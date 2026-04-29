from fastapi import FastAPI, APIRouter, HTTPException, Header, Query, UploadFile, File, Response, Cookie
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import requests
from emergentintegrations.llm.chat import LlmChat, UserMessage
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Environment variables
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'

# Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "ca-ai"
storage_key = None

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    title: Optional[str] = None
    role: Optional[str] = None
    picture: Optional[str] = None
    created_at: str

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: str
    created_at: str

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: str
    name: str
    entity_type: str
    jurisdiction: Optional[str] = None
    trade_licence_no: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_no: Optional[str] = None
    vat_registration_date: Optional[str] = None
    tax_period: Optional[str] = None
    aml_risk_rating: Optional[str] = None
    pep_flag: bool = False
    relationship_manager_id: Optional[str] = None
    status: str = "Active"
    created_at: str
    active_services: List[str] = []

class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task_id: str
    title: str
    description: Optional[str] = None
    service_module: str
    client_id: Optional[str] = None
    due_date: str
    priority: str
    assigned_to: str
    status: str = "Pending"
    created_by: str
    created_at: str
    completed_at: Optional[str] = None

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    activity_id: str
    event_type: str
    description: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    user_id: str
    created_at: str

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str
    session_id: str
    user_id: str
    role: str
    content: str
    created_at: str

# ============= STORAGE HELPERS =============

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        raise

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ============= AUTH HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: str = Header(None), session_token: str = Cookie(None)) -> dict:
    token = None
    if session_token:
        token = session_token
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user_doc

async def log_activity(event_type: str, description: str, user_id: str, client_id: Optional[str] = None, client_name: Optional[str] = None):
    activity = {
        "activity_id": f"act_{uuid.uuid4().hex[:12]}",
        "event_type": event_type,
        "description": description,
        "client_id": client_id,
        "client_name": client_name,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activities.insert_one(activity)

# ============= AUTH ROUTES =============

@api_router.post("/auth/register")
async def register(email: str, password: str, name: str):
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_pwd = hash_password(password)
    
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "password": hashed_pwd,
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    session_token = create_jwt_token(user_id)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    return {"user_id": user_id, "email": email, "name": name, "session_token": session_token}

class LoginRequest(BaseModel):
    email: str
    password: str

@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user_doc = await db.users.find_one({"email": req.email})
    if not user_doc or not verify_password(req.password, user_doc.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    session_token = create_jwt_token(user_doc["user_id"])
    session_doc = {
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    return {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "title": user_doc.get("title"),
        "role": user_doc.get("role", "staff"),
        "picture": user_doc.get("picture"),
        "session_token": session_token
    }

@api_router.get("/auth/users-list")
async def get_users_list():
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    return [{"name": u.get("name"), "email": u.get("email"), "role": u.get("role", "staff"), "title": u.get("title", "")} for u in users]

@api_router.post("/auth/session")
async def create_session(session_id: str):
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    try:
        resp = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Failed to get session data: {e}")
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    user_doc = await db.users.find_one({"email": data["email"]})
    if user_doc:
        user_id = user_doc["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data["picture"]}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": data["email"],
            "name": data["name"],
            "picture": data["picture"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
    
    session_doc = {
        "user_id": user_id,
        "session_token": data["session_token"],
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    return {
        "user_id": user_id,
        "email": data["email"],
        "name": data["name"],
        "picture": data["picture"],
        "session_token": data["session_token"]
    }

@api_router.get("/auth/me")
async def get_me(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    return user

@api_router.post("/auth/logout")
async def logout(authorization: str = Header(None), session_token: str = Cookie(None)):
    token = session_token if session_token else (authorization.split(" ")[1] if authorization else None)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"message": "Logged out"}

# ============= DASHBOARD ROUTES =============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    active_clients = await db.clients.count_documents({"status": "Active"})
    total_tasks = await db.tasks.count_documents({"status": {"$ne": "Completed"}})
    overdue_tasks = await db.tasks.count_documents({
        "status": {"$ne": "Completed"},
        "due_date": {"$lt": datetime.now(timezone.utc).isoformat()}
    })
    
    current_month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    filings_this_month = await db.vat_filings.count_documents({
        "filing_due_date": {"$gte": current_month_start}
    })
    
    aml_alerts = await db.aml_alerts.count_documents({"status": "Flagged"})
    
    return {
        "active_clients": active_clients,
        "open_tasks": total_tasks,
        "overdue_tasks": overdue_tasks,
        "filings_this_month": filings_this_month,
        "aml_alerts": aml_alerts
    }

@api_router.get("/dashboard/activities")
async def get_recent_activities(authorization: str = Header(None), session_token: str = Cookie(None), limit: int = 20):
    user = await get_current_user(authorization, session_token)
    activities = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return activities

# ============= CLIENT ROUTES =============

@api_router.get("/clients")
async def get_clients(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    clients = await db.clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return clients

@api_router.post("/clients")
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

@api_router.get("/clients/{client_id}")
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

@api_router.patch("/clients/{client_id}")
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

# ============= TASK ROUTES =============

@api_router.get("/tasks")
async def get_tasks(authorization: str = Header(None), session_token: str = Cookie(None), filter: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    
    query = {}
    if filter == "my":
        query["assigned_to"] = user["user_id"]
    elif filter == "overdue":
        query["status"] = {"$ne": "Completed"}
        query["due_date"] = {"$lt": datetime.now(timezone.utc).isoformat()}
    elif filter == "week":
        week_end = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        query["status"] = {"$ne": "Completed"}
        query["due_date"] = {"$lte": week_end}
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return tasks

class CreateTaskRequest(BaseModel):
    title: str
    service_module: str
    due_date: str
    priority: str
    description: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None

@api_router.post("/tasks")
async def create_task(req: CreateTaskRequest,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task_doc = {
        "task_id": task_id,
        "title": req.title,
        "description": req.description,
        "service_module": req.service_module,
        "client_id": req.client_id,
        "client_name": req.client_name,
        "due_date": req.due_date,
        "priority": req.priority,
        "assigned_to": req.assigned_to or user["user_id"],
        "assigned_to_name": req.assigned_to_name,
        "status": "Pending",
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tasks.insert_one(task_doc)
    await log_activity("Task created", f"Created task: {req.title}", user["user_id"], req.client_id, req.client_name)
    
    task_doc.pop("_id", None)
    return task_doc

@api_router.patch("/tasks/{task_id}")
async def update_task(task_id: str, status: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    update_data = {}
    if status:
        update_data["status"] = status
        if status == "Completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tasks.update_one({"task_id": task_id}, {"$set": update_data})
    return {"message": "Task updated"}


# ============= EVENTS / CALENDAR ROUTES =============

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

@api_router.post("/events")
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

@api_router.get("/events")
async def get_events(authorization: str = Header(None), session_token: str = Cookie(None), month: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    events = await db.events.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return events

@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.events.delete_one({"event_id": event_id})
    return {"message": "Event deleted"}

# ============= APPRECIATION ROUTES =============

class CreateAppreciationRequest(BaseModel):
    staff_email: str
    staff_name: str
    categories: List[str]
    rating: int
    month: str
    message: Optional[str] = None

@api_router.post("/appreciations")
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

@api_router.get("/appreciations")
async def get_appreciations(authorization: str = Header(None), session_token: str = Cookie(None), staff_email: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {}
    if staff_email:
        query["staff_email"] = staff_email
    apprs = await db.appreciations.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return apprs


# ============= AI ASSISTANT ROUTES =============

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

@api_router.post("/ai/chat")
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

@api_router.get("/ai/chat/{session_id}")
async def get_chat_history(session_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    messages = await db.chat_messages.find(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return messages

@api_router.get("/ai/sessions")
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

@api_router.delete("/ai/chat/{session_id}")
async def delete_chat_session(session_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.chat_messages.delete_many({"session_id": session_id, "user_id": user["user_id"]})
    return {"message": "Session deleted"}

# ============= FILE UPLOAD ROUTES =============

@api_router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), authorization: str = Header(None), session_token: str = Cookie(None),
                     client_id: Optional[str] = None, document_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{file_id}.{ext}"
    
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    
    file_doc = {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "client_id": client_id,
        "document_type": document_type,
        "uploaded_by": user["user_id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.documents.insert_one(file_doc)
    
    return {"file_id": file_id, "filename": file.filename, "path": result["path"]}

@api_router.get("/documents")
async def list_documents(authorization: str = Header(None), session_token: str = Cookie(None),
                        client_id: Optional[str] = None, document_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {"is_deleted": False}
    if client_id:
        query["client_id"] = client_id
    if document_type:
        query["document_type"] = document_type
    docs = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with uploader name
    user_cache = {}
    for doc in docs:
        uid = doc.get("uploaded_by")
        if uid and uid not in user_cache:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1})
            user_cache[uid] = u.get("name", "Unknown") if u else "Unknown"
        doc["uploaded_by_name"] = user_cache.get(uid, "Unknown")
    return docs

@api_router.delete("/documents/{file_id}")
async def delete_document(file_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    result = await db.documents.update_one({"file_id": file_id, "is_deleted": False}, {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": user["user_id"]}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}

@api_router.get("/files/{file_id}")
async def download_file(file_id: str, authorization: str = Header(None), session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header, session_token)
    
    file_doc = await db.documents.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    data, content_type = get_object(file_doc["storage_path"])
    return Response(content=data, media_type=file_doc.get("content_type", content_type))

# Simplified VAT, Audit, Corporate, AML, Advisory routes (basic CRUD for MVP)

@api_router.get("/vat/registrations")
async def get_vat_registrations(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    registrations = await db.vat_registrations.find({}, {"_id": 0}).to_list(1000)
    return registrations

@api_router.post("/vat/registrations")
async def create_vat_registration(client_id: str, annual_turnover: float, registration_type: str,
                                 authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    reg_id = f"vat_reg_{uuid.uuid4().hex[:12]}"
    reg_doc = {
        "registration_id": reg_id,
        "client_id": client_id,
        "client_name": client["name"],
        "annual_turnover": annual_turnover,
        "registration_type": registration_type,
        "status": "Pending Documents",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vat_registrations.insert_one(reg_doc)
    await log_activity("VAT registration", f"VAT registration started for {client['name']}", user["user_id"], client_id, client["name"])
    
    # Return without _id
    return {
        "registration_id": reg_id,
        "client_id": client_id,
        "client_name": client["name"],
        "annual_turnover": annual_turnover,
        "registration_type": registration_type,
        "status": "Pending Documents",
        "created_at": reg_doc["created_at"]
    }

@api_router.get("/vat/filings")
async def get_vat_filings(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    filings = await db.vat_filings.find({}, {"_id": 0}).to_list(1000)
    return filings

@api_router.post("/vat/filings")
async def create_vat_filing(client_id: str, tax_period: str, period_end_date: str, filing_due_date: str,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    filing_id = f"vat_filing_{uuid.uuid4().hex[:12]}"
    filing_doc = {
        "filing_id": filing_id,
        "client_id": client_id,
        "client_name": client["name"],
        "tax_period": tax_period,
        "period_end_date": period_end_date,
        "filing_due_date": filing_due_date,
        "status": "Pending",
        "box_1a": 0,
        "box_1b": 0,
        "box_2": 0,
        "box_3": 0,
        "box_4": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vat_filings.insert_one(filing_doc)
    await log_activity("VAT filing", f"VAT filing created for {client['name']}", user["user_id"], client_id, client["name"])
    
    # Return without _id
    return {
        "filing_id": filing_id,
        "client_id": client_id,
        "client_name": client["name"],
        "tax_period": tax_period,
        "period_end_date": period_end_date,
        "filing_due_date": filing_due_date,
        "status": "Pending",
        "box_1a": 0,
        "box_1b": 0,
        "box_2": 0,
        "box_3": 0,
        "box_4": 0,
        "created_at": filing_doc["created_at"]
    }

@api_router.get("/audit/engagements")
async def get_audit_engagements(authorization: str = Header(None), session_token: str = Cookie(None), engagement_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {"engagement_type": engagement_type} if engagement_type else {}
    engagements = await db.audit_engagements.find(query, {"_id": 0}).to_list(1000)
    return engagements

@api_router.post("/audit/engagements")
async def create_audit_engagement(client_id: str, engagement_type: str, period_start: str, period_end: str,
                                 lead_auditor: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    engagement_id = f"audit_{uuid.uuid4().hex[:12]}"
    engagement_doc = {
        "engagement_id": engagement_id,
        "client_id": client_id,
        "client_name": client["name"],
        "engagement_type": engagement_type,
        "period_start": period_start,
        "period_end": period_end,
        "lead_auditor": lead_auditor,
        "phase": "Planning",
        "risk_level": "Medium",
        "status": "Active",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_engagements.insert_one(engagement_doc)
    await log_activity("Audit engagement", f"{engagement_type} audit started for {client['name']}", user["user_id"], client_id, client["name"])
    
    # Return without _id
    return {
        "engagement_id": engagement_id,
        "client_id": client_id,
        "client_name": client["name"],
        "engagement_type": engagement_type,
        "period_start": period_start,
        "period_end": period_end,
        "lead_auditor": lead_auditor,
        "phase": "Planning",
        "risk_level": "Medium",
        "status": "Active",
        "created_at": engagement_doc["created_at"]
    }

@api_router.get("/aml/alerts")
async def get_aml_alerts(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    alerts = await db.aml_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return alerts

@api_router.post("/aml/alerts")
async def create_aml_alert(client_id: str, amount: float, flag_reason: str,
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    risk_score = 50
    if amount >= 100000:
        risk_score = 85
    elif amount >= 55000:
        risk_score = 65
    
    alert_id = f"aml_{uuid.uuid4().hex[:12]}"
    alert_doc = {
        "alert_id": alert_id,
        "client_id": client_id,
        "client_name": client["name"],
        "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
        "amount": amount,
        "flag_reason": flag_reason,
        "risk_score": risk_score,
        "assigned_to": user["user_id"],
        "status": "Flagged",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.aml_alerts.insert_one(alert_doc)
    await log_activity("AML flag", f"Transaction flagged for {client['name']}: AED {amount:,.2f}", user["user_id"], client_id, client["name"])
    
    # Return without _id
    return {
        "alert_id": alert_id,
        "client_id": client_id,
        "client_name": client["name"],
        "transaction_id": alert_doc["transaction_id"],
        "amount": amount,
        "flag_reason": flag_reason,
        "risk_score": risk_score,
        "assigned_to": user["user_id"],
        "status": "Flagged",
        "created_at": alert_doc["created_at"]
    }

@api_router.patch("/aml/alerts/{alert_id}")
async def update_aml_alert(alert_id: str, status: str, notes: Optional[str] = None,
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    update_data = {"status": status}
    if notes:
        update_data["mlro_notes"] = notes
    update_data["actioned_at"] = datetime.now(timezone.utc).isoformat()
    update_data["actioned_by"] = user["user_id"]
    
    await db.aml_alerts.update_one({"alert_id": alert_id}, {"$set": update_data})
    return {"message": "AML alert updated"}

@api_router.get("/analytics/stats")
async def get_analytics_stats(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    total_clients = await db.clients.count_documents({})
    total_tasks = await db.tasks.count_documents({})
    completed_tasks = await db.tasks.count_documents({"status": "Completed"})
    
    vat_count = await db.vat_filings.count_documents({})
    audit_count = await db.audit_engagements.count_documents({})
    aml_count = await db.aml_alerts.count_documents({})
    
    return {
        "total_clients": total_clients,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_rate": round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1),
        "vat_filings": vat_count,
        "audit_engagements": audit_count,
        "aml_alerts": aml_count
    }

# ============= SERVICE ENGAGEMENTS (Unified) =============

CHECKLIST_TEMPLATES = {
    "statutory_audit": [
        {"group": "Planning", "items": ["Engagement letter", "Risk assessment", "Audit plan", "Materiality memo", "Team briefing"]},
        {"group": "Fieldwork", "items": ["Revenue testing", "Expense sampling", "Bank confirmations", "Inventory count", "Related party review"]},
        {"group": "Review & Reporting", "items": ["Draft report", "Management letter", "Partner review", "Client sign-off", "Filing"]},
    ],
    "internal_audit": [
        {"group": "Scoping", "items": ["Scope definition", "Risk universe update", "Audit program"]},
        {"group": "Testing", "items": ["Control testing", "Walkthrough", "Sample testing", "Exception analysis"]},
        {"group": "Reporting", "items": ["Draft findings", "Management response", "Final report"]},
    ],
    "vat_filing": [
        {"group": "Preparation", "items": ["Data collection", "Purchase invoices review", "Sales invoices review", "Reconciliation"]},
        {"group": "Filing", "items": ["Return preparation", "Box amounts calculation", "Review & approval", "FTA portal submission"]},
        {"group": "Completion", "items": ["Payment confirmation", "Filing receipt archive", "Client notification"]},
    ],
    "vat_registration": [
        {"group": "Documentation", "items": ["Trade licence copy", "Passport / Emirates ID", "Bank letter", "Turnover evidence"]},
        {"group": "Submission", "items": ["FTA portal application", "Supporting docs upload", "Application review"]},
        {"group": "Completion", "items": ["TRN issued", "Certificate archived", "Client notified"]},
    ],
    "corporate_tax": [
        {"group": "Preparation", "items": ["Financial data collection", "Revenue classification", "Exempt income review", "Deduction analysis"]},
        {"group": "Computation", "items": ["Taxable income calculation", "Tax liability computation", "Small business relief check"]},
        {"group": "Filing", "items": ["CT return preparation", "Review & approval", "Portal submission", "Payment processing"]},
    ],
    "aml_review": [
        {"group": "Client Due Diligence", "items": ["KYC documentation", "Beneficial ownership check", "PEP screening", "Sanctions screening"]},
        {"group": "Transaction Monitoring", "items": ["Unusual transaction review", "Threshold analysis", "STR assessment"]},
        {"group": "Reporting", "items": ["goAML report preparation", "MLRO review", "Filing submission"]},
    ],
}

class CreateEngagementRequest(BaseModel):
    service_type: str
    client_id: str
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    phase: Optional[str] = None
    notes: Optional[str] = None
    workflow_id: Optional[str] = None

@api_router.post("/service/engagements")
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

@api_router.get("/service/engagements")
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

@api_router.patch("/service/engagements/{engagement_id}/checklist")
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

@api_router.patch("/service/engagements/{engagement_id}")
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

# ============= SETTINGS ROUTES (Partner Only) =============

SECTIONS = ["overview", "audit", "vat", "corporate", "advisory", "aml"]

async def require_partner(authorization, session_token):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")
    return user

# --- RBAC ---
@api_router.get("/settings/rbac")
async def get_rbac(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "rbac"}, {"_id": 0})
    if not doc:
        default = {"staff": {s: True for s in SECTIONS}, "partner": {s: True for s in SECTIONS}}
        return {"type": "rbac", "config": default}
    return doc

class RBACUpdateRequest(BaseModel):
    config: Dict[str, Dict[str, bool]]

@api_router.patch("/settings/rbac")
async def update_rbac(req: RBACUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "rbac"}, {"$set": {"type": "rbac", "config": req.config, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "RBAC updated"}

# Public RBAC endpoint (any authenticated user can fetch to filter their sidebar)
@api_router.get("/settings/rbac-public")
async def get_rbac_public(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    doc = await db.settings.find_one({"type": "rbac"}, {"_id": 0})
    if not doc:
        default = {"staff": {s: True for s in SECTIONS}, "partner": {s: True for s in SECTIONS}}
        return {"type": "rbac", "config": default}
    return doc

# --- Firm ---
@api_router.get("/settings/firm")
async def get_firm_settings(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    if not doc:
        return {"type": "firm", "firm_name": "Nair & Nelliyatt Chartered Accountants"}
    return doc

class FirmUpdateRequest(BaseModel):
    firm_name: str

@api_router.patch("/settings/firm")
async def update_firm_settings(req: FirmUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "firm"}, {"$set": {"type": "firm", "firm_name": req.firm_name, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "Firm name updated"}

# --- User Management ---
@api_router.get("/settings/users")
async def get_all_users(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "password": 0}).to_list(100)
    return users

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    title: Optional[str] = None
    new_password: Optional[str] = None
    date_of_joining: Optional[str] = None

@api_router.patch("/settings/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = {}
    if req.role and req.role in ("staff", "partner"):
        update_data["role"] = req.role
    if req.title is not None:
        update_data["title"] = req.title
    if req.date_of_joining is not None:
        update_data["date_of_joining"] = req.date_of_joining
    if req.new_password and len(req.new_password) >= 6:
        import bcrypt
        update_data["password"] = bcrypt.hashpw(req.new_password.encode(), bcrypt.gensalt()).decode()
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"user_id": user_id}, {"$set": update_data})
    await log_activity("User updated", f"Updated {target.get('name', user_id)}: {', '.join(update_data.keys())}", user["user_id"])
    return {"message": f"User {target.get('name')} updated"}

# --- Storage ---
@api_router.get("/settings/storage")
async def get_storage_config(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "storage"}, {"_id": 0})
    if not doc:
        return {"type": "storage", "config": {"provider": "default", "aws_s3": {}, "google_drive": {}, "onedrive": {}}}
    return doc

class StorageUpdateRequest(BaseModel):
    config: Dict[str, Any]

@api_router.patch("/settings/storage")
async def update_storage_config(req: StorageUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "storage"}, {"$set": {"type": "storage", "config": req.config, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "Storage config updated"}

# --- Workflows ---
@api_router.get("/settings/workflows")
async def get_workflows(authorization: str = Header(None), session_token: str = Cookie(None), service_type: Optional[str] = None):
    user = await require_partner(authorization, session_token)
    query = {"is_deleted": {"$ne": True}}
    if service_type:
        query["service_type"] = service_type
    wfs = await db.workflows.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    return wfs

class WorkflowStep(BaseModel):
    name: str
    description: Optional[str] = ""
    order: int

class CreateWorkflowRequest(BaseModel):
    name: str
    service_type: str
    steps: List[WorkflowStep]
    is_preset: bool = False

@api_router.post("/settings/workflows")
async def create_workflow(req: CreateWorkflowRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    wf_id = f"wf_{uuid.uuid4().hex[:12]}"
    wf_doc = {
        "workflow_id": wf_id,
        "name": req.name,
        "service_type": req.service_type,
        "steps": [s.model_dump() for s in req.steps],
        "is_preset": req.is_preset,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.workflows.insert_one(wf_doc)
    wf_doc.pop("_id", None)
    return wf_doc

class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = None
    steps: Optional[List[WorkflowStep]] = None

@api_router.patch("/settings/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, req: UpdateWorkflowRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    update = {}
    if req.name:
        update["name"] = req.name
    if req.steps is not None:
        update["steps"] = [s.model_dump() for s in req.steps]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.workflows.update_one({"workflow_id": workflow_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"message": "Workflow updated"}

@api_router.delete("/settings/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    result = await db.workflows.update_one({"workflow_id": workflow_id}, {"$set": {"is_deleted": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"message": "Workflow deleted"}

# ============= NOTIFICATIONS =============

@api_router.get("/notifications")
async def get_notifications(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    today = datetime.now(timezone.utc).date()
    notifications = []

    # Check overdue & upcoming tasks assigned to user (or all if partner)
    task_query = {"status": {"$ne": "Completed"}}
    if user.get("role") != "partner":
        task_query["assigned_to"] = user.get("email")

    tasks = await db.tasks.find(task_query, {"_id": 0}).to_list(100)
    for task in tasks:
        due = task.get("due_date")
        if not due:
            continue
        try:
            due_date = datetime.fromisoformat(due).date() if 'T' in due else datetime.strptime(due, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        days_until = (due_date - today).days
        if days_until < 0:
            notifications.append({
                "notification_id": f"notif_task_{task.get('task_id', '')}",
                "title": f"Overdue: {task.get('title', 'Task')}",
                "message": f"Was due {abs(days_until)} day{'s' if abs(days_until) != 1 else ''} ago — {task.get('client_name', '')}",
                "severity": "urgent",
                "due_date": due,
                "type": "overdue_task",
                "ref_id": task.get("task_id"),
            })
        elif days_until <= 3:
            notifications.append({
                "notification_id": f"notif_task_{task.get('task_id', '')}",
                "title": f"Due Soon: {task.get('title', 'Task')}",
                "message": f"Due in {days_until} day{'s' if days_until != 1 else ''} — {task.get('client_name', '')}",
                "severity": "warning" if days_until <= 1 else "info",
                "due_date": due,
                "type": "upcoming_task",
                "ref_id": task.get("task_id"),
            })

    # Check upcoming events in next 3 days
    events = await db.events.find({"date": {"$exists": True}}, {"_id": 0}).to_list(100)
    for ev in events:
        ev_date_str = ev.get("date")
        if not ev_date_str:
            continue
        try:
            ev_date = datetime.fromisoformat(ev_date_str).date() if 'T' in ev_date_str else datetime.strptime(ev_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        days_until = (ev_date - today).days
        if 0 <= days_until <= 3:
            day_label = "Today" if days_until == 0 else f"In {days_until} day{'s' if days_until != 1 else ''}"
            notifications.append({
                "notification_id": f"notif_ev_{ev.get('event_id', '')}",
                "title": f"Upcoming: {ev.get('title', 'Event')}",
                "message": f"{day_label} — {ev.get('event_type', 'event').capitalize()}",
                "severity": "warning" if days_until == 0 else "info",
                "due_date": ev_date_str,
                "type": "upcoming_event",
                "ref_id": ev.get("event_id"),
            })

    # Check dismissed notifications
    dismissed = await db.dismissed_notifications.find({"user_id": user["user_id"]}, {"_id": 0, "notification_id": 1}).to_list(500)
    dismissed_ids = {d["notification_id"] for d in dismissed}
    notifications = [n for n in notifications if n["notification_id"] not in dismissed_ids]

    # Sort: urgent first, then by due_date
    severity_order = {"urgent": 0, "warning": 1, "info": 2}
    notifications.sort(key=lambda x: (severity_order.get(x["severity"], 2), x.get("due_date", "")))
    return notifications[:20]

@api_router.patch("/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.dismissed_notifications.update_one(
        {"user_id": user["user_id"], "notification_id": notification_id},
        {"$set": {"user_id": user["user_id"], "notification_id": notification_id, "dismissed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Notification dismissed"}

# ============= WORKFLOW-LINKED ENGAGEMENTS =============

@api_router.get("/service/workflows-for-type")
async def get_workflows_for_service(service_type: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    wfs = await db.workflows.find({"service_type": service_type, "is_deleted": {"$ne": True}}, {"_id": 0}).to_list(20)
    return wfs

# ============= CLIENT ACTIVITY TIMELINE =============

@api_router.get("/clients/{client_id}/timeline")
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

# ============= CLIENT ONBOARDING =============

ONBOARDING_DOCUMENT_CHECKLIST = {
    "general": ["Trade Licence Copy", "Memorandum of Association", "Emirates ID (Partners/Directors)", "Passport Copies (Partners/Directors)", "Power of Attorney (if applicable)"],
    "vat": ["Bank Letter / IBAN Certificate", "Turnover Evidence (12 months)", "Previous VAT Returns (if any)"],
    "corporate_tax": ["Financial Statements (Latest)", "Trial Balance", "Tax Registration Certificate (if any)"],
    "aml": ["Source of Funds Declaration", "Beneficial Ownership Structure", "Sanctions Self-Declaration"],
}

SERVICE_TO_ENGAGEMENT_TYPE = {
    "Statutory Audit": "statutory_audit",
    "Internal Audit": "internal_audit",
    "Stock Audit": "stock_audit",
    "Fraud Audit": "fraud_audit",
    "VAT Registration": "vat_registration",
    "VAT Filing": "vat_filing",
    "VAT Amendments": "vat_filing",
    "Corporate Registration": "corporate_tax",
    "Corporate Tax": "corporate_tax",
    "Company Formation": "corporate_tax",
    "Liquidation": "corporate_tax",
    "Valuation": "corporate_tax",
    "Due Diligence": "corporate_tax",
    "AML Review": "aml_review",
    "AML Filing": "aml_review",
    "AML Report": "aml_review",
}

class OnboardingRequest(BaseModel):
    name: str
    entity_type: str
    jurisdiction: Optional[str] = None
    trade_licence_no: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_no: Optional[str] = None
    aml_risk_rating: str = "Low"
    pep_flag: bool = False
    active_services: List[str] = []
    relationship_manager: Optional[str] = None
    relationship_manager_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    auto_create_engagements: bool = True

@api_router.post("/onboarding")
async def onboard_client(req: OnboardingRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can onboard clients")

    # Check if client already exists
    existing = await db.clients.find_one({"name": req.name})
    if existing:
        raise HTTPException(status_code=400, detail=f"Client '{req.name}' already exists")

    # 1. Create Client
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    client_doc = {
        "client_id": client_id,
        "name": req.name,
        "entity_type": req.entity_type,
        "jurisdiction": req.jurisdiction,
        "trade_licence_no": req.trade_licence_no,
        "trn": req.trn,
        "ct_registration_no": req.ct_registration_no,
        "aml_risk_rating": req.aml_risk_rating,
        "pep_flag": req.pep_flag,
        "status": "Onboarding",
        "active_services": req.active_services,
        "relationship_manager_id": req.relationship_manager,
        "contact_person": req.contact_person,
        "contact_email": req.contact_email,
        "contact_phone": req.contact_phone,
        "notes": req.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "onboarded_by": user["user_id"],
        "onboarded_by_name": user.get("name"),
    }
    await db.clients.insert_one(client_doc)

    # 2. Generate onboarding tasks
    tasks_created = []
    assignee = req.relationship_manager or user.get("email")
    assignee_name = req.relationship_manager_name or user.get("name")
    due_base = datetime.now(timezone.utc) + timedelta(days=3)

    # General KYC tasks
    onboarding_tasks = [
        {"title": f"Collect KYC Documents - {req.name}", "service_module": "Onboarding", "priority": "High", "days_offset": 3},
        {"title": f"Verify Entity Details - {req.name}", "service_module": "Onboarding", "priority": "Medium", "days_offset": 5},
        {"title": f"Complete AML Risk Assessment - {req.name}", "service_module": "AML", "priority": "High", "days_offset": 5},
    ]

    # Service-specific tasks
    has_vat = any(s for s in req.active_services if "VAT" in s)
    has_audit = any(s for s in req.active_services if "Audit" in s)
    has_ct = any(s for s in req.active_services if "Corporate" in s or "Tax" in s)

    if has_vat:
        onboarding_tasks.append({"title": f"VAT Registration Check - {req.name}", "service_module": "VAT", "priority": "Medium", "days_offset": 7})
    if has_audit:
        onboarding_tasks.append({"title": f"Schedule Audit Kickoff Meeting - {req.name}", "service_module": "Audit", "priority": "Medium", "days_offset": 10})
    if has_ct:
        onboarding_tasks.append({"title": f"Corporate Tax Registration Review - {req.name}", "service_module": "Corporate Tax", "priority": "Medium", "days_offset": 7})

    for t in onboarding_tasks:
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        task_doc = {
            "task_id": task_id,
            "title": t["title"],
            "description": f"Auto-generated onboarding task for {req.name}",
            "service_module": t["service_module"],
            "client_id": client_id,
            "client_name": req.name,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=t["days_offset"])).strftime("%Y-%m-%d"),
            "priority": t["priority"],
            "assigned_to": assignee,
            "assigned_to_name": assignee_name,
            "status": "Pending",
            "created_by": user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tasks.insert_one(task_doc)
        tasks_created.append(task_id)

    # 3. Auto-create engagements for selected services (if enabled)
    engagements_created = []
    if req.auto_create_engagements and req.active_services:
        # Deduplicate engagement types
        engagement_types_done = set()
        for svc in req.active_services:
            eng_type = SERVICE_TO_ENGAGEMENT_TYPE.get(svc)
            if eng_type and eng_type not in engagement_types_done:
                engagement_types_done.add(eng_type)

                # Check for a workflow template for this service type
                wf = await db.workflows.find_one({"service_type": eng_type, "is_deleted": {"$ne": True}}, {"_id": 0})
                checklist = []
                workflow_name = None
                if wf:
                    workflow_name = wf.get("name")
                    checklist = [{"group": step["name"], "items": [{"label": step.get("description") or step["name"], "done": False}]} for step in wf.get("steps", [])]
                if not checklist:
                    template = CHECKLIST_TEMPLATES.get(eng_type, [])
                    checklist = [{"group": g["group"], "items": [{"label": item, "done": False} for item in g["items"]]} for g in template]

                eng_id = f"eng_{uuid.uuid4().hex[:12]}"
                eng_doc = {
                    "engagement_id": eng_id,
                    "service_type": eng_type,
                    "client_id": client_id,
                    "client_name": req.name,
                    "assigned_to": assignee,
                    "assigned_to_name": assignee_name,
                    "status": "Active",
                    "phase": checklist[0]["group"] if checklist else "",
                    "checklist": checklist,
                    "workflow_id": wf.get("workflow_id") if wf else None,
                    "workflow_name": workflow_name,
                    "created_by": user["user_id"],
                    "created_by_name": user.get("name"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.service_engagements.insert_one(eng_doc)
                engagements_created.append(eng_id)

    # 4. Generate document checklist items
    doc_checklist = list(ONBOARDING_DOCUMENT_CHECKLIST["general"])
    if has_vat:
        doc_checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["vat"])
    if has_ct:
        doc_checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["corporate_tax"])
    if req.aml_risk_rating in ("Medium", "High"):
        doc_checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["aml"])

    # 5. Log activity
    await log_activity("Client onboarded", f"Onboarded new client: {req.name} ({req.entity_type})", user["user_id"], client_id, req.name)

    return {
        "client_id": client_id,
        "client_name": req.name,
        "status": "Onboarding",
        "tasks_created": len(tasks_created),
        "engagements_created": len(engagements_created),
        "document_checklist": doc_checklist,
        "message": f"Client '{req.name}' onboarded successfully",
    }

@api_router.get("/onboarding/document-checklist")
async def get_onboarding_doc_checklist(services: str = "", risk: str = "Low", authorization: str = Header(None), session_token: str = Cookie(None)):
    """Preview document checklist based on selected services and risk."""
    user = await get_current_user(authorization, session_token)
    svc_list = [s.strip() for s in services.split(",") if s.strip()] if services else []

    checklist = list(ONBOARDING_DOCUMENT_CHECKLIST["general"])
    has_vat = any(s for s in svc_list if "VAT" in s)
    has_ct = any(s for s in svc_list if "Corporate" in s or "Tax" in s)
    if has_vat:
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["vat"])
    if has_ct:
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["corporate_tax"])
    if risk in ("Medium", "High"):
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["aml"])

    return {"checklist": checklist}

# ============= EXPORT / REPORTING =============

@api_router.get("/export/audit-report/{engagement_id}")
async def export_audit_report(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    from fpdf import FPDF
    import io

    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Get firm name
    firm_doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    firm_name = firm_doc.get("firm_name", "Nair & Nelliyatt Chartered Accountants") if firm_doc else "Nair & Nelliyatt Chartered Accountants"

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 12, firm_name, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, "Engagement Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)

    # Engagement Info
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, eng.get("service_type", "").replace("_", " ").title(), new_x="LMARGIN", new_y="NEXT")

    info_lines = [
        f"Client: {eng.get('client_name', '—')}",
        f"Assigned To: {eng.get('assigned_to_name', '—')}",
        f"Status: {eng.get('status', '—')}",
        f"Current Phase: {eng.get('phase', '—')}",
        f"Created: {eng.get('created_at', '—')[:10]}",
    ]
    if eng.get("workflow_name"):
        info_lines.append(f"Workflow: {eng.get('workflow_name')}")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    for line in info_lines:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Checklist Progress
    total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
    done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
    progress = round(done / total * 100) if total > 0 else 0

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, f"Checklist Progress: {done}/{total} ({progress}%)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for group in eng.get("checklist", []):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(212, 175, 55)
        pdf.cell(0, 7, group.get("group", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(60, 60, 60)
        for item in group.get("items", []):
            mark = "[x]" if item.get("done") else "[ ]"
            pdf.cell(0, 5, f"  {mark} {item.get('label', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y at %H:%M UTC')} by {user.get('name', '—')}", new_x="LMARGIN", new_y="NEXT", align="C")

    buffer = io.BytesIO()
    pdf.output(buffer)
    buffer.seek(0)

    filename = f"Audit_Report_{eng.get('client_name', 'client').replace(' ', '_')}_{engagement_id[-6:]}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

@api_router.get("/export/vat-return/{engagement_id}")
async def export_vat_return(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    from fpdf import FPDF
    import io

    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    firm_doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    firm_name = firm_doc.get("firm_name", "Nair & Nelliyatt Chartered Accountants") if firm_doc else "Nair & Nelliyatt Chartered Accountants"

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 12, firm_name, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, "VAT Return Summary", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)

    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    # Client info
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, f"Client: {eng.get('client_name', '—')}", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, f"Filing Status: {eng.get('status', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Current Phase: {eng.get('phase', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Prepared By: {eng.get('assigned_to_name', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Period: {eng.get('created_at', '—')[:10]}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Checklist as filing steps
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(10, 17, 40)
    total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
    done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
    pdf.cell(0, 8, f"Filing Checklist: {done}/{total} steps completed", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for group in eng.get("checklist", []):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(212, 175, 55)
        pdf.cell(0, 7, group.get("group", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(60, 60, 60)
        for item in group.get("items", []):
            status = "Completed" if item.get("done") else "Pending"
            pdf.cell(0, 5, f"  [{status}] {item.get('label', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y at %H:%M UTC')} by {user.get('name', '—')}", new_x="LMARGIN", new_y="NEXT", align="C")

    buffer = io.BytesIO()
    pdf.output(buffer)
    buffer.seek(0)

    filename = f"VAT_Return_{eng.get('client_name', 'client').replace(' ', '_')}_{engagement_id[-6:]}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

async def seed_nn_users():
    """Seed the Nair & Nelliyatt team into the database if not already present."""
    default_password = hash_password("nn123456")
    team = [
        {"name": "Arjun Srinivas", "email": "arjun@nnadvisory.ae", "role": "partner", "title": "Managing Partner"},
        {"name": "Sooraj Nelliyatt", "email": "sooraj@nnadvisory.ae", "role": "partner", "title": "Senior Partner"},
        {"name": "Fazil", "email": "fazil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Subin", "email": "subin@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Anju", "email": "anju@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
        {"name": "Roshith", "email": "roshith@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Thasleema", "email": "thasleema@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
        {"name": "Jithin", "email": "jithin@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Shamil A.", "email": "shamil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Akhil", "email": "akhil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Haritha", "email": "haritha@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
    ]
    for member in team:
        existing = await db.users.find_one({"email": member["email"]})
        if not existing:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": member["email"],
                "name": member["name"],
                "title": member["title"],
                "role": member["role"],
                "password": default_password,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Seeded user: {member['name']}")

async def seed_nn_clients():
    """Seed demo clients for Nair & Nelliyatt practice."""
    demo_clients = [
        {"name": "Al Baraka Trading LLC", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "trn": "100234567890003", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "AML"]},
        {"name": "Falcon Logistics Co.", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "trn": "100456789000123", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Internal Audit", "AML"]},
        {"name": "Gulf Pharma Group", "entity_type": "Group", "jurisdiction": "Abu Dhabi", "trn": "100345678900012", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Corporate Tax", "AML"]},
        {"name": "Zara Tech LLC", "entity_type": "LLC", "jurisdiction": "DMCC Free Zone", "trn": "100678900012345", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing"]},
        {"name": "Sunrise Holdings", "entity_type": "Holding", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit", "Company Formation"]},
        {"name": "Marina Holdings", "entity_type": "LLC", "jurisdiction": "Dubai Marina", "trn": "100567890001234", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Internal Audit", "Corporate Tax"]},
        {"name": "Desert Rose Trading", "entity_type": "LLC", "jurisdiction": "Sharjah", "status": "Active", "active_services": ["Statutory Audit", "AML", "Valuation"]},
        {"name": "Al Hayat Retail", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit"]},
        {"name": "Blue Horizon Co.", "entity_type": "LLC", "jurisdiction": "Ajman Free Zone", "status": "Active", "active_services": ["Statutory Audit"]},
        {"name": "Bright Vision LLC", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit"]},
    ]
    for c in demo_clients:
        existing = await db.clients.find_one({"name": c["name"]})
        if not existing:
            await db.clients.insert_one({
                "client_id": f"client_{uuid.uuid4().hex[:12]}",
                "name": c["name"],
                "entity_type": c["entity_type"],
                "jurisdiction": c.get("jurisdiction"),
                "trn": c.get("trn"),
                "status": c.get("status", "Active"),
                "active_services": c.get("active_services", []),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Seeded client: {c['name']}")

async def seed_nn_engagements():
    """Seed sample service engagements if none exist."""
    existing = await db.service_engagements.count_documents({})
    if existing > 0:
        return

    clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1}).to_list(10)
    staff = await db.users.find({"role": "staff"}, {"_id": 0, "name": 1, "email": 1}).to_list(10)
    if not clients or not staff:
        return

    def make_checklist(svc_type, done_map):
        template = CHECKLIST_TEMPLATES.get(svc_type, [])
        cl = []
        for g in template:
            items = []
            for item in g["items"]:
                items.append({"label": item, "done": done_map.get(item, False)})
            cl.append({"group": g["group"], "items": items})
        return cl

    seed_engs = [
        {"service_type": "statutory_audit", "client_idx": 0, "staff_idx": 0, "phase": "Fieldwork",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Team briefing": True, "Revenue testing": True}},
        {"service_type": "statutory_audit", "client_idx": 1, "staff_idx": 3, "phase": "Planning",
         "done": {"Engagement letter": True, "Risk assessment": True}},
        {"service_type": "statutory_audit", "client_idx": 2, "staff_idx": 4, "phase": "Fieldwork",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Materiality memo": True, "Team briefing": True, "Revenue testing": True, "Expense sampling": True, "Bank confirmations": True}},
        {"service_type": "statutory_audit", "client_idx": 7, "staff_idx": 6, "phase": "Review & Reporting",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Materiality memo": True, "Team briefing": True, "Revenue testing": True, "Expense sampling": True, "Bank confirmations": True, "Inventory count": True, "Related party review": True, "Draft report": True, "Management letter": True}},
        {"service_type": "vat_filing", "client_idx": 0, "staff_idx": 3, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True, "Filing receipt archive": True, "Client notification": True}},
        {"service_type": "vat_filing", "client_idx": 2, "staff_idx": 4, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True}},
        {"service_type": "vat_filing", "client_idx": 1, "staff_idx": 5, "phase": "Filing",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True}},
        {"service_type": "vat_filing", "client_idx": 5, "staff_idx": 6, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True, "Filing receipt archive": True}},
        {"service_type": "aml_review", "client_idx": 0, "staff_idx": 4, "phase": "Transaction Monitoring",
         "done": {"KYC documentation": True, "Beneficial ownership check": True, "PEP screening": True, "Sanctions screening": True, "Unusual transaction review": True}},
        {"service_type": "aml_review", "client_idx": 1, "staff_idx": 6, "phase": "Client Due Diligence",
         "done": {"KYC documentation": True, "Beneficial ownership check": True}},
        {"service_type": "corporate_tax", "client_idx": 2, "staff_idx": 4, "phase": "Computation",
         "done": {"Financial data collection": True, "Revenue classification": True, "Exempt income review": True, "Deduction analysis": True, "Taxable income calculation": True}},
    ]

    for se in seed_engs:
        ci = min(se["client_idx"], len(clients) - 1)
        si = min(se["staff_idx"], len(staff) - 1)
        checklist = make_checklist(se["service_type"], se.get("done", {}))
        total = sum(len(g["items"]) for g in checklist)
        done_count = sum(1 for g in checklist for item in g["items"] if item["done"])
        await db.service_engagements.insert_one({
            "engagement_id": f"eng_{uuid.uuid4().hex[:12]}",
            "service_type": se["service_type"],
            "client_id": clients[ci]["client_id"],
            "client_name": clients[ci]["name"],
            "assigned_to": staff[si]["email"],
            "assigned_to_name": staff[si]["name"],
            "status": "Completed" if done_count == total else "Active",
            "phase": se["phase"],
            "checklist": checklist,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info(f"Seeded {len(seed_engs)} service engagements")

async def seed_preset_workflows():
    """Seed preset workflows for each service type if none exist."""
    existing = await db.workflows.count_documents({})
    if existing > 0:
        return
    presets = [
        {"name": "Statutory Audit Workflow", "service_type": "statutory_audit", "steps": [
            {"name": "Engagement Letter", "description": "Issue and sign engagement letter with client", "order": 0},
            {"name": "Risk Assessment", "description": "Assess inherent and control risks", "order": 1},
            {"name": "Audit Planning", "description": "Develop audit plan and materiality thresholds", "order": 2},
            {"name": "Fieldwork Execution", "description": "Perform substantive testing and controls testing", "order": 3},
            {"name": "Review & Quality Control", "description": "Partner review of working papers", "order": 4},
            {"name": "Draft Report", "description": "Prepare draft audit report and management letter", "order": 5},
            {"name": "Client Sign-off", "description": "Obtain client approval and representations", "order": 6},
            {"name": "Final Report & Filing", "description": "Issue final report and file with authorities", "order": 7},
        ]},
        {"name": "VAT Filing Workflow", "service_type": "vat_filing", "steps": [
            {"name": "Data Collection", "description": "Gather sales and purchase invoices from client", "order": 0},
            {"name": "Invoice Reconciliation", "description": "Reconcile invoices with accounting records", "order": 1},
            {"name": "Return Preparation", "description": "Calculate box amounts and prepare VAT return", "order": 2},
            {"name": "Partner Review", "description": "Review and approve return before submission", "order": 3},
            {"name": "FTA Submission", "description": "Submit return via FTA portal", "order": 4},
            {"name": "Payment Processing", "description": "Process VAT payment and confirm receipt", "order": 5},
        ]},
        {"name": "AML Review Workflow", "service_type": "aml_review", "steps": [
            {"name": "KYC Documentation", "description": "Collect and verify identity documents", "order": 0},
            {"name": "Beneficial Ownership", "description": "Identify and verify beneficial owners", "order": 1},
            {"name": "PEP & Sanctions Screening", "description": "Screen against PEP lists and sanctions databases", "order": 2},
            {"name": "Risk Rating", "description": "Assign client risk rating based on due diligence", "order": 3},
            {"name": "Transaction Monitoring", "description": "Review transactions for unusual patterns", "order": 4},
            {"name": "MLRO Review & goAML", "description": "MLRO assessment and goAML report if required", "order": 5},
        ]},
        {"name": "Corporate Tax Workflow", "service_type": "corporate_tax", "steps": [
            {"name": "Financial Data Review", "description": "Review financial statements and trial balance", "order": 0},
            {"name": "Income Classification", "description": "Classify taxable, exempt, and qualifying income", "order": 1},
            {"name": "Tax Computation", "description": "Calculate taxable income and tax liability", "order": 2},
            {"name": "Return Preparation", "description": "Prepare CT return with supporting schedules", "order": 3},
            {"name": "Partner Approval", "description": "Review and sign-off by engagement partner", "order": 4},
            {"name": "Filing & Payment", "description": "Submit via portal and process payment", "order": 5},
        ]},
        {"name": "Internal Audit Workflow", "service_type": "internal_audit", "steps": [
            {"name": "Scope Definition", "description": "Define audit scope and objectives", "order": 0},
            {"name": "Risk Assessment", "description": "Update risk universe and prioritize areas", "order": 1},
            {"name": "Audit Program", "description": "Develop detailed testing procedures", "order": 2},
            {"name": "Control Testing", "description": "Test operating effectiveness of controls", "order": 3},
            {"name": "Findings & Recommendations", "description": "Document findings and propose improvements", "order": 4},
            {"name": "Management Response", "description": "Obtain management responses to findings", "order": 5},
            {"name": "Final Report", "description": "Issue final internal audit report", "order": 6},
        ]},
    ]
    for p in presets:
        await db.workflows.insert_one({
            "workflow_id": f"wf_{uuid.uuid4().hex[:12]}",
            "name": p["name"],
            "service_type": p["service_type"],
            "steps": p["steps"],
            "is_preset": True,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info(f"Seeded {len(presets)} preset workflows")

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed_nn_users()
    await seed_nn_clients()
    await seed_nn_engagements()
    await seed_preset_workflows()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
