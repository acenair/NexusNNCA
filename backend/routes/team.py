"""Routes / team — extracted from server.py without behavior changes."""
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


class CreateEventRequest(BaseModel):
    title: str
    event_type: str  # meeting, followup, task, deadline
    date: str
    time: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None


@router.post("/events")
async def create_event(req: CreateEventRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    event_id = f"evt_{uuid.uuid4().hex[:12]}"
    event_doc = {
        "event_id": event_id,
        "title": req.title,
        "event_type": req.event_type,
        "date": req.date,
        "time": req.time,
        "client_name": req.client_name,
        "client_id": req.client_id,
        "notes": req.notes,
        "assigned_to": req.assigned_to,
        "assigned_to_name": req.assigned_to_name,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.events.insert_one(event_doc)
    label = req.event_type.replace("followup", "follow-up").capitalize()
    await log_activity(f"{label} created", f"{label}: {req.title}", user["user_id"], req.client_id, req.client_name)
    event_doc.pop("_id", None)
    return event_doc


@router.get("/events")
async def get_events(authorization: str = Header(None), session_token: str = Cookie(None), month: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    events = await db.events.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return events


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.events.delete_one({"event_id": event_id})
    return {"message": "Event deleted"}


class CreateAppreciationRequest(BaseModel):
    staff_email: str
    staff_name: str
    categories: List[str]
    rating: int
    month: str
    message: Optional[str] = None


@router.post("/appreciations")
async def create_appreciation(req: CreateAppreciationRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can give appreciations")
    appr_id = f"appr_{uuid.uuid4().hex[:12]}"
    appr_doc = {
        "appreciation_id": appr_id,
        "staff_email": req.staff_email,
        "staff_name": req.staff_name,
        "categories": req.categories,
        "rating": req.rating,
        "month": req.month,
        "message": req.message,
        "given_by": user["user_id"],
        "given_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.appreciations.insert_one(appr_doc)
    await log_activity("Appreciation given", f"Appreciated {req.staff_name}: {', '.join(req.categories)}", user["user_id"])
    appr_doc.pop("_id", None)
    return appr_doc


@router.get("/appreciations")
async def get_appreciations(authorization: str = Header(None), session_token: str = Cookie(None), staff_email: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {}
    if staff_email:
        query["staff_email"] = staff_email
    apprs = await db.appreciations.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return apprs
