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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


SCOPE_CATEGORIES = {
    "customers": ["Trade Licence", "Passport", "Emirates ID", "KYC Review", "UBO / Ownership", "Address / Supporting Records"],
    "firm": ["Firm Trade Licence", "Tenancy / Lease", "Establishment Card", "Professional Indemnity", "Other Insurance", "Firm Registrations", "Operational Records"],
    "staff": ["Residence Visa", "Emirates ID", "Passport", "Medical Insurance", "Employment Records"],
}
STAGES_LIST = ["Not requested", "Requested", "Received", "Under review", "Verified", "Renewal in progress", "Not applicable"]


@router.get("/compliance/categories")
async def compliance_categories(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    return {"categories": SCOPE_CATEGORIES, "stages": STAGES_LIST}


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
    issued_date: Optional[str] = None
    verified_date: Optional[str] = None
    verified_by: Optional[str] = None
    followup_date: Optional[str] = None
    location_note: Optional[str] = None
    date_basis_none: Optional[bool] = False  # "no date tracked"


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
    issued_date: Optional[str] = None
    verified_date: Optional[str] = None
    verified_by: Optional[str] = None
    followup_date: Optional[str] = None
    location_note: Optional[str] = None
    date_basis_none: Optional[bool] = None
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
    if rec.stage not in STAGES_LIST:
        raise HTTPException(status_code=400, detail="Invalid stage")
    today_s = datetime.now(timezone.utc).date().isoformat()
    if rec.stage == "Verified" and (not rec.verified_date or not rec.verified_by):
        raise HTTPException(status_code=422, detail="Verified records need a verification date and reviewer")
    if rec.verified_date and rec.verified_date > today_s:
        raise HTTPException(status_code=422, detail="Verification date cannot be in the future")
    if rec.issued_date and rec.due_date and rec.date_basis == "expiry" and rec.issued_date > rec.due_date:
        raise HTTPException(status_code=422, detail="Issue date must be on or before expiry")
    doc = rec.model_dump()
    if doc.pop("date_basis_none", False):
        doc["date_basis"] = "none"
        doc["due_date"] = None
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
    if updates.pop("date_basis_none", False):
        updates["date_basis"] = "none"
        updates["due_date"] = None
    change_reason = req.change_reason
    old_due = rec.get("due_date")
    today_s = datetime.now(timezone.utc).date().isoformat()
    new_stage = updates.get("stage", rec.get("stage"))
    new_vdate = updates.get("verified_date", rec.get("verified_date"))
    new_vby = updates.get("verified_by", rec.get("verified_by"))
    if new_stage == "Verified" and (not new_vdate or not new_vby):
        raise HTTPException(status_code=422, detail="Verified records need a verification date and reviewer")
    if new_vdate and new_vdate > today_s:
        raise HTTPException(status_code=422, detail="Verification date cannot be in the future")
    if updates.get("date_basis") == "none" or (rec.get("date_basis") == "none" and "due_date" not in updates):
        pass
    history_entry = None
    history_entry = None
    if "due_date" in updates and updates["due_date"] != old_due:
        if old_due and not change_reason:
            raise HTTPException(status_code=422, detail="Reason required when changing an existing date")
        history_entry = {
            "field": "due_date", "from": old_due, "to": updates["due_date"],
            "reason": change_reason or "Date set", "by": user.get("name"),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    elif "stage" in updates and updates["stage"] != rec.get("stage"):
        history_entry = {
            "field": "stage", "from": rec.get("stage"), "to": updates["stage"],
            "reason": change_reason or "Stage updated", "by": user.get("name"),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    elif any(k in updates for k in ("verified_date", "verified_by")):
        history_entry = {
            "field": "verification", "from": rec.get("verified_date"), "to": new_vdate,
            "reason": change_reason or "Verification recorded", "by": user.get("name"),
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


# ---------------- Firm dues & expenses (DEWA, rent, payroll, premiums…) ----------------
# Recurring organisation expenses with due dates, so partners see every
# day-to-day operating payment in one register alongside the document register.

DUE_CATEGORIES = ["Utilities", "Rent", "Telecom", "Payroll", "Insurance", "Government fees", "Professional fees", "Other"]
DUE_FREQUENCIES = ["Monthly", "Quarterly", "Semi-annual", "Annual", "One-off"]
_FREQ_MONTHS = {"Monthly": 1, "Quarterly": 3, "Semi-annual": 6, "Annual": 12}


def _roll_forward(due: date, frequency: str) -> str:
    months = _FREQ_MONTHS.get(frequency, 0)
    if not months:
        return due.isoformat()
    m = due.month - 1 + months
    return date(due.year + m // 12, m % 12 + 1, min(due.day, 28)).isoformat()


class FirmDueIn(BaseModel):
    title: str
    category: str = "Other"
    vendor: Optional[str] = None
    amount: float = 0.0
    frequency: str = "Monthly"
    next_due: Optional[str] = None
    auto_rollover: bool = True
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class FirmDueUpdateIn(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    vendor: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    next_due: Optional[str] = None
    auto_rollover: Optional[bool] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    action: Optional[str] = None  # "mark_paid" rolls the due date forward


@router.get("/compliance/dues")
async def list_dues(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    today = _today()
    dues = await db.firm_dues.find({}, {"_id": 0}).sort("next_due", 1).to_list(500)
    summary = {"due_now": 0, "due_7": 0, "due_30": 0, "monthly_outlook": 0.0, "next_due": None, "overdue_amount": 0.0}
    for d in dues:
        try:
            nd = date.fromisoformat(d["next_due"]) if d.get("next_due") else None
        except (ValueError, KeyError):
            nd = None
        if nd:
            n = (nd - today).days
            if n <= 0:
                summary["due_now"] += 1
                summary["overdue_amount"] += d.get("amount", 0.0) if n < 0 else 0.0
            if n <= 7:
                summary["due_7"] += 1
            if n <= 30:
                summary["due_30"] += 1
            if not summary["next_due"]:
                summary["next_due"] = {"title": d["title"], "date": d["next_due"], "amount": d.get("amount", 0.0)}
        if d.get("frequency") == "Monthly":
            summary["monthly_outlook"] += d.get("amount", 0.0)
    return {"dues": dues, "summary": summary, "categories": DUE_CATEGORIES, "frequencies": DUE_FREQUENCIES}


@router.post("/compliance/dues")
async def create_due(due: FirmDueIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partner only")
    doc = {"due_id": f"due_{uuid.uuid4().hex[:12]}", **due.model_dump(exclude_none=True),
           "last_paid_on": None, "created_by": user.get("name"), "created_at": _now_iso()}
    await db.firm_dues.insert_one(doc)
    return {"ok": True, "due_id": doc["due_id"]}


@router.patch("/compliance/dues/{due_id}")
async def update_due(due_id: str, req: FirmDueUpdateIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partner only")
    existing = await db.firm_dues.find_one({"due_id": due_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Due not found")
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items() if k != "action"}
    if req.action == "mark_paid":
        today = _today()
        try:
            base = date.fromisoformat(existing["next_due"]) if existing.get("next_due") else today
        except ValueError:
            base = today
        # If the due date already passed, roll from it; otherwise from today
        anchor = base if base < today else today
        updates["last_paid_on"] = today.isoformat()
        if existing.get("auto_rollover", True):
            updates["next_due"] = _roll_forward(anchor, req.frequency or existing.get("frequency", "Monthly"))
    if updates:
        await db.firm_dues.update_one({"due_id": due_id}, {"$set": updates})
    return {"ok": True, "next_due": updates.get("next_due", existing.get("next_due"))}


@router.delete("/compliance/dues/{due_id}")
async def delete_due(due_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partner only")
    await db.firm_dues.delete_one({"due_id": due_id})
    return {"ok": True}
