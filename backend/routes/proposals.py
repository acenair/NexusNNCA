"""Routes / proposals — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from datetime import datetime
from core import db
from core import log_activity
from core import require_partner
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


class ProposalTemplateRequest(BaseModel):
    name: str
    scope_of_work: str = ""
    fee_structure: str = ""
    terms: str = ""
    service_type: Optional[str] = None


@router.post("/proposal-templates")
async def create_proposal_template(req: ProposalTemplateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    template_id = f"ptpl_{uuid.uuid4().hex[:12]}"
    doc = {"template_id": template_id, "name": req.name, "scope_of_work": req.scope_of_work, "fee_structure": req.fee_structure, "terms": req.terms, "service_type": req.service_type, "created_by": user["user_id"], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.proposal_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/proposal-templates")
async def get_proposal_templates(authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    return await db.proposal_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.delete("/proposal-templates/{template_id}")
async def delete_proposal_template(template_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    r = await db.proposal_templates.delete_one({"template_id": template_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


class ProposalRequest(BaseModel):
    client_id: str
    client_name: Optional[str] = None
    template_id: Optional[str] = None
    title: str
    scope_of_work: str = ""
    fee_structure: str = ""
    terms: str = ""
    total_fee: Optional[float] = None
    status: str = "Draft"


@router.post("/proposals")
async def create_proposal(req: ProposalRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    proposal_id = f"prop_{uuid.uuid4().hex[:12]}"
    cname = req.client_name
    if not cname:
        c = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
        cname = c["name"] if c else "Unknown"
    doc = {"proposal_id": proposal_id, "client_id": req.client_id, "client_name": cname, "template_id": req.template_id, "title": req.title, "scope_of_work": req.scope_of_work, "fee_structure": req.fee_structure, "terms": req.terms, "total_fee": req.total_fee, "status": req.status, "created_by": user["user_id"], "created_by_name": user.get("name"), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.proposals.insert_one(doc)
    doc.pop("_id", None)
    await log_activity("Proposal created", f"Proposal '{req.title}' for {cname}", user["user_id"], req.client_id, cname)
    return doc


@router.get("/proposals")
async def get_proposals(authorization: str = Header(None), session_token: str = Cookie(None), client_id: Optional[str] = None):
    await require_partner(authorization, session_token)
    query = {}
    if client_id:
        query["client_id"] = client_id
    return await db.proposals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.patch("/proposals/{proposal_id}")
async def update_proposal(proposal_id: str, authorization: str = Header(None), session_token: str = Cookie(None), status: Optional[str] = None, title: Optional[str] = None, scope_of_work: Optional[str] = None, fee_structure: Optional[str] = None, terms: Optional[str] = None, total_fee: Optional[float] = None):
    user = await require_partner(authorization, session_token)
    prop = await db.proposals.find_one({"proposal_id": proposal_id})
    if not prop:
        raise HTTPException(status_code=404, detail="Proposal not found")
    update = {}
    if status and status in ("Draft", "Sent", "Accepted", "Declined"):
        update["status"] = status
    if title is not None: update["title"] = title
    if scope_of_work is not None: update["scope_of_work"] = scope_of_work
    if fee_structure is not None: update["fee_structure"] = fee_structure
    if terms is not None: update["terms"] = terms
    if total_fee is not None: update["total_fee"] = total_fee
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.proposals.update_one({"proposal_id": proposal_id}, {"$set": update})
    return {"message": "Proposal updated"}


@router.delete("/proposals/{proposal_id}")
async def delete_proposal(proposal_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    r = await db.proposals.delete_one({"proposal_id": proposal_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {"message": "Proposal deleted"}
