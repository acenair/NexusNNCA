"""Routes / users — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import List
from services.auth import MIN_PASSWORD_LENGTH
from typing import Optional
from services.auth import _generate_temp_secret
from datetime import datetime
from core import db
from core import hash_password
from core import log_activity
from core import require_partner
from datetime import timedelta
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/settings/users")
async def get_all_users(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "password": 0}).to_list(100)
    return users


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    new_password: Optional[str] = None
    date_of_joining: Optional[str] = None
    client_id: Optional[str] = None
    notification_email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    emirates_id: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    visa_status: Optional[str] = None
    visa_expiry: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    address: Optional[str] = None
    department: Optional[str] = None


@router.patch("/settings/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = {}
    if req.name is not None and req.name.strip():
        update_data["name"] = req.name.strip()
    if req.role and req.role in ("staff", "partner", "client"):
        update_data["role"] = req.role
        if req.role != "client":
            update_data["client_id"] = None
    if req.client_id is not None and req.role == "client":
        update_data["client_id"] = req.client_id
    if req.title is not None:
        update_data["title"] = req.title
    if req.email is not None and req.email != target.get("email"):
        existing = await db.users.find_one({"email": req.email, "user_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        update_data["email"] = req.email
    if req.date_of_joining is not None:
        update_data["date_of_joining"] = req.date_of_joining
    if req.notification_email is not None:
        update_data["notification_email"] = req.notification_email
    if req.phone is not None:
        update_data["phone"] = req.phone
    # HR fields
    for field in ["date_of_birth", "gender", "emirates_id", "passport_number", "passport_expiry", "visa_status", "visa_expiry", "emergency_contact_name", "emergency_contact_phone", "address", "department"]:
        val = getattr(req, field, None)
        if val is not None:
            update_data[field] = val
    password_changed = False
    if req.new_password:
        if len(req.new_password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        update_data["password"] = hash_password(req.new_password)
        update_data["must_change_password"] = True
        update_data["password_updated_at"] = datetime.now(timezone.utc).isoformat()
        password_changed = True
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"user_id": user_id}, {"$set": update_data})
    if password_changed:
        await db.user_sessions.delete_many({"user_id": user_id})
    await log_activity("User updated", f"Updated {target.get('name', user_id)}: {', '.join(update_data.keys())}", user["user_id"])
    return {"message": f"User {update_data.get('name', target.get('name'))} updated"}


class CreateUserRequest(BaseModel):
    name: str
    email: str
    role: str = "staff"
    title: Optional[str] = None
    notification_email: Optional[str] = None
    phone: Optional[str] = None


@router.post("/settings/users")
async def create_user(req: CreateUserRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    partner = await require_partner(authorization, session_token)
    if not req.name.strip() or not req.email.strip():
        raise HTTPException(status_code=400, detail="Name and email are required")
    email = req.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    if req.role not in ("staff", "partner", "client"):
        raise HTTPException(status_code=400, detail="Role must be staff, partner, or client")
    temp_password = _generate_temp_secret(12)
    user_doc = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": req.name.strip(),
        "title": req.title.strip() if req.title else "",
        "role": req.role,
        "password": hash_password(temp_password),
        "must_change_password": True,
        "notification_email": req.notification_email.strip() if req.notification_email else "",
        "phone": req.phone.strip() if req.phone else "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    await log_activity("User created", f"{partner['name']} created user {req.name.strip()} ({email})", partner["user_id"])
    return {"message": f"User {req.name.strip()} created", "user_id": user_doc["user_id"], "temporary_password": temp_password}


@router.post("/settings/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    partner = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    temp_password = _generate_temp_secret(12)
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {"password": hash_password(temp_password), "must_change_password": True, "password_updated_at": datetime.now(timezone.utc).isoformat()},
            "$unset": {"password_reset_code_hash": "", "password_reset_code_expires_at": "", "password_reset_requested_at": ""},
        }
    )
    await db.user_sessions.delete_many({"user_id": user_id})
    await log_activity("Password reset by partner", f"{partner['name']} reset password for {target.get('name')}", partner["user_id"])
    return {"temporary_password": temp_password, "user_name": target.get("name"), "user_email": target.get("email")}


@router.get("/settings/password-reset-requests")
async def get_pending_reset_requests(authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    users = await db.users.find(
        {"password_reset_requested_at": {"$exists": True, "$ne": None}}, {"_id": 0, "password": 0}
    ).sort("password_reset_requested_at", -1).to_list(50)
    return [{"user_id": u["user_id"], "name": u.get("name"), "email": u.get("email"), "role": u.get("role"), "requested_at": u.get("password_reset_requested_at")} for u in users]


@router.post("/settings/users/{user_id}/generate-reset-code")
async def admin_generate_reset_code(user_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    partner = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    code = _generate_temp_secret(digits_only=True)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {"password_reset_code_hash": hash_password(code), "password_reset_code_expires_at": expires_at},
            "$unset": {"password_reset_requested_at": ""},
        }
    )
    await log_activity("Password reset code generated", f"{partner['name']} generated a reset code for {target.get('name')}", partner["user_id"])
    return {"reset_code": code, "expires_at": expires_at, "user_name": target.get("name"), "user_email": target.get("email")}


@router.patch("/settings/users/{user_id}/approve")
async def approve_user(user_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"status": "approved"}})
    await log_activity("User approved", f"Approved {target.get('name', user_id)} ({target.get('email')})", user["user_id"])
    return {"message": f"User {target.get('name')} approved"}


@router.patch("/settings/users/{user_id}/reject")
async def reject_user(user_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await log_activity("User rejected", f"Rejected {target.get('name', user_id)} ({target.get('email')})", user["user_id"])
    return {"message": f"User {target.get('name')} rejected and removed"}


class UserAccessRequest(BaseModel):
    hidden_sections: List[str] = []


@router.patch("/settings/user-access/{user_id}")
async def update_user_access(user_id: str, req: UserAccessRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"hidden_sections": req.hidden_sections}})
    return {"message": f"Access updated for {target.get('name')}"}


@router.get("/settings/user-access")
async def get_all_user_access(authorization: str = Header(None), session_token: str = Cookie(None)):
    await require_partner(authorization, session_token)
    users = await db.users.find({"role": {"$in": ["staff", "partner"]}}, {"_id": 0, "user_id": 1, "name": 1, "role": 1, "hidden_sections": 1}).to_list(100)
    return users
