"""Routes / push — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from typing import Any
from pydantic import BaseModel
from fastapi import Cookie
from typing import Dict
from fastapi import HTTPException
from fastapi import Header
from core import VAPID_PUBLIC_KEY
from datetime import datetime
from core import db
from core import get_current_user
from services.push import send_push_to_user
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/push/vapid-key")
async def get_vapid_public_key():
    """Return the VAPID public key for frontend push subscription."""
    return {"public_key": VAPID_PUBLIC_KEY}


class PushSubscriptionRequest(BaseModel):
    subscription: Dict[str, Any]


@router.post("/push/subscribe")
async def subscribe_push(req: PushSubscriptionRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Store a push subscription for the authenticated user."""
    user = await get_current_user(authorization, session_token)
    endpoint = req.subscription.get("endpoint", "")

    # Upsert subscription (one per endpoint per user)
    await db.push_subscriptions.update_one(
        {"user_id": user["user_id"], "endpoint": endpoint},
        {"$set": {
            "user_id": user["user_id"],
            "user_email": user.get("email"),
            "user_name": user.get("name"),
            "subscription": req.subscription,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    return {"message": "Push subscription stored"}


@router.post("/push/unsubscribe")
async def unsubscribe_push(req: PushSubscriptionRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Remove a push subscription."""
    user = await get_current_user(authorization, session_token)
    endpoint = req.subscription.get("endpoint", "")
    await db.push_subscriptions.delete_one({"user_id": user["user_id"], "endpoint": endpoint})
    return {"message": "Push subscription removed"}


@router.post("/push/test")
async def test_push(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Send a test push notification to the current user."""
    user = await get_current_user(authorization, session_token)
    sent = await send_push_to_user(
        user["user_id"],
        "Nair & Nelliyatt",
        f"Push notifications are working, {user.get('name', 'there')}!",
        "/dashboard",
        "nn-test"
    )
    return {"message": f"Test push sent to {sent} device(s)"}


@router.post("/push/send-deadline-alerts")
async def send_deadline_push_alerts(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Partner can trigger push alerts for overdue/due-soon tasks to all assigned staff."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")

    today = datetime.now(timezone.utc).date()
    tasks = await db.tasks.find({"status": {"$ne": "Completed"}}, {"_id": 0}).to_list(500)

    # Group alerts by assigned user email
    user_alerts = {}
    for t in tasks:
        due = t.get("due_date")
        if not due:
            continue
        try:
            due_date = datetime.fromisoformat(due).date() if 'T' in due else datetime.strptime(due, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_until = (due_date - today).days
        if days_until > 3:
            continue

        assignee_email = t.get("assigned_to")
        if not assignee_email:
            continue

        # Find user_id for this email
        assignee = await db.users.find_one({"email": assignee_email}, {"_id": 0, "user_id": 1, "name": 1})
        if not assignee:
            continue

        uid = assignee["user_id"]
        if uid not in user_alerts:
            user_alerts[uid] = []
        label = f"OVERDUE: {t['title']}" if days_until < 0 else f"Due {'today' if days_until == 0 else f'in {days_until}d'}: {t['title']}"
        user_alerts[uid].append(label)

    total_sent = 0
    for uid, alerts in user_alerts.items():
        body = f"{len(alerts)} deadline alert{'s' if len(alerts) != 1 else ''}: {alerts[0]}" + (f" (+{len(alerts)-1} more)" if len(alerts) > 1 else "")
        sent = await send_push_to_user(uid, "Deadline Alert — N&N", body, "/tasks", "nn-deadline")
        total_sent += sent

    return {"message": f"Pushed alerts to {len(user_alerts)} user(s), {total_sent} device(s)"}
