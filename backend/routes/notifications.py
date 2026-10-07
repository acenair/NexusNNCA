"""Routes / notifications — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import Header
from datetime import datetime
from core import db
from core import get_current_user
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/notifications")
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


@router.patch("/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.dismissed_notifications.update_one(
        {"user_id": user["user_id"], "notification_id": notification_id},
        {"$set": {"user_id": user["user_id"], "notification_id": notification_id, "dismissed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Notification dismissed"}
