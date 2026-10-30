"""Trial Balance import + chart-of-accounts mapping for audit engagements.

Phase 1 of the audit workbench: upload a CSV/XLSX trial balance, parse it,
auto-map accounts to financial-statement lines (keyword heuristics) with
manual override, and run balance/integrity checks on the mapped TB.
"""
import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, File, Header, HTTPException, UploadFile
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event

router = APIRouter(prefix="/api")

# Financial-statement lines (IFRS-style, SME-friendly). Order = presentation order.
STATEMENT_LINES = [
    # (line, group)
    ("Cash and bank balances", "Assets"),
    ("Trade receivables", "Assets"),
    ("Other receivables and advances", "Assets"),
    ("Inventory", "Assets"),
    ("Prepayments", "Assets"),
    ("Property, plant and equipment", "Assets"),
    ("Intangible assets", "Assets"),
    ("Other assets", "Assets"),
    ("Trade payables", "Liabilities"),
    ("Accruals and other payables", "Liabilities"),
    ("VAT and taxes payable", "Liabilities"),
    ("Loans and borrowings", "Liabilities"),
    ("Provisions and end-of-service", "Liabilities"),
    ("Other liabilities", "Liabilities"),
    ("Share capital", "Equity"),
    ("Retained earnings", "Equity"),
    ("Reserves", "Equity"),
    ("Owner drawings", "Equity"),
    ("Revenue", "Income"),
    ("Other income", "Income"),
    ("Cost of sales", "Expenses"),
    ("Staff costs", "Expenses"),
    ("Depreciation and amortisation", "Expenses"),
    ("Operating expenses", "Expenses"),
    ("Finance costs", "Expenses"),
]

# Keyword heuristics for auto-mapping (checked in order; first match wins).
AUTO_MAP_RULES = [
    ("Cash and bank balances", r"cash|bank|petty|withdrawal|deposit account|islamic bank|current account|savings"),
    ("Trade receivables", r"debtor|receivab|account receivable|ar "),
    ("Other receivables and advances", r"advance to|advance |staff loan|loan to|due from|prepaid expense|deposit paid|security deposit|other receivable"),
    ("Inventory", r"inventory|stock in trade|stock-in-trade|goods in trade|trading stock"),
    ("Prepayments", r"prepay|pre-payment|rent paid in advance|insurance paid"),
    ("Property, plant and equipment", r"comput|machinery|equipment|furniture|vehicle|motor|building|land|improvement|leasehold|ppe|office automation|air.?condition|fit.?out|tools|plant"),
    ("Intangible assets", r"intangible|goodwill|software licence|software license|patent|trademark|trade mark"),
    ("VAT and taxes payable", r"\bvat\b|value added tax|corporate tax|tax payable|\bct\b|withholding|excise"),
    ("Trade payables", r"creditor|trade payab|account payable|ap "),
    ("Accruals and other payables", r"accrue|accrual|outstanding expense|due to|payable to|other payable|audit fee payable"),
    ("Loans and borrowings", r"loan from|borrow|bank overdraft|overdraft|term loan|bank loan|finance lease|debenture"),
    ("Provisions and end-of-service", r"provision|end of service|end-of-service|eos\b|gratuity"),
    ("Share capital", r"share capital|capital account|partner.?s? capital|owner.?s? capital"),
    ("Retained earnings", r"retained|accumulated (profit|loss|fund)|profit and loss account|p&l account"),
    ("Reserves", r"reserve|revaluation"),
    ("Owner drawings", r"drawings|drawing account|partner.?s? drawing|owner.?s? drawing"),
    ("Revenue", r"revenue|sales|service (income|fee|revenue)|fee income|turnover|professional fees|consultancy income|income from"),
    ("Other income", r"other income|interest income|exchange (gain|difference)|forex|miscellaneous income|discount received|scrap"),
    ("Cost of sales", r"cost of (sales|goods)|cogs|purchases|direct cost|cost of material|opening stock|closing stock|direct expense"),
    ("Staff costs", r"salary|salaries|wages|staff|payroll|employee|bonus|visa cost|medical insurance|air ticket|gratuity expense|hr ?cost"),
    ("Depreciation and amortisation", r"depreciation|amortis|amortiz|depletion"),
    ("Finance costs", r"interest expense|finance cost|bank charge|loan processing|interest on"),
    ("Operating expenses", r"expense|rent|utilities|electricity|water|telephone|internet|advertis|marketing|print|stationery|travel|repairs|maintenance|municipality|licence fee|license fee|professional fee|audit fee|legal|consult|subscription|insurance|postage|courier|petrol|fuel|entertainment|office|commission|cleaning|security|sponsor|food|refreshment|tea|coffee|miscellaneous"),
]


def _num(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("AED", "").replace("\xa0", "").strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace("-", "") if neg else s.replace("-", "")
    try:
        return -abs(float(s)) if neg else float(s)
    except ValueError:
        return 0.0


def _parse_rows(filename, content: bytes):
    """Parse CSV or XLSX into [{account, description, debit, credit}]."""
    rows = []
    if filename.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        raw = [[c for c in row] for row in (ws.iter_rows(values_only=True) if ws else [])]
        wb.close()
    else:
        text = content.decode("utf-8-sig", errors="replace")
        raw = list(csv.reader(io.StringIO(text)))
    if not raw:
        return []
    # Find header row: the first row with >=2 non-empty cells mentioning
    # account-ish words, or fall back to first non-empty row.
    header_idx, header = None, None
    for i, r in enumerate(raw[:10]):
        cells = [str(c or "").strip().lower() for c in r]
        joined = " ".join(cells)
        if sum(1 for c in cells if c) >= 2 and any(k in joined for k in ("account", "particular", "description", "ledger", "a/c")):
            header_idx, header = i, cells
            break
    if header_idx is None:
        header_idx = 0
        header = [str(c or "").strip().lower() for c in raw[0]] if raw else []
    cols = {h: i for i, h in enumerate(header)}
    acc_i = next((cols[k] for k in ("account", "account name", "accountname", "ledger", "particulars", "particular", "a/c", "account description", "description") if k in cols), None)
    if acc_i is None:
        acc_i = 0 if not header or not any(cols[h] == 0 and h for h in cols) else 0
    dr_i = next((cols[k] for k in ("debit", "dr", "debits", "debit amount", "dr amount") if k in cols), None)
    cr_i = next((cols[k] for k in ("credit", "cr", "credits", "credit amount", "cr amount") if k in cols), None)
    desc_i = next((cols[k] for k in ("description", "account description", "narration") if k in cols), None)
    for r in raw[header_idx + 1:]:
        cells = list(r) + [None] * 12  # pad
        acct = str(cells[acc_i] or "").strip()
        if not acct:
            continue
        low = acct.lower()
        if low in ("total", "grand total", "trial balance") or low.startswith("total "):
            continue
        debit = _num(cells[dr_i]) if dr_i is not None else 0.0
        credit = _num(cells[cr_i]) if cr_i is not None else 0.0
        if debit == 0 and credit == 0 and desc_i is not None and dr_i is None and cr_i is None:
            # single amount column fallback: try the first numeric column after account
            for j in range(acc_i + 1, min(len(cells), acc_i + 5)):
                v = _num(cells[j])
                if v != 0:
                    debit = v if v > 0 else 0.0
                    credit = -v if v < 0 else 0.0
                    break
        rows.append({"account": acct, "description": str(cells[desc_i] or "").strip() if desc_i is not None else "",
                     "debit": debit, "credit": credit})
    return rows


def _automap_rows(rows):
    import re
    mapped, auto = 0, 0
    for row in rows:
        line = row.get("mapping")
        if line and line in dict(STATEMENT_LINES):
            mapped += 1
            continue
        blob = (row["account"] + " " + (row.get("description") or "")).lower()
        for target, pattern in AUTO_MAP_RULES:
            if re.search(pattern, blob):
                row["mapping"] = target
                row["auto"] = True
                mapped += 1
                auto += 1
                break
    return mapped, auto


def _net_amount(row):
    return round((row.get("debit") or 0.0) - (row.get("credit") or 0.0), 2)


async def _load_tb(engagement_id):
    return await db.tb_imports.find_one({"engagement_id": engagement_id}, {"_id": 0})


@router.get("/tb/{engagement_id}")
async def get_tb(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    doc = await _load_tb(engagement_id)
    return doc or {"engagement_id": engagement_id, "rows": [], "file_name": None}


@router.post("/tb/{engagement_id}/import")
async def import_tb(engagement_id: str, file: UploadFile = File(...),
                    authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Not allowed")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 8 MB)")
    try:
        rows = _parse_rows(file.filename or "upload.csv", content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")
    if not rows:
        raise HTTPException(422, "No account rows found — check that the file has an account column with debit/credit amounts")
    mapped, auto = _automap_rows(rows)
    doc = {
        "tb_id": str(uuid.uuid4()),
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "file_name": file.filename,
        "imported_by": user.get("name") or user.get("email"),
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "mapped_count": mapped,
        "auto_mapped": auto,
    }
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc, upsert=True)
    await journal_event(engagement_id, "tb_imported",
                        f"Trial balance imported: {file.filename} — {len(rows)} accounts, {mapped} mapped ({auto} auto-mapped)",
                        by_name=user.get("name") or "User",
                        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    return doc


@router.patch("/tb/{engagement_id}/mapping")
async def set_mapping(engagement_id: str, body: Optional[dict] = None,
                      authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    body = body or {}
    idx = body.get("row_index")
    line = body.get("mapping") or ""
    if line and line not in dict(STATEMENT_LINES):
        raise HTTPException(422, f"Unknown statement line: {line}")
    doc = await _load_tb(engagement_id)
    if not doc:
        raise HTTPException(404, "No trial balance imported for this engagement")
    if idx is None or not (0 <= int(idx) < len(doc["rows"])):
        raise HTTPException(422, "Invalid row index")
    row = doc["rows"][int(idx)]
    row["mapping"] = line or None
    row["auto"] = False
    doc["mapped_count"] = sum(1 for r in doc["rows"] if r.get("mapping"))
    doc["updated_by"] = user.get("name") or user.get("email")
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc)
    acct = doc["rows"][int(idx)]["account"] if doc["rows"] else ""
    await journal_event(engagement_id, "tb_mapping_changed",
                        f"TB mapping changed: '{acct}' → {line or 'unmapped'}",
                        by_name=user.get("name") or "User")
    return doc


@router.post("/tb/{engagement_id}/automap")
async def automap(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    doc = await _load_tb(engagement_id)
    if not doc:
        raise HTTPException(404, "No trial balance imported for this engagement")
    mapped, auto = _automap_rows(doc["rows"])
    doc["mapped_count"] = mapped
    doc["auto_mapped"] = auto
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc)
    return doc


@router.get("/tb/{engagement_id}/checks")
async def tb_checks(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    doc = await _load_tb(engagement_id)
    if not doc or not doc.get("rows"):
        return {"checks": [], "lines": [], "available": False}
    rows = doc["rows"]
    total_dr = round(sum(r.get("debit") or 0 for r in rows), 2)
    total_cr = round(sum(r.get("credit") or 0 for r in rows), 2)
    unmapped = [r["account"] for r in rows if not r.get("mapping")]
    zero_rows = [r["account"] for r in rows if _net_amount(r) == 0 and r.get("mapping")]
    # Mapped roll-forward by statement line
    lines = {}
    for r in rows:
        line = r.get("mapping")
        if not line:
            continue
        lines.setdefault(line, {"line": line, "group": dict(STATEMENT_LINES).get(line, ""), "amount": 0.0, "accounts": []})
        lines[line]["amount"] = round(lines[line]["amount"] + _net_amount(r), 2)
        lines[line]["accounts"].append(r["account"])
    ordered = sorted(lines.values(), key=lambda l: [s[0] for s in STATEMENT_LINES].index(l["line"]))
    checks = [
        {"id": "in_balance", "name": "Debits equal credits",
         "status": "pass" if abs(total_dr - total_cr) < 0.01 else "fail",
         "detail": f"Debits AED {total_dr:,.2f} vs credits AED {total_cr:,.2f} — difference AED {total_dr - total_cr:,.2f}"},
        {"id": "fully_mapped", "name": "All accounts mapped to statement lines",
         "status": "pass" if not unmapped else "fail",
         "detail": "Every account has a statement line" if not unmapped else f"{len(unmapped)} unmapped: {', '.join(unmapped[:6])}{'…' if len(unmapped) > 6 else ''}"},
        {"id": "no_zero_balances", "name": "No zero-balance accounts",
         "status": "pass" if not zero_rows else "warn",
         "detail": "All accounts carry a balance" if not zero_rows else f"{len(zero_rows)} zero-balance accounts (safe to exclude)"},
        {"id": "pl_present", "name": "Revenue and expense lines populated",
         "status": "pass" if any(l["group"] in ("Income", "Expenses") and abs(l["amount"]) > 0.01 for l in ordered) else "warn",
         "detail": "P&L mapped" if any(l["group"] in ("Income", "Expenses") and abs(l["amount"]) > 0.01 for l in ordered) else "No income/expense accounts mapped yet"},
    ]
    return {"checks": checks, "lines": ordered, "available": True,
            "totals": {"debit": total_dr, "credit": total_cr, "unmapped": len(unmapped), "rows": len(rows)}}


@router.delete("/tb/{engagement_id}")
async def delete_tb(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    res = await db.tb_imports.delete_one({"engagement_id": engagement_id})
    if not res.deleted_count:
        raise HTTPException(404, "No trial balance imported for this engagement")
    return {"ok": True}
