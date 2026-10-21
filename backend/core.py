"""Shared core: DB, auth helpers, storage, models, constants."""
from fastapi import HTTPException, Header, Cookie
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os, uuid, bcrypt, jwt, requests, logging, io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Env vars
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'mailto:admin@nnadvisory.ae')
APP_NAME = "ca-ai"

logger = logging.getLogger(__name__)

# ---- Storage (portable) ----
# BACKEND: local disk by default (volume-mounted in Docker); S3-compatible when
# S3_BUCKET + keys are configured. Same function signatures as before, so no
# route code changes. Existing object paths remain valid.
STORAGE_BACKEND = os.environ.get('STORAGE_BACKEND', 'local')  # 'local' | 's3'
LOCAL_STORAGE_DIR = Path(os.environ.get('LOCAL_STORAGE_DIR', str(ROOT_DIR / 'uploads')))
S3_BUCKET = os.environ.get('S3_BUCKET', '')
S3_REGION = os.environ.get('S3_REGION', 'us-east-1')
S3_ENDPOINT = os.environ.get('S3_ENDPOINT', '')  # for B2/Hostinger S3-compatible stores
_s3 = None


def _s3_client():
    global _s3
    if _s3 is None:
        import boto3
        kwargs = {"region_name": S3_REGION}
        if S3_ENDPOINT:
            kwargs["endpoint_url"] = S3_ENDPOINT
        _s3 = boto3.client(
            's3',
            aws_access_key_id=os.environ['S3_ACCESS_KEY'],
            aws_secret_access_key=os.environ['S3_SECRET_KEY'],
            **kwargs,
        )
    return _s3


def init_storage():
    """Verify the configured storage is usable. Kept for startup-call compat."""
    if STORAGE_BACKEND == 'local':
        LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        return str(LOCAL_STORAGE_DIR)
    if STORAGE_BACKEND == 's3':
        _s3_client().head_bucket(Bucket=S3_BUCKET)
        return S3_BUCKET
    raise ValueError(f"Unknown STORAGE_BACKEND: {STORAGE_BACKEND}")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if STORAGE_BACKEND == 'local':
        dest = (LOCAL_STORAGE_DIR / path).resolve()
        # path safety: never escape the storage dir
        if not str(dest).startswith(str(LOCAL_STORAGE_DIR.resolve())):
            raise ValueError("Invalid storage path")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return {"path": path, "size": len(data)}
    _s3_client().put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path, "size": len(data)}


def get_object(path: str) -> tuple:
    if STORAGE_BACKEND == 'local':
        src = (LOCAL_STORAGE_DIR / path).resolve()
        if not str(src).startswith(str(LOCAL_STORAGE_DIR.resolve())) or not src.exists():
            raise FileNotFoundError(f"Object not found: {path}")
        import mimetypes
        ctype = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
        return src.read_bytes(), ctype
    obj = _s3_client().get_object(Bucket=S3_BUCKET, Key=path)
    return obj['Body'].read(), obj.get('ContentType', 'application/octet-stream')

# ---- Auth helpers ----
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user_raw(authorization: str = Header(None), session_token: str = Cookie(None)) -> dict:
    """Session + user lookup WITHOUT the must_change_password gate.
    Used only by /auth/me, /auth/change-password so a user who must change
    their password can still load their identity and submit the change."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif session_token:
        token = session_token
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
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0, "password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("status") == "pending_approval":
        raise HTTPException(status_code=403, detail="Account pending approval")
    return user_doc

async def get_current_user(authorization: str = Header(None), session_token: str = Cookie(None)) -> dict:
    user = await get_current_user_raw(authorization, session_token)
    if user.get("must_change_password"):
        raise HTTPException(status_code=403, detail="PASSWORD_CHANGE_REQUIRED")
    return user

async def require_partner(authorization: str = Header(None), session_token: str = Cookie(None)) -> dict:
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")
    return user

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
