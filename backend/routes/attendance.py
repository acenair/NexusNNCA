"""Attendance & leave — morning/afternoon units, leave requests, working-Saturday rule.

Units per day: AM + PM each 'present' | 'leave' | 'absent' | 'holiday' | 'sc' (unconfirmed working Saturday).
Working-week rule (firm): Nov–Dec Saturday+Sunday off; Jan–Oct alternate Saturdays —
Saturdays in Jan–Oct without a mark show 'sc' (working Saturday, unconfirmed) unless
listed in working_saturdays (confirmed off) — matches the Auditflow mockup.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from pydantic import BaseModel

from core import db, get_current_user

router = APIRouter(prefix="/api")


def _require_partner(user):
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partner only")
    return user


async def _staff_list():
    q = {"role": {"$nin": ["client"]}, "status": {"$ne": "pending_approval"}}
    return await db.users.find(q, {"_id": 0, "password": 0, "user_sessions": 0}).sort("name", 1).to_list(200)


def _month_days(month: str):
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        last = 31
    else:
        last = (datetime(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1) - timedelta(days=1)).day
    d = datetime(y, m, 1)
    out = []
    while d.month == m and d.day <= last:
        out.append(d.date())
        d += timedelta(days=1)
    return out


def _day_kind(day, is_holiday: bool) -> str:
    """default unit kind for a date when unmarked"""
    wd = day.weekday()  # 5=Sat, 6=Sun
    if is_holiday:
        return "holiday"
    m = day.month
    if wd == 6:  # Sunday always off
        return "holiday"
    if wd == 5 and m in (11, 12):  # Nov-Dec Saturday off
        return "holiday"
    if wd == 5:  # Jan-Oct Saturday: SC unless confirmed as working/off
        return "sc"
    return "workday"


@router.get("/attendance/month")
async def attendance_month(month: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    staff = await _staff_list()
    days = _month_days(month)
    holiday_set = {h["date"] for h in await db.holidays.find({}, {"_id": 0, "date": 1}).to_list(200)}
    records = {}
    async for r in db.attendance.find({"date": {"$regex": f"^{month}"}}, {"_id": 0}):
        records[(r["user_id"], r["date"])] = r
    today_iso = datetime.now(timezone.utc).date().isoformat()
    grid = []
    for u in staff:
        row = {"user_id": u["user_id"], "name": u["name"], "title": u.get("title") or "", "cells": []}
        for d in days:
            iso = d.isoformat()
            if iso > today_iso:
                kind, marked = ("future", "future"), False
            else:
                r = records.get((u["user_id"], iso))
                default = _day_kind(d, iso in holiday_set)
                kind = (r.get("am"), r.get("pm")) if r else (default, default)
                marked = bool(r)
            row["cells"].append({"date": iso, "am": kind[0], "pm": kind[1], "marked": marked})
        # totals in half-day units
        att = sum(1 for c in row["cells"] for half in (c["am"], c["pm"]) if half == "present") / 2
        leave = sum(1 for c in row["cells"] for half in (c["am"], c["pm"]) if half == "leave") / 2
        row["attendance_days"] = att
        row["leave_days"] = leave
        grid.append(row)
    return {"month": month, "staff": grid, "days": [d.isoformat() for d in days],
            "holidays": sorted(holiday_set)}


@router.get("/attendance/summary")
async def attendance_summary(month: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    data = await attendance_month(month, authorization, session_token)
    staff = data["staff"]
    today_iso = datetime.now(timezone.utc).date().isoformat()
    total_att = sum(s["attendance_days"] for s in staff)
    total_leave = sum(s["leave_days"] for s in staff)
    pending_leave = await db.leave_requests.count_documents({"status": "Pending"})
    unmarked = 0
    for s in staff:
        for c in s["cells"]:
            if c["date"] <= today_iso and not c["marked"] and c["am"] in ("workday", "sc"):
                unmarked += 0.5
    return {"month": month, "attendance_days": total_att, "leave_days": total_leave,
            "pending_leave": pending_leave, "unmarked_days": unmarked}


class MarkRequest(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    am: str
    pm: str


@router.post("/attendance/mark")
async def mark_attendance(req: MarkRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    _require_partner(user)
    valid = ("present", "leave", "absent", "holiday", "sc")
    if req.am not in valid or req.pm not in valid:
        raise HTTPException(status_code=400, detail="Invalid unit")
    await db.attendance.update_one(
        {"user_id": req.user_id, "date": req.date},
        {"$set": {"am": req.am, "pm": req.pm,
                  "marked_by": user.get("name"), "marked_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return {"ok": True}


class LeaveRequest(BaseModel):
    user_id: str
    from_date: str
    to_date: str
    days: float
    leave_type: str = "Annual"
    reason: Optional[str] = None


@router.post("/attendance/leave")
async def request_leave(req: LeaveRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "partner" and req.user_id != user["user_id"]:
        target = req.user_id
    else:
        target = user["user_id"]
    doc = {
        "leave_id": f"lv_{uuid.uuid4().hex[:10]}", "user_id": target,
        "from_date": req.from_date, "to_date": req.to_date, "days": req.days,
        "leave_type": req.leave_type, "reason": req.reason, "status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leave_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/attendance/leave")
async def list_leave(year: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    q = {}
    if year:
        q["from_date"] = {"$regex": f"^{year}"}
    rows = await db.leave_requests.find(q, {"_id": 0}).sort("from_date", -1).to_list(1000)
    users = {u["user_id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1}).to_list(200)}
    for r in rows:
        r["name"] = users.get(r["user_id"], "—")
    # monthly leave taken per staff (approved only) for the mockup's year grid
    monthly = {}
    for r in rows:
        if r["status"] != "Approved":
            continue
        m = r["from_date"][:7]
        monthly.setdefault(r["user_id"], {"name": r["name"], "months": {}})
        monthly[r["user_id"]]["months"][m] = round(monthly[r["user_id"]]["months"].get(m, 0) + r["days"], 1)
    return {"requests": rows, "monthly_grid": list(monthly.values())}


@router.patch("/attendance/leave/{leave_id}")
async def decide_leave(leave_id: str, status: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    _require_partner(user)
    if status not in ("Approved", "Rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.leave_requests.update_one({"leave_id": leave_id}, {"$set": {
        "status": status, "decided_by": user.get("name"),
        "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return {"ok": True}


@router.post("/attendance/holidays")
async def add_holiday(date: str, name: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    _require_partner(user)
    await db.holidays.update_one({"date": date}, {"$set": {"date": date, "name": name}}, upsert=True)
    return {"ok": True}


@router.get("/attendance/holidays")
async def list_holidays(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    rows = await db.holidays.find({}, {"_id": 0}).sort("date", 1).to_list(200)
    return rows
