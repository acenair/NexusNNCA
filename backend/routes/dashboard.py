"""Routes / dashboard — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import Header
from datetime import datetime
from core import db
from core import get_current_user
from core import require_partner
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/dashboard/stats")
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


@router.get("/dashboard/activities")
async def get_recent_activities(authorization: str = Header(None), session_token: str = Cookie(None), limit: int = 20):
    user = await get_current_user(authorization, session_token)
    activities = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return activities


@router.get("/analytics/stats")
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


@router.get("/dashboard/visa-alerts")
async def get_visa_alerts(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    all_users = await db.users.find({"status": {"$ne": "pending_approval"}, "role": {"$ne": "client"}}, {"_id": 0, "password": 0}).to_list(200)
    today = datetime.now(timezone.utc).date()
    alerts = []
    for u in all_users:
        for field, label in [("passport_expiry", "Passport"), ("visa_expiry", "Visa")]:
            val = u.get(field)
            if not val:
                continue
            try:
                exp_date = datetime.fromisoformat(val).date() if isinstance(val, str) else val
                days_left = (exp_date - today).days
                if days_left <= 30:
                    alerts.append({"user_id": u["user_id"], "name": u.get("name"), "document": label, "expiry_date": val, "days_left": days_left, "title": u.get("title", "")})
            except Exception:
                pass
    alerts.sort(key=lambda x: x["days_left"])
    return alerts
