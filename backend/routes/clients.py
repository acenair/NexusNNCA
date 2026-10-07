"""Routes / clients — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import List
from typing import Optional
from datetime import datetime
from core import db
from core import get_current_user
from core import log_activity
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/clients")
async def get_clients(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    # Client role users can only see their own linked client record
    if user.get("role") == "client":
        client_id = user.get("client_id")
        if not client_id:
            return []
        client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
        return [client] if client else []
    clients = await db.clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return clients


@router.post("/clients")
async def create_client(name: str, entity_type: str, authorization: str = Header(None), session_token: str = Cookie(None),
                       jurisdiction: Optional[str] = None, trade_licence_no: Optional[str] = None,
                       trn: Optional[str] = None, aml_risk_rating: Optional[str] = "Low"):
    user = await get_current_user(authorization, session_token)
    
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    client_doc = {
        "client_id": client_id,
        "name": name,
        "entity_type": entity_type,
        "jurisdiction": jurisdiction,
        "trade_licence_no": trade_licence_no,
        "trn": trn,
        "aml_risk_rating": aml_risk_rating,
        "pep_flag": False,
        "status": "Active",
        "active_services": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.clients.insert_one(client_doc)
    await log_activity("Client added", f"Added new client: {name}", user["user_id"], client_id, name)
    
    # Return without _id
    return {
        "client_id": client_id,
        "name": name,
        "entity_type": entity_type,
        "jurisdiction": jurisdiction,
        "trade_licence_no": trade_licence_no,
        "trn": trn,
        "aml_risk_rating": aml_risk_rating,
        "pep_flag": False,
        "status": "Active",
        "active_services": [],
        "created_at": client_doc["created_at"]
    }


@router.get("/clients/{client_id}")
async def get_client(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


class UpdateClientRequest(BaseModel):
    name: Optional[str] = None
    entity_type: Optional[str] = None
    jurisdiction: Optional[str] = None
    trade_licence_no: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_no: Optional[str] = None
    vat_registration_date: Optional[str] = None
    tax_period: Optional[str] = None
    aml_risk_rating: Optional[str] = None
    pep_flag: Optional[bool] = None
    status: Optional[str] = None
    active_services: Optional[List[str]] = None
    relationship_manager_id: Optional[str] = None


@router.patch("/clients/{client_id}")
async def update_client(client_id: str, req: UpdateClientRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("title") != "Managing Partner":
        raise HTTPException(status_code=403, detail="Only the Managing Partner can edit clients")
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.clients.update_one({"client_id": client_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    updated = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    await log_activity("Client updated", f"Updated client: {updated.get('name', client_id)}", user["user_id"], client_id, updated.get("name"))
    return updated


@router.get("/clients/{client_id}/timeline")
async def get_client_timeline(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    timeline = []

    # Tasks
    tasks = await db.tasks.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    for t in tasks:
        timeline.append({
            "type": "task", "title": t.get("title", "Task"),
            "status": t.get("status"), "date": t.get("due_date") or t.get("created_at", ""),
            "detail": f"Assigned to {t.get('assigned_to_name', t.get('assigned_to', '—'))} | Priority: {t.get('priority', '—')}",
            "ref_id": t.get("task_id"),
        })

    # Events
    events = await db.events.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    for e in events:
        timeline.append({
            "type": e.get("event_type", "event"), "title": e.get("title", "Event"),
            "status": "Scheduled", "date": e.get("date", ""),
            "detail": e.get("description", ""),
            "ref_id": e.get("event_id"),
        })

    # Documents
    docs = await db.documents.find({"client_id": client_id, "is_deleted": False}, {"_id": 0}).to_list(100)
    for d in docs:
        timeline.append({
            "type": "document", "title": d.get("original_filename", "Document"),
            "status": d.get("document_type", ""), "date": d.get("created_at", ""),
            "detail": f"Uploaded by {d.get('uploaded_by_name', '—')}",
            "ref_id": d.get("file_id"),
        })

    # Engagements
    engs = await db.service_engagements.find({"client_id": client_id, "status": {"$ne": "Deleted"}}, {"_id": 0}).to_list(50)
    for eng in engs:
        total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
        done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
        progress = round(done / total * 100) if total > 0 else 0
        timeline.append({
            "type": "engagement", "title": eng.get("service_type", "").replace("_", " ").title(),
            "status": eng.get("status"), "date": eng.get("created_at", ""),
            "detail": f"Phase: {eng.get('phase', '—')} | Progress: {progress}% | {eng.get('assigned_to_name', '—')}",
            "ref_id": eng.get("engagement_id"),
        })

    # Activities
    activities = await db.activities.find({"client_id": client_id}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    for a in activities:
        timeline.append({
            "type": "activity", "title": a.get("action", "Activity"),
            "status": "", "date": a.get("timestamp", ""),
            "detail": a.get("description", ""),
            "ref_id": None,
        })

    # Sort by date descending
    def parse_date(item):
        d = item.get("date", "")
        if not d:
            return ""
        return d

    timeline.sort(key=parse_date, reverse=True)
    return {"client": client, "timeline": timeline}
