"""Routes / settings — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from typing import Any
from pydantic import BaseModel
from fastapi import Cookie
from typing import Dict
from fastapi import Header
from typing import Optional
from datetime import datetime
from core import db
from core import get_current_user
from core import require_partner
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/settings/reminder-config")
async def get_reminder_config(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "reminder_config"}, {"_id": 0})
    if not doc:
        return {"type": "reminder_config", "aml_designated_staff": "", "audit_client_mapping": {}}
    return doc


class ReminderConfigRequest(BaseModel):
    aml_designated_staff: Optional[str] = None
    audit_client_mapping: Optional[Dict[str, str]] = None


@router.patch("/settings/reminder-config")
async def update_reminder_config(req: ReminderConfigRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    update = {"type": "reminder_config", "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}
    if req.aml_designated_staff is not None:
        update["aml_designated_staff"] = req.aml_designated_staff
    if req.audit_client_mapping is not None:
        update["audit_client_mapping"] = req.audit_client_mapping
    await db.settings.update_one({"type": "reminder_config"}, {"$set": update}, upsert=True)
    return {"message": "Reminder config updated"}


SECTIONS = ["overview", "audit", "vat", "corporate", "advisory", "aml"]


@router.get("/settings/rbac")
async def get_rbac(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "rbac"}, {"_id": 0})
    if not doc:
        default = {"staff": {s: True for s in SECTIONS}, "partner": {s: True for s in SECTIONS}}
        return {"type": "rbac", "config": default}
    return doc


class RBACUpdateRequest(BaseModel):
    config: Dict[str, Dict[str, bool]]


@router.patch("/settings/rbac")
async def update_rbac(req: RBACUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "rbac"}, {"$set": {"type": "rbac", "config": req.config, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "RBAC updated"}


@router.get("/settings/rbac-public")
async def get_rbac_public(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    doc = await db.settings.find_one({"type": "rbac"}, {"_id": 0})
    if not doc:
        default = {"staff": {s: True for s in SECTIONS}, "partner": {s: True for s in SECTIONS}}
        return {"type": "rbac", "config": default}
    return doc


@router.get("/settings/firm")
async def get_firm_settings(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    if not doc:
        return {"type": "firm", "firm_name": "Nair & Nelliyatt Chartered Accountants"}
    return doc


class FirmUpdateRequest(BaseModel):
    firm_name: str


@router.patch("/settings/firm")
async def update_firm_settings(req: FirmUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "firm"}, {"$set": {"type": "firm", "firm_name": req.firm_name, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "Firm name updated"}


@router.get("/settings/storage")
async def get_storage_config(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.settings.find_one({"type": "storage"}, {"_id": 0})
    if not doc:
        return {"type": "storage", "config": {"provider": "default", "aws_s3": {}, "google_drive": {}, "onedrive": {}}}
    return doc


class StorageUpdateRequest(BaseModel):
    config: Dict[str, Any]


@router.patch("/settings/storage")
async def update_storage_config(req: StorageUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.settings.update_one({"type": "storage"}, {"$set": {"type": "storage", "config": req.config, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"message": "Storage config updated"}
