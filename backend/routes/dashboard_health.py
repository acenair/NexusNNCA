"""Dashboard bottom half (mockup: Auditflow _ Dashboarddd.html) — live data.

GET /api/dashboard/health
  -> team_capacity, growth_mix, activity, delivery, billing, quality
Every figure is computed from live collections; nothing is hard-coded.
"""
from datetime import datetime, timezone, date
from fastapi import APIRouter, Header, Cookie

from core import db, get_current_user

router = APIRouter(prefix="/api", tags=["dashboard"])

AUDIT_TYPES = ("statutory_audit", "internal_audit", "stock_audit", "fraud_audit", "aml_review")
TAX_TYPES = ("vat_filing", "corporate_tax")


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    return ("".join(p[0].upper() for p in parts[:2])) or "??"


def _iso(v) -> str:
    """Best-effort ISO date string from unknown date field."""
    if isinstance(v, datetime):
        return v.isoformat()
    return v or "" if isinstance(v, str) else ""


@router.get("/dashboard/health")
async def dashboard_health(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    this_month = today[:7]

    engs = await db.service_engagements.find({"status": {"$ne": "Deleted"}}, {"_id": 0}).to_list(None)
    active = [e for e in engs if (e.get("status") == "Active")]
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(None)
    leads = await db.leads.find({}, {"_id": 0}).to_list(None)
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(None)
    clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1, "client_name": 1}).to_list(None)
    journal = await db.engagement_journal.find({}).sort("at", -1).limit(4).to_list(None)
    qm_ind = await db.qm_records.find({"kind": "independence"}, {"_id": 0}).to_list(None)
    notes = await db.review_notes.find({}, {"_id": 0}).to_list(None)

    # ---- Team capacity (allocated vs actual hours across active engagements) ----
    cap = {}
    for e in active:
        for sc in (e.get("staff_costs") or []):
            n = sc.get("name") or "Unassigned"
            d = cap.setdefault(n, {"allocated": 0.0, "actual": 0.0})
            d["allocated"] += float(sc.get("allocated_hours") or 0)
            d["actual"] += float(sc.get("actual_hours") or 0)
    team = sorted(
        [{"name": n, "initials": _initials(n), "allocated": int(d["allocated"]), "actual": int(d["actual"]),
          "pct": round(100 * d["actual"] / d["allocated"]) if d["allocated"] else 0}
         for n, d in cap.items()],
        key=lambda t: -t["allocated"])[:6]
    over_budget_staff = [t["name"] for t in team if t["allocated"] and t["actual"] > t["allocated"]]

    # ---- Growth & service mix ----
    open_stages = ("Proposal sent", "Negotiation")
    open_prop = [l for l in leads if (l.get("stage") in open_stages)]
    won = len([l for l in leads if "won" in (l.get("stage") or "").lower()])
    enq = len([l for l in leads if (l.get("received_date") or l.get("created_at") or "")[:7] == this_month])
    audit_n = len([e for e in active if (e.get("service_type") in AUDIT_TYPES)])
    tax_n = len([e for e in active if (e.get("service_type") in TAX_TYPES)])
    from datetime import timedelta
    renewals = 0
    async for e in db.service_engagements.find(
            {"status": "Active", "service_type": {"$in": ["statutory_audit", "internal_audit", "aml_review"]}},
            {"_id": 0, "engagement_id": 1, "client_id": 1, "service_type": 1}):
        nxt = await db.service_engagements.find_one(
            {"client_id": e.get("client_id"), "service_type": e.get("service_type"), "status": "Active",
             "engagement_id": {"$ne": e.get("engagement_id")},
             "created_at": {"$gte": (now - timedelta(days=30)).isoformat()}}, {"_id": 1})
        if not nxt:
            renewals += 1

    # ---- Recent firm activity (journal + issued invoices + new engagements) ----
    acts = []
    for j in journal:
        acts.append({"title": j.get("text") or j.get("event") or "Update",
                     "sub": f"{j.get('by_name') or j.get('client_name') or 'System'} · {_iso(j.get('at'))[:10]}",
                     "at": _iso(j.get("at")), "link": "/app/engagements"})
    for i in invoices:
        d = _iso(i.get("date"))
        if d >= (now.date().replace(day=1).isoformat()):
            acts.append({"title": f"{i.get('invoice_number')} issued — {i.get('client_name')}",
                         "sub": f"AED {float(i.get('amount') or 0):,.0f} · {d}", "at": d, "link": "/app/invoices"})
    for e in sorted(engs, key=lambda x: _iso(x.get("created_at")), reverse=True)[:3]:
        d = _iso(e.get("created_at"))
        if d >= (now.date().replace(day=1).isoformat()):
            acts.append({"title": f"New engagement — {e.get('client_name')}",
                         "sub": f"{e.get('service_type', '').replace('_', ' ').title()} · {d}",
                         "at": d, "link": "/app/engagements"})
    acts = sorted(acts, key=lambda a: a.get("at") or "", reverse=True)[:4]

    # ---- Delivery & budget performance ----
    open_past_due = len([t for t in tasks if (t.get("status") or "").lower() not in ("done", "completed", "closed")
                         and (t.get("due_date") or "9999") < today])
    total_tasks = len(tasks)
    on_track = max(0, total_tasks - open_past_due)
    tot_alloc = sum(float(sc.get("allocated_hours") or 0) for e in active for sc in (e.get("staff_costs") or []))
    tot_actual = sum(float(sc.get("actual_hours") or 0) for e in active for sc in (e.get("staff_costs") or []))
    jobs_over = 0
    for e in active:
        a = sum(float(sc.get("allocated_hours") or 0) for sc in (e.get("staff_costs") or []))
        x = sum(float(sc.get("actual_hours") or 0) for sc in (e.get("staff_costs") or []))
        if a > 0 and x > a:
            jobs_over += 1

    # ---- Billing readiness ----
    clients_with_invoice = {i.get("client_name") for i in invoices}
    done_no_inv = [e for e in active if e.get("phase") == "Completion"
                   and e.get("client_name") not in clients_with_invoice]
    drafts = [i for i in invoices if i.get("status") == "Draft"]
    pend = lambda i: max(0.0, float(i.get("amount") or 0) - float(i.get("amount_paid") or 0)
                         - sum(float(c.get("amount") or 0) for c in (i.get("credits") or [])))
    overdue_inv = [i for i in invoices if not i.get("cancelled") and i.get("status") != "Draft"
                   and pend(i) > 0.009 and (i.get("due_date") or "9999") < today]
    final_ready = [e for e in active if e.get("phase") == "Completion"]

    # ---- Quality & acceptance checks ----
    kyc_ids = {k.get("client_id") for k in await db.sample_kyc.find({}, {"_id": 0, "client_id": 1}).to_list(None)}
    kyc_missing = len([c for c in clients if c.get("client_id") not in kyc_ids])
    indep_done = {q.get("engagement_ref") for q in qm_ind}
    indep_pending = len([e for e in active if "audit" in (e.get("service_type") or "")
                         and e.get("engagement_id") not in indep_done])
    open_points = len([n for n in notes if (n.get("status") or "").lower() != "cleared"])

    return {
        "team_capacity": {
            "staff": team,
            "note": (f"{len(over_budget_staff)} team member(s) above their allocated hours. "
                     "Review assignments before accepting new work.") if over_budget_staff
                    else "All team members within allocated hours.",
        },
        "growth_mix": {
            "new_enquiries": enq,
            "open_proposals": len(open_prop),
            "open_proposals_value": sum(float(l.get("value") or 0) for l in open_prop),
            "won": won,
            "renewals_due_30d": renewals,
            "active_mix": [audit_n, tax_n, len(active) - audit_n - tax_n],
        },
        "activity": acts,
        "delivery": {
            "on_time_pct": round(100 * on_track / total_tasks) if total_tasks else 100,
            "on_time_detail": f"{on_track} of {total_tasks} deliverables not past due",
            "budget_hours": int(tot_alloc),
            "actual_hours": int(tot_actual),
            "hours_variance": int(tot_actual - tot_alloc),
            "variance_pct": round(100 * (tot_actual - tot_alloc) / tot_alloc) if tot_alloc else 0,
            "jobs_over_budget": jobs_over,
        },
        "billing": {
            "uninvoiced_count": len(done_no_inv),
            "uninvoiced_value": sum(float(e.get("fee_amount") or 0) for e in done_no_inv),
            "draft_count": len(drafts),
            "draft_value": sum(float(i.get("amount") or 0) for i in drafts),
            "overdue_count": len(overdue_inv),
            "overdue_value": sum(pend(i) for i in overdue_inv),
            "final_print_ready": len(final_ready),
        },
        "quality": {
            "kyc_missing": kyc_missing,
            "independence_pending": indep_pending,
            "open_review_points": open_points,
            "signoff_pending": len(final_ready),
        },
    }
