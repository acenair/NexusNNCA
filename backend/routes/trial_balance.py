"""Trial Balance import + chart-of-accounts mapping for audit engagements.

Caseware-style workflow:
  1. Preview import (upload a file or pick one the client already uploaded) —
     label the columns, with smart suggestions and saved per-client layouts.
  2. Confirm — rows are built, mappings applied from FIRM MEMORY (accounts
     mapped in any previous import auto-apply), then keyword heuristics fill
     the rest. Unmapped accounts get manual mapping with typeahead search.
  3. Checks — balance, full mapping, zero balances, P&L presence.
Every confirmed mapping updates firm memory, so next year's import of the
same client maps itself.
"""
import csv
import io
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, File, Form, Header, HTTPException, UploadFile
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event

router = APIRouter(prefix="/api")

MAX_FILE = 8 * 1024 * 1024

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
LINE_NAMES = {line for line, _ in STATEMENT_LINES}

# Keyword heuristics for auto-mapping (checked in order; first match wins).
AUTO_MAP_RULES = [
    ("Cash and bank balances", r"cash|bank|petty|withdrawal|deposit account|islamic bank|current account|savings"),
    ("VAT and taxes payable", r"\bvat\b|value added tax|corporate tax|tax payable|\bct\b|withholding|excise"),
    ("Trade payables", r"creditor|trade payab|account payable|ap "),
    ("Accruals and other payables", r"accrue|accrual|outstanding expense|due to|payable to|other payable|audit fee payable"),
    ("Loans and borrowings", r"loan from|borrow|bank overdraft|overdraft|term loan|bank loan|finance lease|debenture"),
    ("Provisions and end-of-service", r"provision|end of service|end-of-service|eos\b|gratuity"),
    ("Share capital", r"share capital|capital account|partner.?s? capital|owner.?s? capital"),
    ("Retained earnings", r"retained|accumulated (profit|loss|fund)|profit and loss account|p&l account"),
    ("Reserves", r"reserve|revaluation"),
    ("Owner drawings", r"drawings|drawing account|partner.?s? drawing|owner.?s? drawing"),
    ("Trade receivables", r"debtor|receivab|account receivable|ar "),
    ("Other receivables and advances", r"advance to|advance |staff loan|loan to|due from|prepaid expense|deposit paid|security deposit|other receivable"),
    ("Inventory", r"inventory|stock in trade|stock-in-trade|goods in trade|trading stock"),
    ("Prepayments", r"prepay|pre-payment|rent paid in advance|insurance paid"),
    ("Property, plant and equipment", r"comput|machinery|equipment|furniture|vehicle|motor|building|land|improvement|leasehold|ppe|office automation|air.?condition|fit.?out|tools|plant"),
    ("Intangible assets", r"intangible|goodwill|software licence|software license|patent|trademark|trade mark"),
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


def _norm_key(name):
    """Normalised account key for firm-memory lookups."""
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


def _parse_raw(filename, content: bytes):
    """Return (header_index, headers, raw_grid) from CSV or XLSX."""
    if filename.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        raw = [[("" if c is None else c) for c in row] for row in (ws.iter_rows(values_only=True) if ws else [])]
        wb.close()
    else:
        text = content.decode("utf-8-sig", errors="replace")
        raw = [[("" if c is None else c) for c in row] for row in csv.reader(io.StringIO(text))]
    if not raw:
        raise HTTPException(422, "The file is empty")
    header_idx = None
    for i, r in enumerate(raw[:10]):
        cells = [str(c or "").strip().lower() for c in r]
        joined = " ".join(cells)
        if sum(1 for c in cells if c) >= 2 and any(k in joined for k in ("account", "particular", "description", "ledger", "a/c")):
            header_idx = i
            break
    if header_idx is None:
        header_idx = 0
    headers = [str(c or "").strip() for c in raw[header_idx]]
    return header_idx, headers, raw


def _col_index(headers, candidates):
    low = [h.lower() for h in headers]
    for k in candidates:
        if k in low:
            return low.index(k)
    return None


def _suggest_columns(headers):
    return {
        "account": _col_index(headers, ("account", "account name", "accountname", "ledger", "particulars", "particular", "a/c", "account description", "description")),
        "debit": _col_index(headers, ("debit", "dr", "debits", "debit amount", "dr amount")),
        "credit": _col_index(headers, ("credit", "cr", "credits", "credit amount", "cr amount")),
        "description": _col_index(headers, ("description", "account description", "narration")),
    }


def _build_rows(raw, header_idx, cols):
    """Build account rows from the raw grid using chosen column indices."""
    acc_i = cols.get("account")
    if acc_i is None:
        raise HTTPException(422, "Choose which column holds the account names")
    dr_i, cr_i, desc_i = cols.get("debit"), cols.get("credit"), cols.get("description")
    rows = []
    for r in raw[header_idx + 1:]:
        cells = list(r) + [None] * 12
        acct = str(cells[acc_i] or "").strip()
        if not acct:
            continue
        low = acct.lower()
        if low in ("total", "grand total", "trial balance") or low.startswith("total "):
            continue
        debit = _num(cells[dr_i]) if dr_i is not None and dr_i < len(cells) else 0.0
        credit = _num(cells[cr_i]) if cr_i is not None and cr_i < len(cells) else 0.0
        rows.append({
            "account": acct,
            "description": (str(cells[desc_i]).strip() if desc_i is not None and desc_i < len(cells) and cells[desc_i] is not None else ""),
            "debit": debit, "credit": credit,
        })
    return rows


async def _memory_map(rows):
    """Apply firm memory (mappings confirmed in any previous import)."""
    mem = {m["key"]: m["mapping"] async for m in db.tb_mapping_memory.find({}, {"_id": 0, "key": 1, "mapping": 1})}
    count = 0
    for row in rows:
        hit = mem.get(_norm_key(row["account"]))
        if hit and hit in LINE_NAMES:
            row["mapping"] = hit
            row["source"] = "memory"
            count += 1
    return count


def _automap_rows(rows):
    """Keyword heuristics for rows still unmapped."""
    auto = 0
    for row in rows:
        if row.get("mapping"):
            continue
        blob = (row["account"] + " " + (row.get("description") or "")).lower()
        for target, pattern in AUTO_MAP_RULES:
            if re.search(pattern, blob):
                row["mapping"] = target
                row["source"] = "auto"
                auto += 1
                break
    return auto


def _net_amount(row):
    return round((row.get("debit") or 0.0) - (row.get("credit") or 0.0), 2)


async def _load_tb(engagement_id):
    return await db.tb_imports.find_one({"engagement_id": engagement_id}, {"_id": 0})


async def _save_memory(rows, client_id=""):
    """Remember confirmed mappings so next year's import maps itself."""
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        key = _norm_key(row["account"])
        mapping = row.get("mapping")
        if not key or not mapping or mapping not in LINE_NAMES:
            continue
        await db.tb_mapping_memory.update_one(
            {"key": key},
            {"$set": {"mapping": mapping, "client_id": client_id, "updated_at": now},
             "$inc": {"hits": 1}},
            upsert=True)


async def _staff_only(user):
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    return user


# ---------- Preview (step 1): upload a file OR pick a client-uploaded document ----------

@router.post("/tb/{engagement_id}/import/preview")
async def import_preview(engagement_id: str, file: Optional[UploadFile] = File(None),
                         document_id: str = Form(""),
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")

    if document_id:
        doc = await db.documents.find_one({"file_id": document_id, "client_id": eng.get("client_id")})
        if not doc:
            raise HTTPException(404, "Client document not found")
        content, filename = doc.get("data") or b"", doc.get("filename") or "client-upload"
        if not content:
            raise HTTPException(422, "That document has no stored file content")
    elif file:
        content, filename = await file.read(), (file.filename or "upload")
    else:
        raise HTTPException(422, "Provide a file or a client document_id")
    if len(content) > MAX_FILE:
        raise HTTPException(413, "File too large (max 8 MB)")

    try:
        header_idx, headers, raw = _parse_raw(filename, content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")
    if not any(h for h in headers):
        raise HTTPException(422, "No readable columns found")

    data_rows = raw[header_idx + 1:]
    staging_id = f"stg_{uuid.uuid4().hex[:12]}"
    await db.tb_staging.replace_one(
        {"engagement_id": engagement_id},
        {"staging_id": staging_id, "engagement_id": engagement_id,
         "client_id": eng.get("client_id"), "filename": filename,
         "content": content, "header_row": header_idx,
         "created_at": datetime.now(timezone.utc).isoformat()},
        upsert=True)
    layout = await db.tb_layouts.find_one({"client_id": eng.get("client_id")}, {"_id": 0, "columns": 1})
    return {
        "staging_id": staging_id,
        "filename": filename,
        "header_row": header_idx,
        "headers": headers,
        "preview": [[str(c) for c in r[:max(len(headers), 6)]] for r in data_rows[:8]],
        "row_count": sum(1 for r in data_rows if r and str(r[0] or "").strip()),
        "suggested": _suggest_columns(headers),
        "saved_layout": (layout or {}).get("columns"),
    }


# ---------- Confirm (step 2): build rows with chosen columns ----------

@router.post("/tb/{engagement_id}/import/confirm")
async def import_confirm(engagement_id: str, body: Optional[dict] = None,
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    staging = await db.tb_staging.find_one({"engagement_id": engagement_id})
    if not staging or staging.get("staging_id") != body.get("staging_id"):
        raise HTTPException(409, "Import session expired — start the import again")

    cols = body.get("columns") or {}
    cols = {k: (int(v) if v is not None and str(v) != "" else None)
            for k, v in cols.items() if k in ("account", "debit", "credit", "description")}
    try:
        header_idx, headers, raw = _parse_raw(staging["filename"], staging["content"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not re-read the staged file: {e}")
    rows = _build_rows(raw, header_idx, cols)
    if not rows:
        raise HTTPException(422, "No account rows found — check the account column and that Total rows are the only exclusions")

    memory_n = await _memory_map(rows)
    auto_n = _automap_rows(rows)
    # remember every mapped row so next year's import maps itself
    await _save_memory(rows, client_id=eng.get("client_id") or "")

    doc = {
        "tb_id": f"tb_{uuid.uuid4().hex[:12]}",
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "file_name": staging.get("filename"),
        "imported_by": user.get("name") or user.get("email"),
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "columns": cols,
        "rows": rows,
        "mapped_count": sum(1 for r in rows if r.get("mapping")),
        "memory_mapped": memory_n,
        "auto_mapped": auto_n,
    }
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc, upsert=True)
    if body.get("save_layout"):
        await db.tb_layouts.update_one(
            {"client_id": eng.get("client_id")},
            {"$set": {"columns": cols, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.get("name")}},
            upsert=True)
    await db.tb_staging.delete_one({"engagement_id": engagement_id})
    await journal_event(engagement_id, "tb_imported",
                        (f"Trial balance imported: {doc['file_name']} — {len(rows)} accounts; "
                         f"{memory_n} from firm memory, {auto_n} keyword-matched, "
                         f"{sum(1 for r in rows if not r.get('mapping'))} need mapping"),
                        by_name=user.get("name") or "User",
                        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    doc.pop("_id", None)
    return doc


# ---------- Client documents already on file ----------

@router.get("/tb/{engagement_id}/client-documents")
async def client_documents(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    docs = []
    async for d in db.documents.find(
            {"client_id": eng.get("client_id"), "data": {"$ne": None}},
            {"_id": 0, "file_id": 1, "filename": 1, "uploaded_at": 1, "source": 1}
    ).sort("uploaded_at", -1).limit(10):
        name = (d.get("filename") or "").lower()
        if name.endswith((".exe", ".bat", ".sh")):
            continue
        docs.append(d)
    return {"documents": docs}


# ---------- Mapping + checks ----------

@router.get("/tb/{engagement_id}")
async def get_tb(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    doc = await _load_tb(engagement_id)
    return doc or {"engagement_id": engagement_id, "rows": [], "file_name": None}


@router.patch("/tb/{engagement_id}/mapping")
async def set_mapping(engagement_id: str, body: Optional[dict] = None,
                      authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    idx = body.get("row_index")
    line = body.get("mapping") or ""
    if line and line not in LINE_NAMES:
        raise HTTPException(422, f"Unknown statement line: {line}")
    doc = await _load_tb(engagement_id)
    if not doc:
        raise HTTPException(404, "No trial balance imported for this engagement")
    if idx is None or not (0 <= int(idx) < len(doc["rows"])):
        raise HTTPException(422, "Invalid row index")
    row = doc["rows"][int(idx)]
    row["mapping"] = line or None
    row["source"] = "manual" if line else None
    doc["mapped_count"] = sum(1 for r in doc["rows"] if r.get("mapping"))
    doc["updated_by"] = user.get("name") or user.get("email")
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc)
    if line:
        await _save_memory([row], client_id=doc.get("client_id") or "")
    await journal_event(engagement_id, "tb_mapping_changed",
                        f"TB mapping changed: '{row['account']}' → {line or 'unmapped'}",
                        by_name=user.get("name") or "User")
    return doc


@router.post("/tb/{engagement_id}/automap")
async def automap(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    doc = await _load_tb(engagement_id)
    if not doc:
        raise HTTPException(404, "No trial balance imported for this engagement")
    memory_n = await _memory_map(doc["rows"])
    auto_n = _automap_rows(doc["rows"])
    doc["mapped_count"] = sum(1 for r in doc["rows"] if r.get("mapping"))
    doc["memory_mapped"] = memory_n
    doc["auto_mapped"] = auto_n
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, doc)
    await journal_event(engagement_id, "tb_automapped",
                        f"Auto-map re-run: {memory_n} from firm memory, {auto_n} keyword-matched, {sum(1 for r in doc['rows'] if not r.get('mapping'))} still unmapped",
                        by_name=user.get("name") or "User")
    return doc


@router.get("/tb/{engagement_id}/checks")
async def tb_checks(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    doc = await _load_tb(engagement_id)
    if not doc or not doc.get("rows"):
        return {"checks": [], "lines": [], "available": False}
    rows = doc["rows"]
    total_dr = round(sum(r.get("debit") or 0 for r in rows), 2)
    total_cr = round(sum(r.get("credit") or 0 for r in rows), 2)
    unmapped = [r["account"] for r in rows if not r.get("mapping")]
    zero_rows = [r["account"] for r in rows if _net_amount(r) == 0 and r.get("mapping")]
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
    user = await _staff_only(await get_current_user(authorization, session_token))
    res = await db.tb_imports.delete_one({"engagement_id": engagement_id})
    if not res.deleted_count:
        raise HTTPException(404, "No trial balance imported for this engagement")
    await journal_event(engagement_id, "tb_removed", "Imported trial balance removed",
                        by_name=user.get("name") or "User")
    return {"ok": True}
