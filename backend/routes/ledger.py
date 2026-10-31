"""Books ingestion: general-ledger files from Tally / QuickBooks / Zoho / Xero / CSV.

Strategy: NNCA's clients keep their books in their own accounting software —
we never replace it. This module INGESTS a full general ledger:
  * Tally Prime DayBook XML export (vouchers + ledger legs), or
  * any GL spreadsheet (QuickBooks/Zoho/Xero GL report exports, or a plain
    date/account/debit/credit CSV) via the column-labelling wizard.
The vouchers are parsed, de-duplicated, aggregated to a trial balance and
pushed through the SAME pipeline as a manual TB import (firm mapping memory,
keyword auto-map, integrity checks, adjustments register, IFRS builder).
Re-ingesting a period replaces the previous data cleanly (idempotent).
"""
import csv
import io
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, File, Form, Header, HTTPException, UploadFile
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event
from routes.trial_balance import (
    LINE_NAMES, MAX_FILE, _automap_rows, _col_index, _memory_map, _norm_key,
    _num, _parse_raw, _save_memory, _staff_only, _suggest_columns,
)

router = APIRouter(prefix="/api")

MAX_ENTRIES = 20000
ACCOUNTING_SYSTEMS = ("Tally", "QuickBooks", "Zoho Books", "Xero", "Excel / Google Sheets", "Other")

DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%m/%d/%Y")


def _today():
    return datetime.now(timezone.utc).isoformat()


def _parse_date(s):
    s = str(s or "").strip()
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(s, f).date().isoformat()
        except ValueError:
            continue
    return None


# ---------------- Tally XML ----------------

def _strip_ns(tag):
    return tag.rsplit("}", 1)[-1].upper()


def _tally_legs(voucher):
    """Collect ledger legs from a <VOUCHER> element. Tally sign convention:
    AMOUNT negative = debit, positive = credit."""
    legs = []
    for child in voucher:
        name = _strip_ns(child.tag)
        if name in ("ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST", "ALLINVENTORYENTRIES.LIST"):
            ledger, amount = None, None
            for sub in child:
                sname = _strip_ns(sub.tag)
                if sname == "LEDGERNAME":
                    ledger = (sub.text or "").strip()
                elif sname == "AMOUNT":
                    try:
                        amount = float((sub.text or "0").replace(",", "").strip())
                    except ValueError:
                        amount = None
            if ledger:
                amt = amount or 0.0
                legs.append({"account": ledger,
                             "debit": -amt if amt < 0 else 0.0,
                             "credit": amt if amt > 0 else 0.0})
        # inventory entries can carry accounting allocations one level deeper
        elif name == "INVENTORYENTRIES.LIST":
            for sub in child:
                if _strip_ns(sub.tag) == "ACCOUNTINGALLOCATIONS.LIST":
                    ledger, amount = None, None
                    for s2 in sub:
                        s2n = _strip_ns(s2.tag)
                        if s2n == "LEDGERNAME":
                            ledger = (s2.text or "").strip()
                        elif s2n == "AMOUNT":
                            try:
                                amount = float((s2.text or "0").replace(",", "").strip())
                            except ValueError:
                                amount = None
                    if ledger:
                        amt = amount or 0.0
                        legs.append({"account": ledger,
                                     "debit": -amt if amt < 0 else 0.0,
                                     "credit": amt if amt > 0 else 0.0})
    return legs


def _tally_text(voucher, tag):
    for child in voucher:
        if _strip_ns(child.tag) == tag:
            return (child.text or "").strip()
    return ""


def parse_tally_xml(content: bytes):
    """Parse a Tally DayBook / voucher XML export into normalized entries."""
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        raise HTTPException(422, "This is not a valid Tally XML export — export Day Book as 'XML (Data Interchange)' from TallyPrime (Alt+E on the Day Book) and upload that file")
    entries, skipped = [], 0
    for voucher in root.iter():
        if _strip_ns(voucher.tag) != "VOUCHER":
            continue
        if (voucher.get("CANCELLED") or "").strip().lower() in ("yes", "true"):
            skipped += 1
            continue
        legs = _tally_legs(voucher)
        if not legs:
            skipped += 1
            continue
        date = _parse_date(voucher.get("DATE") or _tally_text(voucher, "DATE"))
        vtype = (voucher.get("VCHTYPE") or _tally_text(voucher, "VOUCHERTYPENAME") or "Voucher").strip()
        vno = (voucher.get("VOUCHERNUMBER") or _tally_text(voucher, "VOUCHERNUMBER") or "").strip()
        narration = _tally_text(voucher, "NARRATION")
        for leg in legs:
            entries.append({
                "date": date, "voucher_no": vno, "voucher_type": vtype,
                "account": leg["account"], "debit": round(leg["debit"], 2),
                "credit": round(leg["credit"], 2),
                "narration": (narration or "")[:300],
            })
    if not entries:
        raise HTTPException(422, "No voucher entries found in the Tally XML — make sure the export is the Day Book (transactions), not masters")
    return entries, skipped


# ---------------- Universal GL spreadsheet ----------------

GL_DATE_COLS = ("date", "transaction date", "voucher date", "entry date", "posting date")
GL_ACCOUNT_COLS = ("account", "account name", "ledger", "ledger name", "particulars", "particular", "account description", "description", "a/c")
GL_DEBIT_COLS = ("debit", "dr", "debit amount", "dr amount", "debits")
GL_CREDIT_COLS = ("credit", "cr", "credit amount", "cr amount", "credits")
GL_VOUCHER_COLS = ("voucher no", "voucher number", "voucher", "num", "number", "doc no", "document number", "reference", "ref")
GL_TYPE_COLS = ("type", "transaction type", "voucher type", "entry type")
GL_NARRATION_COLS = ("narration", "memo", "memo/description", "name", "note")


def parse_gl_csv(filename, content: bytes):
    """Parse a general-ledger spreadsheet into entries using column detection."""
    header_idx, headers, raw = _parse_raw(filename, content)
    low = [h.lower().strip() for h in headers]
    date_i = _col_index(headers, GL_DATE_COLS)
    acc_i = _col_index(headers, GL_ACCOUNT_COLS)
    dr_i = _col_index(headers, GL_DEBIT_COLS)
    cr_i = _col_index(headers, GL_CREDIT_COLS)
    if acc_i is None:
        raise HTTPException(422, "Could not find an account/ledger column — use the column labelling to map it")
    if date_i is None and dr_i is None and cr_i is None:
        raise HTTPException(422, "This looks like a summary, not a general ledger — a GL needs date and/or debit/credit columns")
    vno_i = _col_index(headers, GL_VOUCHER_COLS)
    type_i = _col_index(headers, GL_TYPE_COLS)
    nar_i = _col_index(headers, GL_NARRATION_COLS)
    entries = []
    for r in raw[header_idx + 1:]:
        cells = list(r) + [None] * 14
        acct = str(cells[acc_i] or "").strip()
        if not acct:
            continue
        low_a = acct.lower()
        if low_a in ("total", "grand total", "trial balance", "general ledger") or low_a.startswith("total "):
            continue
        debit = _num(cells[dr_i]) if dr_i is not None and dr_i < len(cells) else 0.0
        credit = _num(cells[cr_i]) if cr_i is not None and cr_i < len(cells) else 0.0
        if debit == 0.0 and credit == 0.0:
            continue
        entries.append({
            "date": _parse_date(cells[date_i]) if date_i is not None and date_i < len(cells) else None,
            "voucher_no": str(cells[vno_i]).strip() if vno_i is not None and vno_i < len(cells) and cells[vno_i] is not None else "",
            "voucher_type": str(cells[type_i]).strip() if type_i is not None and type_i < len(cells) and cells[type_i] is not None else "",
            "account": acct, "debit": round(debit, 2), "credit": round(credit, 2),
            "narration": (str(cells[nar_i]).strip() if nar_i is not None and nar_i < len(cells) and cells[nar_i] is not None else "")[:300],
        })
    if not entries:
        raise HTTPException(422, "No ledger entries found — check the file has transaction rows below the header")
    cols = {"date": date_i, "account": acc_i, "debit": dr_i, "credit": cr_i,
            "voucher_no": vno_i, "voucher_type": type_i, "narration": nar_i}
    suggested = {k: v for k, v in {
        "date": date_i, "account": acc_i, "debit": dr_i, "credit": cr_i,
        "voucher_no": vno_i, "narration": nar_i}.items() if v is not None}
    return entries, 0, headers, suggested


def detect_and_parse(filename, content: bytes):
    """Route to the right parser. Returns (entries, skipped, source, headers, suggested|None)."""
    head = content[:2000].decode("utf-8-sig", errors="replace").lower()
    is_xml = filename.lower().endswith(".xml") or "<envelope" in head or "<voucher" in head or "<tallymessage" in head
    if is_xml:
        entries, skipped = parse_tally_xml(content)
        return entries, skipped, "Tally XML", None, None
    entries, skipped, headers, suggested = parse_gl_csv(filename, content)
    return entries, skipped, "GL spreadsheet", headers, suggested


# ---------------- Aggregation + quality ----------------

def find_duplicates(entries):
    """Same date + voucher_no + account + amount appearing more than once."""
    seen, dupes = set(), 0
    for e in entries:
        fp = (e.get("date"), e.get("voucher_no"), e["account"], round(e["debit"], 2), round(e["credit"], 2))
        if fp in seen:
            dupes += 1
        else:
            seen.add(fp)
    return dupes


def aggregate_tb(entries):
    """Aggregate entries to trial-balance rows (accounts with zero net excluded)."""
    by_acc = {}
    for e in entries:
        row = by_acc.setdefault(e["account"], {"account": e["account"], "description": "", "debit": 0.0, "credit": 0.0})
        row["debit"] = round(row["debit"] + e["debit"], 2)
        row["credit"] = round(row["credit"] + e["credit"], 2)
        if e.get("voucher_type") and e["voucher_type"] not in row["description"]:
            row["description"] = (row["description"] + ", " + e["voucher_type"]).strip(", ")[:120]
    rows, excluded_zero = [], 0
    for row in sorted(by_acc.values(), key=lambda r: r["account"].lower()):
        if abs(row["debit"] - row["credit"]) < 0.005:  # zero net — self-clearing accounts drop out
            excluded_zero += 1
            continue
        rows.append(row)
    return rows, excluded_zero


def vat_totals(entries):
    out = inn = 0.0
    for e in entries:
        a = e["account"].lower()
        if re.search(r"output vat|vat payable|vat output|sales tax payable", a):
            out += e["credit"] - e["debit"]
        elif re.search(r"input vat|vat recover|vat input|purchase tax", a):
            inn += e["debit"] - e["credit"]
    return round(max(out, 0.0), 2), round(max(inn, 0.0), 2)


async def _get_engagement(engagement_id):
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    return eng


# ---------------- Ingest: preview (step 1) ----------------

@router.post("/ledger/{engagement_id}/ingest/preview")
async def ledger_preview(engagement_id: str, file: Optional[UploadFile] = File(None),
                         document_id: str = Form(""),
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    eng = await _get_engagement(engagement_id)
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
        entries, skipped, source, headers, suggested = detect_and_parse(filename, content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not parse the file: {e}")
    if len(entries) > MAX_ENTRIES:
        raise HTTPException(413, f"Ledger too large: {len(entries)} entries (max {MAX_ENTRIES}). Export a shorter period and ingest in year chunks")

    dates = sorted(e["date"] for e in entries if e.get("date"))
    accounts, acct_order = {}, []
    for e in entries:
        if e["account"] not in accounts:
            accounts[e["account"]] = {"account": e["account"], "debit": 0.0, "credit": 0.0}
            acct_order.append(e["account"])
        accounts[e["account"]]["debit"] = round(accounts[e["account"]]["debit"] + e["debit"], 2)
        accounts[e["account"]]["credit"] = round(accounts[e["account"]]["credit"] + e["credit"], 2)
    top = sorted(accounts.values(), key=lambda a: abs(a["debit"] - a["credit"]), reverse=True)[:12]
    vat_out, vat_in = vat_totals(entries)
    dupes = find_duplicates(entries)
    needs_columns = source == "GL spreadsheet" and (_col_index(headers or [], GL_DATE_COLS) is None or
                                                    _col_index(headers or [], GL_DEBIT_COLS) is None or
                                                    _col_index(headers or [], GL_CREDIT_COLS) is None)

    staging_id = f"led_{uuid.uuid4().hex[:12]}"
    await db.ledger_staging.replace_one(
        {"engagement_id": engagement_id},
        {"staging_id": staging_id, "engagement_id": engagement_id,
         "client_id": eng.get("client_id"), "filename": filename,
         "content": content, "source": source, "created_at": _today()},
        upsert=True)
    return {
        "staging_id": staging_id, "filename": filename, "source": source,
        "entries": len(entries), "skipped": skipped, "vouchers": len({(e.get("voucher_no"), e.get("date")) for e in entries}),
        "period_from": dates[0] if dates else None, "period_to": dates[-1] if dates else None,
        "accounts_top": top, "account_count": len(accounts),
        "vat_output": vat_out, "vat_input": vat_in, "duplicates": dupes,
        "needs_columns": needs_columns, "headers": headers or [],
        "suggested": suggested or {},
        "preview": [[str(c) for c in r[:8]] for r in raw_preview(content, is_xml=(source == "Tally XML"))],
    }


def raw_preview(content, is_xml=False, n=6):
    """Small human-readable preview of the file head."""
    try:
        if is_xml:
            text = content[:4000].decode("utf-8-sig", errors="replace")
            lines = [l.strip()[:120] for l in text.splitlines() if l.strip()][:n]
            return [l.split(",") for l in lines]
        text = content.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))[:n]
        return rows
    except Exception:
        return []


# ---------------- Ingest: confirm (step 2) ----------------

@router.post("/ledger/{engagement_id}/ingest/confirm")
async def ledger_confirm(engagement_id: str, body: Optional[dict] = None,
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    eng = await _get_engagement(engagement_id)
    staging = await db.ledger_staging.find_one({"engagement_id": engagement_id})
    if not staging or staging.get("staging_id") != body.get("staging_id"):
        raise HTTPException(409, "Import session expired — start the ingestion again")

    content, filename, source = staging["content"], staging["filename"], staging["source"]
    try:
        if source == "Tally XML":
            entries, skipped = parse_tally_xml(content)
        else:
            cols = body.get("columns") or {}
            mapped = {k: (int(v) if v is not None and str(v) != "" else None)
                      for k, v in cols.items() if v is not None and str(v) != ""}
            entries, skipped = _parse_gl_with_columns(content, filename, mapped)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not re-read the staged file: {e}")
    if len(entries) > MAX_ENTRIES:
        raise HTTPException(413, f"Ledger too large: {len(entries)} entries (max {MAX_ENTRIES})")

    dupes = find_duplicates(entries)
    rows, excluded_zero = aggregate_tb(entries)
    if not rows:
        raise HTTPException(422, "The ledger aggregated to nothing — check the account column")
    memory_n = await _memory_map(rows)
    auto_n = _automap_rows(rows)
    await _save_memory(rows, client_id=eng.get("client_id") or "")

    dates = sorted(e["date"] for e in entries if e.get("date"))
    vat_out, vat_in = vat_totals(entries)
    now = _today()
    tb_doc = {
        "tb_id": f"tb_{uuid.uuid4().hex[:12]}",
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "file_name": filename,
        "imported_by": user.get("name") or user.get("email"),
        "imported_at": now,
        "columns": {},
        "rows": rows,
        "mapped_count": sum(1 for r in rows if r.get("mapping")),
        "memory_mapped": memory_n,
        "auto_mapped": auto_n,
        "derived_from_ledger": True,
        "ledger_source": source,
        "ledger_vouchers": len({(e.get("voucher_no"), e.get("date")) for e in entries}),
        "ledger_entries": len(entries),
        "ledger_period": [dates[0], dates[-1]] if dates else None,
        "ledger_duplicates": dupes,
        "ledger_vat": {"output": vat_out, "input": vat_in},
    }
    # replace the TB for this engagement and the stored entries atomically-enough:
    # entries first, then the TB pointer; a crash between them leaves the old TB intact.
    await db.ledger_entries.delete_many({"engagement_id": engagement_id})
    if entries:
        for chunk_start in range(0, len(entries), 500):
            chunk = entries[chunk_start:chunk_start + 500]
            await db.ledger_entries.insert_many(
                [{**e, "engagement_id": engagement_id, "client_id": eng.get("client_id"),
                  "client_name": eng.get("client_name"), "ingested_at": now} for e in chunk])
    await db.tb_imports.replace_one({"engagement_id": engagement_id}, tb_doc, upsert=True)

    summary = {
        "engagement_id": engagement_id, "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"), "source": source,
        "vouchers": tb_doc["ledger_vouchers"], "entries": len(entries),
        "period_from": dates[0] if dates else None, "period_to": dates[-1] if dates else None,
        "vat_output": vat_out, "vat_input": vat_in, "duplicates": dupes,
        "accounts": len(rows), "zero_excluded": excluded_zero, "skipped": skipped,
        "file_name": filename, "by": user.get("name") or user.get("email"), "at": now,
    }
    await db.ledger_ingests.replace_one({"engagement_id": engagement_id}, summary, upsert=True)
    await db.ledger_staging.delete_one({"engagement_id": engagement_id})
    await journal_event(
        engagement_id, "ledger_ingested",
        (f"General ledger ingested from {source}: {filename} — {len(entries)} entries, "
         f"{tb_doc['ledger_vouchers']} vouchers ({(dates[0] if dates else '?')} to {(dates[-1] if dates else '?')}); "
         f"trial balance derived ({len(rows)} accounts, {memory_n} memory-mapped), {dupes} duplicate lines flagged"),
        by_name=user.get("name") or "User",
        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    return {"ok": True, "tb": {k: v for k, v in tb_doc.items() if k != "rows"},
            "rows": len(rows), "excluded_zero": excluded_zero, "skipped": skipped}


def _parse_gl_with_columns(content, filename, mapped):
    """Re-parse a GL spreadsheet with user-confirmed column indices."""
    header_idx, headers, raw = _parse_raw(filename, content)
    date_i = mapped.get("date")
    acc_i = mapped.get("account")
    dr_i = mapped.get("debit")
    cr_i = mapped.get("credit")
    vno_i = mapped.get("voucher_no")
    nar_i = mapped.get("narration")
    if acc_i is None:
        raise HTTPException(422, "Choose which column holds the account names")
    if dr_i is None and cr_i is None:
        raise HTTPException(422, "Choose the debit and/or credit columns")
    entries = []
    for r in raw[header_idx + 1:]:
        cells = list(r) + [None] * 14
        acct = str(cells[acc_i] or "").strip()
        if not acct:
            continue
        if acct.lower() in ("total", "grand total") or acct.lower().startswith("total "):
            continue
        debit = _num(cells[dr_i]) if dr_i is not None and dr_i < len(cells) else 0.0
        credit = _num(cells[cr_i]) if cr_i is not None and cr_i < len(cells) else 0.0
        if debit == 0.0 and credit == 0.0:
            continue
        entries.append({
            "date": _parse_date(cells[date_i]) if date_i is not None and date_i < len(cells) else None,
            "voucher_no": str(cells[vno_i]).strip() if vno_i is not None and vno_i < len(cells) and cells[vno_i] is not None else "",
            "voucher_type": "", "account": acct,
            "debit": round(debit, 2), "credit": round(credit, 2),
            "narration": (str(cells[nar_i]).strip() if nar_i is not None and nar_i < len(cells) and cells[nar_i] is not None else "")[:300],
        })
    if not entries:
        raise HTTPException(422, "No ledger entries found with the chosen columns")
    return entries, 0


# ---------------- Integrations (Settings tab) — declared BEFORE /{engagement_id} routes ----------------

@router.get("/ledger/integrations")
async def integrations(authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    clients = []
    async for c in db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1, "accounting_system": 1}).sort("name", 1):
        clients.append({"client_id": c.get("client_id"), "client_name": c.get("name") or c.get("client_name"),
                        "accounting_system": c.get("accounting_system") or ""})
    latest = {}
    async for s in db.ledger_ingests.find({}, {"_id": 0, "client_id": 1, "source": 1, "vouchers": 1,
                                               "period_from": 1, "period_to": 1, "at": 1}).sort("at", -1):
        if s.get("client_id") and s["client_id"] not in latest:
            latest[s["client_id"]] = s
    return {"integrations": [{**c, "last_ingest": latest.get(c["client_id"])} for c in clients]}


@router.patch("/ledger/integrations/{client_id}")
async def set_accounting_system(client_id: str, body: Optional[dict] = None,
                                authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    system = (body.get("accounting_system") or "").strip()
    if system and system not in ACCOUNTING_SYSTEMS:
        raise HTTPException(422, f"Unknown accounting system — use one of: {', '.join(ACCOUNTING_SYSTEMS)}")
    res = await db.clients.update_one({"client_id": client_id}, {"$set": {"accounting_system": system}})
    if not res.matched_count:
        raise HTTPException(404, "Client not found")
    return {"ok": True, "client_id": client_id, "accounting_system": system}


# ---------------- Ledger summary ----------------

@router.get("/ledger/{engagement_id}")
async def ledger_summary(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    summary = await db.ledger_ingests.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not summary:
        return {"available": False}
    top = []
    async for row in db.ledger_entries.aggregate([
        {"$match": {"engagement_id": engagement_id}},
        {"$group": {"_id": "$account", "debit": {"$sum": "$debit"}, "credit": {"$sum": "$credit"}, "n": {"$sum": 1}}},
        {"$sort": {"debit": -1}}, {"$limit": 15},
    ]):
        top.append({"account": row["_id"], "debit": round(row["debit"], 2),
                    "credit": round(row["credit"], 2), "entries": row["n"]})
    return {"available": True, **summary, "accounts_top": top}
