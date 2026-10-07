"""Routes / engagements — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from services.templates import CHECKLIST_TEMPLATES
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from datetime import datetime
from core import db
from core import get_current_user
from core import log_activity
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


class CreateEngagementRequest(BaseModel):
    service_type: str
    client_id: str
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    phase: Optional[str] = None
    notes: Optional[str] = None
    workflow_id: Optional[str] = None


@router.post("/service/engagements")
async def create_service_engagement(req: CreateEngagementRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # If workflow_id provided, use workflow steps as checklist
    checklist = []
    workflow_name = None
    if req.workflow_id:
        wf = await db.workflows.find_one({"workflow_id": req.workflow_id, "is_deleted": {"$ne": True}}, {"_id": 0})
        if wf:
            workflow_name = wf.get("name")
            # Convert workflow steps into checklist groups
            checklist = [{"group": step["name"], "items": [{"label": step.get("description") or step["name"], "done": False}]} for step in wf.get("steps", [])]

    # Fallback to CHECKLIST_TEMPLATES if no workflow provided or found
    if not checklist:
        template = CHECKLIST_TEMPLATES.get(req.service_type, [])
        checklist = [{"group": g["group"], "items": [{"label": item, "done": False} for item in g["items"]]} for g in template]

    eng_id = f"eng_{uuid.uuid4().hex[:12]}"
    eng_doc = {
        "engagement_id": eng_id,
        "service_type": req.service_type,
        "client_id": req.client_id,
        "client_name": client["name"],
        "assigned_to": req.assigned_to,
        "assigned_to_name": req.assigned_to_name,
        "status": "Active",
        "phase": req.phase or (checklist[0]["group"] if checklist else ""),
        "notes": req.notes,
        "checklist": checklist,
        "workflow_id": req.workflow_id,
        "workflow_name": workflow_name,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.service_engagements.insert_one(eng_doc)
    eng_doc.pop("_id", None)
    await log_activity("Engagement created", f"{req.service_type.replace('_',' ').title()} for {client['name']}", user["user_id"], req.client_id, client["name"])
    return eng_doc


@router.get("/service/engagements")
async def list_service_engagements(authorization: str = Header(None), session_token: str = Cookie(None), service_type: Optional[str] = None, client_id: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {"status": {"$ne": "Deleted"}}
    if service_type:
        query["service_type"] = service_type
    if client_id:
        query["client_id"] = client_id
    engs = await db.service_engagements.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return engs


class ToggleChecklistRequest(BaseModel):
    group_index: int
    item_index: int
    done: bool


@router.patch("/service/engagements/{engagement_id}/checklist")
async def toggle_checklist_item(engagement_id: str, req: ToggleChecklistRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    checklist = eng.get("checklist", [])
    if req.group_index < len(checklist) and req.item_index < len(checklist[req.group_index]["items"]):
        checklist[req.group_index]["items"][req.item_index]["done"] = req.done

    # Auto-update phase based on checklist progress
    phase = checklist[0]["group"] if checklist else ""
    for g in checklist:
        if any(not item["done"] for item in g["items"]):
            phase = g["group"]
            break
        phase = g["group"]

    total = sum(len(g["items"]) for g in checklist)
    done_count = sum(1 for g in checklist for item in g["items"] if item["done"])
    status = "Completed" if done_count == total and total > 0 else "Active"

    await db.service_engagements.update_one(
        {"engagement_id": engagement_id},
        {"$set": {"checklist": checklist, "phase": phase, "status": status}}
    )
    return {"phase": phase, "status": status, "progress": round(done_count / total * 100) if total > 0 else 0}


@router.patch("/service/engagements/{engagement_id}")
async def update_service_engagement(engagement_id: str, status: Optional[str] = None, phase: Optional[str] = None, assigned_to: Optional[str] = None, assigned_to_name: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    update_data = {}
    if status:
        update_data["status"] = status
    if phase:
        update_data["phase"] = phase
    if assigned_to:
        update_data["assigned_to"] = assigned_to
    if assigned_to_name:
        update_data["assigned_to_name"] = assigned_to_name
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": update_data})
    return {"message": "Engagement updated"}


@router.post("/service/engagements/{engagement_id}/approve")
async def bypass_approve_engagement(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Partner can directly approve all remaining checklist items and mark engagement as Completed."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can bypass-approve")

    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Mark all checklist items as done
    checklist = eng.get("checklist", [])
    for group in checklist:
        for item in group.get("items", []):
            item["done"] = True

    # Set last group as current phase
    last_phase = checklist[-1]["group"] if checklist else eng.get("phase", "")

    await db.service_engagements.update_one(
        {"engagement_id": engagement_id},
        {"$set": {
            "checklist": checklist,
            "status": "Completed",
            "phase": last_phase,
            "approved_by": user["user_id"],
            "approved_by_name": user.get("name"),
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    await log_activity("Bypass approval", f"Partner {user.get('name')} approved {eng.get('service_type')} for {eng.get('client_name')}", user["user_id"], eng.get("client_id"), eng.get("client_name"))
    return {"message": f"Engagement approved by {user.get('name')}", "status": "Completed", "phase": last_phase}


@router.get("/service/workflows-for-type")
async def get_workflows_for_service(service_type: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    wfs = await db.workflows.find({"service_type": service_type, "is_deleted": {"$ne": True}}, {"_id": 0}).to_list(20)
    return wfs
