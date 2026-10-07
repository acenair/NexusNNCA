"""Routes / onboarding — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from core import APP_NAME
from typing import Any
from pydantic import BaseModel
from services.templates import CHECKLIST_TEMPLATES
from fastapi import Cookie
from typing import Dict
from pydantic import Field
from fastapi import File
from fastapi import HTTPException
from fastapi import Header
from typing import List
from typing import Optional
from fastapi import UploadFile
from datetime import datetime
from core import db
from core import get_current_user
from core import log_activity
from core import put_object
from datetime import timedelta
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


ONBOARDING_DOCUMENT_CHECKLIST = {
    "general": ["Trade Licence Copy", "Memorandum of Association", "Emirates ID (Partners/Directors)", "Passport Copies (Partners/Directors)", "Power of Attorney (if applicable)"],
    "vat": ["Bank Letter / IBAN Certificate", "Turnover Evidence (12 months)", "Previous VAT Returns (if any)"],
    "corporate_tax": ["Financial Statements (Latest)", "Trial Balance", "Tax Registration Certificate (if any)"],
    "aml": ["Source of Funds Declaration", "Beneficial Ownership Structure", "Sanctions Self-Declaration"],
}


PIPELINE_STAGES = {
    "stage_1": {"label": "Stage 1: New Lead / Inquiry", "action": "Capture initial company details and the purpose of the requested service.", "documents": []},
    "stage_2": {"label": "Stage 2: Discovery & KYC Check", "action": "Complete discovery and validate KYC documentation.", "documents": ["Trade License", "Passport/EID of Owners", "VAT Certificate"]},
    "stage_3": {"label": "Stage 3: Proposal Sent & Negotiation", "action": "Record the quoted fee and share the formal proposal.", "documents": ["Audit Proposal Document"]},
    "stage_4": {"label": "Stage 4: Engagement Signed & Advance", "action": "Collect the signed engagement letter and confirm advance payment.", "documents": ["Signed Engagement Letter", "Payment Receipt / Proof"], "requires_advance_confirmation": True},
    "stage_5": {"label": "Stage 5: Onboarding Completed & Execution", "action": "Collect execution inputs and assign the Audit Partner and Manager.", "documents": ["Audit Request Checklist (PBC List)", "Trial Balance"], "requires_assignment": True},
    "stage_6": {"label": "Stage 6: Lost / On Hold", "action": "Document the lost reason and optionally schedule re-engagement.", "documents": [], "requires_lost_reason": True},
}


DYNAMIC_SERVICE_CONFIG = {
    "Audit": {"sheet": "Master Sheet", "engagement_type": "statutory_audit"},
    "Corporate tax return filing": {"sheet": "Corporate Tax Return Filing", "engagement_type": "corporate_tax"},
    "Internal Audit": {"sheet": "Internal Audit", "engagement_type": "internal_audit"},
    "AML consultancy": {"sheet": "AML Consultancy", "engagement_type": "aml_review"},
    "Accounting": {"sheet": "Accounting", "engagement_type": "accounting"},
    "Vat consultancy": {"sheet": "VAT Consultancy", "engagement_type": "vat_consultancy"},
}


SERVICE_TO_ENGAGEMENT_TYPE = {
    "Statutory Audit": "statutory_audit",
    "Internal Audit": "internal_audit",
    "Stock Audit": "stock_audit",
    "Fraud Audit": "fraud_audit",
    "VAT Registration": "vat_registration",
    "VAT Filing": "vat_filing",
    "VAT Amendments": "vat_filing",
    "Corporate Registration": "corporate_tax",
    "Corporate Tax": "corporate_tax",
    "Company Formation": "corporate_tax",
    "Liquidation": "corporate_tax",
    "Valuation": "corporate_tax",
    "Due Diligence": "corporate_tax",
    "AML Review": "aml_review",
    "AML Filing": "aml_review",
    "AML Report": "aml_review",
}


class OnboardingRequest(BaseModel):
    name: str
    entity_type: str
    jurisdiction: Optional[str] = None
    trade_name: Optional[str] = None
    emirate: Optional[str] = None
    freezone_name: Optional[str] = None
    industry: Optional[str] = None
    trade_licence_no: Optional[str] = None
    license_expiry_date: Optional[str] = None
    vat_registered: bool = False
    trn: Optional[str] = None
    corporate_tax_registered: bool = False
    corporate_tax_trn: Optional[str] = None
    ct_registration_no: Optional[str] = None
    financial_year_end: Optional[str] = None
    service_type: Optional[str] = None
    audit_purpose: Optional[str] = None
    service_purpose: Optional[str] = None
    service_period: Optional[str] = None
    previous_auditor: Optional[str] = None
    lead_source: Optional[str] = None
    referred_by: Optional[str] = None
    pipeline_stage: str = "stage_1"
    proposal_date: Optional[str] = None
    quoted_fee: Optional[float] = None
    payment_terms: Optional[str] = None
    aml_risk_rating: str = "Low"
    pep_flag: bool = False
    active_services: List[str] = Field(default_factory=list)
    relationship_manager: Optional[str] = None
    relationship_manager_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_designation: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    secondary_contact_info: Optional[str] = None
    notes: Optional[str] = None
    auto_create_engagements: bool = True


class OnboardingStageUpdateRequest(BaseModel):
    pipeline_stage: str
    advance_payment_confirmed: bool = False
    lost_reason: Optional[str] = None
    re_engagement_date: Optional[str] = None
    audit_partner: Optional[str] = None
    audit_manager: Optional[str] = None


def get_stage_tracker(stage: str) -> Dict[str, Any]:
    tracker = PIPELINE_STAGES.get(stage)
    if not tracker:
        raise HTTPException(status_code=400, detail="Invalid pipeline stage")
    return {"stage": stage, **tracker}


async def create_onboarding_engagement(onboarding: Dict[str, Any], user: Dict[str, Any]):
    existing = await db.service_engagements.find_one({"onboarding_id": onboarding["onboarding_id"]}, {"_id": 0, "engagement_id": 1})
    if existing:
        return existing["engagement_id"]
    config = DYNAMIC_SERVICE_CONFIG[onboarding["service_type"]]
    eng_type = config["engagement_type"]
    workflow = await db.workflows.find_one({"service_type": eng_type, "is_deleted": {"$ne": True}}, {"_id": 0})
    checklist = []
    if workflow:
        checklist = [{"group": step["name"], "items": [{"label": step.get("description") or step["name"], "done": False}]} for step in workflow.get("steps", [])]
    if not checklist:
        template = CHECKLIST_TEMPLATES.get(eng_type, [])
        checklist = [{"group": group["group"], "items": [{"label": label, "done": False} for label in group["items"]]} for group in template]
    engagement_id = f"eng_{uuid.uuid4().hex[:12]}"
    document = {
        "engagement_id": engagement_id, "onboarding_id": onboarding["onboarding_id"], "service_type": eng_type,
        "crm_sheet": onboarding["crm_sheet"], "client_id": onboarding["client_id"], "client_name": onboarding["name"],
        "assigned_to": onboarding.get("audit_manager"), "assigned_to_name": onboarding.get("audit_manager"),
        "audit_partner": onboarding.get("audit_partner"), "status": "Active", "phase": checklist[0]["group"] if checklist else "",
        "checklist": checklist, "workflow_id": workflow.get("workflow_id") if workflow else None,
        "workflow_name": workflow.get("name") if workflow else None, "created_by": user["user_id"],
        "created_by_name": user.get("name"), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.service_engagements.insert_one(document)
    return engagement_id


@router.post("/onboarding")
async def onboard_client(req: OnboardingRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can onboard clients")

    if req.service_type not in DYNAMIC_SERVICE_CONFIG:
        raise HTTPException(status_code=400, detail="Select a valid service type")
    tracker = get_stage_tracker(req.pipeline_stage)
    if req.pipeline_stage == "stage_5":
        raise HTTPException(status_code=400, detail="Create the service pipeline at an earlier stage, then confirm advance payment before moving to Stage 5")
    if req.pipeline_stage == "stage_6":
        raise HTTPException(status_code=400, detail="Select a lost reason from the service tracker before using Stage 6")

    # Reuse the client master record when the legal name already exists; each service has its own onboarding record.
    existing = await db.clients.find_one({"name": req.name})
    active_services = list(dict.fromkeys([*(existing.get("active_services", []) if existing else []), req.service_type]))
    if existing:
        client_id = existing["client_id"]
        await db.clients.update_one({"client_id": client_id}, {"$set": {"active_services": active_services, "status": existing.get("status") or "Onboarding", "trade_name": req.trade_name, "emirate": req.emirate, "freezone_name": req.freezone_name, "industry": req.industry, "license_expiry_date": req.license_expiry_date, "vat_registered": req.vat_registered, "corporate_tax_registered": req.corporate_tax_registered, "corporate_tax_trn": req.corporate_tax_trn, "financial_year_end": req.financial_year_end, "contact_person": req.contact_person, "contact_email": req.contact_email, "contact_phone": req.contact_phone}})
    else:
        client_id = f"client_{uuid.uuid4().hex[:12]}"
        client_doc = {"client_id": client_id, "name": req.name, "trade_name": req.trade_name, "entity_type": req.entity_type, "jurisdiction": req.jurisdiction, "emirate": req.emirate, "freezone_name": req.freezone_name, "industry": req.industry, "trade_licence_no": req.trade_licence_no, "license_expiry_date": req.license_expiry_date, "trn": req.trn if req.vat_registered else None, "vat_registered": req.vat_registered, "corporate_tax_registered": req.corporate_tax_registered, "corporate_tax_trn": req.corporate_tax_trn, "ct_registration_no": req.ct_registration_no, "financial_year_end": req.financial_year_end, "aml_risk_rating": req.aml_risk_rating, "pep_flag": req.pep_flag, "status": "Onboarding", "active_services": active_services, "relationship_manager_id": req.relationship_manager, "contact_person": req.contact_person, "contact_designation": req.contact_designation, "contact_email": req.contact_email, "contact_phone": req.contact_phone, "secondary_contact_info": req.secondary_contact_info, "notes": req.notes, "created_at": datetime.now(timezone.utc).isoformat(), "onboarded_by": user["user_id"], "onboarded_by_name": user.get("name")}
        await db.clients.insert_one(client_doc)

    onboarding_id = f"onb_{uuid.uuid4().hex[:12]}"
    config = DYNAMIC_SERVICE_CONFIG[req.service_type]
    onboarding_doc = {"onboarding_id": onboarding_id, "client_id": client_id, "name": req.name, "service_type": req.service_type, "crm_sheet": config["sheet"], "pipeline_stage": req.pipeline_stage, "trade_name": req.trade_name, "emirate": req.emirate, "jurisdiction": req.jurisdiction, "freezone_name": req.freezone_name, "industry": req.industry, "entity_type": req.entity_type, "trade_licence_no": req.trade_licence_no, "license_expiry_date": req.license_expiry_date, "vat_registered": req.vat_registered, "trn": req.trn if req.vat_registered else None, "corporate_tax_registered": req.corporate_tax_registered, "corporate_tax_trn": req.corporate_tax_trn, "financial_year_end": req.financial_year_end, "audit_purpose": req.audit_purpose, "service_purpose": req.service_purpose, "service_period": req.service_period, "previous_auditor": req.previous_auditor, "lead_source": req.lead_source, "referred_by": req.referred_by, "proposal_date": req.proposal_date, "quoted_fee": req.quoted_fee, "payment_terms": req.payment_terms, "contact_person": req.contact_person, "contact_designation": req.contact_designation, "contact_phone": req.contact_phone, "contact_email": req.contact_email, "secondary_contact_info": req.secondary_contact_info, "relationship_manager": req.relationship_manager, "relationship_manager_name": req.relationship_manager_name, "aml_risk_rating": req.aml_risk_rating, "notes": req.notes, "created_by": user["user_id"], "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.client_onboardings.insert_one(onboarding_doc)
    await db.clients.update_one({"client_id": client_id}, {"$set": {"latest_onboarding_id": onboarding_id}})

    # 2. Generate onboarding tasks
    tasks_created = []
    assignee = req.relationship_manager or user.get("email")
    assignee_name = req.relationship_manager_name or user.get("name")
    due_base = datetime.now(timezone.utc) + timedelta(days=3)

    # Stage 1 always starts with a concise initial-detail capture task.
    onboarding_tasks = [
        {"title": f"Capture initial details & purpose - {req.name}", "service_module": "Onboarding", "priority": "High", "days_offset": 3},
    ]

    # Service-specific tasks
    has_vat = req.service_type == "Vat consultancy"
    has_audit = req.service_type in ("Audit", "Internal Audit")
    has_ct = req.service_type == "Corporate tax return filing"

    if has_vat:
        onboarding_tasks.append({"title": f"VAT Registration Check - {req.name}", "service_module": "VAT", "priority": "Medium", "days_offset": 7})
    if has_audit:
        onboarding_tasks.append({"title": f"Schedule Audit Kickoff Meeting - {req.name}", "service_module": "Audit", "priority": "Medium", "days_offset": 10})
    if has_ct:
        onboarding_tasks.append({"title": f"Corporate Tax Registration Review - {req.name}", "service_module": "Corporate Tax", "priority": "Medium", "days_offset": 7})

    for t in onboarding_tasks:
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        task_doc = {
            "task_id": task_id,
            "title": t["title"],
            "description": f"Auto-generated onboarding task for {req.name}",
            "service_module": t["service_module"],
            "client_id": client_id,
            "client_name": req.name,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=t["days_offset"])).strftime("%Y-%m-%d"),
            "priority": t["priority"],
            "assigned_to": assignee,
            "assigned_to_name": assignee_name,
            "status": "Pending",
            "created_by": user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tasks.insert_one(task_doc)
        tasks_created.append(task_id)

    # Service engagements are created only when Stage 5 is reached.
    # Log the normalized CRM-sheet mapping so every service remains traceable end-to-end.
    await log_activity("Client onboarded", f"Onboarded new client: {req.name} ({req.entity_type})", user["user_id"], client_id, req.name)

    return {
        "client_id": client_id,
        "onboarding_id": onboarding_id,
        "client_name": req.name,
        "status": tracker["label"],
        "crm_sheet": config["sheet"],
        "tasks_created": len(tasks_created),
        "engagements_created": 0,
        "document_checklist": tracker["documents"],
        "message": f"Client '{req.name}' onboarded successfully",
    }


@router.get("/onboarding/document-checklist")
async def get_onboarding_doc_checklist(services: str = "", risk: str = "Low", authorization: str = Header(None), session_token: str = Cookie(None)):
    """Preview the legacy checklist endpoint without shadowing dynamic record routes."""
    user = await get_current_user(authorization, session_token)
    svc_list = [item.strip() for item in services.split(",") if item.strip()] if services else []
    checklist = list(ONBOARDING_DOCUMENT_CHECKLIST["general"])
    if any("VAT" in item for item in svc_list):
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["vat"])
    if any("Corporate" in item or "Tax" in item for item in svc_list):
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["corporate_tax"])
    if risk in ("Medium", "High"):
        checklist.extend(ONBOARDING_DOCUMENT_CHECKLIST["aml"])
    return {"checklist": checklist}


@router.get("/onboarding/{onboarding_id}")
async def get_onboarding_record(onboarding_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    record = await db.client_onboardings.find_one({"onboarding_id": onboarding_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Onboarding record not found")
    documents = await db.documents.find({"onboarding_id": onboarding_id, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(100)
    record["stage_tracker"] = get_stage_tracker(record.get("pipeline_stage", "stage_1"))
    record["documents"] = documents
    return record


@router.get("/onboarding/client/{client_id}")
async def get_client_onboardings(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    records = await db.client_onboardings.find({"client_id": client_id}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return records


@router.patch("/onboarding/{onboarding_id}")
async def update_onboarding_stage(onboarding_id: str, req: OnboardingStageUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can update onboarding pipelines")
    tracker = get_stage_tracker(req.pipeline_stage)
    if req.pipeline_stage == "stage_5" and not req.advance_payment_confirmed:
        raise HTTPException(status_code=400, detail="Confirm advance payment status before moving to Stage 5")
    if req.pipeline_stage == "stage_6" and req.lost_reason not in ("High Fee", "Competitor", "No Response", "Other"):
        raise HTTPException(status_code=400, detail="Select a lost reason before saving Stage 6")
    record = await db.client_onboardings.find_one({"onboarding_id": onboarding_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Onboarding record not found")
    updates = {"pipeline_stage": req.pipeline_stage, "advance_payment_confirmed": req.advance_payment_confirmed, "lost_reason": req.lost_reason if req.pipeline_stage == "stage_6" else None, "re_engagement_date": req.re_engagement_date if req.pipeline_stage == "stage_6" else None, "audit_partner": req.audit_partner, "audit_manager": req.audit_manager, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.client_onboardings.update_one({"onboarding_id": onboarding_id}, {"$set": updates})
    record.update(updates)
    engagement_id = None
    if req.pipeline_stage == "stage_5":
        engagement_id = await create_onboarding_engagement(record, user)
        await db.clients.update_one({"client_id": record["client_id"]}, {"$set": {"status": "Active"}})
    await log_activity("Onboarding stage updated", f"{record['name']} moved to {tracker['label']}", user["user_id"], record["client_id"], record["name"])
    return {"onboarding_id": onboarding_id, "pipeline_stage": req.pipeline_stage, "stage_tracker": tracker, "engagement_id": engagement_id}


@router.post("/onboarding/{onboarding_id}/documents")
async def upload_onboarding_document(onboarding_id: str, document_label: str, file: UploadFile = File(...), authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    record = await db.client_onboardings.find_one({"onboarding_id": onboarding_id}, {"_id": 0, "client_id": 1})
    if not record:
        raise HTTPException(status_code=404, detail="Onboarding record not found")
    allowed = get_stage_tracker((await db.client_onboardings.find_one({"onboarding_id": onboarding_id}, {"_id": 0, "pipeline_stage": 1}))["pipeline_stage"])["documents"]
    if document_label not in allowed:
        raise HTTPException(status_code=400, detail="This document is not required at the current pipeline stage")
    extension = file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin"
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{file_id}.{extension}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    document = {"file_id": file_id, "storage_path": result["path"], "original_filename": file.filename, "content_type": file.content_type, "size": result["size"], "client_id": record["client_id"], "onboarding_id": onboarding_id, "document_type": f"Onboarding | {document_label}", "document_label": document_label, "uploaded_by": user["user_id"], "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.documents.insert_one(document)
    return {"file_id": file_id, "document_label": document_label, "filename": file.filename}
