"""Client queries: auditors raise queries on an engagement; clients reply in
their portal with text and file attachments. Threads per question."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, File, Form, Header, HTTPException, UploadFile
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event

router = APIRouter(prefix="/api")

MAX_FILE = 8 * 1024 * 1024


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _staff(user):
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    return user


async def _client(user):
    if user.get("role") != "client":
        raise HTTPException(403, "Client role required")
    client_id = user.get("client_id")
    if not client_id:
        raise HTTPException(403, "No client linked")
    return client_id


async def _touch_journal(q, event, text, by_name):
    eng = await db.service_engagements.find_one(
        {"engagement_id": q.get("engagement_id")}, {"_id": 0, "client_id": 1, "client_name": 1})
    await journal_event(q.get("engagement_id", ""), event, text[:300], by_name=by_name,
                        client_id=(eng or {}).get("client_id") or "",
                        client_name=(eng or {}).get("client_name") or "")


# ---------- Firm side ----------

@router.post("/service/engagements/{engagement_id}/queries")
async def raise_query(engagement_id: str, body: Optional[dict] = None,
                      authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff(await get_current_user(authorization, session_token))
    body = body or {}
    question = str(body.get("question") or "").strip()
    if not question:
        raise HTTPException(422, "Query text is required")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    q = {
        "query_id": f"qry_{uuid.uuid4().hex[:12]}",
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "service_type": eng.get("service_type"),
        "question": question[:4000],
        "asked_by": user.get("name") or user.get("email"),
        "asked_at": _now(),
        "status": "Open",   # Open=awaiting client, Answered=client replied, Closed=resolved
        "replies": [],
        "answered_at": None,
        "closed_at": None,
    }
    await db.engagement_queries.insert_one(q)
    await _touch_journal(q, "query_raised", f"Query sent to client: {question[:200]}",
                         user.get("name") or "User")
    q.pop("_id", None)
    return q


@router.get("/service/engagements/{engagement_id}/queries")
async def list_engagement_queries(engagement_id: str,
                                  authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff(await get_current_user(authorization, session_token))
    items = await db.engagement_queries.find(
        {"engagement_id": engagement_id}, {"_id": 0}).sort("asked_at", -1).to_list(200)
    return {"queries": items,
            "counts": {"open": sum(1 for q in items if q["status"] == "Open"),
                       "answered": sum(1 for q in items if q["status"] == "Answered"),
                       "closed": sum(1 for q in items if q["status"] == "Closed")}}


@router.post("/queries/{query_id}/close")
async def close_query(query_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff(await get_current_user(authorization, session_token))
    q = await db.engagement_queries.find_one_and_update(
        {"query_id": query_id}, {"$set": {"status": "Closed", "closed_at": _now()}},
        return_document=True)
    if not q:
        raise HTTPException(404, "Query not found")
    q.pop("_id", None)
    await _touch_journal(q, "query_closed", f"Query resolved: {q.get('question', '')[:150]}",
                         user.get("name") or "User")
    return q


# ---------- Client side ----------

@router.get("/client-portal/queries")
async def client_queries(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client_id = await _client(user)
    items = await db.engagement_queries.find(
        {"client_id": client_id}, {"_id": 0, "client_id": 0}).sort("asked_at", -1).to_list(200)
    return {"queries": items,
            "counts": {"open": sum(1 for q in items if q["status"] == "Open"),
                       "answered": sum(1 for q in items if q["status"] == "Answered")}}


@router.post("/client-portal/queries/{query_id}/reply")
async def client_reply(query_id: str, text: str = Form(""), file: Optional[UploadFile] = File(None),
                       authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client_id = await _client(user)
    text = (text or "").strip()
    if not text and not file:
        raise HTTPException(422, "Reply needs a message or a file")
    q = await db.engagement_queries.find_one({"query_id": query_id, "client_id": client_id})
    if not q:
        raise HTTPException(404, "Query not found")
    if q.get("status") == "Closed":
        raise HTTPException(422, "This query is closed — ask the firm to reopen it")

    reply = {"reply_id": f"rpl_{uuid.uuid4().hex[:12]}", "by_role": "client",
             "by_name": user.get("name") or "Client", "text": text[:4000], "at": _now(),
             "file_id": None, "filename": None}
    if file:
        if (file.filename or "").lower().endswith(".exe"):
            raise HTTPException(422, "File type not allowed")
        content = await file.read()
        if len(content) > MAX_FILE:
            raise HTTPException(413, "File too large (max 8 MB)")
        file_id = f"file_{uuid.uuid4().hex[:12]}"
        await db.documents.insert_one({
            "file_id": file_id, "filename": file.filename, "content_type": file.content_type,
            "size": len(content), "data": content, "client_id": client_id,
            "uploader_id": user["user_id"], "uploader_name": user.get("name"),
            "uploaded_at": _now(), "source": "query_reply", "query_id": query_id,
        })
        reply["file_id"] = file_id
        reply["filename"] = file.filename

    status = "Answered" if q["status"] in ("Open", "Answered") else "Open"
    await db.engagement_queries.update_one(
        {"query_id": query_id},
        {"$push": {"replies": reply}, "$set": {"status": status, "answered_at": _now()}})
    await _touch_journal(q, "query_answered",
                         f"Client replied to query '{q.get('question', '')[:120]}'"
                         + (f" + file {reply['filename']}" if reply["filename"] else ""),
                         by_name=reply["by_name"])
    reply_q = await db.engagement_queries.find_one({"query_id": query_id}, {"_id": 0})
    return reply_q
