"""Routes / aml — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from datetime import datetime
from core import db
from core import get_current_user
from core import log_activity
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/aml/alerts")
async def get_aml_alerts(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    alerts = await db.aml_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return alerts


@router.post("/aml/alerts")
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


@router.patch("/aml/alerts/{alert_id}")
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
