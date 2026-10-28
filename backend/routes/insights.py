"""Practice insights — recurring retainers, regulatory deadlines, hours sync,
annual renewals, staff utilization, UN sanctions screening. Read-mostly endpoints
computed from live data so they never drift out of sync with the ledger."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Body, Header
from typing import Optional
from datetime import datetime, timezone, timedelta, date
from core import db, get_current_user
from services.templates import CHECKLIST_TEMPLATES
import calendar
import json
import os
import re
import uuid

router = APIRouter(prefix="/api")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def _partner(user):
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Partners only")
    return user


async def _authed_partner(authorization, session_token):
    user = await get_current_user(authorization, session_token)
    return _partner(user)


def _pending_of(inv):
    return max(0, (inv.get("amount") or 0) - (inv.get("amount_paid") or 0)
               - sum(c.get("amount", 0) for c in inv.get("credits", [])))


def _retainer_freq(eng):
    terms = (eng.get("terms") or {}).get("payment_terms", "") or ""
    t = terms.lower()
    if "monthly" in t or "every month" in t:
        return "monthly"
    if "quarterly" in t:
        return "quarterly"
    return None


def _periods_since(start_iso, freq, today_iso, limit=12):
    out = []
    if not start_iso:
        return out
    try:
        d = date.fromisoformat(start_iso[:10]).replace(day=1)
    except ValueError:
        return out
    today_d = date.fromisoformat(today_iso)
    guard = 0
    while d <= today_d and guard < limit:
        guard += 1
        if freq == "monthly":
            out.append(d.strftime("%Y-%m"))
            d = date(d.year + (1 if d.month == 12 else 0), 1 if d.month == 12 else d.month + 1, 1)
        else:
            out.append(f"{d.year}-Q{(d.month - 1) // 3 + 1}")
            nm = ((d.month - 1) // 3) * 3 + 4
            d = date(d.year + (1 if nm == 13 else 0), 1 if nm == 13 else nm, 1)
    return out


# ---------- 1. Recurring retainer billing ----------

@router.get("/insights/retainers")
async def list_retainers(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _authed_partner(authorization, session_token)
    engagements = await db.service_engagements.find(
        {"status": {"$ne": "Deleted"}}, {"_id": 0}).to_list(500)
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    today = datetime.now(timezone.utc).date().isoformat()
    rows = []
    for e in engagements:
        freq = _retainer_freq(e)
        if not freq:
            continue
        fee = e.get("fee_amount") or 0
        recent = _periods_since((e.get("created_at") or today)[:10], freq, today, limit=6)
        period_rows = []
        for p in recent:
            marker = f"{e['engagement_id']}::{p}"
            inv = next((i for i in invoices if i.get("recurring_key") == marker), None)
            period_rows.append({"period": p,
                                "invoice_id": inv["invoice_id"] if inv else None,
                                "invoice_number": inv["invoice_number"] if inv else None,
                                "status": inv["status"] if inv else "Not generated",
                                "gross": inv["amount"] if inv else fee})
        due = [p for p in period_rows if not p["invoice_id"]]
        rows.append({"engagement_id": e["engagement_id"], "client_id": e.get("client_id"),
                     "client_name": e.get("client_name"), "service_type": e.get("service_type"),
                     "frequency": freq, "fee": fee, "due_periods": due, "periods": period_rows})
    rows.sort(key=lambda r: -len(r["due_periods"]))
    return {"retainers": rows, "today": today}


@router.post("/insights/retainers/generate")
async def generate_retainer_drafts(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _authed_partner(authorization, session_token)
    engagements = await db.service_engagements.find(
        {"status": {"$ne": "Deleted"}}, {"_id": 0}).to_list(500)
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    existing_keys = {i.get("recurring_key") for i in invoices}
    today = datetime.now(timezone.utc).date().isoformat()
    seq = await db.invoices.count_documents({}) + 1
    created = []
    for e in engagements:
        freq = _retainer_freq(e)
        if not freq:
            continue
        fee = e.get("fee_amount") or 0
        for p in _periods_since((e.get("created_at") or today)[:10], freq, today, limit=6):
            marker = f"{e['engagement_id']}::{p}"
            if marker in existing_keys:
                continue
            net = round(fee, 2)
            vat = round(net * 5 / 100, 2)
            invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
            doc = {
                "invoice_id": invoice_id,
                "invoice_number": f"INV-{today[:4]}-{seq:03d}",
                "client_id": e.get("client_id"), "client_name": e.get("client_name"),
                "service_name": f"{e.get('service_type', 'retainer').replace('_', ' ').title()} retainer — {p}",
                "amount": round(net + vat, 2), "net_amount": net, "vat_amount": vat, "vat_percent": 5,
                "date": today,
                "due_date": (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat(),
                "status": "Draft",
                "notes": f"Auto-generated retainer draft for {p}. Review, then issue.",
                "staff": e.get("assigned_to_name"), "amount_paid": 0, "receipts": [], "credits": [],
                "cancelled": False, "recurring_key": marker, "source": "recurring",
                "created_by": user["user_id"], "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.invoices.insert_one(doc)
            existing_keys.add(marker)
            seq += 1
            created.append({"invoice_number": doc["invoice_number"], "client_name": doc["client_name"],
                            "period": p, "gross": doc["amount"]})
    return {"created": created, "count": len(created)}


# ---------- 2. Regulatory deadlines ----------

@router.get("/insights/regulatory-deadlines")
async def regulatory_deadlines(within_days: int = 90, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    today = date.fromisoformat(datetime.now(timezone.utc).date().isoformat())
    horizon = today + timedelta(days=max(30, within_days))
    out = []

    def add(kind, ref_id, client, label, due, note=""):
        if today - timedelta(days=30) <= due <= horizon:
            out.append({"kind": kind, "ref_id": ref_id, "client": client, "label": label,
                        "due": due.isoformat(), "days_left": (due - today).days, "note": note})

    async for e in db.service_engagements.find({"service_type": "vat_filing", "status": {"$ne": "Deleted"}}, {"_id": 0}):
        fy = (e.get("terms") or {}).get("tax_period") or ""
        m = re.search(r"Q([1-4])", fy.upper())
        if m:
            q = int(m.group(1))
            y = 2026
            quarter_end = date(y, q * 3, calendar.monthrange(y, q * 3)[1])
            add("VAT return", e["engagement_id"], e.get("client_name"), f"VAT return — {fy}",
                quarter_end + timedelta(days=28), "FTA filing deadline (28 days after quarter end)")

    async for e in db.service_engagements.find({"service_type": "corporate_tax", "status": {"$ne": "Deleted"}}, {"_id": 0}):
        fy = (e.get("terms") or {}).get("tax_period") or ""
        m = re.search(r"(20\d\d)", fy)
        if m:
            year = int(m.group(1))
            add("Corporate tax return", e["engagement_id"], e.get("client_name"),
                f"CT return — FY {year}", date(year + 1, 9, 30), "Due 9 months after financial year end")

    async for c in db.clients.find({"license_expiry_date": {"$nin": [None, ""]}}, {"_id": 0}):
        try:
            due = date.fromisoformat(c["license_expiry_date"][:10])
        except (ValueError, TypeError):
            continue
        add("Trade licence", c.get("client_id"), c.get("name"), "Trade licence renewal", due)

    out.sort(key=lambda d: d["due"])
    return {"deadlines": out[:60], "today": today.isoformat()}


# ---------- 3. Billable hours -> engagement costing ----------

@router.post("/insights/costing/sync-hours/{engagement_id}")
async def sync_costing_hours(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    client_id = eng.get("client_id")
    entries = await db.billable_hours.find({"client_id": client_id}, {"_id": 0}).to_list(2000)
    if not entries:
        return {"ok": True, "message": "No logged hours found for this client", "updated": False}

    by_staff = {}
    for e in entries:
        name = e.get("staff_name") or "Unassigned"
        by_staff[name] = round(by_staff.get(name, 0) + (e.get("hours") or 0), 2)

    sc = eng.get("staff_costs") or []
    updated = []
    for row in sc:
        logged = by_staff.get(row.get("name"))
        if logged is not None:
            row["actual_hours"] = logged
            updated.append(row["name"])
            by_staff.pop(row["name"], None)
    for name, hours in list(by_staff.items()):
        sc.append({"name": name, "allocated_hours": 0, "actual_hours": hours,
                   "remaining_hours": 0, "budget_rate": 150, "actual_rate": 150})
        updated.append(name)
        by_staff.pop(name)
    await db.service_engagements.update_one(
        {"engagement_id": engagement_id},
        {"$set": {"staff_costs": sc,
                  "actual_hours": sum(r.get("actual_hours", 0) for r in sc)}})
    return {"ok": True, "updated": True, "staff_matched": updated,
            "message": "Actual hours synced from the billable-hours log for " + ", ".join(updated)}


# ---------- 4. Annual renewal ----------

@router.get("/insights/renewal-candidates")
async def renewal_candidates(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    year = datetime.now(timezone.utc).year
    rows = []
    async for e in db.service_engagements.find(
            {"status": {"$ne": "Deleted"},
             "service_type": {"$in": ["statutory_audit", "internal_audit", "aml_review"]}},
            {"_id": 0}):
        # already renewed if another engagement of the same client+service was
        # created in the last 30 days (i.e. the renewal itself)
        nxt = await db.service_engagements.find_one(
            {"client_id": e.get("client_id"), "service_type": e["service_type"],
             "status": {"$ne": "Deleted"}, "engagement_id": {"$ne": e["engagement_id"]},
             "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()}},
            {"_id": 0})
        if nxt:
            continue
        rows.append({"engagement_id": e["engagement_id"], "client_id": e.get("client_id"),
                     "client_name": e.get("client_name"), "service_type": e["service_type"],
                     "fee": e.get("fee_amount"), "status": e.get("status")})
    return {"candidates": rows}


@router.post("/insights/renew")
async def renew_engagement(payload: dict = Body(default=None), authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    _partner(user)
    eid = (payload or {}).get("engagement_id")
    if not eid:
        raise HTTPException(status_code=422, detail="engagement_id required")
    eng = await db.service_engagements.find_one({"engagement_id": eid}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    year = datetime.now(timezone.utc).year
    template = CHECKLIST_TEMPLATES.get(eng.get("service_type"), [])
    checklist = [{"group": g["group"], "items": [{"label": it, "done": False} for it in g["items"]]} for g in template]
    new_id = f"eng_{uuid.uuid4().hex[:12]}"
    doc = dict(eng)
    doc.update({"engagement_id": new_id, "status": "Active",
                "phase": checklist[0]["group"] if checklist else "",
                "checklist": checklist, "fee_amount": eng.get("fee_amount"),
                "notes": f"Renewed from {eid} ({year} -> {year + 1}).",
                "created_by": user["user_id"], "created_by_name": user.get("name"),
                "created_at": datetime.now(timezone.utc).isoformat(), "source": "renewal"})
    for k in ("approved_by", "approved_by_name", "approved_at", "milestones", "staff_costs"):
        doc.pop(k, None)
    await db.service_engagements.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "new_engagement_id": new_id, "client_name": doc.get("client_name")}


# ---------- 5. Staff utilization ----------

@router.get("/insights/staff-utilization")
async def staff_utilization(month: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    month = month or datetime.now(timezone.utc).date().strftime("%Y-%m")
    staff = await db.users.find({"role": {"$ne": "client"}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(100)
    rows = []
    for u in staff:
        allocated = 0.0
        # scan all active engagements — a staff_cost row named for this user counts
        # toward their allocation regardless of who the engagement is assigned to
        async for e in db.service_engagements.find({"status": "Active"}, {"_id": 0, "staff_costs": 1}):
            for s in e.get("staff_costs", []):
                sn = s.get("name", "").strip().lower()
                un = u["name"].strip().lower()
                if sn and un and (sn.startswith(un) or un.startswith(sn)
                                  or sn.split()[0] == un.split()[0]):
                    allocated += s.get("allocated_hours", 0) or 0
        logged = 0.0
        async for bh in db.billable_hours.find({"staff_id": u["user_id"], "date": {"$regex": f"^{month}"}}, {"_id": 0, "hours": 1}):
            logged += bh.get("hours", 0) or 0
        y, m = int(month[:4]), int(month[5:7])
        weekdays = sum(1 for dd in range(1, calendar.monthrange(y, m)[1] + 1)
                       if date(y, m, dd).weekday() < 5)
        capacity = weekdays * 8
        rows.append({"user_id": u["user_id"], "name": u["name"], "allocated": round(allocated, 1),
                     "logged": round(logged, 1), "capacity": capacity,
                     "utilization_pct": round(allocated / capacity * 100) if capacity else 0})
    # dedupe users that share a name (e.g. two accounts for the same person)
    merged = {}
    for r in rows:
        m = merged.setdefault(r["name"], r)  # store the row itself so identity check works
        if r is not m:
            m["allocated"] = round(m["allocated"] + r["allocated"], 1)
            m["logged"] = round(m["logged"] + r["logged"], 1)
            m["capacity"] = max(m["capacity"], r["capacity"])
    rows = list(merged.values())
    for r in rows:
        r["utilization_pct"] = round(r["allocated"] / r["capacity"] * 100) if r["capacity"] else 0
    rows.sort(key=lambda r: -r["utilization_pct"])
    return {"month": month, "staff": rows}


# ---------- 6. UN sanctions screening ----------

_SANCTIONS = None


def _sanctions():
    global _SANCTIONS
    if _SANCTIONS is None:
        path = os.path.join(DATA_DIR, "un_sanctions.json")
        with open(path) as f:
            _SANCTIONS = json.load(f)
    return _SANCTIONS


def _tokens(name: str):
    stop = {"llc", "ltd", "fzco", "fze", "fz", "the", "and", "co", "company", "group",
            "trading", "est", "establishment", "general", "international", "services", "dmcc"}
    return [t for t in re.split(r"[^a-z0-9]+", name.lower()) if t and t not in stop]


@router.get("/insights/sanctions-screen")
async def sanctions_screen(name: str, client_id: Optional[str] = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    data = _sanctions()
    client_toks = set(_tokens(name))
    if not client_toks:
        return {"hits": [], "clear": True, "screened_name": name, "list_date": data.get("retrieved")}
    hits = []
    for entry in data["entries"]:
        for nm in entry["names"]:
            ent_toks = set(_tokens(nm))
            if not ent_toks:
                continue
            overlap = len(client_toks & ent_toks) / len(ent_toks)
            if overlap >= 0.6:
                hits.append({"matched_name": nm, "type": entry["type"], "score": round(overlap, 2),
                             "aliases": entry["names"][:4], "dob": entry.get("dob", "")})
                break
    hits.sort(key=lambda h: -h["score"])
    if client_id:
        await db.clients.update_one({"client_id": client_id}, {"$set": {
            "sanctions_screened_at": datetime.now(timezone.utc).isoformat(),
            "sanctions_hits": len(hits)}})
    return {"hits": hits[:5], "clear": not hits, "screened_name": name, "list_date": data.get("retrieved")}
