"""Routes / vat — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from datetime import datetime
from core import db
from core import get_current_user
from core import log_activity
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/vat/registrations")
async def get_vat_registrations(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    registrations = await db.vat_registrations.find({}, {"_id": 0}).to_list(1000)
    return registrations


@router.post("/vat/registrations")
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


@router.get("/vat/filings")
async def get_vat_filings(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    filings = await db.vat_filings.find({}, {"_id": 0}).to_list(1000)
    return filings


@router.post("/vat/filings")
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
