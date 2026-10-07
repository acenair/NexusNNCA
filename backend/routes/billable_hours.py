"""Routes / billable hours — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from fastapi import Response
from datetime import datetime
from core import db
from core import get_current_user
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


class LogHoursRequest(BaseModel):
    client_id: str
    client_name: Optional[str] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    hours: float
    date: str
    description: Optional[str] = None


@router.post("/billable-hours")
async def log_billable_hours(req: LogHoursRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    entry_id = f"bh_{uuid.uuid4().hex[:12]}"

    # Auto-resolve client name if not provided
    client_name = req.client_name
    if not client_name:
        client_doc = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
        client_name = client_doc["name"] if client_doc else "Unknown"

    entry = {
        "entry_id": entry_id,
        "staff_id": user["user_id"],
        "staff_name": user.get("name"),
        "staff_email": user.get("email"),
        "client_id": req.client_id,
        "client_name": client_name,
        "task_id": req.task_id,
        "task_title": req.task_title,
        "hours": req.hours,
        "date": req.date,
        "description": req.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.billable_hours.insert_one(entry)
    entry.pop("_id", None)
    return entry


@router.get("/billable-hours")
async def get_billable_hours(authorization: str = Header(None), session_token: str = Cookie(None), staff_email: Optional[str] = None, client_id: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {}
    # Staff can only see their own hours; partners see all
    if user.get("role") != "partner":
        query["staff_email"] = user.get("email")
    elif staff_email:
        query["staff_email"] = staff_email
    if client_id:
        query["client_id"] = client_id
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        if date_q:
            query["date"] = date_q

    entries = await db.billable_hours.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    return entries


@router.delete("/billable-hours/{entry_id}")
async def delete_billable_hours(entry_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    entry = await db.billable_hours.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Staff can only delete their own; partners can delete any
    if user.get("role") != "partner" and entry.get("staff_email") != user.get("email"):
        raise HTTPException(status_code=403, detail="Cannot delete another user's entry")
    await db.billable_hours.delete_one({"entry_id": entry_id})
    return {"message": "Entry deleted"}


@router.get("/billable-hours/summary")
async def get_billable_hours_summary(authorization: str = Header(None), session_token: str = Cookie(None), date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Returns summary grouped by staff and client for reporting."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")

    query = {}
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        if date_q:
            query["date"] = date_q

    entries = await db.billable_hours.find(query, {"_id": 0}).to_list(5000)

    # Group by staff
    staff_summary = {}
    client_summary = {}
    for e in entries:
        staff_key = e.get("staff_email", "unknown")
        staff_name = e.get("staff_name", "Unknown")
        client_key = e.get("client_id", "unknown")
        client_name = e.get("client_name", "Unknown")
        hours = e.get("hours", 0)

        if staff_key not in staff_summary:
            staff_summary[staff_key] = {"staff_name": staff_name, "staff_email": staff_key, "total_hours": 0, "clients": {}}
        staff_summary[staff_key]["total_hours"] += hours
        if client_key not in staff_summary[staff_key]["clients"]:
            staff_summary[staff_key]["clients"][client_key] = {"client_name": client_name, "hours": 0}
        staff_summary[staff_key]["clients"][client_key]["hours"] += hours

        if client_key not in client_summary:
            client_summary[client_key] = {"client_name": client_name, "total_hours": 0, "staff": {}}
        client_summary[client_key]["total_hours"] += hours
        if staff_key not in client_summary[client_key]["staff"]:
            client_summary[client_key]["staff"][staff_key] = {"staff_name": staff_name, "hours": 0}
        client_summary[client_key]["staff"][staff_key]["hours"] += hours

    # Convert clients dict to list for JSON
    for sk in staff_summary:
        staff_summary[sk]["clients"] = list(staff_summary[sk]["clients"].values())
    for ck in client_summary:
        client_summary[ck]["staff"] = list(client_summary[ck]["staff"].values())

    return {
        "total_hours": sum(e.get("hours", 0) for e in entries),
        "total_entries": len(entries),
        "by_staff": list(staff_summary.values()),
        "by_client": list(client_summary.values()),
    }


@router.get("/billable-hours/export")
async def export_billable_hours(authorization: str = Header(None), session_token: str = Cookie(None), staff_email: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Export billable hours as CSV."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")

    import io, csv

    query = {}
    if staff_email:
        query["staff_email"] = staff_email
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        if date_q:
            query["date"] = date_q

    entries = await db.billable_hours.find(query, {"_id": 0}).sort("date", -1).to_list(5000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Staff", "Email", "Client", "Task", "Hours", "Description"])
    for e in entries:
        writer.writerow([e.get("date"), e.get("staff_name"), e.get("staff_email"), e.get("client_name"), e.get("task_title", ""), e.get("hours"), e.get("description", "")])

    content = output.getvalue()
    staff_label = staff_email.split("@")[0] if staff_email else "team"
    filename = f"Billable_Hours_{staff_label}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(content=content, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})
