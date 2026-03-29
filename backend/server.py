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
JWT_SECRET = os.environ.get('JWT_SECRET', 'ca-ai-compliance-secret-key-2026')
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

@api_router.post("/auth/login")
async def login(email: str, password: str):
    user_doc = await db.users.find_one({"email": email})
    if not user_doc or not verify_password(password, user_doc.get("password", "")):
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
        "picture": user_doc.get("picture"),
        "session_token": session_token
    }

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
    
    return client_doc

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

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

@api_router.post("/tasks")
async def create_task(title: str, service_module: str, due_date: str, priority: str,
                     authorization: str = Header(None), session_token: str = Cookie(None),
                     description: Optional[str] = None, client_id: Optional[str] = None,
                     assigned_to: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task_doc = {
        "task_id": task_id,
        "title": title,
        "description": description,
        "service_module": service_module,
        "client_id": client_id,
        "due_date": due_date,
        "priority": priority,
        "assigned_to": assigned_to or user["user_id"],
        "status": "Pending",
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tasks.insert_one(task_doc)
    await log_activity("Task created", f"Created task: {title}", user["user_id"])
    
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

# ============= AI ASSISTANT ROUTES =============

@api_router.post("/ai/chat")
async def chat_with_ai(session_id: str, message: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    # Save user message
    user_msg_doc = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "session_id": session_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(user_msg_doc)
    
    # Get chat history
    history = await db.chat_messages.find(
        {"session_id": session_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Create AI chat instance with UAE compliance context
    system_message = """You are an AI compliance assistant for a UAE-based accounting and audit firm. 
    You specialize in:
    - UAE VAT (Federal Decree-Law No. 8/2017)
    - Corporate Tax (Federal Decree-Law No. 47/2022)
    - AML/CFT (Federal Law No. 20/2018)
    - UAE Companies Law (Federal Decree-Law No. 32/2021)
    - DIFC / ADGM regulations
    - International audit standards (ISA) and IFRS
    - Business valuation and due diligence in UAE
    
    Provide concise, accurate answers (under 250 words). Always cite the applicable law.
    If a question is outside your scope, politely decline and redirect."""
    
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message
    ).with_model("openai", "gpt-4o")
    
    user_message = UserMessage(text=message)
    
    try:
        response = await chat.send_message(user_message)
        
        # Save AI response
        ai_msg_doc = {
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
            "session_id": session_id,
            "user_id": user["user_id"],
            "role": "assistant",
            "content": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_messages.insert_one(ai_msg_doc)
        
        return {"response": response}
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")

@api_router.get("/ai/chat/{session_id}")
async def get_chat_history(session_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    messages = await db.chat_messages.find(
        {"session_id": session_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return messages

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
    
    return reg_doc

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
    
    return filing_doc

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
    
    return engagement_doc

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
    
    return alert_doc

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

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
