"""Lead management v2 - enquiries -> proposals -> engagements pipeline.

Stages: New lead / Qualified / Proposal sent / Negotiation / Confirmed / Rejected.
"""
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

STAGES = ["New lead", "Qualified", "Proposal sent", "Negotiation", "Confirmed", "Rejected"]
REJECTION_REASONS = ["Fee / budget", "Existing auditor retained", "Scope mismatch", "Timing / postponed", "Lost to competitor", "Other"]


class LeadIn(BaseModel):
    company: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: str = "Referral"
    source_detail: Optional[str] = None
    service: str = "External Audit"
    owner: Optional[str] = None
    received_date: Optional[str] = None
    value: float = 0
    stage: str = "New lead"
    proposal_ref: Optional[str] = None
    sent_date: Optional[str] = None
    expected_decision_date: Optional[str] = None
    followup_date: Optional[str] = None
    closed_date: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None


def _pct(a, b):
    return round(a / b * 100) if b else None


def _summary(leads):
    sent = [l for l in leads if l.get("sent_date")]
    confirmed = [l for l in leads if l["stage"] == "Confirmed"]
    rejected = [l for l in leads if l["stage"] == "Rejected"]
    open_leads = [l for l in leads if l["stage"] not in ("Confirmed", "Rejected")]
    open_proposals = [l for l in sent if l["stage"] not in ("Confirmed", "Rejected")]
    today = datetime.now(timezone.utc).date().isoformat()
    attention = {
        "open_without_followup": sum(1 for l in open_leads if not l.get("followup_date")),
        "qualified_without_proposal": sum(1 for l in open_leads if l["stage"] == "Qualified" and not l.get("sent_date")),
        "decision_date_passed": sum(1 for l in open_leads if l.get("expected_decision_date") and l["expected_decision_date"] < today),
        "overdue_followups": sum(1 for l in open_leads if l.get("followup_date") and l["followup_date"] < today),
        "confirmed_count": len(confirmed),
        "acceptance_rate": _pct(len(confirmed), len(sent)),
        "closed_win_rate": _pct(len(confirmed), len(confirmed) + len(rejected)),
    }
    by_source = {}
    for s in sorted({l.get("source", "Other") for l in leads}):
        rs = [l for l in leads if l.get("source") == s]
        w = sum(1 for l in rs if l["stage"] == "Confirmed")
        lo = sum(1 for l in rs if l["stage"] == "Rejected")
        by_source[s] = {"leads": len(rs), "sent": sum(1 for l in rs if l.get("sent_date")),
                        "confirmed": w, "rejected": lo,
                        "confirmed_value": sum(l.get("value", 0) for l in rs if l["stage"] == "Confirmed"),
                        "closed_win_rate": _pct(w, w + lo)}
    by_owner = {}
    for o in sorted({l.get("owner", "-") for l in leads}):
        rs = [l for l in leads if l.get("owner") == o]
        by_owner[o] = {"leads": len(rs),
                       "sent": sum(1 for l in rs if l.get("sent_date")),
                       "confirmed": sum(1 for l in rs if l["stage"] == "Confirmed"),
                       "rejected": sum(1 for l in rs if l["stage"] == "Rejected"),
                       "open_value": sum(l.get("value", 0) for l in rs if l.get("sent_date") and l["stage"] not in ("Confirmed", "Rejected"))}
    return {
        "new_leads": len(leads),
        "proposals_sent": len(sent),
        "sent_rate": _pct(len(sent), len(leads)),
        "confirmed": len(confirmed),
        "confirmed_value": sum(l.get("value", 0) for l in confirmed),
        "rejected": len(rejected),
        "open_proposal_value": sum(l.get("value", 0) for l in open_proposals),
        "by_stage": {s: sum(1 for l in leads if l["stage"] == s) for s in STAGES},
        "loss_reasons": {r: sum(1 for l in rejected if (l.get("rejection_reason") or "Not recorded") == r)
                         for r in sorted({(l.get("rejection_reason") or "Not recorded") for l in rejected})},
        "attention": attention,
        "by_source": by_source,
        "by_owner": by_owner,
        "stages": STAGES,
        "rejection_reasons": REJECTION_REASONS,
    }


@router.get("/leads")
async def list_leads(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    migrate = {"New": "New lead", "Contacted": "Qualified"}
    for l in leads:
        if l["stage"] in migrate:
            l["stage"] = migrate[l["stage"]]
    return {"leads": leads, "summary": _summary(leads)}


@router.post("/leads")
async def create_lead(req: LeadIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if req.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    if req.stage == "Rejected" and not req.rejection_reason:
        raise HTTPException(status_code=422, detail="Choose a rejection reason")
    doc = req.model_dump()
    doc.update({
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}",
        "owner": req.owner or user.get("name"),
        "received_date": req.received_date or datetime.now(timezone.utc).date().isoformat(),
        "history": [{"text": "Lead created", "at": datetime.now(timezone.utc).isoformat(), "by": user.get("name")}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, stage: Optional[str] = None, value: Optional[float] = None,
                      followup_date: Optional[str] = None, notes: Optional[str] = None,
                      proposal_ref: Optional[str] = None, sent_date: Optional[str] = None,
                      expected_decision_date: Optional[str] = None, closed_date: Optional[str] = None,
                      rejection_reason: Optional[str] = None, source_detail: Optional[str] = None,
                      authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    update = {}
    if stage is not None and stage != lead["stage"]:
        if stage not in STAGES:
            raise HTTPException(status_code=400, detail="Invalid stage")
        if stage == "Rejected" and not (rejection_reason or lead.get("rejection_reason")):
            raise HTTPException(status_code=422, detail="Choose a rejection reason")
        update["stage"] = stage
        await db.leads.update_one({"lead_id": lead_id}, {"$push": {"history": {
            "text": f"Stage changed: {lead['stage']} -> {stage}",
            "at": datetime.now(timezone.utc).isoformat(), "by": user.get("name")}}})
    for k, v in [("value", value), ("followup_date", followup_date), ("notes", notes),
                 ("proposal_ref", proposal_ref), ("sent_date", sent_date),
                 ("expected_decision_date", expected_decision_date), ("closed_date", closed_date),
                 ("rejection_reason", rejection_reason), ("source_detail", source_detail)]:
        if v is not None:
            update[k] = v
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
        "history": {"text": f"Confirmed - converted to proposal {proposal_id}",
                    "at": datetime.now(timezone.utc).isoformat(), "by": user.get("name"),
                    "converted_to": proposal_id}}})
    return {"ok": True, "proposal_id": proposal_id}
