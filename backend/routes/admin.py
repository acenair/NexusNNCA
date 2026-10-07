"""Routes / admin — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import List
from core import db
from core import get_current_user
from core import log_activity

router = APIRouter(prefix="/api")


class ResetRequest(BaseModel):
    confirm: str
    collections: List[str] = []


RESETTABLE_COLLECTIONS = ["clients", "tasks", "events", "activities", "appreciations", "service_engagements", "documents", "invoices", "billable_hours", "client_doc_checklists", "vat_registrations", "vat_filings", "audit_engagements", "aml_alerts", "workflows", "chat_messages", "dismissed_notifications", "push_subscriptions", "client_audits"]


@router.post("/admin/reset-data")
async def reset_data(req: ResetRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Clear selected collections. Requires confirmation text 'RESET'."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner" or user.get("title") != "Managing Partner":
        raise HTTPException(status_code=403, detail="Only Managing Partner can reset data")
    if req.confirm != "RESET":
        raise HTTPException(status_code=400, detail="Type 'RESET' to confirm")

    deleted_counts = {}
    targets = req.collections if req.collections else RESETTABLE_COLLECTIONS

    for coll_name in targets:
        if coll_name in RESETTABLE_COLLECTIONS:
            result = await db[coll_name].delete_many({})
            deleted_counts[coll_name] = result.deleted_count

    await log_activity("Data reset", f"Reset {len(deleted_counts)} collections: {', '.join(deleted_counts.keys())}", user["user_id"])
    return {"message": f"Reset {len(deleted_counts)} collection(s)", "deleted": deleted_counts}


@router.get("/admin/data-stats")
async def get_data_stats(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Get document count per collection for the reset UI."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")

    stats = {}
    for coll_name in RESETTABLE_COLLECTIONS:
        stats[coll_name] = await db[coll_name].count_documents({})
    stats["users"] = await db.users.count_documents({})
    return stats
