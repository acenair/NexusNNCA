"""Routes / reminders — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import Header
from datetime import datetime
from core import db
from core import get_current_user
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/reminders")
async def get_reminders(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Returns reminders from real tasks, engagements, and events. Applies service-based routing."""
    user = await get_current_user(authorization, session_token)
    today = datetime.now(timezone.utc).date()
    reminders = []

    # Load service-based reminder config
    reminder_cfg = await db.settings.find_one({"type": "reminder_config"}, {"_id": 0})
    aml_staff = reminder_cfg.get("aml_designated_staff", "") if reminder_cfg else ""
    audit_mapping = reminder_cfg.get("audit_client_mapping", {}) if reminder_cfg else {}

    # Overdue & upcoming tasks
    task_query = {"status": {"$ne": "Completed"}}
    if user.get("role") != "partner":
        # Staff see their own tasks, EXCLUDING ones fixed-routed away to a designated staff member
        user_email = user.get("email")
        exclude_conditions = []
        if aml_staff and aml_staff != user_email:
            exclude_conditions.append({"service_module": {"$regex": "AML", "$options": "i"}})
        mapped_away_clients = [cid for cid, staff in audit_mapping.items() if staff and staff != user_email]
        if mapped_away_clients:
            exclude_conditions.append({"client_id": {"$in": mapped_away_clients}, "service_module": {"$regex": "Audit", "$options": "i"}})
        normal_cond = {"assigned_to": user_email}
        if exclude_conditions:
            normal_cond = {"$and": [{"assigned_to": user_email}, {"$nor": exclude_conditions}]}
        service_or = [normal_cond]
        # If this staff is the designated AML person, they exclusively receive all AML tasks
        if aml_staff == user_email:
            service_or.append({"service_module": {"$regex": "AML", "$options": "i"}})
        # If this staff is mapped for any audit client, they exclusively receive those audit tasks
        audit_clients = [cid for cid, staff in audit_mapping.items() if staff == user_email]
        if audit_clients:
            service_or.append({"client_id": {"$in": audit_clients}, "service_module": {"$regex": "Audit", "$options": "i"}})
        task_query["$or"] = service_or

    staff_names = {u["email"]: u["name"] async for u in db.users.find({}, {"_id": 0, "email": 1, "name": 1})}
    tasks = await db.tasks.find(task_query, {"_id": 0}).to_list(200)
    for t in tasks:
        due = t.get("due_date")
        if not due:
            continue
        try:
            due_date = datetime.fromisoformat(due).date() if 'T' in due else datetime.strptime(due, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_until = (due_date - today).days
        if days_until <= 14:
            service_module = t.get("service_module", "")
            effective_email = t.get("assigned_to")
            effective_name = t.get("assigned_to_name") or effective_email
            if aml_staff and "aml" in service_module.lower():
                effective_email = aml_staff
                effective_name = staff_names.get(aml_staff, aml_staff)
            elif "audit" in service_module.lower() and audit_mapping.get(t.get("client_id")):
                mapped_staff = audit_mapping[t.get("client_id")]
                effective_email = mapped_staff
                effective_name = staff_names.get(mapped_staff, mapped_staff)
            reminders.append({
                "reminder_id": f"rem_task_{t.get('task_id', '')}",
                "type": "task",
                "title": t.get("title", "Task"),
                "client_name": t.get("client_name", ""),
                "client_id": t.get("client_id"),
                "assigned_to": effective_name,
                "assigned_to_email": effective_email,
                "due_date": due,
                "days_until": days_until,
                "priority": t.get("priority", "Medium"),
                "status": t.get("status", "Pending"),
                "description": t.get("description", ""),
                "service_module": t.get("service_module", ""),
                "severity": "urgent" if days_until < 0 else "warning" if days_until <= 3 else "info",
                "ref_id": t.get("task_id"),
            })

    # Upcoming events (within 14 days)
    events = await db.events.find({"date": {"$exists": True}}, {"_id": 0}).to_list(200)
    for ev in events:
        ev_date_str = ev.get("date")
        if not ev_date_str:
            continue
        try:
            ev_date = datetime.fromisoformat(ev_date_str).date() if 'T' in ev_date_str else datetime.strptime(ev_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_until = (ev_date - today).days
        if 0 <= days_until <= 14:
            reminders.append({
                "reminder_id": f"rem_ev_{ev.get('event_id', '')}",
                "type": "event",
                "title": ev.get("title", "Event"),
                "client_name": ev.get("client_name", ""),
                "client_id": ev.get("client_id"),
                "assigned_to": ev.get("assigned_to_name") or ev.get("assigned_to", ""),
                "due_date": ev_date_str,
                "days_until": days_until,
                "priority": "High" if days_until <= 1 else "Medium",
                "status": "Scheduled",
                "description": ev.get("notes") or ev.get("description", ""),
                "service_module": ev.get("event_type", "event").capitalize(),
                "severity": "warning" if days_until <= 1 else "info",
                "ref_id": ev.get("event_id"),
            })

    # Active engagements nearing attention
    engs = await db.service_engagements.find({"status": "Active"}, {"_id": 0}).to_list(100)
    for eng in engs:
        total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
        done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
        progress = round(done / total * 100) if total > 0 else 0
        if progress < 50:
            reminders.append({
                "reminder_id": f"rem_eng_{eng.get('engagement_id', '')}",
                "type": "engagement",
                "title": eng.get("service_type", "").replace("_", " ").title(),
                "client_name": eng.get("client_name", ""),
                "client_id": eng.get("client_id"),
                "assigned_to": eng.get("assigned_to_name") or eng.get("assigned_to", ""),
                "due_date": eng.get("created_at", "")[:10],
                "days_until": None,
                "priority": "High" if progress < 25 else "Medium",
                "status": f"{progress}% complete — Phase: {eng.get('phase', '—')}",
                "description": f"Engagement at {progress}% completion, currently in {eng.get('phase', '—')} phase",
                "service_module": eng.get("service_type", "").replace("_", " ").title(),
                "severity": "warning" if progress < 25 else "info",
                "ref_id": eng.get("engagement_id"),
            })

    # Sort: urgent first
    severity_order = {"urgent": 0, "warning": 1, "info": 2}
    reminders.sort(key=lambda x: (severity_order.get(x["severity"], 2), x.get("due_date") or "9999"))
    return reminders
