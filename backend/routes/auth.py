"""Routes / auth — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from services.auth import MIN_PASSWORD_LENGTH
from services.auth import _extract_token
from core import create_jwt_token
from datetime import datetime
from core import db
from core import get_current_user
from core import get_current_user_raw
from core import hash_password
from core import log_activity
from core import logger
import requests
from datetime import timedelta
from datetime import timezone
import uuid
from core import verify_password

router = APIRouter(prefix="/api")


@router.post("/auth/register")
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
        "role": "staff",
        "status": "pending_approval",
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    return {"message": "Account created. Pending admin approval.", "error": "pending_approval"}


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
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
        "session_token": session_token,
        "must_change_password": bool(user_doc.get("must_change_password"))
    }


@router.get("/auth/users-list")
async def get_users_list(authorization: str = Header(None), session_token: str = Cookie(None)):
    # SECURITY: was unauthenticated (leaked all staff emails/roles to the internet).
    # Now requires a valid session; any authenticated user (staff/partner/client) may
    # read names/titles for assignment pickers, but client-role users no longer see
    # the full directory — only partners and staff do (clients get 403).
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    users = await db.users.find({"status": {"$ne": "pending_approval"}}, {"_id": 0, "password": 0}).to_list(100)
    return [{"name": u.get("name"), "email": u.get("email"), "role": u.get("role", "staff"), "title": u.get("title", "")} for u in users]


@router.get("/auth/login-directory")
async def get_login_directory():
    # Public (pre-auth) endpoint for the Login page user-picker.
    # Returns ONLY directory display fields — no emails, no roles, no titles —
    # so an anonymous visitor cannot enumerate staff email addresses.
    users = await db.users.find(
        {"status": {"$ne": "pending_approval"}, "role": {"$in": ["partner", "staff"]}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    return [{"name": u.get("name"), "title": u.get("title", "")} for u in users]


@router.post("/auth/session")
async def create_session(session_id: str):
    # SECURITY: Google OAuth sign-in is disabled for now — it let a user skip
    # email+password entirely, which also meant it could skip the forced
    # password-change gate. Re-evaluate in a future phase if re-enabled.
    raise HTTPException(status_code=410, detail="Google sign-in is temporarily disabled. Please use email and password.")
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
        # Check if user is approved
        if user_doc.get("status") == "pending_approval":
            return {"error": "pending_approval", "message": "Your account is pending admin approval. Please contact the administrator."}
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": data["email"],
            "name": data["name"],
            "picture": data["picture"],
            "role": "staff",
            "title": "",
            "status": "pending_approval",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        return {"error": "pending_approval", "message": "Account created! Your access is pending admin approval."}
    
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


@router.get("/auth/me")
async def get_me(authorization: str = Header(None), session_token: str = Cookie(None)):
    # Uses the ungated raw lookup so a user who must change their password
    # can still load their identity (ProtectedRoute needs this to route them
    # to the change-password screen instead of treating them as logged out).
    user = await get_current_user_raw(authorization, session_token)
    return user


@router.post("/auth/logout")
async def logout(authorization: str = Header(None), session_token: str = Cookie(None)):
    # Prefer Authorization header over cookie (consistent with get_current_user)
    token = _extract_token(authorization, session_token)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"message": "Logged out"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user_raw(authorization, session_token)
    full_user = await db.users.find_one({"user_id": user["user_id"]})
    if not full_user or not verify_password(req.current_password, full_user.get("password", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(req.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password": hash_password(req.new_password), "must_change_password": False, "password_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    # Keep the session used to make this request alive; kill every other active session
    current_token = _extract_token(authorization, session_token)
    await db.user_sessions.delete_many({"user_id": user["user_id"], "session_token": {"$ne": current_token}})
    await log_activity("Password changed", f"{full_user.get('name')} changed their password", user["user_id"])
    return {"message": "Password updated successfully"}


class ForgotPasswordRequest(BaseModel):
    email: str


@router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user_doc = await db.users.find_one({"email": req.email.strip().lower()})
    if user_doc and user_doc.get("status") != "pending_approval":
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"password_reset_requested_at": datetime.now(timezone.utc).isoformat()}})
    # SECURITY: identical response whether or not the account exists — never reveal that.
    return {"message": "If an account exists for this email, a partner will be in touch shortly with a reset code."}


class ResetPasswordRequest(BaseModel):
    email: str
    reset_code: str
    new_password: str


@router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    user_doc = await db.users.find_one({"email": req.email.strip().lower()})
    if not user_doc or not user_doc.get("password_reset_code_hash"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    expires_at = user_doc.get("password_reset_code_expires_at")
    expires_dt = datetime.fromisoformat(expires_at) if expires_at else None
    if expires_dt and expires_dt.tzinfo is None:
        expires_dt = expires_dt.replace(tzinfo=timezone.utc)
    if not expires_dt or expires_dt < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")
    if not verify_password(req.reset_code.strip(), user_doc["password_reset_code_hash"]):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    if len(req.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters")

    await db.users.update_one(
        {"user_id": user_doc["user_id"]},
        {
            "$set": {"password": hash_password(req.new_password), "must_change_password": False, "password_updated_at": datetime.now(timezone.utc).isoformat()},
            "$unset": {"password_reset_code_hash": "", "password_reset_code_expires_at": "", "password_reset_requested_at": ""},
        }
    )
    # No pre-existing session to preserve here — kill everything and issue one fresh session.
    await db.user_sessions.delete_many({"user_id": user_doc["user_id"]})
    new_session_token = create_jwt_token(user_doc["user_id"])
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"], "session_token": new_session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await log_activity("Password reset via self-service code", f"{user_doc.get('name')} reset their password", user_doc["user_id"])
    return {
        "message": "Password updated. You're now signed in.",
        "session_token": new_session_token,
        "user_id": user_doc["user_id"], "email": user_doc["email"], "name": user_doc["name"],
        "role": user_doc.get("role", "staff"),
    }
