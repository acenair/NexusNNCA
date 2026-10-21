#!/usr/bin/env python3
"""Reset demo data and rebuild the working world around 2 sample companies.

Keeps: users (real team), imported clients (263 real), activities log, holidays.
Wipes: seeded demo clients, demo engagements, sample invoices/tasks/leads,
       sample attendance marks + leave (re-created fresh below).
Creates: for the 2 companies — engagements (with terms/milestones/checklists),
       tasks, invoices (paid/part-paid/overdue/draft with receipts+credit),
       leads (3-stage pipeline), a pending leave request.

Run INSIDE the backend container:  python scripts/reset_two_companies.py
"""
import uuid
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://mongo:27017")
DB = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10)[os.environ.get("DB_NAME", "ca_ai")]
now = datetime.now(timezone.utc)
today = now.date()


def iso(d):
    return d.isoformat()


# ---------- wipe ----------
for coll in ["service_engagements", "invoices", "tasks", "leads", "leave_requests",
             "attendance", "proposals"]:
    DB[coll].delete_many({})
DB.clients.delete_many({"client_id": {"$exists": True}, "source": {"$ne": "xlsx_import_2026_10"}})
DB.compliance_records.delete_many({})  # re-synced automatically
print("wiped demo data")

# ---------- the two companies ----------
co1 = DB.clients.find_one({"name": {"$regex": "^1990 Breive", "$options": "i"}})
co2 = DB.clients.find_one({"name": {"$regex": "^A T O M", "$options": "i"}})
assert co1 and co2, "sample companies not found in imported clients"
staff = {u["name"].split()[0].lower(): u for u in DB.users.find({}, {"_id": 0, "password": 0})}
users = list(DB.users.find({}, {"_id": 0, "password": 0}))
staff_by_name = {u["name"]: u for u in users}


def uid(name_part):
    for n, u in staff_by_name.items():
        if name_part.lower() in n.lower():
            return u["user_id"], n
    return users[0]["user_id"], users[0]["name"]


# ---------- engagements ----------
def make_eng(client, service_type, phase, assigned, terms=None, fee=None, checklist=None, milestones=None):
    doc = {
        "engagement_id": f"eng_{uuid.uuid4().hex[:12]}",
        "service_type": service_type,
        "client_id": client["client_id"], "client_name": client["name"],
        "assigned_to": uid(assigned)[0], "assigned_to_name": uid(assigned)[1],
        "status": "Active", "phase": phase,
        "notes": "Sample company setup",
        "terms": terms or {}, "fee_amount": fee,
        "milestones": milestones or [],
        "created_by": users[0]["user_id"], "created_by_name": users[0]["name"],
        "created_at": (now - timedelta(days=20)).isoformat(),
    }
    if checklist:
        doc["checklist"] = checklist
    DB.service_engagements.insert_one(doc)
    doc.pop("_id", None)
    return doc


def cl(groups_done, groups):
    """checklist builder: groups_done = number of fully-done groups, then partially"""
    out = []
    for i, (g, items) in enumerate(groups):
        done = i < groups_done
        out.append({"group": g, "items": [{"label": it, "done": done} for it in items]})
    return out


AUDIT_GROUPS = [
    ("Planning", ["Engagement letter signed", "Risk assessment", "Audit plan", "Materiality memo", "Team briefing", "PBC list sent to client"]),
    ("Fieldwork", ["Revenue testing", "Expense sampling", "Bank confirmations", "Inventory count", "Related party review", "Trial balance review"]),
    ("Review & Reporting", ["Draft report", "Management letter", "Partner review", "Client sign-off", "Filing"]),
    ("Completion", ["Deliver documents to client", "Archive engagement file", "Invoice final payment"]),
]
VAT_GROUPS = [
    ("Preparation", ["Data collection", "Purchase invoices review", "Sales invoices review", "Input/output VAT reconciliation"]),
    ("Filing", ["Return preparation", "Box amounts calculation", "Review & approval", "FTA portal submission"]),
    ("Completion", ["Payment confirmation", "Filing receipt archived", "Client notification"]),
]
CT_GROUPS = [
    ("Preparation", ["Financial data collection", "Revenue classification", "Exempt income review", "Deduction analysis"]),
    ("Computation", ["Taxable income calculation", "Tax liability computation", "Small business relief check", "Transfer pricing reference"]),
    ("Filing", ["CT return preparation", "Review & approval", "Portal submission", "Payment processing"]),
    ("Completion", ["Filing receipt archived", "Client notified"]),
]

fee1 = float(co1.get("fee_amount") or 4500)
eng1 = make_eng(co1, "statutory_audit", "Fieldwork", "Thasleema",
                terms={"payment_terms": "50% Advance, 50% Draft Report", "audit_purpose": "Bank Requirement",
                       "audit_period": "FY 2025", "engagement_date": iso(today - timedelta(days=20))},
                fee=fee1,
                checklist=cl(1, AUDIT_GROUPS),
                milestones=[{"label": "Advance", "percent": 50, "amount": round(fee1 / 2, 2)},
                            {"label": "Draft Report", "percent": 50, "amount": round(fee1 / 2, 2)}])

eng2 = make_eng(co1, "vat_filing", "Filing", "Roshith",
                terms={"return_frequency": "Quarterly (Jan-Mar / Apr-Jun)", "tax_period": "Q3 2026 (Jul-Sep)",
                       "fta_due_date": iso(today + timedelta(days=38)), "internal_target_date": iso(today + timedelta(days=28)),
                       "reminder_buffer_days": 10, "payment_terms": "100% on filing"},
                fee=1500, checklist=cl(1, VAT_GROUPS),
                milestones=[{"label": "On filing", "percent": 100, "amount": 1500}])

fee2 = float(co2.get("fee_amount") or 1000)
eng3 = make_eng(co2, "corporate_tax", "Preparation", "Fazil",
                terms={"payment_terms": "100% on filing", "audit_period": "FY 2025", "engagement_date": iso(today - timedelta(days=10))},
                fee=fee2, checklist=cl(0, CT_GROUPS),
                milestones=[{"label": "On filing", "percent": 100, "amount": fee2}])
print("engagements: 3 created (audit+VAT for co1, CT for co2)")

# ---------- tasks ----------
tasks = [
    (co1, "Collect audit trail & bank statements", "Thasleema", -6, "High", "Pending"),      # overdue
    (co1, "Send PBC list reminder to client", "Thasleema", -2, "Medium", "Pending"),          # overdue
    (co1, "VAT box reconciliation for Q3", "Roshith", 3, "High", "In Progress"),
    (co2, "Collect FY2025 financials for CT computation", "Fazil", 5, "High", "Pending"),
    (co1, "Draft audit planning memo", "Thasleema", 12, "Medium", "Pending"),
    (co2, "Small business relief eligibility check", "Fazil", 18, "Low", "Pending"),
    (co1, "Bank confirmation follow-up", "Thasleema", 25, "Low", "Completed"),
]
for client, title, who, due_in, prio, status in tasks:
    due = today + timedelta(days=due_in)
    u = uid(who)
    DB.tasks.insert_one({
        "task_id": f"task_{uuid.uuid4().hex[:10]}", "title": title,
        "description": "", "service_module": "audit" if "audit" in title.lower() else ("vat" if "VAT" in title else "corporate"),
        "client_id": client["client_id"], "client_name": client["name"],
        "due_date": iso(due), "priority": prio, "status": status,
        "assigned_to": u[0], "assigned_to_name": u[1],
        "created_by": users[0]["user_id"], "created_at": (now - timedelta(days=15)).isoformat(),
        "completed_at": iso(now) if status == "Completed" else None,
        "source": "two_company_setup",
    })
print("tasks: 7 created (2 overdue, 2 due this week)")

# ---------- invoices ----------
def inv(number_seq, client, service, amount, date, due, staff_name, state):
    receipts, credits, paid = [], [], 0.0
    status = "Unpaid"
    if state == "paid":
        receipts.append({"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": amount,
                         "method": "Bank transfer", "reference": f"TRF-{number_seq:04d}",
                         "date": iso(min(due - timedelta(days=3), today)),
                         "recorded_by": "Admin", "recorded_at": now.isoformat()})
        paid = amount; status = "Paid"
    elif state == "part":
        paid = round(amount * 0.5, 2)
        receipts.append({"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": paid,
                         "method": "Bank transfer", "reference": f"TRF-{number_seq:04d}",
                         "date": iso(today - timedelta(days=2)), "recorded_by": "Admin", "recorded_at": now.isoformat()})
    elif state == "credit":
        credits.append({"credit_id": f"CN-{uuid.uuid4().hex[:8].upper()}", "amount": 250, "reason": "agreed fee adjustment",
                        "date": iso(today - timedelta(days=1)), "created_by": "Admin"})
    doc = {
        "invoice_id": f"inv_{uuid.uuid4().hex[:12]}", "invoice_number": f"INV-2026-{number_seq:03d}",
        "client_id": client["client_id"], "client_name": client["name"],
        "service_name": service, "amount": amount, "date": iso(date), "due_date": iso(due),
        "status": status, "staff": staff_name, "amount_paid": paid,
        "receipts": receipts, "credits": credits, "cancelled": False,
        "created_at": now.isoformat(), "source": "two_company_setup",
    }
    DB.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


inv(1, co1, "External Audit", fee1 / 2, today - timedelta(days=18), today - timedelta(days=3), "Thasleema", "paid")       # advance, paid
inv(2, co1, "VAT Filing", 1500, today - timedelta(days=5), today + timedelta(days=38), "Roshith", "part")                # part paid
inv(3, co2, "Corporate Tax", fee2, today - timedelta(days=25), today - timedelta(days=10), "Fazil", "unpaid")            # overdue
inv(4, co1, "External Audit", fee1 / 2, today, today + timedelta(days=15), "Thasleema", "draft")                          # draft (not issued)
inv(5, co2, "Corporate Tax — amended", fee2 - 250, today - timedelta(days=40), today - timedelta(days=25), "Fazil", "credit")  # older, with credit
print("invoices: 5 created (paid, part-paid, overdue, draft, credit)")

# ---------- leads ----------
leads = [
    ("Mirdif Retail Group LLC", "Referral", "External Audit", 8000, "New", 5),
    ("Jumeirah Services FZ-LLC", "Website", "Corporate Tax", 4500, "Proposal sent", 2),
    ("Business Bay Consulting", "Existing client", "Accounting", 3600, "Confirmed", -1),
]
for company, source, service, value, stage, follow_in in leads:
    DB.leads.insert_one({
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}", "company": company,
        "contact_name": "", "phone": "", "email": "",
        "source": source, "service": service,
        "owner": users[0]["name"], "value": value, "stage": stage,
        "followup_date": iso(today + timedelta(days=follow_in)),
        "notes": "Sample lead", "history": [{"stage": stage, "at": now.isoformat(), "by": users[0]["name"]}],
        "created_at": now.isoformat(),
    })
print("leads: 3 created (New / Proposal sent / Confirmed)")

# ---------- attendance sample marks + leave ----------
u_thas = uid("Thasleema")[0]
for d_ago in range(1, 6):
    day = today - timedelta(days=d_ago)
    if day.weekday() == 6:  # skip sundays
        continue
    DB.attendance.insert_one({"user_id": u_thas, "date": iso(day), "am": "present", "pm": "present",
                              "marked_by": "Admin", "marked_at": now.isoformat()})
DB.leave_requests.insert_one({
    "leave_id": f"lv_{uuid.uuid4().hex[:10]}", "user_id": u_thas,
    "from_date": iso(today + timedelta(days=7)), "to_date": iso(today + timedelta(days=8)),
    "days": 2, "leave_type": "Annual", "reason": "Sample leave request", "status": "Pending",
    "created_at": now.isoformat(),
})
print("attendance marks (5 days) + 1 pending leave created")
print("DONE — world rebuilt around:", co1["name"], "&", co2["name"])
