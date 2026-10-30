"""Engagement work journal + handover brief.

Every meaningful action on an engagement is auto-journaled (tick, phase move,
TB import/mapping, review notes, reassignment) so a covering partner or
auditor can reconstruct exactly where the work stands. Auditors can also add
manual journal notes. The handover brief summarises continuity state.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user

router = APIRouter(prefix="/api")


async def journal_event(engagement_id: str, event: str, text: str, by_name: str = "",
                        client_id: str = "", client_name: str = "", kind: str = "auto"):
    """Append an entry to the engagement work journal (fire-and-forget)."""
    entry = {
        "entry_id": f"jrn_{uuid.uuid4().hex[:12]}",
        "engagement_id": engagement_id,
        "client_id": client_id or "",
        "client_name": client_name or "",
        "kind": kind,          # auto | manual
        "event": event,        # short machine tag, e.g. checklist_done
        "text": text[:2000],
        "by_name": by_name or "System",
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.engagement_journal.insert_one(entry)
    return entry


async def _staff_user(user):
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    return user


async def _eng(engagement_id):
    doc = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Engagement not found")
    return doc


@router.get("/journal/{engagement_id}")
async def get_journal(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_user(await get_current_user(authorization, session_token))
    entries = await db.engagement_journal.find(
        {"engagement_id": engagement_id}, {"_id": 0}
    ).sort("at", -1).to_list(500)
    return {"entries": entries}


@router.post("/journal/{engagement_id}")
async def add_journal_note(engagement_id: str, body: Optional[dict] = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_user(await get_current_user(authorization, session_token))
    body = body or {}
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(422, "Journal note text is required")
    eng = await _eng(engagement_id)
    entry = await journal_event(
        engagement_id, "manual_note", text,
        by_name=user.get("name") or user.get("email") or "User",
        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "",
        kind="manual")
    entry.pop("_id", None)
    return entry


@router.get("/journal/{engagement_id}/brief")
async def handover_brief(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_user(await get_current_user(authorization, session_token))
    eng = await _eng(engagement_id)

    checklist = eng.get("checklist", [])
    total = sum(len(g.get("items", [])) for g in checklist)
    done = sum(1 for g in checklist for i in g.get("items", []) if i.get("done"))
    undocumented = [
        i.get("label") for g in checklist for i in g.get("items", [])
        if i.get("done") and not (i.get("note") or "").strip()
    ]

    open_notes = await db.review_notes.count_documents(
        {"engagement_id": engagement_id, "status": "Open"})
    last_entry = await db.engagement_journal.find_one(
        {"engagement_id": engagement_id}, {"_id": 0}, sort=[("at", -1)])

    quiet_days = None
    if last_entry:
        try:
            then = datetime.fromisoformat(str(last_entry["at"]).replace("Z", "+00:00"))
            quiet_days = max(0, (datetime.now(timezone.utc) - then).days)
        except (ValueError, TypeError):
            pass

    return {
        "phase": eng.get("phase"),
        "status": eng.get("status"),
        "assigned_to_name": eng.get("assigned_to_name"),
        "progress": round(done / total * 100) if total else 0,
        "done": done, "total": total,
        "open_review_notes": open_notes,
        "undocumented": {"count": len(undocumented), "items": undocumented[:5]},
        "last_activity": (last_entry or {}).get("at"),
        "last_activity_text": (last_entry or {}).get("text"),
        "quiet_days": quiet_days,
    }
