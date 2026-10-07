"""Routes / client portal — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from typing import Any
from pydantic import BaseModel
from fastapi import Cookie
from typing import Dict
from fastapi import File
from fastapi import HTTPException
from fastapi import Header
from typing import List
from fastapi import UploadFile
from datetime import datetime
from core import db
from core import get_current_user
from core import require_partner
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


CLIENT_DOC_CHECKLISTS = {
    "aml": [
        {"label": "Emirates ID (Front & Back)", "required": True},
        {"label": "Passport Copy", "required": True},
        {"label": "Source of Funds Declaration", "required": True},
        {"label": "Beneficial Ownership Structure", "required": True},
        {"label": "Bank Statements (6 months)", "required": True},
        {"label": "Sanctions Self-Declaration", "required": True},
    ],
    "company_formation": [
        {"label": "Trade Licence Application Form", "required": True},
        {"label": "Passport Copies (All Shareholders)", "required": True},
        {"label": "Emirates ID Copies", "required": True},
        {"label": "Memorandum of Association (Draft)", "required": True},
        {"label": "NOC from Current Sponsor (if applicable)", "required": False},
        {"label": "Proof of Address", "required": True},
        {"label": "Business Plan", "required": False},
    ],
    "vat_registration": [
        {"label": "Trade Licence Copy", "required": True},
        {"label": "Passport / Emirates ID of Authorized Signatory", "required": True},
        {"label": "Bank Letter / IBAN Certificate", "required": True},
        {"label": "Turnover Evidence (12 months)", "required": True},
        {"label": "Import/Export Documentation (if applicable)", "required": False},
        {"label": "Lease Agreement / Ejari", "required": False},
    ],
    "audit": [
        {"label": "Trial Balance (Year End)", "required": True},
        {"label": "Financial Statements (Draft)", "required": True},
        {"label": "Bank Reconciliation Statements", "required": True},
        {"label": "Accounts Receivable Aging", "required": True},
        {"label": "Accounts Payable Aging", "required": True},
        {"label": "Fixed Asset Register", "required": True},
        {"label": "Inventory Listing", "required": False},
        {"label": "Payroll Summary", "required": False},
        {"label": "Related Party Transactions Detail", "required": False},
    ],
}


@router.get("/client-portal/documents")
async def get_client_documents(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Get document checklist for the logged-in client user."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client role required")
    client_id = user.get("client_id")
    if not client_id:
        return {"checklist": [], "client_name": ""}

    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    client_name = client.get("name", "") if client else ""

    # Get or create document checklist for this client
    doc_checklist = await db.client_doc_checklists.find_one({"client_id": client_id}, {"_id": 0})
    if not doc_checklist:
        # Determine service type from client's active services or engagements
        service_type = None
        services = client.get("active_services", []) if client else []
        if any("AML" in s for s in services):
            service_type = "aml"
        elif any("Formation" in s for s in services):
            service_type = "company_formation"
        elif any("VAT Registration" in s for s in services):
            service_type = "vat_registration"
        elif any("Audit" in s for s in services):
            service_type = "audit"
        else:
            service_type = "audit"  # default

        template = CLIENT_DOC_CHECKLISTS.get(service_type, CLIENT_DOC_CHECKLISTS["audit"])
        items = [{"item_id": f"dci_{uuid.uuid4().hex[:8]}", "label": t["label"], "required": t["required"], "uploaded": False, "file_id": None, "filename": None, "uploaded_at": None} for t in template]

        doc_checklist = {
            "client_id": client_id,
            "service_type": service_type,
            "items": items,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.client_doc_checklists.insert_one(doc_checklist)
        doc_checklist.pop("_id", None)

    return {"checklist": doc_checklist.get("items", []), "service_type": doc_checklist.get("service_type"), "client_name": client_name}


@router.post("/client-portal/documents/{item_id}/upload")
async def upload_client_document(item_id: str, file: UploadFile = File(...), authorization: str = Header(None), session_token: str = Cookie(None)):
    """Client uploads a file for a specific checklist item."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client role required")
    client_id = user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client linked")

    # Verify item_id exists in this client's checklist
    checklist_doc = await db.client_doc_checklists.find_one({"client_id": client_id, "items.item_id": item_id}, {"_id": 0})
    if not checklist_doc:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    content = await file.read()
    file_id = f"file_{uuid.uuid4().hex[:12]}"

    # Store file in documents collection
    doc_entry = {
        "file_id": file_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "data": content,
        "client_id": client_id,
        "uploader_id": user["user_id"],
        "uploader_name": user.get("name"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "source": "client_portal",
    }
    await db.documents.insert_one(doc_entry)

    # Update checklist item
    await db.client_doc_checklists.update_one(
        {"client_id": client_id, "items.item_id": item_id},
        {"$set": {
            "items.$.uploaded": True,
            "items.$.file_id": file_id,
            "items.$.filename": file.filename,
            "items.$.uploaded_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    return {"file_id": file_id, "filename": file.filename, "message": "Document uploaded"}


@router.get("/client-portal/workflow")
async def get_client_workflow(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Get workflow stages visible to client."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client role required")
    client_id = user.get("client_id")
    if not client_id:
        return {"engagements": []}

    engs = await db.service_engagements.find({"client_id": client_id}, {"_id": 0}).to_list(20)
    result = []
    for eng in engs:
        stages = []
        for group in eng.get("checklist", []):
            items = group.get("items", [])
            total = len(items)
            done = sum(1 for i in items if i.get("done"))
            status = "Completed" if done == total and total > 0 else "In Progress" if done > 0 else "Pending"
            stages.append({"name": group.get("group", ""), "status": status})

        result.append({
            "engagement_id": eng.get("engagement_id"),
            "service_type": eng.get("service_type", "").replace("_", " ").title(),
            "status": eng.get("status", "Active"),
            "phase": eng.get("phase", ""),
            "stages": stages,
        })

    return {"engagements": result}


@router.get("/client-portal/invoices")
async def get_client_invoices(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Get invoice history for the logged-in client."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client role required")
    client_id = user.get("client_id")
    if not client_id:
        return []
    invoices = await db.invoices.find({"client_id": client_id}, {"_id": 0}).sort("date", -1).to_list(100)
    return invoices


@router.get("/admin/client-checklists/{client_id}")
async def get_client_checklist(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    doc = await db.client_doc_checklists.find_one({"client_id": client_id}, {"_id": 0})
    return doc or {"client_id": client_id, "items": []}


class ChecklistUpdateRequest(BaseModel):
    items: List[Dict[str, Any]]


@router.patch("/admin/client-checklists/{client_id}")
async def update_client_checklist(client_id: str, req: ChecklistUpdateRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    await db.client_doc_checklists.update_one(
        {"client_id": client_id},
        {"$set": {"items": req.items, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Checklist updated"}
