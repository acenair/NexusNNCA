"""Routes / ai — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from core import EMERGENT_LLM_KEY
from fastapi import HTTPException
from fastapi import Header
from emergentintegrations.llm.chat import LlmChat
from emergentintegrations.llm.chat import UserMessage
from datetime import datetime
from core import db
from core import get_current_user
from core import logger
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


class AIChatRequest(BaseModel):
    session_id: str
    message: str


async def get_firm_context(user):
    """Gather firm data context for AI to reference."""
    clients = await db.clients.find({}, {"_id": 0, "name": 1, "status": 1, "active_services": 1, "jurisdiction": 1}).to_list(50)
    tasks = await db.tasks.find({}, {"_id": 0, "title": 1, "status": 1, "assigned_to_name": 1, "client_name": 1, "due_date": 1, "service_module": 1, "priority": 1}).sort("due_date", 1).to_list(50)
    events = await db.events.find({}, {"_id": 0, "title": 1, "event_type": 1, "date": 1, "client_name": 1}).sort("date", 1).to_list(30)
    staff = await db.users.find({"role": "staff"}, {"_id": 0, "name": 1, "title": 1, "email": 1}).to_list(20)

    lines = ["=== FIRM DATA (Nair & Nelliyatt Chartered Accountants) ==="]
    if clients:
        lines.append(f"\nClients ({len(clients)}):")
        for c in clients:
            svcs = ', '.join(c.get('active_services', []))
            lines.append(f"  - {c['name']} | {c.get('status','N/A')} | {c.get('jurisdiction','')} | Services: {svcs}")
    if tasks:
        lines.append(f"\nActive Tasks ({len(tasks)}):")
        for t in tasks:
            lines.append(f"  - {t.get('title','')} | Client: {t.get('client_name','N/A')} | Assigned: {t.get('assigned_to_name','N/A')} | Due: {t.get('due_date','N/A')} | Status: {t.get('status','Pending')} | Priority: {t.get('priority','Medium')}")
    if events:
        lines.append(f"\nUpcoming Events ({len(events)}):")
        for e in events:
            lines.append(f"  - {e.get('date','')} | {e.get('event_type','')} | {e.get('title','')} | Client: {e.get('client_name','')}")
    if staff:
        lines.append(f"\nStaff ({len(staff)}):")
        for s in staff:
            lines.append(f"  - {s['name']} ({s.get('title','Staff')})")
    return '\n'.join(lines)


@router.post("/ai/chat")
async def chat_with_ai(req: AIChatRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)

    # Save user message
    user_msg_doc = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "session_id": req.session_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": req.message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(user_msg_doc)

    # Build context from firm data
    firm_context = await get_firm_context(user)

    # Build chat history for context
    history = await db.chat_messages.find(
        {"session_id": req.session_id},
        {"_id": 0, "role": 1, "content": 1}
    ).sort("created_at", 1).to_list(40)
    history_text = ""
    if len(history) > 1:
        recent = history[-10:]
        history_text = "\n\n=== RECENT CONVERSATION ===\n" + "\n".join([f"{m['role'].upper()}: {m['content']}" for m in recent[:-1]])

    system_message = f"""You are the AI Compliance Assistant for Nair & Nelliyatt Chartered Accountants, a UAE-based audit and advisory firm.

You serve two roles:
1. UAE REGULATORY EXPERT — Answer questions about:
   - UAE VAT (Federal Decree-Law No. 8/2017, amended)
   - UAE Corporate Tax (Federal Decree-Law No. 47/2022, 9% rate, AED 375K threshold)
   - AML/CFT (Federal Law No. 20/2018 — DNFBP obligations, goAML, STR filing)
   - UAE Companies Law (Federal Decree-Law No. 32/2021)
   - International audit standards (ISA), IFRS framework
   - FTA portal processes, TRN registration, voluntary disclosures

2. FIRM DATA ASSISTANT — You have real-time access to the firm's client portfolio, tasks, events, and staff. Answer questions about client status, deadlines, workload, audit progress, etc.

{firm_context}
{history_text}

Guidelines:
- Be concise and precise (under 300 words unless detail is requested)
- Cite applicable UAE law or standard when relevant
- For firm data questions, reference specific client names, dates, and staff assignments
- If you don't know something, say so clearly
- Format responses with markdown for clarity"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=req.session_id,
        system_message=system_message
    ).with_model("gemini", "gemini-3-flash-preview")

    user_message = UserMessage(text=req.message)

    try:
        response = await chat.send_message(user_message)

        ai_msg_doc = {
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
            "session_id": req.session_id,
            "user_id": user["user_id"],
            "role": "assistant",
            "content": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_messages.insert_one(ai_msg_doc)

        return {"response": response, "session_id": req.session_id}
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.get("/ai/chat/{session_id}")
async def get_chat_history(session_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    messages = await db.chat_messages.find(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return messages


@router.get("/ai/sessions")
async def get_chat_sessions(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": "$session_id", "last_msg": {"$last": "$content"}, "last_at": {"$last": "$created_at"}, "count": {"$sum": 1}}},
        {"$sort": {"last_at": -1}},
        {"$limit": 20}
    ]
    sessions = await db.chat_messages.aggregate(pipeline).to_list(20)
    return [{"session_id": s["_id"], "preview": s["last_msg"][:80] if s["last_msg"] else "", "last_at": s["last_at"], "message_count": s["count"]} for s in sessions]


@router.delete("/ai/chat/{session_id}")
async def delete_chat_session(session_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.chat_messages.delete_many({"session_id": session_id, "user_id": user["user_id"]})
    return {"message": "Session deleted"}
