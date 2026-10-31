"""B2 — Receipt inbox: AI-parsed purchase receipts with a duplicate firewall.

Staff upload receipt photos/PDFs against a service engagement. Gemini vision
extracts vendor, date, totals, VAT and TRN; the module then guards against the
classic books-and-records failure modes:
  * exact duplicate  — same file bytes already in the inbox (hard 409 block)
  * probable dupe    — same vendor + date + total already present (stored,
                       flagged, partner reviews before accepting)
Parsed fields are editable; accept/flag workflow mirrors the adjustments
register so testers can sign off receipts for expense testing / VAT input.
"""
import asyncio
import hashlib
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, File, HTTPException, Header, Query, Response, UploadFile
from fastapi import Body

from core import APP_NAME, db, get_current_user, get_object, put_object
from routes.journal import journal_event
from routes.trial_balance import _staff_only

router = APIRouter(prefix="/api")

MAX_RECEIPT_BYTES = 8 * 1024 * 1024  # 8 MB, same cap as TB staging
ALLOWED_MIMES = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "application/pdf": "pdf",
}
RECEIPT_STATUSES = ("Pending review", "Accepted", "Flagged duplicate", "Rejected")

_PARSE_PROMPT = (
    "You are an audit junior extracting structured data from a purchase "
    "receipt / tax invoice image or PDF (UAE & GCC businesses: FTA VAT rules). "
    "Return ONLY a JSON object, no markdown fences, with keys: "
    "vendor (string, supplier/trade license name), vendor_trn (string or null, TRN/VAT reg no), "
    "invoice_no (string or null), date (YYYY-MM-DD or null), "
    "currency (ISO code, default AED), total (number, grand total incl. VAT), "
    "vat_amount (number or null), vat_percent (number or null), "
    "category (one of: meals, fuel, office_supplies, travel, utilities, "
    "professional_fees, rent, IT_software, marketing, repairs, other), "
    "line_items (array of {description, qty, amount}, max 15), "
    "payment_method (string or null), "
    "confidence (0-1 how legible/complete the document is), "
    "extraction_notes (string, anything odd: cropped, handwritten, unclear VAT). "
    "If the document is not a receipt/invoice at all, return "
    '{"error": "not_a_receipt"} with all other keys null.'
)


def _today():
    return datetime.now(timezone.utc).isoformat()


def _norm_vendor(name):
    return re.sub(r'[^a-z0-9]', '', str(name or '').lower())[:40]


async def _gemini_parse(data: bytes, mime: str) -> dict:
    """Vision-parse a receipt. Lazy import so the module (and tests) load
    without the package; surfaces a clean 503 when AI isn't configured."""
    import os
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "GEMINI_API_KEY not configured — cannot auto-parse receipts")
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")

    def _sync():
        result = model.generate_content([
            {"mime_type": mime, "data": data},
            _PARSE_PROMPT,
        ])
        return result.text

    text = await asyncio.to_thread(_sync)
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text).rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        raise HTTPException(502, "AI returned unparseable output — try a clearer photo")


def _dupe_query(engagement_id: str, parsed: dict, exclude_receipt_id=None):
    """Probable-duplicate match: same engagement + vendor + date + total."""
    q = {
        "engagement_id": engagement_id,
        "is_deleted": {"$ne": True},
        "vendor_key": _norm_vendor(parsed.get("vendor")),
        "receipt_date": parsed.get("date"),
        "total": parsed.get("total"),
    }
    if exclude_receipt_id:
        q["receipt_id"] = {"$ne": exclude_receipt_id}
    return q


@router.post("/receipts/{engagement_id}/upload")
async def upload_receipt(engagement_id: str, file: UploadFile = File(...),
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id})
    if not eng:
        raise HTTPException(404, "Engagement not found")

    data = await file.read()
    if len(data) > MAX_RECEIPT_BYTES:
        raise HTTPException(413, "Receipt file too large (8 MB max)")
    mime = (file.content_type or "").split(";")[0].strip().lower()
    ext = ALLOWED_MIMES.get(mime)
    if not ext:
        raise HTTPException(400, "Only JPEG, PNG, WebP or PDF receipts are accepted")

    # --- duplicate firewall, layer 1: exact same bytes already in this inbox ---
    sha = hashlib.sha256(data).hexdigest()
    exact = await db.receipts.find_one({
        "engagement_id": engagement_id, "sha256": sha, "is_deleted": {"$ne": True}},
        {"_id": 0, "receipt_id": 1, "uploaded_by_name": 1, "created_at": 1})
    if exact:
        raise HTTPException(409, {
            "message": "Duplicate file — this exact receipt was already uploaded",
            "existing_receipt_id": exact.get("receipt_id"),
            "uploaded_by": exact.get("uploaded_by_name"),
            "uploaded_at": exact.get("created_at"),
        })

    # store the file first (parse never leaves us without the artifact)
    receipt_id = f"rcp_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/receipts/{engagement_id}/{receipt_id}.{ext}"
    put_object(path, data, mime)

    parsed = await _gemini_parse(data, mime)
    if parsed.get("error") == "not_a_receipt":
        raise HTTPException(422, "This doesn't look like a receipt or invoice — not saved")

    doc = {
        "receipt_id": receipt_id,
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "file_path": path,
        "file_name": file.filename,
        "mime_type": mime,
        "size": len(data),
        "sha256": sha,
        "vendor": parsed.get("vendor"),
        "vendor_key": _norm_vendor(parsed.get("vendor")),
        "vendor_trn": parsed.get("vendor_trn"),
        "invoice_no": parsed.get("invoice_no"),
        "receipt_date": parsed.get("date"),
        "currency": parsed.get("currency") or "AED",
        "total": parsed.get("total"),
        "vat_amount": parsed.get("vat_amount"),
        "vat_percent": parsed.get("vat_percent"),
        "category": parsed.get("category") or "other",
        "line_items": (parsed.get("line_items") or [])[:15],
        "payment_method": parsed.get("payment_method"),
        "confidence": parsed.get("confidence"),
        "extraction_notes": parsed.get("extraction_notes"),
        "status": "Pending review",
        "duplicate_of": None,
        "uploaded_by": user["user_id"],
        "uploaded_by_name": user.get("name", "Staff"),
        "is_deleted": False,
        "created_at": _today(),
    }
    # --- duplicate firewall, layer 2: same vendor+date+total already present ---
    prob = await db.receipts.find_one(_dupe_query(engagement_id, doc), {"_id": 0, "receipt_id": 1, "uploaded_by_name": 1})
    if prob:
        doc["status"] = "Flagged duplicate"
        doc["duplicate_of"] = prob.get("receipt_id")

    await db.receipts.insert_one(doc)
    await journal_event(engagement_id, "receipt_uploaded",
                        f"Receipt uploaded: {doc['vendor'] or 'unknown vendor'} "
                        f"{doc['currency']} {doc['total']} ({doc['status']})",
                        by_name=user.get("name") or user.get("email"),
                        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    doc.pop("_id", None)
    return doc


@router.get("/receipts/{engagement_id}")
async def list_receipts(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    rows = await db.receipts.find(
        {"engagement_id": engagement_id, "is_deleted": {"$ne": True}},
        {"_id": 0}).sort("created_at", -1).to_list(500)
    totals = {
        "count": len(rows),
        "accepted": sum(1 for r in rows if r.get("status") == "Accepted"),
        "pending": sum(1 for r in rows if r.get("status") == "Pending review"),
        "flagged": sum(1 for r in rows if r.get("status") == "Flagged duplicate"),
        "vat_total": sum(float(r.get("vat_amount") or 0) for r in rows if r.get("status") == "Accepted"),
        "total_spend": sum(float(r.get("total") or 0) for r in rows if r.get("status") == "Accepted"),
    }
    return {"receipts": rows, "totals": totals}


@router.get("/receipts/{engagement_id}/{receipt_id}/file")
async def receipt_file(engagement_id: str, receipt_id: str, authorization: str = Header(None),
                       session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await _staff_only(await get_current_user(auth_header, session_token))
    doc = await db.receipts.find_one({"receipt_id": receipt_id, "engagement_id": engagement_id,
                                      "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Receipt not found")
    try:
        data, ctype = get_object(doc["file_path"])
    except FileNotFoundError:
        raise HTTPException(404, "Receipt file missing from storage")
    return Response(content=data, media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{doc.get("file_name", "receipt")}"'})


@router.patch("/receipts/{engagement_id}/{receipt_id}")
async def update_receipt(engagement_id: str, receipt_id: str,
                         payload: dict = Body(...),
                         authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    doc = await db.receipts.find_one({"receipt_id": receipt_id, "engagement_id": engagement_id,
                                      "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Receipt not found")

    editable = ("vendor", "vendor_trn", "invoice_no", "receipt_date", "currency",
                "total", "vat_amount", "vat_percent", "category", "payment_method",
                "extraction_notes")
    updates = {k: payload[k] for k in editable if k in payload}
    if "vendor" in updates:
        updates["vendor_key"] = _norm_vendor(updates["vendor"])
    if "status" in payload:
        if payload["status"] not in RECEIPT_STATUSES:
            raise HTTPException(400, f"Status must be one of {RECEIPT_STATUSES}")
        updates["status"] = payload["status"]
        if payload["status"] != "Flagged duplicate":
            updates["duplicate_of"] = None
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["edited_by"] = user.get("name", user["user_id"])
    updates["edited_at"] = _today()
    await db.receipts.update_one({"receipt_id": receipt_id}, {"$set": updates})

    if updates.get("status") and updates["status"] != doc.get("status"):
        await journal_event(engagement_id, "receipt_status",
                            f"Receipt {doc.get('vendor') or receipt_id} → {updates['status']}",
                            by_name=user.get("name") or user.get("email"),
                            client_id=doc.get("client_id") or "", client_name=doc.get("client_name") or "")
    return {**doc, **updates, "_id": None}


@router.delete("/receipts/{engagement_id}/{receipt_id}")
async def delete_receipt(engagement_id: str, receipt_id: str, authorization: str = Header(None),
                         session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    result = await db.receipts.update_one(
        {"receipt_id": receipt_id, "engagement_id": engagement_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True, "deleted_by": user.get("name", user["user_id"]), "deleted_at": _today()}})
    if result.matched_count == 0:
        raise HTTPException(404, "Receipt not found")
    return {"message": "Receipt deleted"}
