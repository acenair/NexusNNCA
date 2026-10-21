"""Lead management — enquiries → proposals → engagements pipeline (Auditflow mockup)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from pydantic import BaseModel

from core import db, get_current_user

router = APIRouter(prefix="/api")

STAGES = ["New", "Contacted", "Proposal sent", "Confirmed", "Rejected"]


class LeadIn(BaseModel):
    company: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: str = "Referral"          # Referral | Website | Email enquiry | Phone / WhatsApp | Existing client | Networking
    service: str = "External Audit"   # service line
    owner: Optional[str] = None
    value: float = 0                  # expected fee AED
    stage: str = "New"
    followup_date: Optional[str] = None
    notes: Optional[str] = None


def _summary(leads):
    live = [l for l in leads if l["stage"] not in ("Rejected",)]
    confirmed = [l for l in leads if l["stage"] == "Confirmed"]
    rejected = [l for l in leads if l["stage"] == "Rejected"]
    proposed = [l for l in leads if l["stage"] in ("Proposal sent", "Confirmed")]
    open_value = sum(l.get("value", 0) for l in live if l["stage"] == "Proposal sent")
    win_rate = round(len(confirmed) / len(proposed) * 100) if proposed else 0
    return {
        "new_leads": len(leads),
        "proposals_sent": len(proposed),
        "confirmed": len(confirmed),
        "confirmed_value": sum(l.get("value", 0) for l in confirmed),
        "rejected": len(rejected),
        "open_value": open_value,
        "win_rate": win_rate,
        "by_stage": {s: sum(1 for l in leads if l["stage"] == s) for s in STAGES},
        "by_source": {},
    }


@router.get("/leads")
async def list_leads(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"leads": leads, "summary": _summary(leads)}


@router.post("/leads")
async def create_lead(req: LeadIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    doc = req.model_dump()
    doc.update({
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}",
        "owner": req.owner or user.get("name"),
        "history": [{"stage": "New", "at": datetime.now(timezone.utc).isoformat(), "by": user.get("name")}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, stage: Optional[str] = None, value: Optional[float] = None,
                      followup_date: Optional[str] = None, notes: Optional[str] = None,
                      authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    update = {}
    if stage is not None and stage != lead["stage"]:
        if stage not in STAGES:
            raise HTTPException(status_code=400, detail="Invalid stage")
        update["stage"] = stage
        await db.leads.update_one({"lead_id": lead_id}, {"$push": {"history": {
            "stage": stage, "at": datetime.now(timezone.utc).isoformat(), "by": user.get("name")}}})
    if value is not None:
        update["value"] = value
    if followup_date is not None:
        update["followup_date"] = followup_date
    if notes is not None:
        update["notes"] = notes
    if update:
        await db.leads.update_one({"lead_id": lead_id}, {"$set": update})
    return {"ok": True, **({"stage": stage} if stage else {})}


@router.post("/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Confirmed lead -> proposal in the proposals pipeline."""
    user = await get_current_user(authorization, session_token)
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead["stage"] == "Confirmed":
        return {"ok": True, "already": True}
    proposal_id = f"prop_{uuid.uuid4().hex[:10]}"
    await db.proposals.insert_one({
        "proposal_id": proposal_id, "client_name": lead["company"],
        "service": lead["service"], "value": lead.get("value", 0),
        "stage": "Confirmed", "owner": lead.get("owner"),
        "notes": f"Converted from lead {lead['lead_id']} ({lead.get('source')})",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.leads.update_one({"lead_id": lead_id}, {"$set": {"stage": "Confirmed"}, "$push": {
        "history": {"stage": "Confirmed", "at": datetime.now(timezone.utc).isoformat(),
                    "by": user.get("name"), "converted_to": proposal_id}}})
    return {"ok": True, "proposal_id": proposal_id}
