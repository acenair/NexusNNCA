"""Lifecycle — extracted from server.py without behavior changes."""
from services.templates import CHECKLIST_TEMPLATES
import audit_workbook
from core import client
from datetime import datetime
from core import db
from core import hash_password
from core import init_storage
from core import logger
from datetime import timezone
import uuid

async def seed_nn_users():
    """Seed the Nair & Nelliyatt team into the database if not already present."""
    default_password = hash_password("nn123456")
    team = [
        {"name": "Arjun Srinivas", "email": "srinivas.anup@gmail.com", "role": "partner", "title": "Managing Partner"},
        {"name": "Sooraj Nelliyatt", "email": "sooraj@nnadvisory.ae", "role": "partner", "title": "Senior Partner"},
        {"name": "Fazil", "email": "fazil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Subin", "email": "subin@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Anju", "email": "anju@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
        {"name": "Roshith", "email": "roshith@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Thasleema", "email": "thasleema@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
        {"name": "Jithin", "email": "jithin@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Shamil A.", "email": "shamil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Akhil", "email": "akhil@nnadvisory.ae", "role": "staff", "title": "Associate"},
        {"name": "Haritha", "email": "haritha@nnadvisory.ae", "role": "staff", "title": "Senior Associate"},
    ]
    for member in team:
        existing = await db.users.find_one({"email": member["email"]})
        if not existing:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": member["email"],
                "name": member["name"],
                "title": member["title"],
                "role": member["role"],
                "password": default_password,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Seeded user: {member['name']}")
        else:
            # Ensure seed-defined fields are up to date (name, title, role)
            updates = {}
            if existing.get("name") != member["name"]:
                updates["name"] = member["name"]
            if existing.get("title") != member["title"]:
                updates["title"] = member["title"]
            if existing.get("role") != member["role"]:
                updates["role"] = member["role"]
            if updates:
                await db.users.update_one({"email": member["email"]}, {"$set": updates})
                logger.info(f"Updated seed user fields for {member['name']}: {', '.join(updates.keys())}")


async def seed_nn_clients():
    """Seed demo clients for Nair & Nelliyatt practice."""
    demo_clients = [
        {"name": "Al Baraka Trading LLC", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "trn": "100234567890003", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "AML"]},
        {"name": "Falcon Logistics Co.", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "trn": "100456789000123", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Internal Audit", "AML"]},
        {"name": "Gulf Pharma Group", "entity_type": "Group", "jurisdiction": "Abu Dhabi", "trn": "100345678900012", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Corporate Tax", "AML"]},
        {"name": "Zara Tech LLC", "entity_type": "LLC", "jurisdiction": "DMCC Free Zone", "trn": "100678900012345", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing"]},
        {"name": "Sunrise Holdings", "entity_type": "Holding", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit", "Company Formation"]},
        {"name": "Marina Holdings", "entity_type": "LLC", "jurisdiction": "Dubai Marina", "trn": "100567890001234", "status": "Active", "active_services": ["Statutory Audit", "VAT Filing", "Internal Audit", "Corporate Tax"]},
        {"name": "Desert Rose Trading", "entity_type": "LLC", "jurisdiction": "Sharjah", "status": "Active", "active_services": ["Statutory Audit", "AML", "Valuation"]},
        {"name": "Al Hayat Retail", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit"]},
        {"name": "Blue Horizon Co.", "entity_type": "LLC", "jurisdiction": "Ajman Free Zone", "status": "Active", "active_services": ["Statutory Audit"]},
        {"name": "Bright Vision LLC", "entity_type": "LLC", "jurisdiction": "Dubai Mainland", "status": "Active", "active_services": ["Statutory Audit"]},
    ]
    for c in demo_clients:
        existing = await db.clients.find_one({"name": c["name"]})
        if not existing:
            await db.clients.insert_one({
                "client_id": f"client_{uuid.uuid4().hex[:12]}",
                "name": c["name"],
                "entity_type": c["entity_type"],
                "jurisdiction": c.get("jurisdiction"),
                "trn": c.get("trn"),
                "status": c.get("status", "Active"),
                "active_services": c.get("active_services", []),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Seeded client: {c['name']}")


async def seed_nn_engagements():
    """Seed sample service engagements if none exist."""
    existing = await db.service_engagements.count_documents({})
    if existing > 0:
        return

    clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1}).to_list(10)
    staff = await db.users.find({"role": "staff"}, {"_id": 0, "name": 1, "email": 1}).to_list(10)
    if not clients or not staff:
        return

    def make_checklist(svc_type, done_map):
        template = CHECKLIST_TEMPLATES.get(svc_type, [])
        cl = []
        for g in template:
            items = []
            for item in g["items"]:
                items.append({"label": item, "done": done_map.get(item, False)})
            cl.append({"group": g["group"], "items": items})
        return cl

    seed_engs = [
        {"service_type": "statutory_audit", "client_idx": 0, "staff_idx": 0, "phase": "Fieldwork",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Team briefing": True, "Revenue testing": True}},
        {"service_type": "statutory_audit", "client_idx": 1, "staff_idx": 3, "phase": "Planning",
         "done": {"Engagement letter": True, "Risk assessment": True}},
        {"service_type": "statutory_audit", "client_idx": 2, "staff_idx": 4, "phase": "Fieldwork",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Materiality memo": True, "Team briefing": True, "Revenue testing": True, "Expense sampling": True, "Bank confirmations": True}},
        {"service_type": "statutory_audit", "client_idx": 7, "staff_idx": 6, "phase": "Review & Reporting",
         "done": {"Engagement letter": True, "Risk assessment": True, "Audit plan": True, "Materiality memo": True, "Team briefing": True, "Revenue testing": True, "Expense sampling": True, "Bank confirmations": True, "Inventory count": True, "Related party review": True, "Draft report": True, "Management letter": True}},
        {"service_type": "vat_filing", "client_idx": 0, "staff_idx": 3, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True, "Filing receipt archive": True, "Client notification": True}},
        {"service_type": "vat_filing", "client_idx": 2, "staff_idx": 4, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True}},
        {"service_type": "vat_filing", "client_idx": 1, "staff_idx": 5, "phase": "Filing",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True}},
        {"service_type": "vat_filing", "client_idx": 5, "staff_idx": 6, "phase": "Completion",
         "done": {"Data collection": True, "Purchase invoices review": True, "Sales invoices review": True, "Reconciliation": True, "Return preparation": True, "Box amounts calculation": True, "Review & approval": True, "FTA portal submission": True, "Payment confirmation": True, "Filing receipt archive": True}},
        {"service_type": "aml_review", "client_idx": 0, "staff_idx": 4, "phase": "Transaction Monitoring",
         "done": {"KYC documentation": True, "Beneficial ownership check": True, "PEP screening": True, "Sanctions screening": True, "Unusual transaction review": True}},
        {"service_type": "aml_review", "client_idx": 1, "staff_idx": 6, "phase": "Client Due Diligence",
         "done": {"KYC documentation": True, "Beneficial ownership check": True}},
        {"service_type": "corporate_tax", "client_idx": 2, "staff_idx": 4, "phase": "Computation",
         "done": {"Financial data collection": True, "Revenue classification": True, "Exempt income review": True, "Deduction analysis": True, "Taxable income calculation": True}},
    ]

    for se in seed_engs:
        ci = min(se["client_idx"], len(clients) - 1)
        si = min(se["staff_idx"], len(staff) - 1)
        checklist = make_checklist(se["service_type"], se.get("done", {}))
        total = sum(len(g["items"]) for g in checklist)
        done_count = sum(1 for g in checklist for item in g["items"] if item["done"])
        await db.service_engagements.insert_one({
            "engagement_id": f"eng_{uuid.uuid4().hex[:12]}",
            "service_type": se["service_type"],
            "client_id": clients[ci]["client_id"],
            "client_name": clients[ci]["name"],
            "assigned_to": staff[si]["email"],
            "assigned_to_name": staff[si]["name"],
            "status": "Completed" if done_count == total else "Active",
            "phase": se["phase"],
            "checklist": checklist,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info(f"Seeded {len(seed_engs)} service engagements")


async def seed_preset_workflows():
    """Seed preset workflows for each service type if none exist."""
    existing = await db.workflows.count_documents({})
    if existing > 0:
        return
    presets = [
        {"name": "Statutory Audit Workflow", "service_type": "statutory_audit", "steps": [
            {"name": "Engagement Letter", "description": "Issue and sign engagement letter with client", "order": 0},
            {"name": "Risk Assessment", "description": "Assess inherent and control risks", "order": 1},
            {"name": "Audit Planning", "description": "Develop audit plan and materiality thresholds", "order": 2},
            {"name": "Fieldwork Execution", "description": "Perform substantive testing and controls testing", "order": 3},
            {"name": "Review & Quality Control", "description": "Partner review of working papers", "order": 4},
            {"name": "Draft Report", "description": "Prepare draft audit report and management letter", "order": 5},
            {"name": "Client Sign-off", "description": "Obtain client approval and representations", "order": 6},
            {"name": "Final Report & Filing", "description": "Issue final report and file with authorities", "order": 7},
        ]},
        {"name": "VAT Filing Workflow", "service_type": "vat_filing", "steps": [
            {"name": "Data Collection", "description": "Gather sales and purchase invoices from client", "order": 0},
            {"name": "Invoice Reconciliation", "description": "Reconcile invoices with accounting records", "order": 1},
            {"name": "Return Preparation", "description": "Calculate box amounts and prepare VAT return", "order": 2},
            {"name": "Partner Review", "description": "Review and approve return before submission", "order": 3},
            {"name": "FTA Submission", "description": "Submit return via FTA portal", "order": 4},
            {"name": "Payment Processing", "description": "Process VAT payment and confirm receipt", "order": 5},
        ]},
        {"name": "AML Review Workflow", "service_type": "aml_review", "steps": [
            {"name": "KYC Documentation", "description": "Collect and verify identity documents", "order": 0},
            {"name": "Beneficial Ownership", "description": "Identify and verify beneficial owners", "order": 1},
            {"name": "PEP & Sanctions Screening", "description": "Screen against PEP lists and sanctions databases", "order": 2},
            {"name": "Risk Rating", "description": "Assign client risk rating based on due diligence", "order": 3},
            {"name": "Transaction Monitoring", "description": "Review transactions for unusual patterns", "order": 4},
            {"name": "MLRO Review & goAML", "description": "MLRO assessment and goAML report if required", "order": 5},
        ]},
        {"name": "Corporate Tax Workflow", "service_type": "corporate_tax", "steps": [
            {"name": "Financial Data Review", "description": "Review financial statements and trial balance", "order": 0},
            {"name": "Income Classification", "description": "Classify taxable, exempt, and qualifying income", "order": 1},
            {"name": "Tax Computation", "description": "Calculate taxable income and tax liability", "order": 2},
            {"name": "Return Preparation", "description": "Prepare CT return with supporting schedules", "order": 3},
            {"name": "Partner Approval", "description": "Review and sign-off by engagement partner", "order": 4},
            {"name": "Filing & Payment", "description": "Submit via portal and process payment", "order": 5},
        ]},
        {"name": "Internal Audit Workflow", "service_type": "internal_audit", "steps": [
            {"name": "Scope Definition", "description": "Define audit scope and objectives", "order": 0},
            {"name": "Risk Assessment", "description": "Update risk universe and prioritize areas", "order": 1},
            {"name": "Audit Program", "description": "Develop detailed testing procedures", "order": 2},
            {"name": "Control Testing", "description": "Test operating effectiveness of controls", "order": 3},
            {"name": "Findings & Recommendations", "description": "Document findings and propose improvements", "order": 4},
            {"name": "Management Response", "description": "Obtain management responses to findings", "order": 5},
            {"name": "Final Report", "description": "Issue final internal audit report", "order": 6},
        ]},
    ]
    for p in presets:
        await db.workflows.insert_one({
            "workflow_id": f"wf_{uuid.uuid4().hex[:12]}",
            "name": p["name"],
            "service_type": p["service_type"],
            "steps": p["steps"],
            "is_preset": True,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info(f"Seeded {len(presets)} preset workflows")


async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await ensure_db_indexes()
    await seed_nn_users()
    await seed_nn_clients()
    await seed_nn_engagements()
    await seed_preset_workflows()
    await audit_workbook.seed_audit_template(db, logger)
    await migrate_force_password_change()


async def migrate_force_password_change():
    """One-time rollout migration: flag every existing account to require a
    password change on next login, replacing the shared placeholder password."""
    marker = await db.settings.find_one({"type": "security_migration_v1"})
    if marker:
        return
    result = await db.users.update_many({}, {"$set": {"must_change_password": True}})
    await db.settings.insert_one({"type": "security_migration_v1", "applied_at": datetime.now(timezone.utc).isoformat()})
    logger.info(f"Security migration v1: flagged {result.modified_count} existing users to require a password change")


async def ensure_db_indexes():
    """Create indexes for the hottest query paths (idempotent)."""
    index_specs = {
        "users": [("email", 1)],
        "user_sessions": [("session_token", 1), ("user_id", 1)],
        "activities": [("created_at", -1)],
        "documents": [("file_id", 1), ("client_id", 1), ("is_deleted", 1)],
        "tasks": [("client_id", 1), ("status", 1)],
        "events": [("user_id", 1), ("start", -1)],
        "service_engagements": [("client_id", 1), ("engagement_id", 1)],
        "client_audits": [("engagement_id", 1), ("client_id", 1)],
        "chat_messages": [("session_id", 1), ("user_id", 1)],
        "clients": [("client_id", 1)],
        "notifications": [("user_id", 1), ("created_at", -1)],
    }
    try:
        existing = await db.list_collection_names()
        for coll, keys in index_specs.items():
            if coll not in existing:
                continue
            await db[coll].create_index(keys, background=True)
        logger.info("Database indexes ensured")
    except Exception as e:
        logger.error(f"Index creation failed: {e}")


async def shutdown_db_client():
    client.close()
