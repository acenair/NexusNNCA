"""Seed sample onboarding pipeline records so the Client Master 'Pipeline' view demonstrates itself.

Creates 6 sample clients (one per onboarding service type), each with a client_onboardings
record at a different pipeline stage (1-4) plus the auto-generated onboarding tasks.
Removable: every document carries source='sample_onboarding'.
Run on the VPS:  docker exec -w /app nnca-backend-1 sh -c 'PYTHONPATH=/app python scripts/seed_sample_onboarding.py'
"""
import os, uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

DB = MongoClient(os.environ.get("MONGO_URI", "mongodb://mongo:27017"))[
    os.environ.get("MONGO_DB", "ca_ai")]
SOURCE = "sample_onboarding"

SERVICES = {
    "Audit":                       {"sheet": "Master Sheet", "engagement_type": "statutory_audit"},
    "Corporate tax return filing": {"sheet": "Corporate Tax Return Filing", "engagement_type": "corporate_tax"},
    "Internal Audit":              {"sheet": "Internal Audit", "engagement_type": "internal_audit"},
    "AML consultancy":             {"sheet": "AML Consultancy", "engagement_type": "aml_review"},
    "Accounting":                  {"sheet": "Accounting", "engagement_type": "accounting"},
    "Vat consultancy":             {"sheet": "VAT Consultancy", "engagement_type": "vat_filing"},
}
STAGES = ["stage_1", "stage_2", "stage_3", "stage_4", "stage_2", "stage_3"]
PROFILES = [
    {"name": "Sample Falcon Trading LLC", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Dubai", "industry": "Trading", "vat": True},
    {"name": "Sample Crescent Tax Advisory FZCO", "entity_type": "FZCO", "jurisdiction": "Free Zone", "emirate": "Dubai", "freezone_name": "IFZA", "industry": "Professional Services", "vat": True, "ct": True},
    {"name": "Sample Dune Logistics LLC", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Sharjah", "industry": "Logistics", "vat": True},
    {"name": "Sample Meridian Consultants LLC", "entity_type": "LLC", "jurisdiction": "Mainland", "emirate": "Abu Dhabi", "industry": "Consulting", "vat": False, "ct": True},
    {"name": "Sample Oasis Foods Trading", "entity_type": "Establishment", "jurisdiction": "Mainland", "emirate": "Dubai", "industry": "F&B", "vat": True},
    {"name": "Sample Vista Media FZ-LLC", "entity_type": "FZ-LLC", "jurisdiction": "Free Zone", "emirate": "Dubai", "freezone_name": "DMCC", "industry": "Media", "vat": True},
]
FEES = [18000, 5500, 15000, 7000, 4800, 1500]
TERMS = ["50% Advance, 50% Draft Report", "50% Advance, 50% on filing", "50% Advance, 50% Final Report",
         "50% Advance, 50% Final Report", "Monthly in advance", "Quarterly in advance"]
SOURCES = ["Referral", "Website", "Existing client", "Networking", "Website", "Referral"]

now = datetime.now(timezone.utc)
created = 0
for i, (svc, cfg) in enumerate(SERVICES.items()):
    prof = PROFILES[i]
    if DB.client_onboardings.find_one({"source": SOURCE, "name": prof["name"]}):
        continue
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    onb_id = f"onb_{uuid.uuid4().hex[:12]}"
    stage = STAGES[i]
    fee = FEES[i]

    DB.clients.insert_one({
        "client_id": client_id, "name": prof["name"], "trade_name": prof["name"].replace("Sample ", ""),
        "entity_type": prof["entity_type"], "jurisdiction": prof["jurisdiction"], "emirate": prof["emirate"],
        "freezone_name": prof.get("freezone_name"), "industry": prof["industry"],
        "trade_licence_no": f"LIC-{100000 + i}", "license_expiry_date": f"2027-{(i % 12) + 1:02d}-15",
        "vat_registered": prof.get("vat", False), "trn": f"100{3000 + i}{40000 + i}" if prof.get("vat") else None,
        "corporate_tax_registered": prof.get("ct", False),
        "corporate_tax_trn": f"CT-{200000 + i}" if prof.get("ct") else None,
        "financial_year_end": "12-31", "aml_risk_rating": ["Low", "Medium", "High"][i % 3], "pep_flag": False,
        "status": "Onboarding", "active_services": [svc], "latest_onboarding_id": onb_id,
        "contact_person": f"Contact {i + 1}", "contact_email": f"contact{i + 1}@sampleclient.ae",
        "contact_phone": f"+9715{50000000 + i * 1111}", "source": SOURCE, "created_at": now.isoformat(),
    })

    DB.client_onboardings.insert_one({
        "onboarding_id": onb_id, "client_id": client_id, "name": prof["name"],
        "service_type": svc, "crm_sheet": cfg["sheet"], "pipeline_stage": stage,
        "trade_name": prof["name"].replace("Sample ", ""), "emirate": prof["emirate"],
        "jurisdiction": prof["jurisdiction"], "freezone_name": prof.get("freezone_name"),
        "industry": prof["industry"], "entity_type": prof["entity_type"],
        "trade_licence_no": f"LIC-{100000 + i}", "license_expiry_date": f"2027-{(i % 12) + 1:02d}-15",
        "vat_registered": prof.get("vat", False), "corporate_tax_registered": prof.get("ct", False),
        "financial_year_end": "12-31", "lead_source": SOURCES[i], "proposal_date": "2026-10-05" if i >= 2 else None,
        "quoted_fee": fee, "payment_terms": TERMS[i],
        "contact_person": f"Contact {i + 1}", "contact_email": f"contact{i + 1}@sampleclient.ae",
        "contact_phone": f"+9715{50000000 + i * 1111}", "aml_risk_rating": ["Low", "Medium", "High"][i % 3],
        "notes": f"Sample {svc} pipeline — shows how onboarding tracking works. Replace with a live client.",
        "source": SOURCE, "created_at": now.isoformat(), "updated_at": now.isoformat(),
    })

    # Auto-generated onboarding tasks (same shape the live POST /onboarding creates)
    tasks = [{"title": f"Capture initial details & purpose - {prof['name']}", "service_module": "Onboarding", "priority": "High", "days_offset": 3}]
    if svc == "Vat consultancy":
        tasks.append({"title": f"VAT Registration Check - {prof['name']}", "service_module": "VAT", "priority": "Medium", "days_offset": 7})
    if svc in ("Audit", "Internal Audit"):
        tasks.append({"title": f"Schedule Audit Kickoff Meeting - {prof['name']}", "service_module": "Audit", "priority": "Medium", "days_offset": 10})
    if svc == "Corporate tax return filing":
        tasks.append({"title": f"Corporate Tax Registration Review - {prof['name']}", "service_module": "Corporate Tax", "priority": "Medium", "days_offset": 7})
    for t in tasks:
        DB.tasks.insert_one({
            "task_id": f"task_{uuid.uuid4().hex[:12]}", "title": t["title"],
            "description": f"Auto-generated onboarding task for {prof['name']}",
            "service_module": t["service_module"], "client_id": client_id, "client_name": prof["name"],
            "due_date": (now + timedelta(days=t["days_offset"])).strftime("%Y-%m-%d"),
            "priority": t["priority"], "assigned_to_name": None, "status": "Pending",
            "source": SOURCE, "created_at": now.isoformat(),
        })
    created += 1

print(f"created {created} sample onboarding pipelines")
print("pipeline stages:", {p["name"]: p["stage"] for p in [dict(name=PROFILES[i]["name"], stage=STAGES[i]) for i in range(len(SERVICES))]})
