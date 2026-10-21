"""Routes / engagements — extracted from server.py without behavior changes."""
from fastapi import APIRouter, Body, Cookie
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
    # service-specific + commercial terms (from the firm's tracker workbooks)
    return_frequency: Optional[str] = None
    tax_period: Optional[str] = None
    fta_due_date: Optional[str] = None
    internal_target_date: Optional[str] = None
    reminder_buffer_days: Optional[float] = None
    accounting_frequency: Optional[str] = None
    work_location: Optional[str] = None
    target_completion_days: Optional[float] = None
    audit_scope: Optional[str] = None
    allocated_days: Optional[float] = None
    field_visit_start: Optional[str] = None
    field_visit_end: Optional[str] = None
    closing_meeting_date: Optional[str] = None
    report_due_date: Optional[str] = None
    risk_classification: Optional[str] = None
    goaml_status: Optional[str] = None
    reporting_frequency: Optional[str] = None
    returns_due_date: Optional[str] = None
    sar_status: Optional[str] = None
    audit_purpose: Optional[str] = None
    audit_period: Optional[str] = None
    payment_terms: Optional[str] = None
    quoted_fee: Optional[float] = None
    engagement_date: Optional[str] = None


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
    from services.templates import milestones_from_terms
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
        "terms": {k: v for k, v in {
            "return_frequency": req.return_frequency, "tax_period": req.tax_period,
            "fta_due_date": req.fta_due_date, "internal_target_date": req.internal_target_date,
            "reminder_buffer_days": req.reminder_buffer_days,
            "accounting_frequency": req.accounting_frequency, "work_location": req.work_location,
            "target_completion_days": req.target_completion_days,
            "audit_scope": req.audit_scope, "allocated_days": req.allocated_days,
            "field_visit_start": req.field_visit_start, "field_visit_end": req.field_visit_end,
            "closing_meeting_date": req.closing_meeting_date, "report_due_date": req.report_due_date,
            "risk_classification": req.risk_classification, "goaml_status": req.goaml_status,
            "reporting_frequency": req.reporting_frequency, "returns_due_date": req.returns_due_date,
            "sar_status": req.sar_status, "audit_purpose": req.audit_purpose,
            "audit_period": req.audit_period, "payment_terms": req.payment_terms,
            "engagement_date": req.engagement_date,
        }.items() if v is not None},
        "fee_amount": req.quoted_fee,
        "milestones": milestones_from_terms(req.payment_terms or "", req.quoted_fee or 0),
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.service_engagements.insert_one(eng_doc)
    eng_doc.pop("_id", None)
    await log_activity("Engagement created", f"{req.service_type.replace('_',' ').title()} for {client['name']}", user["user_id"], req.client_id, client["name"])
    return eng_doc


@router.get("/service/engagement-terms")
async def engagement_terms(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Service-specific term definitions for the create dialog + detail view."""
    await get_current_user(authorization, session_token)
    from services.templates import SERVICE_TERMS, GENERAL_TERMS
    return {"service_terms": SERVICE_TERMS, "general_terms": GENERAL_TERMS}


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
async def update_service_engagement(engagement_id: str, status: Optional[str] = None, phase: Optional[str] = None, assigned_to: Optional[str] = None, assigned_to_name: Optional[str] = None, allocated_hours: Optional[float] = None, actual_hours: Optional[float] = None, budget_cost_rate: Optional[float] = None, payload: Optional[dict] = Body(default=None), authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    update_data = {}
    if payload and "staff_costs" in payload:
        # Per-staff hourly costing: [{name, allocated_hours, actual_hours, remaining_hours, budget_rate, actual_rate}]
        rows = payload.get("staff_costs")
        if not isinstance(rows, list):
            raise HTTPException(status_code=422, detail="staff_costs must be a list")
        cleaned = []
        for r in rows:
            if not isinstance(r, dict) or not str(r.get("name", "")).strip():
                raise HTTPException(status_code=422, detail="Each staff row needs a name")
            try:
                nums = {k: float(r.get(k) or 0) for k in ("allocated_hours", "actual_hours", "remaining_hours", "budget_rate", "actual_rate")}
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="Staff hours/rates must be numbers")
            if any(v < 0 for v in nums.values()):
                raise HTTPException(status_code=422, detail="Staff hours/rates cannot be negative")
            cleaned.append({"name": str(r["name"]).strip()[:120], **nums})
        if not cleaned:
            raise HTTPException(status_code=422, detail="Add at least one staff allocation")
        update_data["staff_costs"] = cleaned
    if status:
        update_data["status"] = status
    if phase:
        update_data["phase"] = phase
    if allocated_hours is not None:
        update_data["allocated_hours"] = allocated_hours
    if actual_hours is not None:
        update_data["actual_hours"] = actual_hours
    if budget_cost_rate is not None:
        update_data["budget_cost_rate"] = budget_cost_rate
    if assigned_to:
        update_data["assigned_to"] = assigned_to
    if assigned_to_name:
        update_data["assigned_to_name"] = assigned_to_name
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": update_data})
    return {"message": "Engagement updated"}


class ChecklistItemRequest(BaseModel):
    group: str
    label: str


@router.post("/service/engagements/{engagement_id}/checklist/items")
async def add_checklist_item(engagement_id: str, req: ChecklistItemRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Add a checklist item to a group (creates the group if new). Partner only."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can edit checklists")
    if not req.label.strip():
        raise HTTPException(status_code=422, detail="Item label is required")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0, "checklist": 1})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    checklist = eng.get("checklist", [])
    for g in checklist:
        if g["group"] == req.group:
            g["items"].append({"label": req.label.strip(), "done": False})
            break
    else:
        checklist.append({"group": req.group.strip(), "items": [{"label": req.label.strip(), "done": False}]})
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": {"checklist": checklist}})
    return {"ok": True, "checklist": checklist}


@router.delete("/service/engagements/{engagement_id}/checklist/items/{group_index}/{item_index}")
async def remove_checklist_item(engagement_id: str, group_index: int, item_index: int, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Remove a checklist item; drops the group when it becomes empty. Partner only."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can edit checklists")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0, "checklist": 1})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    checklist = eng.get("checklist", [])
    if not (0 <= group_index < len(checklist)) or not (0 <= item_index < len(checklist[group_index]["items"])):
        raise HTTPException(status_code=404, detail="Checklist item not found")
    checklist[group_index]["items"].pop(item_index)
    if not checklist[group_index]["items"]:
        checklist.pop(group_index)
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": {"checklist": checklist}})
    return {"ok": True, "checklist": checklist}


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
