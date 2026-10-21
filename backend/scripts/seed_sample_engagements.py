"""Seed one sample engagement per service line (24 services) from real imported clients.

Idempotent: skips service types that already have a live engagement.
Removable: every document carries source='sample_engagement'.
Run on the VPS:  docker exec nnca-backend-1 python scripts/seed_sample_engagements.py
"""
import asyncio, os, uuid
from datetime import datetime, timezone
from pymongo import MongoClient
from services.templates import CHECKLIST_TEMPLATES, milestones_from_terms

DB = MongoClient(os.environ.get("MONGO_URI", "mongodb://mongo:27017"))[
    os.environ.get("MONGO_DB", "ca_ai")]
SOURCE = "sample_engagement"

# Suggested fee + payment terms per service (AED, sample)
PLAN = {
    "statutory_audit":        (18000, "50% Advance, 50% Draft Report"),
    "internal_audit":         (15000, "50% Advance, 50% Final Report"),
    "stock_audit":            (6000,  "100% on completion"),
    "fraud_audit":            (25000, "40% Advance, 60% Final Report"),
    "vat_registration":       (2500,  "100% on registration"),
    "vat_filing":             (1500,  "Quarterly in advance"),
    "vat_amendments":         (1200,  "100% on completion"),
    "corporate_registration": (7500,  "50% Advance, 50% on licence"),
    "corporate_tax":          (5500,  "50% Advance, 50% on filing"),
    "company_formation":      (12000, "50% Advance, 50% on licence"),
    "company_liquidation":    (15000, "30% Advance, 40% on DEWS filing, 30% on closure"),
    "business_valuation":     (9000,  "50% Advance, 50% Draft Report"),
    "due_diligence":          (20000, "50% Advance, 50% Final Report"),
    "aml_review":             (7000,  "50% Advance, 50% Final Report"),
    "aml_filing":             (4000,  "100% on filing"),
    "aml_reports":            (3500,  "100% on submission"),
    "goaml":                  (5000,  "50% Advance, 50% on goAML registration"),
    "accounting":             (4800,  "Monthly in advance"),
    "bank_account_opening":   (3000,  "100% on account opening"),
    "transfer_pricing":       (11000, "50% Advance, 50% Final Report"),
    "attestation_services":   (1800,  "100% on attestation"),
    "mofa_services":          (1500,  "100% on attestation"),
    "dmcc_services":          (2500,  "100% on completion"),
    "certification_services": (2000,  "100% on certificate"),
    "chamber_attestation":    (900,   "100% on attestation"),
}
# Service-specific terms that make each engagement realistic
TERMS = {
    "vat_filing":       {"return_frequency": "Quarterly", "tax_period": "Q3 2026", "reminder_buffer_days": 10},
    "corporate_tax":    {"return_frequency": "Annual", "tax_period": "FY 2025", "reminder_buffer_days": 30},
    "statutory_audit":  {"audit_scope": "Full scope IFRS statutory audit", "allocated_days": 15, "audit_period": "FY 2025"},
    "internal_audit":   {"audit_scope": "Controls & process review", "allocated_days": 10},
    "aml_review":       {"risk_classification": "Medium", "reporting_frequency": "Annual"},
    "aml_filing":       {"risk_classification": "Medium", "returns_due_date": "2026-12-31"},
    "goaml":            {"goaml_status": "Not registered", "reporting_frequency": "As required"},
    "accounting":       {"accounting_frequency": "Monthly", "work_location": "In-House"},
}

async def main():
    now = datetime.now(timezone.utc).isoformat()
    clients = list(DB.clients.find(
        {"source": "xlsx_import_2026_10"}, {"_id": 0, "client_id": 1, "name": 1}).limit(60))
    if not clients:
        clients = list(DB.clients.find({}, {"_id": 0, "client_id": 1, "name": 1}).limit(60))
    if not clients:  # bare DB — create placeholder sample clients
        for k in range(1, 8):
            DB.clients.insert_one({
                "client_id": f"sample_client_{k}", "name": f"Sample Business {k} LLC",
                "source": SOURCE})
        clients = list(DB.clients.find({"source": SOURCE}, {"_id": 0, "client_id": 1, "name": 1}))
    staff = [u for u in DB.users.find(
        {"role": {"$ne": "client"}}, {"_id": 0, "user_id": 1, "name": 1})]
    existing = {e["service_type"] for e in DB.service_engagements.find(
        {"status": {"$ne": "Deleted"}}, {"_id": 0, "service_type": 1})}
    used_clients = {e["client_id"] for e in DB.service_engagements.find(
        {"status": {"$ne": "Deleted"}}, {"_id": 0, "client_id": 1})}

    ci = 0
    created = skipped = 0
    for svc, (fee, terms) in PLAN.items():
        if svc in existing:
            skipped += 1
            continue
        # pick a client not already used by a live engagement of another sample
        client = None
        for _ in range(len(clients)):
            c = clients[ci % len(clients)]; ci += 1
            if c["client_id"] not in used_clients:
                client = c; break
        if not client:
            client = clients[ci % len(clients)]; ci += 1
        used_clients.add(client["client_id"])
        st = staff[created % len(staff)] if staff else {}
        template = CHECKLIST_TEMPLATES.get(svc, [])
        checklist = [{"group": g["group"], "items": [{"label": it, "done": False} for it in g["items"]]} for g in template]
        svc_terms = dict(TERMS.get(svc, {}))
        svc_terms["payment_terms"] = terms
        eng = {
            "engagement_id": f"eng_{uuid.uuid4().hex[:12]}",
            "service_type": svc,
            "client_id": client["client_id"], "client_name": client["name"],
            "assigned_to": st.get("user_id"), "assigned_to_name": st.get("name"),
            "status": "Active",
            "phase": checklist[0]["group"] if checklist else "",
            "notes": f"Sample engagement for {svc.replace('_',' ')} — replace with live work.",
            "checklist": checklist,
            "terms": {k: v for k, v in svc_terms.items() if v is not None},
            "fee_amount": fee,
            "milestones": milestones_from_terms(terms, fee),
            "source": SOURCE,
            "created_at": now,
        }
        DB.service_engagements.insert_one(eng)
        created += 1

    print(f"created {created}, skipped (already present) {skipped}")
    total = DB.service_engagements.count_documents({"status": {"$ne": "Deleted"}})
    print(f"live engagements now: {total}")

asyncio.run(main())
