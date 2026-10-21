"""Consolidated demo data: 5 sample companies, fully mapped for demo purposes.

Each demo company gets: client record, onboarding pipeline record (varied stages),
engagements across all 25 service lines (5 per company, real checklists + milestone terms),
invoices with receipts/credits (paid / part-paid / overdue / draft mix), and tasks.

Replaces the earlier scattered samples (sample_engagement, sample_ledger, sample_onboarding,
task_N_sample) — those are wiped on first run. Idempotent: re-running refreshes the demo set.
Real imported clients (source: xlsx_import_2026_10) are never touched.

Run:  docker exec -w /app nnca-backend-1 sh -c 'PYTHONPATH=/app python scripts/seed_demo_companies.py'
"""
import os, uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from services.templates import CHECKLIST_TEMPLATES, milestones_from_terms

DB = MongoClient(os.environ.get("MONGO_URI", "mongodb://mongo:27017"))[
    os.environ.get("MONGO_DB", "ca_ai")]
SRC = "demo_company"
now = datetime.now(timezone.utc)
today = now.date().isoformat()

# wipe previous scattered samples (never touches xlsx-imported real clients)
DB.client_onboardings.delete_many({"source": {"$in": ["sample_onboarding", SRC]}})
DB.clients.delete_many({"source": {"$in": ["sample_onboarding", "sample_engagement", SRC]}})
DB.service_engagements.delete_many({"source": {"$in": ["sample_engagement", SRC]}})
DB.invoices.delete_many({"source": "sample_ledger"})
DB.tasks.delete_many({"$or": [
    {"source": {"$in": ["sample_onboarding", SRC]}},
    {"task_id": {"$regex": "^task_.*_sample$"}},
]})

# 5 companies x 5 services each = all 25 service lines mapped
COMPANIES = [
    {
        "name": "Falcon Trading LLC (Demo)", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Dubai",
        "industry": "Trading", "vat": True, "ct": True, "risk": "Low", "stage": "stage_4", "onb_service": "Audit",
        "services": [
            ("statutory_audit", 18000, "50% Advance, 50% Draft Report"),
            ("vat_filing", 1500, "Quarterly in advance"),
            ("aml_review", 7000, "50% Advance, 50% Final Report"),
            ("accounting", 4800, "Monthly in advance"),
            ("stock_audit", 6000, "100% on completion"),
        ],
    },
    {
        "name": "Crescent Tax Advisory FZCO (Demo)", "entity_type": "FZCO", "jurisdiction": "Free Zone", "emirate": "Dubai",
        "freezone_name": "IFZA", "industry": "Professional Services", "vat": True, "ct": True, "risk": "Medium",
        "stage": "stage_2", "onb_service": "Corporate tax return filing",
        "services": [
            ("corporate_tax", 5500, "50% Advance, 50% on filing"),
            ("vat_registration", 2500, "100% on registration"),
            ("goaml", 5000, "50% Advance, 50% on goAML registration"),
            ("transfer_pricing", 11000, "50% Advance, 50% Final Report"),
            ("due_diligence", 20000, "50% Advance, 50% Final Report"),
        ],
    },
    {
        "name": "Dune Logistics LLC (Demo)", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Sharjah",
        "industry": "Logistics", "vat": True, "risk": "Medium", "stage": "stage_3", "onb_service": "Internal Audit",
        "services": [
            ("internal_audit", 15000, "50% Advance, 50% Final Report"),
            ("fraud_audit", 25000, "40% Advance, 60% Final Report"),
            ("vat_amendments", 1200, "100% on completion"),
            ("bank_account_opening", 3000, "100% on account opening"),
            ("chamber_attestation", 900, "100% on attestation"),
        ],
    },
    {
        "name": "Meridian Consultants LLC (Demo)", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Abu Dhabi",
        "industry": "Consulting", "ct": True, "risk": "High", "stage": "stage_3", "onb_service": "AML consultancy",
        "services": [
            ("business_valuation", 9000, "50% Advance, 50% Draft Report"),
            ("aml_filing", 4000, "100% on filing"),
            ("aml_reports", 3500, "100% on submission"),
            ("company_formation", 12000, "50% Advance, 50% on licence"),
            ("company_liquidation", 15000, "30% Advance, 40% on DEWS filing, 30% on closure"),
        ],
    },
    {
        "name": "Vista Media FZ-LLC (Demo)", "entity_type": "FZ-LLC", "jurisdiction": "Free Zone", "emirate": "Dubai",
        "freezone_name": "DMCC", "industry": "Media", "vat": True, "risk": "Low", "stage": "stage_1",
        "onb_service": "Vat consultancy",
        "services": [
            ("vat_registration", 2500, "100% on registration"),
            ("corporate_registration", 7500, "50% Advance, 50% on licence"),
            ("attestation_services", 1800, "100% on attestation"),
            ("mofa_services", 1500, "100% on attestation"),
            ("dmcc_services", 2500, "100% on completion"),
            ("certification_services", 2000, "100% on certificate"),
        ],
    },
]
STAGE_TRACKER_DOCS = {
    "Trade License", "Passport/EID of Owners", "VAT Certificate", "Audit Proposal Document",
}
staff = [u for u in DB.users.find({"role": {"$ne": "client"}}, {"_id": 0, "user_id": 1, "name": 1})]
svc_terms = {
    "vat_filing": {"return_frequency": "Quarterly", "tax_period": "Q3 2026"},
    "corporate_tax": {"return_frequency": "Annual", "tax_period": "FY 2025"},
    "statutory_audit": {"audit_scope": "Full scope IFRS statutory audit", "audit_period": "FY 2025", "allocated_days": 15},
    "internal_audit": {"audit_scope": "Controls & process review", "allocated_days": 10},
    "aml_review": {"risk_classification": "Medium", "reporting_frequency": "Annual"},
    "aml_filing": {"risk_classification": "Medium", "returns_due_date": "2026-12-31"},
    "goaml": {"goaml_status": "Not registered", "reporting_frequency": "As required"},
    "accounting": {"accounting_frequency": "Monthly", "work_location": "In-House"},
}

def st(name): return staff[sum(map(len, name)) % len(staff)] if staff else {}

# invoice sequence continues after whatever is already in the ledger
seq = DB.invoices.count_documents({})
engs_created = invs_created = 0
for ci, comp in enumerate(COMPANIES):
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    onb_id = f"onb_{uuid.uuid4().hex[:12]}"
    mgr = st(comp["name"])

    DB.clients.insert_one({
        "client_id": client_id, "name": comp["name"], "trade_name": comp["name"].replace(" (Demo)", ""),
        "entity_type": comp["entity_type"], "jurisdiction": comp["jurisdiction"], "emirate": comp["emirate"],
        "freezone_name": comp.get("freezone_name"), "industry": comp["industry"],
        "trade_licence_no": f"LIC-DEMO-{1000 + ci}", "license_expiry_date": f"2027-{(ci % 12) + 1:02d}-15",
        "vat_registered": comp.get("vat", False),
        "trn": f"100{4000 + ci}00003" if comp.get("vat") else None,
        "corporate_tax_registered": comp.get("ct", False),
        "corporate_tax_trn": f"CT-DEMO-{2000 + ci}" if comp.get("ct") else None,
        "financial_year_end": "12-31", "aml_risk_rating": comp["risk"], "pep_flag": False,
        "status": "Onboarding", "active_services": [s for s, _, _ in comp["services"]],
        "latest_onboarding_id": onb_id,
        "contact_person": f"Contact {ci + 1}", "contact_email": f"contact{ci + 1}@democlient.ae",
        "contact_phone": f"+9715{60000000 + ci * 1111}", "source": SRC, "created_at": now.isoformat(),
    })

    DB.client_onboardings.insert_one({
        "onboarding_id": onb_id, "client_id": client_id, "name": comp["name"],
        "service_type": comp["onb_service"], "crm_sheet": {"Audit": "Master Sheet",
            "Corporate tax return filing": "Corporate Tax Return Filing", "Internal Audit": "Internal Audit",
            "AML consultancy": "AML Consultancy", "Accounting": "Accounting", "Vat consultancy": "VAT Consultancy"}[comp["onb_service"]],
        "pipeline_stage": comp["stage"], "trade_name": comp["name"].replace(" (Demo)", ""),
        "emirate": comp["emirate"], "jurisdiction": comp["jurisdiction"], "freezone_name": comp.get("freezone_name"),
        "industry": comp["industry"], "entity_type": comp["entity_type"],
        "trade_licence_no": f"LIC-DEMO-{1000 + ci}", "vat_registered": comp.get("vat", False),
        "corporate_tax_registered": comp.get("ct", False), "financial_year_end": "12-31",
        "lead_source": ["Referral", "Website", "Existing client", "Networking", "Referral"][ci],
        "proposal_date": today if comp["stage"] in ("stage_3", "stage_4") else None,
        "quoted_fee": comp["services"][0][1], "payment_terms": comp["services"][0][2],
        "contact_person": f"Contact {ci + 1}", "contact_email": f"contact{ci + 1}@democlient.ae",
        "contact_phone": f"+9715{60000000 + ci * 1111}", "aml_risk_rating": comp["risk"],
        "notes": "Demo company — shows the full onboarding pipeline. Remove via source: demo_company.",
        "source": SRC, "created_at": now.isoformat(), "updated_at": now.isoformat(),
    })

    for si, (svc, fee, terms) in enumerate(comp["services"]):
        template = CHECKLIST_TEMPLATES.get(svc, [])
        checklist = []
        for g in template:
            items = [{"label": it, "done": (k % 3 == 0)} for k, it in enumerate(g["items"])]
            checklist.append({"group": g["group"], "items": items})
        s = st(svc)
        DB.service_engagements.insert_one({
            "engagement_id": f"eng_{uuid.uuid4().hex[:12]}", "service_type": svc,
            "client_id": client_id, "client_name": comp["name"],
            "assigned_to": s.get("user_id"), "assigned_to_name": s.get("name"),
            "status": "Active", "phase": checklist[0]["group"] if checklist else "",
            "notes": f"Demo engagement for {svc.replace('_', ' ')}.",
            "checklist": checklist,
            "terms": {"payment_terms": terms, **svc_terms.get(svc, {})},
            "fee_amount": fee, "milestones": milestones_from_terms(terms, fee),
            "source": SRC, "created_at": now.isoformat(),
        })
        engs_created += 1

    # invoices: paid, part-paid, overdue, draft per company
    inv_plan = [
        # (service, amount, days_ago, due_in, status, receipts)
        (comp["services"][0][0].replace("_", " ").title(), comp["services"][0][1], 40, -5, "Paid", 1),      # fully paid, older
        (comp["services"][1][0].replace("_", " ").title(), comp["services"][1][1], 15, 10, "Unpaid", 0),    # current, unpaid
        (comp["services"][2][0].replace("_", " ").title(), comp["services"][2][1], 35, -3, "Unpaid", 0),    # OVERDUE
        (comp["services"][3][0].replace("_", " ").title(), comp["services"][3][1], 2, 14, "Draft", 0),      # draft
    ]
    for j, (svc_name, amount, ago, due_in, status, n_receipts) in enumerate(inv_plan):
        seq += 1
        date = (now - timedelta(days=ago)).date().isoformat()
        inv_id = f"inv_{uuid.uuid4().hex[:12]}"
        paid = 0
        receipts = []
        if status == "Paid":
            paid = amount
            receipts = [{"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": amount,
                         "method": "Bank transfer", "reference": f"TRF-DEMO{ci}{j}",
                         "date": (now - timedelta(days=ago - 3)).date().isoformat()}]
        elif j == 1:  # part paid via advance receipt
            paid = round(amount / 2)
            receipts = [{"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": paid,
                         "method": "Bank transfer", "reference": f"TRF-DEMO{ci}{j}",
                         "date": (now - timedelta(days=5)).date().isoformat()}]
        credits = []
        if ci == 0 and j == 1:  # one credit note somewhere for the demo
            credits = [{"credit_id": f"CN-{uuid.uuid4().hex[:8].upper()}", "amount": 200,
                        "reason": "Agreed fee adjustment", "date": (now - timedelta(days=4)).date().isoformat()}]
        DB.invoices.insert_one({
            "invoice_id": inv_id, "invoice_number": f"INV-{now.year}-{seq:03d}",
            "client_id": client_id, "client_name": comp["name"], "service_name": svc_name,
            "amount": amount, "date": date, "due_date": (now + timedelta(days=due_in)).date().isoformat(),
            "status": status, "notes": "Demo invoice — safe to delete (source: demo_company).",
            "staff": mgr.get("name"), "amount_paid": paid if status != "Draft" else 0,
            "receipts": receipts if status != "Draft" else [], "credits": credits,
            "cancelled": False, "source": SRC, "created_at": now.isoformat(),
        })
        invs_created += 1

    # a few tasks per company
    for k, (title, days, pri) in enumerate([
        (f"Collect PBC documents - {comp['name']}", 5, "High"),
        (f"Schedule kickoff call - {comp['name']}", 8, "Medium"),
        (f"Send engagement letter for signature - {comp['name']}", 3, "High"),
    ]):
        DB.tasks.insert_one({
            "task_id": f"task_{uuid.uuid4().hex[:12]}", "title": title,
            "description": f"Demo task for {comp['name']}", "service_module": "Onboarding",
            "client_id": client_id, "client_name": comp["name"],
            "due_date": (now + timedelta(days=days)).date().isoformat(),
            "priority": pri, "assigned_to_name": mgr.get("name"), "status": "Pending",
            "source": SRC, "created_at": now.isoformat(),
        })

print(f"demo set ready: 5 companies · {engs_created} engagements (all 25 services) · {invs_created} invoices (paid/part-paid/overdue/draft) · pipelines at stages 1/2/3/4 · tasks seeded")
