"""Compliance tracker — document expiry & review register.

Scopes: customers (KYC), firm, staff. Masked references only — no scans or
full ID numbers are stored (mask guidance enforced client-side; refs stored as text).
Customers trade-licence and staff visa/passport records auto-sync from source
collections; manual records and edits are preserved.
"""
import uuid
from datetime import datetime, timezone, date

from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from pydantic import BaseModel

from core import db
from core import get_current_user

router = APIRouter(prefix="/api")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _bucket(due: Optional[str]) -> str:
    """Mockup buckets from an ISO due date."""
    if not due:
        return "no_date"
    try:
        d = datetime.fromisoformat(due).date() if isinstance(due, str) else due
    except ValueError:
        return "no_date"
    delta = (d - _today()).days
    if delta < 0:
        return "expired"
    if delta <= 30:
        return "le30"
    if delta <= 60:
        return "le60"
    return "gt60"


async def _sync_customers():
    """Trade-licence compliance records from the client master (auto rows)."""
    async for c in db.clients.find({"license_expiry": {"$nin": [None, ""]}}, {"_id": 0}):
        lic = str(c.get("trade_licence_no") or "")
        masked = ("····" + lic[-4:]) if len(lic) >= 4 else ""
        existing = await db.compliance_records.find_one(
            {"scope": "customers", "subject_id": c["client_id"], "doc_type": "Trade Licence"})
        expired = c["license_expiry"] < _today().isoformat()
        if not existing:
            await db.compliance_records.insert_one({
                "record_id": f"cmp_{uuid.uuid4().hex[:12]}", "scope": "customers",
                "subject_id": c["client_id"], "subject_name": c["name"],
                "doc_type": "Trade Licence", "holder": c.get("licensing_authority") or "—",
                "masked_ref": masked, "owner": c.get("workdone_by") or "Admin",
                "date_basis": "expiry", "due_date": c["license_expiry"],
                "stage": "Renewal in progress" if expired else "Verified",
                "authority": c.get("licensing_authority") or "", "notes": "",
                "source": "auto", "history": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        elif existing.get("source") == "auto":
            await db.compliance_records.update_one(
                {"record_id": existing["record_id"]},
                {"$set": {"due_date": c["license_expiry"], "subject_name": c["name"],
                          "stage": "Renewal in progress" if expired else "Verified"}})


async def _sync_staff():
    """Visa / passport compliance records from user profiles (auto rows)."""
    async for u in db.users.find({"role": {"$nin": ["client"]}, "$or": [
            {"visa_expiry": {"$nin": [None, ""]}}, {"passport_expiry": {"$nin": [None, ""]}}]},
            {"_id": 0, "password": 0}):
        for field, doc_type in [("visa_expiry", "Residence Visa"), ("passport_expiry", "Passport")]:
            val = u.get(field)
            if not val:
                continue
            existing = await db.compliance_records.find_one(
                {"scope": "staff", "subject_id": u["user_id"], "doc_type": doc_type})
            expired = val < _today().isoformat()
            if not existing:
                await db.compliance_records.insert_one({
                    "record_id": f"cmp_{uuid.uuid4().hex[:12]}", "scope": "staff",
                    "subject_id": u["user_id"], "subject_name": u["name"],
                    "doc_type": doc_type, "holder": u.get("title") or "—",
                    "masked_ref": "", "owner": "Admin", "date_basis": "expiry",
                    "due_date": val,
                    "stage": "Renewal in progress" if expired else "Verified",
                    "authority": "", "notes": "", "source": "auto", "history": [],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            elif existing.get("source") == "auto":
                await db.compliance_records.update_one(
                    {"record_id": existing["record_id"]},
                    {"$set": {"due_date": val, "stage": "Renewal in progress" if expired else "Verified"}})


class ComplianceRecordIn(BaseModel):
    scope: str  # customers | firm | staff
    subject_name: str
    subject_id: Optional[str] = None
    doc_type: str
    holder: Optional[str] = None
    masked_ref: Optional[str] = None
    owner: Optional[str] = None
    date_basis: str = "expiry"  # expiry | review
    due_date: Optional[str] = None
    stage: str = "Not requested"
    authority: Optional[str] = None
    notes: Optional[str] = None


class ComplianceUpdateIn(BaseModel):
    doc_type: Optional[str] = None
    holder: Optional[str] = None
    masked_ref: Optional[str] = None
    owner: Optional[str] = None
    date_basis: Optional[str] = None
    due_date: Optional[str] = None
    stage: Optional[str] = None
    authority: Optional[str] = None
    notes: Optional[str] = None
    change_reason: Optional[str] = None


@router.get("/compliance/records")
async def list_records(scope: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    await _sync_customers()
    await _sync_staff()
    query = {"scope": scope} if scope else {}
    records = await db.compliance_records.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    for r in records:
        r["bucket"] = _bucket(r.get("due_date"))
    return records


@router.post("/compliance/records")
async def create_record(rec: ComplianceRecordIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if rec.scope not in ("customers", "firm", "staff"):
        raise HTTPException(status_code=400, detail="Invalid scope")
    doc = rec.model_dump()
    doc.update({
        "record_id": f"cmp_{uuid.uuid4().hex[:12]}", "source": "manual", "history": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["user_id"],
    })
    await db.compliance_records.insert_one(doc)
    return {"record_id": doc["record_id"]}


@router.patch("/compliance/records/{record_id}")
async def update_record(record_id: str, req: ComplianceUpdateIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    rec = await db.compliance_records.find_one({"record_id": record_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")

    updates = {k: v for k, v in req.model_dump().items() if v is not None and k != "change_reason"}
    change_reason = req.change_reason
    old_due = rec.get("due_date")
    history_entry = None
    if "due_date" in updates and updates["due_date"] != old_due:
        if old_due and not change_reason:
            raise HTTPException(status_code=422, detail="Reason required when changing an existing date")
        history_entry = {
            "field": "due_date", "from": old_due, "to": updates["due_date"],
            "reason": change_reason or "Date set", "by": user.get("name"),
            "at": datetime.now(timezone.utc).isoformat(),
        }

    if updates:
        await db.compliance_records.update_one({"record_id": record_id}, {"$set": updates})
    if history_entry:
        await db.compliance_records.update_one({"record_id": record_id}, {"$push": {"history": history_entry}})
    return {"ok": True}


@router.delete("/compliance/records/{record_id}")
async def delete_record(record_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partner only")
    await db.compliance_records.delete_one({"record_id": record_id})
    return {"ok": True}
