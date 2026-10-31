"""B3 — VAT reconciliation: books VAT vs filed VAT returns, per tax period.

For a client's engagement this compares, quarter by quarter:
  * BOOKS VAT — aggregated from the ingested general-ledger entries
    (ledger_entries, same VAT-account patterns as the books-ingestion totals)
    plus accepted receipts' input VAT as a secondary signal;
  * FILED VAT — the FTA return boxes captured on the client's vat_filings
    (Box 1a standard-rated output + Box 1b reverse-charge vs Box 4 recoverable
    input).
Variances beyond AED 1 are flagged for review; each period can be signed off
(Reviewed) with a note, mirroring the adjustments-register workflow.
"""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from fastapi import Body

from core import db, get_current_user
from routes.journal import journal_event
from routes.trial_balance import _staff_only

router = APIRouter(prefix="/api")

VAT_OUT_PAT = re.compile(r"output vat|vat payable|vat output|sales tax payable", re.I)
VAT_IN_PAT = re.compile(r"input vat|vat recover|vat input|purchase tax", re.I)
TOLERANCE = 1.0  # AED — rounding-level differences reconcile


def _today():
    return datetime.now(timezone.utc).isoformat()


def _quarter_key(iso_date):
    """'2025-08-14' → '2025-Q3' (fiscal quarters = calendar quarters)."""
    if not iso_date:
        return None
    m = re.match(r"(\d{4})-(\d{2})", str(iso_date))
    if not m:
        return None
    y, mo = int(m.group(1)), int(m.group(2))
    return f"{y}-Q{(mo - 1) // 3 + 1}"


async def books_vat_by_quarter(client_id):
    """Per-quarter books VAT from the ingested general ledger entries."""
    quarters = {}
    async for e in db.ledger_entries.find(
            {"client_id": client_id},
            {"date": 1, "account": 1, "debit": 1, "credit": 1, "_id": 0}):
        qk = _quarter_key(e.get("date"))
        if not qk:
            continue
        a = str(e.get("account") or "")
        dr = float(e.get("debit") or 0.0)
        cr = float(e.get("credit") or 0.0)
        q = quarters.setdefault(qk, {"output": 0.0, "input": 0.0, "entries": 0})
        q["entries"] += 1
        if VAT_OUT_PAT.search(a):
            q["output"] += cr - dr
        elif VAT_IN_PAT.search(a):
            q["input"] += dr - cr
    for q in quarters.values():
        q["output"] = round(max(q["output"], 0.0), 2)
        q["input"] = round(max(q["input"], 0.0), 2)
    return quarters


async def receipts_vat_by_quarter(client_id):
    """Accepted receipts' input VAT per quarter — a secondary books-side signal."""
    quarters = {}
    async for r in db.receipts.find(
            {"client_id": client_id, "status": "Accepted", "is_deleted": {"$ne": True}},
            {"receipt_date": 1, "vat_amount": 1, "_id": 0}):
        qk = _quarter_key(r.get("receipt_date"))
        if qk and r.get("vat_amount") is not None:
            quarters[qk] = round(quarters.get(qk, 0.0) + float(r["vat_amount"]), 2)
    return quarters


def _classify(filing_status, books, filed_output, filed_input):
    if books is None or books["entries"] == 0:
        return "Books missing"
    if (filing_status or "Pending") != "Filed":
        return "Not filed"
    if abs(books["output"] - filed_output) <= TOLERANCE and \
       abs(books["input"] - filed_input) <= TOLERANCE:
        return "Reconciled"
    return "Variance"


@router.get("/vat/recon/{engagement_id}")
async def vat_reconciliation(engagement_id: str, authorization: str = Header(None),
                             session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    client_id = eng.get("client_id")

    filings = await db.vat_filings.find({"client_id": client_id}, {"_id": 0}) \
        .sort("period_end_date", 1).to_list(100)
    books = await books_vat_by_quarter(client_id)
    receipts_vat = await receipts_vat_by_quarter(client_id)
    reviews = {r["period_key"]: r for r in await db.vat_recon_reviews.find(
        {"client_id": client_id}, {"_id": 0}).to_list(100)}

    rows = []
    seen = set()
    for f in filings:
        qk = _quarter_key(f.get("period_end_date")) or f.get("tax_period")
        seen.add(qk)
        b = books.get(qk)
        row = {
            "period_key": qk,
            "tax_period": f.get("tax_period"),
            "period_end_date": f.get("period_end_date"),
            "filing_id": f.get("filing_id"),
            "filing_status": f.get("status", "Pending"),
            "filed_output": round(float(f.get("box_1a") or 0) + float(f.get("box_1b") or 0), 2),
            "filed_input": round(float(f.get("box_4") or 0), 2),
            "books_output": b["output"] if b else None,
            "books_input": b["input"] if b else None,
            "books_entries": b["entries"] if b else 0,
            "receipts_input_vat": receipts_vat.get(qk, 0.0) or None,
            "variance_output": None, "variance_input": None,
            "status": None,
            "review": reviews.get(qk),
        }
        if b:
            row["variance_output"] = round(b["output"] - row["filed_output"], 2)
            row["variance_input"] = round(b["input"] - row["filed_input"], 2)
        row["status"] = _classify(f.get("status", "Pending"),
                                  {"entries": b["entries"] if b else 0,
                                   "output": b["output"] if b else 0,
                                   "input": b["input"] if b else 0},
                                  row["filed_output"], row["filed_input"])
        rows.append(row)

    # book quarters with no filing at all — an unfiled period is a finding
    for qk in sorted(set(books) - seen):
        b = books[qk]
        if b["output"] == 0 and b["input"] == 0:
            continue
        rows.append({
            "period_key": qk, "tax_period": qk.replace("-", " "), "period_end_date": None,
            "filing_id": None, "filing_status": None,
            "filed_output": None, "filed_input": None,
            "books_output": b["output"], "books_input": b["input"],
            "books_entries": b["entries"], "receipts_input_vat": receipts_vat.get(qk, 0.0) or None,
            "variance_output": None, "variance_input": None,
            "status": "No return filed", "review": reviews.get(qk),
        })

    # periods a reviewer signed off that have neither filing nor books — stay visible
    for qk, review in reviews.items():
        if qk not in seen and qk not in books:
            rows.append({
                "period_key": qk, "tax_period": qk.replace("-", " "), "period_end_date": None,
                "filing_id": None, "filing_status": None,
                "filed_output": None, "filed_input": None,
                "books_output": None, "books_input": None, "books_entries": 0,
                "receipts_input_vat": None, "variance_output": None, "variance_input": None,
                "status": "Books missing", "review": review,
            })

    rows.sort(key=lambda r: r["period_key"] or "")
    books_ledger = await db.ledger_ingests.find_one(
        {"client_id": client_id}, {"_id": 0, "source": 1, "at": 1, "file_name": 1})
    return {
        "engagement_id": engagement_id, "client_id": client_id, "client_name": eng.get("client_name"),
        "books_ledger": books_ledger, "periods": rows,
        "totals": {
            "periods": len(rows),
            "reconciled": sum(1 for r in rows if r["status"] == "Reconciled"),
            "variance": sum(1 for r in rows if r["status"] in ("Variance", "No return filed")),
            "books_missing": sum(1 for r in rows if r["status"] == "Books missing"),
            "not_filed": sum(1 for r in rows if r["status"] in ("Not filed", "No return filed")),
        },
    }


@router.patch("/vat/recon/{engagement_id}/{period_key}")
async def review_period(engagement_id: str, period_key: str, payload: dict = Body(...),
                        authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    note = str(payload.get("note") or "").strip()
    review = {
        "client_id": eng.get("client_id"), "period_key": period_key,
        "reviewed_by": user.get("name") or user.get("email"),
        "reviewed_at": _today(), "note": note[:500],
    }
    await db.vat_recon_reviews.update_one(
        {"client_id": eng.get("client_id"), "period_key": period_key},
        {"$set": review}, upsert=True)
    await journal_event(engagement_id, "vat_recon_reviewed",
                        f"VAT reconciliation for {period_key} reviewed by {review['reviewed_by']}"
                        + (f" — {note}" if note else ""),
                        by_name=review["reviewed_by"],
                        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    return review


@router.delete("/vat/recon/{engagement_id}/{period_key}")
async def unreview_period(engagement_id: str, period_key: str, authorization: str = Header(None),
                          session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    await db.vat_recon_reviews.delete_one(
        {"client_id": eng.get("client_id"), "period_key": period_key})
    return {"ok": True}
