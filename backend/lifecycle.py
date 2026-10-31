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
import re
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
    if await db.clients.count_documents({}) > 0:
        return

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
    if await db.service_engagements.count_documents({}) > 0:
        return

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


async def seed_einvoicing_samples():
    """Sample e-invoicing readiness rows for demo clients (once)."""
    if await db.einvoicing_readiness.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    demo_clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1}).to_list(10)
    samples = [
        ("Meridian Consultants LLC (Demo)", "phase1", 68000000, {"tin_confirmed": True, "fields_ready": True}, "Avalara Gulf Technologies LLC"),
        ("Falcon Trading LLC (Demo)", "phase2", 2400000, {"tin_confirmed": True}, ""),
        ("Gulf Pharma Group", "phase1", 68000000, {"tin_confirmed": True, "fields_ready": True}, "Avalara Gulf Technologies LLC"),
        ("Al Baraka Trading LLC", "phase2", 2400000, {"tin_confirmed": True}, ""),
    ]
    n = 0
    for name, phase, revenue, checks, asp in samples:
        c = next((x for x in demo_clients if x["name"] == name), None)
        if not c:
            continue
        await db.einvoicing_readiness.update_one(
            {"client_id": c["client_id"]},
            {"$set": {"phase": phase, "annual_revenue_aed": revenue, "asp_name": asp,
                      **checks, "client_name": name, "updated_by": "system (sample data)", "updated_at": now}},
            upsert=True)
        n += 1
    logger.info(f"Seeded sample e-invoicing readiness for {n} demo clients")


async def seed_demo_tb_ajes():
    """Seed a sample trial balance + adjusting entries onto the demo audit
    engagement (once), so the audit workbench has consistent sample data."""
    # any demo audit engagement still without a trial balance?
    demo_engs = await db.service_engagements.find(
        {"service_type": "statutory_audit", "status": "Active"},
        {"_id": 0, "engagement_id": 1, "client_id": 1, "client_name": 1}).to_list(50)
    if await db.tb_imports.find_one({"source": "sample_ledger"}):
        return  # already seeded
    eng = None
    for e in demo_engs:
        if not await db.tb_imports.find_one({"engagement_id": e["engagement_id"]}, {"_id": 1}):
            eng = e
            break
    if not eng:
        return
    now = datetime.now(timezone.utc).isoformat()
    tb_rows = [
        # account, description, debit, credit, mapping
        ("Cash at bank - Emirates NBD", "Bank current account", 614900, 0, "Cash and bank balances"),
        ("Petty cash", "", 3500, 0, "Cash and bank balances"),
        ("Accounts receivable - trade", "", 286400, 0, "Trade receivables"),
        ("Other deposits", "Office deposit", 60000, 0, "Other receivables and advances"),
        ("Office equipment - cost", "", 148000, 0, "Property, plant and equipment"),
        ("Furniture and fittings - cost", "", 52000, 0, "Property, plant and equipment"),
        ("Accounts payable - trade", "", 0, 143800, "Trade payables"),
        ("Accrued expenses", "", 0, 28500, "Accruals and other payables"),
        ("VAT payable", "", 0, 21400, "VAT and taxes payable"),
        ("End-of-service obligation", "", 0, 46200, "Provisions and end-of-service"),
        ("Share capital", "", 0, 300000, "Share capital"),
        ("Retained earnings - b/fwd", "", 0, 131000, "Retained earnings"),
        ("Management fees earned", "", 0, 1240000, "Revenue"),
        ("Other operating income", "", 0, 18000, "Other income"),
        ("Staff salaries and benefits", "", 486000, 0, "Staff costs"),
        ("Office rent", "", 168000, 0, "Operating expenses"),
        ("Utilities and telephone", "", 32400, 0, "Operating expenses"),
        ("Professional and licence fees", "", 47500, 0, "Operating expenses"),
        ("Office expenses and sundry", "", 24100, 0, "Operating expenses"),
        ("Bank charges", "", 6100, 0, "Finance costs"),
    ]
    await db.tb_imports.insert_one({
        "tb_id": f"tb_{uuid.uuid4().hex[:12]}",
        "engagement_id": eng["engagement_id"],
        "client_id": eng["client_id"],
        "client_name": eng["client_name"],
        "file_name": "sample_trial_balance_FY2025.csv",
        "imported_by": "system (sample data)",
        "imported_at": now,
        "columns": {"account": 0, "description": 1, "debit": 2, "credit": 3},
        "source": "sample_ledger",
        "rows": [{"account": a, "description": d, "debit": dr, "credit": cr,
                  "mapping": m, "source": "memory"} for a, d, dr, cr, m in tb_rows],
        "mapped_count": len(tb_rows),
        "memory_mapped": 0,
        "auto_mapped": 0,
    })
    # firm mapping memory for the sample accounts — so ANY later import (TB or
    # GL ingestion) for any client maps these accounts automatically
    for a, d, dr, cr, m in tb_rows:
        key = re.sub(r"[^a-z0-9]+", " ", a.lower()).strip()
        await db.tb_mapping_memory.update_one(
            {"key": key},
            {"$set": {"mapping": m, "client_id": eng.get("client_id") or "",
                      "updated_at": now, "source": "sample_ledger"}},
            upsert=True)
    sample_ajes = [
        ("Accrue December electricity bill not yet recorded in the books", 3800,
         "Utilities and telephone", "Accrued expenses"),
        ("Provide for end-of-service benefit shortfall for the year", 15400,
         "Staff salaries and benefits", "End-of-service obligation"),
        ("Reverse bank charge duplicated on 12 March statement", 275,
         "Bank charges", "Cash at bank - Emirates NBD"),
    ]
    for i, (desc, amt, dr, cr) in enumerate(sample_ajes, 1):
        await db.engagement_ajes.insert_one({
            "aje_id": f"aje_{uuid.uuid4().hex[:12]}",
            "engagement_id": eng["engagement_id"],
            "client_id": eng["client_id"],
            "client_name": eng["client_name"],
            "ref": f"AJE-{i:03d}",
            "description": desc,
            "amount": amt,
            "debit_account": dr,
            "credit_account": cr,
            "debit_line": next(m for a2, d2, dr2, cr2, m in tb_rows if a2 == dr),
            "credit_line": next(m for a2, d2, dr2, cr2, m in tb_rows if a2 == cr),
            "status": "Posted" if i <= 2 else "Proposed",
            "raised_by": "system (sample data)",
            "signed_off_by": "Arjun Srinivas" if i <= 2 else None,
            "signed_off_at": now if i <= 2 else None,
            "source": "sample_ledger",
            "created_at": now,
        })
    logger.info(f"Seeded sample trial balance + {len(sample_ajes)} AJEs for demo engagement {eng['engagement_id']}")
    # sample e-invoicing readiness for two demo clients (one each side of the 50m line)
    if await db.einvoicing_readiness.count_documents({}) == 0:
        demo_clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1}).to_list(5)
        samples = [
            ("Gulf Pharma Group", "phase1", 68000000, {"tin_confirmed": True, "fields_ready": True}, "Avalara Gulf Technologies LLC"),
            ("Al Baraka Trading LLC", "phase2", 2400000, {"tin_confirmed": True}, ""),
        ]
        for name, phase, revenue, checks, asp in samples:
            c = next((x for x in demo_clients if x["name"] == name), None)
            if not c:
                continue
            await db.einvoicing_readiness.update_one(
                {"client_id": c["client_id"]},
                {"$set": {"phase": phase, "annual_revenue_aed": revenue, "asp_name": asp,
                          **checks, "client_name": name, "updated_by": "system (sample data)", "updated_at": now}},
                upsert=True)
        logger.info("Seeded sample e-invoicing readiness for demo clients")


async def seed_demo_ledger():
    """Seed a sample Tally-style general ledger for the demo audit engagement.

    The GL aggregates EXACTLY to the seeded sample trial balance (every account's
    net equals its TB balance, the clearing account nets to zero), so the dry-run
    story is coherent: books ingested from Tally → derived TB → AJEs → statements.
    """
    tb = await db.tb_imports.find_one({"source": "sample_ledger"})
    if not tb or await db.ledger_ingests.find_one({"engagement_id": tb["engagement_id"]}):
        return
    now = datetime.now(timezone.utc).isoformat()
    flavor = [
        ("cash|bank|petty", "Receipt"), ("receivab|debtor|deposit", "Journal"),
        ("payab|accrued|vat|end-of-service", "Payment"), ("capital|retained", "Journal"),
        ("income|fees earned", "Sales"), ("salary|rent|utilit|fees|expenses|charges", "Payment"),
    ]
    entries = []
    for i, row in enumerate(tb.get("rows", [])):
        net = round((row.get("debit") or 0.0) - (row.get("credit") or 0.0), 2)
        if net == 0:
            continue
        month = 4 + (i % 12)
        year = 2025 if month <= 12 else 2026
        m = month if month <= 12 else month - 12
        date = f"{year}-{m:02d}-{(5 + (i * 3) % 20):02d}"
        vtype = next((t for pat, t in flavor if re.search(pat, row["account"].lower())), "Journal")
        contra = -net
        entries.extend([
            {"date": date, "voucher_no": f"JV-{i + 1:03d}", "voucher_type": vtype,
             "account": row["account"], "debit": max(net, 0.0), "credit": max(-net, 0.0),
             "narration": f"Sample books entry — {row['account']}", "engagement_id": tb["engagement_id"],
             "client_id": tb.get("client_id"), "client_name": tb.get("client_name"), "ingested_at": now},
            {"date": date, "voucher_no": f"JV-{i + 1:03d}", "voucher_type": vtype,
             "account": "Suspense clearing", "debit": max(contra, 0.0), "credit": max(-contra, 0.0),
             "narration": "Balancing leg (clears to nil)", "engagement_id": tb["engagement_id"],
             "client_id": tb.get("client_id"), "client_name": tb.get("client_name"), "ingested_at": now},
        ])
    await db.ledger_entries.insert_many(entries)
    dates = sorted(e["date"] for e in entries if e.get("date"))
    await db.ledger_ingests.replace_one(
        {"engagement_id": tb["engagement_id"]},
        {"engagement_id": tb["engagement_id"], "client_id": tb.get("client_id"),
         "client_name": tb.get("client_name"), "source": "Tally XML",
         "vouchers": len({(e["voucher_no"], e["date"]) for e in entries}), "entries": len(entries),
         "period_from": dates[0], "period_to": dates[-1],
         "vat_output": 21400.0, "vat_input": 0.0, "duplicates": 0,
         "accounts": len(tb.get("rows", [])), "zero_excluded": 1, "skipped": 0,
         "file_name": "sample_daybook_FY2025_tally.xml", "by": "system (sample data)", "at": now},
        upsert=True)
    await db.tb_imports.update_one(
        {"_id": tb["_id"]},
        {"$set": {"derived_from_ledger": True, "ledger_source": "Tally XML",
                  "ledger_vouchers": len({(e["voucher_no"], e["date"]) for e in entries}),
                  "ledger_entries": len(entries), "ledger_period": [dates[0], dates[-1]],
                  "ledger_duplicates": 0, "ledger_vat": {"output": 21400.0, "input": 0.0}}})
    # demo client keeps its books in Tally — aligns Settings → Integrations with the sample story
    if tb.get("client_id"):
        await db.clients.update_one({"client_id": tb["client_id"]}, {"$set": {"accounting_system": "Tally"}})
    logger.info(f"Seeded sample Tally-style ledger ({len(entries)} entries) for engagement {tb['engagement_id']}")


async def seed_demo_e2e():
    """Fill the sample-audit client's story end to end, so the dry run can use ONE
    client to see every module connected: time logged by the audit team, sample
    documents for each stage (incl. a TB file that the import wizard can ingest),
    client queries (one answered, one open), the 50/50 billing milestones, and a
    review note. Every artifact is guarded — existing data is never duplicated."""
    tb = await db.tb_imports.find_one({"source": "sample_ledger"}, {"_id": 0})
    if not tb:
        return
    EID, CID, CNAME = tb["engagement_id"], tb.get("client_id"), tb.get("client_name")
    now = datetime.now(timezone.utc).isoformat()
    from routes.journal import journal_event
    eng = await db.service_engagements.find_one({"engagement_id": EID}, {"_id": 0}) or {}
    tag = dict(source="sample_e2e", client_id=CID, client_name=CNAME, engagement_id=EID)

    # 1 — time spent by the audit team (skip if the client already has hours)
    if await db.billable_hours.count_documents({"client_id": CID}) == 0:
        staff = await db.users.find(
            {"role": {"$in": ("staff", "partner")}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}).to_list(8)
        names = [s for s in staff if s.get("name")][:3] or staff[:3]
        work = [
            ("Planning — risk assessment walkthrough with management", "Anju", 5.5, "2026-10-12"),
            ("Planning — prior-year file review", "Anju", 3.0, "2026-10-13"),
            ("PBC list issued and follow-ups", "Anju", 1.5, "2026-10-14"),
            ("Books ingestion — Tally XML import and TB derivation", "Subin", 4.0, "2026-10-19"),
            ("Trial balance mapping review", "Subin", 2.5, "2026-10-20"),
            ("Bank statements collection and review", "Fazil", 3.5, "2026-10-21"),
            ("VAT account reconciliation to filed returns", "Fazil", 4.5, "2026-10-22"),
            ("Adjusting entries proposed and discussed", "Subin", 2.0, "2026-10-23"),
            ("Team briefing on flagged risks", "Anju", 1.0, "2026-10-26"),
            ("Revenue testing sample selection", "Fazil", 6.0, "2026-10-27"),
            ("Expense sampling", "Fazil", 4.5, "2026-10-28"),
            ("Draft management letter points", "Subin", 3.0, "2026-10-29"),
            ("Partner review — planning memo", "Anju", 2.5, "2026-10-29"),
            ("Client call — audit progress update", "Anju", 0.75, "2026-10-30"),
        ]
        for i, (desc, who, hrs, date) in enumerate(work):
            s = next((x for x in names if who.lower() in (x.get("name") or "").lower()), names[i % len(names)])
            await db.billable_hours.insert_one({
                "entry_id": f"bh_{uuid.uuid4().hex[:12]}", "staff_id": s.get("user_id"),
                "staff_name": s.get("name"), "staff_email": s.get("email"),
                "client_id": CID, "client_name": CNAME,
                "task_id": EID, "task_title": f"{eng.get('service_type', 'statutory_audit').replace('_', ' ').title()} — {CNAME}",
                "hours": hrs, "date": date, "description": desc, **tag, "created_at": now})
        logger.info(f"Seeded {len(work)} sample time entries for {CNAME}")

    # 2 — sample documents for each stage (inline data so previews + TB import work)
    if await db.documents.count_documents({"client_id": CID, "engagement_id": EID, "source": "sample_e2e"}) == 0:
        tb_csv = "Account,Debit,Credit\n" + "\n".join(
            f"{r['account']},{r.get('debit') or 0},{r.get('credit') or 0}" for r in tb.get("rows", []))
        docs = [
            ("Engagement letter — signed.pdf", "application/pdf", "sample_onboarding",
             f"ENGAGEMENT LETTER — Statutory audit FY2025\nClient: {CNAME}\nScope: Full scope IFRS statutory audit\nFee: AED 18,000 (50% advance, 50% on draft report)\nSigned and in force."),
            ("PBC list — audit FY2025.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sample_stage_doc",
             "PREPARERS PACK\n1. Signed engagement letter\n2. Trial balance (this file)\n3. Bank statements Apr-Mar\n4. VAT returns Q1-Q4\n5. Fixed asset register\n6. Debtors and creditors ageing\n7. Management accounts"),
            ("Trial balance FY2025.csv", "text/csv", "sample_stage_doc", tb_csv),
            ("Bank statements — Emirates NBD.zip", "application/zip", "sample_stage_doc",
             "12 monthly bank statements, Emirates NBD current account, Apr 2025 - Mar 2026 (sample bundle)."),
            ("VAT returns — filed Q1-Q4.pdf", "application/pdf", "sample_stage_doc",
             "FTA VAT 201 returns as filed for the four quarters of FY2025. Total output VAT AED 21,400 (per books ledger)."),
            ("Fixed asset register FY2025.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sample_stage_doc",
             "Office equipment AED 148,000; Furniture and fittings AED 52,000. Depreciation per policy note 3."),
            ("Prior year financial statements.pdf", "application/pdf", "sample_stage_doc",
             "FY2024 audited financial statements — comparatives for the IFRS statement builder."),
            ("Draft financial statements FY2025.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "sample_stage_doc",
             "DRAFT — IFRS statements generated from the trial balance and adjusting entries AJE-001..003."),
            ("Management representation letter — draft.pdf", "application/pdf", "sample_stage_doc",
             "Draft rep letter for signature at year end: responsibility for the books, completeness of liabilities, related parties, fraud."),
        ]
        for filename, ctype, src, body in docs:
            await db.documents.insert_one({
                "file_id": f"file_{uuid.uuid4().hex[:12]}", "filename": filename, "content_type": ctype,
                "size": len(body.encode()), "data": body.encode(), "client_id": CID,
                "uploader_id": "system", "uploader_name": "system (sample data)",
                "uploaded_at": now, "source": src, **tag})
        await journal_event(EID, "docs_seeded",
                            f"Sample stage documents added to the file: engagement letter, PBC pack, trial balance, bank statements, VAT returns, asset register, prior-year FS, draft FS, rep letter",
                            by_name="system (sample data)", client_id=CID or "", client_name=CNAME or "")
        logger.info(f"Seeded {len(docs)} sample stage documents for {CNAME}")

    # 3 — client queries: one answered, one open
    if await db.engagement_queries.count_documents({"engagement_id": EID}) == 0:
        base = {"query_id": f"qry_{uuid.uuid4().hex[:12]}", "engagement_id": EID,
                "client_id": CID, "client_name": CNAME, "service_type": eng.get("service_type", "statutory_audit"),
                "asked_by": "Anju S.", "replies": [], "answered_at": None, "closed_at": None}
        await db.engagement_queries.insert_one({**base,
            "question": "Please share the September and October bank statements — the ones uploaded are password protected.",
            "asked_at": "2026-10-21T09:30:00+00:00", "status": "Answered",
            "answered_at": "2026-10-22T14:10:00+00:00",
            "replies": [{"reply_id": f"rpl_{uuid.uuid4().hex[:12]}", "by_role": "client", "by_name": "Falcon Trading — Finance",
                         "text": "Apologies — unlocked versions for Sep and Oct are now uploaded under Bank statements.",
                         "at": "2026-10-22T14:10:00+00:00", "file_id": None, "filename": None}]})
        await db.engagement_queries.insert_one({**base,
            "query_id": f"qry_{uuid.uuid4().hex[:12]}",
            "question": "Confirm the related-party list is complete as at 31 March 2026 — we only see two entities in the register.",
            "asked_at": "2026-10-29T11:00:00+00:00", "status": "Open"})
        logger.info(f"Seeded sample client queries for engagement {EID}")

    # 4 — billing milestones 50/50: advance paid, draft report pending
    if await db.invoices.count_documents({"client_id": CID}) == 0:
        fee = eng.get("fee_amount") or 18000
        for label, pct, status, paid in (("Advance 50%", 0.5, "Paid", fee * 0.5), ("Draft report 50%", 0.5, "Unpaid", 0)):
            net = round(fee * pct, 2)
            await db.invoices.insert_one({
                "invoice_id": f"inv_{uuid.uuid4().hex[:12]}",
                "invoice_number": f"INV-2026-{100 + (0 if label.startswith('Advance') else 1)}",
                "client_id": CID, "client_name": CNAME,
                "service_name": f"External audit FY2025 — {label}",
                "amount": round(net * 1.05, 2), "net_amount": net, "vat_amount": round(net * 0.05, 2), "vat_percent": 5,
                "date": "2026-10-12" if label.startswith("Advance") else "2026-10-30",
                "due_date": "2026-11-25", "status": status,
                "notes": "Sample billing milestone (50% advance / 50% draft report).",
                "staff": "Anju", "amount_paid": paid,
                "receipts": [{"amount": paid, "date": "2026-10-15", "method": "Bank transfer", "note": "Advance received"}] if paid else [],
                "credits": [], "cancelled": False, "source": "sample_e2e",
                "created_by": "system", "created_at": now})
        logger.info(f"Seeded 50/50 sample invoices for {CNAME}")

    # 5 — a review note the partner has not cleared yet
    if await db.review_notes.count_documents({"engagement_id": EID}) == 0:
        await db.review_notes.insert_one({
            "note_id": f"rn_{uuid.uuid4().hex[:12]}", "engagement_id": EID,
            "text": "Materiality set on revenue before the AJEs post — confirm the final figure still holds once AJE-002 (end-of-service provision) is signed off.",
            "author_id": "system", "author_name": "Arjun S.", "status": "Open",
            "created_at": now, "cleared_at": None, "cleared_by": None})

    # 6b — sample receipts in the engagement's receipt inbox (incl. one flagged duplicate
    # so the dry run shows the duplicate firewall working)
    if await db.receipts.count_documents({"engagement_id": EID}) == 0:
        samples = [
            ("Emirates Telecommunications (Etisalat)", "100234567890003", "INV-ETI-88213", "2025-10-05", 641.25, 30.53, 5, "Telecommunications", "Office internet and mobile — September"),
            ("Union Properties — Building Management", "100456789000123", "SRV-2025-0344", "2025-10-07", 16800.0, 800.0, 5, "Rent", "Office rent — Q3 service charge"),
            ("Sharaf DG Business", "100678901234567", "SD-77812", "2025-10-18", 4410.0, 210.0, 5, "Office equipment", "Laptop dock and monitors for new joiner"),
            ("Careem Business", None, None, "2025-10-22", 87.50, None, None, "Travel", "Client site visits — Al Quoz"),
        ]
        seed_receipts = []
        for vendor, trn, inv_no, date, total, vat, vpct, cat, note in samples:
            body = f"receipt:{vendor}:{inv_no or 'xtra'}".encode()
            seed_receipts.append({
                "receipt_id": f"rcp_{uuid.uuid4().hex[:12]}", "engagement_id": EID,
                "client_id": CID, "client_name": CNAME,
                "file_path": f"sample/receipts/{uuid.uuid4().hex}.png", "file_name": f"{vendor.split(' ')[0].lower()}_receipt_{date}.png",
                "mime_type": "image/png", "size": len(body), "sha256": __import__("hashlib").sha256(body).hexdigest(),
                "vendor": vendor, "vendor_key": re.sub(r"[^a-z0-9]+", "", vendor.lower()),
                "vendor_trn": trn, "invoice_no": inv_no, "receipt_date": date,
                "currency": "AED", "total": total, "vat_amount": vat, "vat_percent": vpct,
                "category": cat, "line_items": [], "payment_method": "Card",
                "confidence": 0.92, "extraction_notes": note, "status": "Pending review",
                "duplicate_of": None, "uploaded_by": "system", "uploaded_by_name": "system (sample data)",
                "is_deleted": False, "created_at": now})
        dupe_src = seed_receipts[0]
        seed_receipts.append({**dupe_src,
            "receipt_id": f"rcp_{uuid.uuid4().hex[:12]}",
            "file_name": "etisalat_receipt_2025-10-05 (1).png",
            "sha256": __import__("hashlib").sha256(b"re-upload-same-receipt").hexdigest(),
            "status": "Flagged duplicate", "duplicate_of": dupe_src["receipt_id"],
            "uploaded_by_name": "Client portal"})
        for r in seed_receipts:
            r.update(tag)
        await db.receipts.insert_many(seed_receipts)
        await journal_event(EID, "receipt", "Sample receipts added to the inbox: 4 parsed (vendors, totals, VAT extracted) and 1 re-upload flagged as duplicate",
                            by_name="system (sample data)", client_id=CID or "", client_name=CNAME or "")
        logger.info(f"Seeded {len(seed_receipts)} sample receipts for engagement {EID}")

    # 7 — planning checklist reflects the story (idempotent)
    if eng.get("checklist"):
        changed = False
        done_labels = {"Engagement letter", "Risk assessment", "Audit plan", "Team briefing"}
        for group in eng["checklist"]:
            for item in group.get("items", []):
                if item.get("label") in done_labels and not item.get("done"):
                    item["done"] = True
                    changed = True
        if changed:
            await db.service_engagements.update_one({"engagement_id": EID}, {"$set": {"checklist": eng["checklist"]}})
            logger.info(f"Marked planning checklist items done for engagement {EID}")


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
    await seed_demo_tb_ajes()
    await seed_einvoicing_samples()
    await seed_demo_ledger()
    await seed_demo_e2e()
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
