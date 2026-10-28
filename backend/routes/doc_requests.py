"""Client document requests (PBC lists) with a no-login client upload portal.

Workflow: partner creates a request (optionally prefilled from a per-service PBC template),
shares the magic link (/upload/<token>) with the client over WhatsApp/email; the client
uploads files against each item WITHOUT logging in; uploads land in the documents
collection for the client (and auto-sync to Google Drive when connected) and the item
flips to Received. Partners see progress; nothing else on the portal is exposed.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from fastapi import File
from fastapi import Form
from fastapi import UploadFile
from typing import Optional
from datetime import datetime
from core import APP_NAME, db, get_current_user, get_object, put_object
from core import log_activity
from datetime import timezone
import secrets
import uuid

router = APIRouter(prefix="/api")

# Per-service PBC templates (prefill the request items)
PBC_TEMPLATES = {
    "statutory_audit": ["Trial balance", "General ledger (full year)", "Bank statements (all accounts, full year)",
                        "Bank reconciliation statements", "Sales ledger & VAT returns", "Purchase ledger",
                        "Fixed asset register", "Loan statements", "Inventory count records",
                        "Previous year audited financials", "Memorandum & Articles", "Trade licence copy"],
    "internal_audit": ["Process flowcharts / SOPs", "Organisation chart", "Delegation of authority matrix",
                       "Prior internal audit report", "Key system access lists", "Reconciliation samples"],
    "vat_filing": ["Sales invoices / sales register", "Purchase invoices / expense register",
                   "Bank statements", "Previous VAT returns", "VAT registration certificate (TRN)"],
    "vat_registration": ["Trade licence", "Passport & Emirates ID of owners", "Tenancy contract / Ejari",
                         "Bank account letter", "Estimated turnover projection"],
    "corporate_tax": ["Audited financial statements", "Trial balance", "Tax registration certificate (CT TRN)",
                      "Related party transaction schedule", "Group structure chart"],
    "accounting": ["Bank statements (period)", "Sales & purchase invoices", "Petty cash records",
                   "Payroll records", "Prior period trial balance"],
    "aml_review": ["Trade licence", "UBO / ownership documents", "MLRO appointment letter",
                   "AML policy & training records", "Customer risk assessments", "Previous goAML filings"],
    "goaml": ["Trade licence", "Passport & Emirates ID of UBO", "MLRO details", "BRN / goAML registration details"],
    "corporate_registration": ["Passport copies of shareholders", "Business plan", "Tenancy / address proof"],
    "company_formation": ["Passport copies of shareholders", "Proposed names list", "Business activity summary"],
    "company_liquidation": ["Trade licence", "Shareholders' resolution", "Final audit / accounts", "Clearance applications"],
    "business_valuation": ["Financial statements (3 years)", "Management accounts", "Shareholding details"],
    "due_diligence": ["Financial statements", "Corporate structure chart", "Key contracts", "Litigation summary"],
    "bank_account_opening": ["Trade licence", "Shareholder documents", "Business profile", "6 months bank statements"],
    "transfer_pricing": ["Related party transaction details", "Group financials", "Intercompany agreements"],
    "attestation_services": ["Original document to attest", "Passport copy", "Supporting letter"],
    "mofa_services": ["Original document", "Passport copy", "Chamber attestation (if applicable)"],
    "dmcc_services": ["Company documents", "Application forms", "Passport copies"],
    "certification_services": ["Document to certify", "Supporting evidence"],
    "chamber_attestation": ["Invoice / document to attest", "Certificate of origin", "Trade licence copy"],
    "stock_audit": ["Inventory listing", "Warehouse layout", "Count instructions", "Last count sheets"],
    "fraud_audit": ["Suspicion details / whistle-blower report", "Relevant ledgers", "System access logs"],
    "corporate_registration": ["Shareholder passports", "Business plan", "Address proof"],
    "aml_filing": ["Previous AML return", "Transaction summaries", "Customer risk register"],
    "aml_reports": ["Compliance monitoring reports", "STR/SAR copies", "Training records"],
}


class DocRequestIn(BaseModel):
    client_id: str
    title: str
    due_date: Optional[str] = None
    items: list[str] = []
    engagement_id: Optional[str] = None
    note: Optional[str] = None


@router.get("/doc-requests/templates")
async def list_pbc_templates(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    return PBC_TEMPLATES


@router.post("/doc-requests")
async def create_doc_request(req: DocRequestIn, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff"):
        raise HTTPException(status_code=403, detail="Only firm users can create document requests")
    client = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    items = [{"item_id": f"itm_{uuid.uuid4().hex[:8]}", "label": lbl.strip()[:200], "status": "Pending", "uploads": []}
             for lbl in req.items if lbl and lbl.strip()]
    if not items:
        raise HTTPException(status_code=422, detail="Add at least one requested document")
    request_id = f"dcr_{uuid.uuid4().hex[:12]}"
    token = secrets.token_urlsafe(24)
    doc = {
        "request_id": request_id, "token": token, "client_id": req.client_id, "client_name": client["name"],
        "title": req.title.strip()[:160], "due_date": req.due_date, "engagement_id": req.engagement_id,
        "note": (req.note or "")[:400], "items": items, "status": "Open",
        "created_by": user["user_id"], "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.doc_requests.insert_one(doc)
    await log_activity("Document request created", f"{req.title} for {client['name']} ({len(items)} items)", user["user_id"], req.client_id, client["name"])
    doc.pop("_id", None)
    return doc


@router.get("/doc-requests")
async def list_doc_requests(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    rows = await db.doc_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return rows


@router.get("/doc-requests/{request_id}")
async def get_doc_request(request_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    doc = await db.doc_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found")
    uploads = await db.documents.find({"request_id": request_id, "is_deleted": False},
                                      {"_id": 0, "file_id": 1, "original_filename": 1, "document_type": 1, "created_at": 1}).to_list(200)
    doc["uploads"] = uploads
    return doc


@router.delete("/doc-requests/{request_id}")
async def delete_doc_request(request_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can delete requests")
    res = await db.doc_requests.delete_one({"request_id": request_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"ok": True}


# ---- Public client portal (no login; token is the credential) ----

def _portal_doc(doc):
    return {"title": doc["title"], "client_name": doc["client_name"], "due_date": doc.get("due_date"),
            "note": doc.get("note"), "status": doc["status"], "items": doc["items"]}


@router.get("/public/doc-requests/{token}")
async def portal_view(token: str):
    doc = await db.doc_requests.find_one({"token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="This document request link is invalid or has been revoked")
    return _portal_doc(doc)


@router.post("/public/doc-requests/{token}/upload")
async def portal_upload(token: str, file: UploadFile = File(...), item_id: str = Form(""),
                        uploader_name: str = Form("")):
    doc = await db.doc_requests.find_one({"token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Invalid or revoked link")
    item = next((i for i in doc["items"] if i["item_id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Requested document item not found")

    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 25 MB)")
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/clients/{doc['client_id']}/{file_id}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")

    file_doc = {
        "file_id": file_id, "storage_path": result["path"], "original_filename": file.filename,
        "filename": file.filename, "content_type": file.content_type, "size": result["size"],
        "client_id": doc["client_id"], "client_name": doc["client_name"],
        "document_type": item["label"], "request_id": doc["request_id"],
        "uploaded_by_name": (uploader_name or "Client")[:80],
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(file_doc)

    item["status"] = "Received"
    item["uploads"] = item.get("uploads", []) + [{"file_id": file_id, "filename": file.filename,
                                                  "uploaded_at": datetime.now(timezone.utc).isoformat(),
                                                  "by": (uploader_name or "Client")[:80]}]
    if all(i["status"] == "Received" for i in doc["items"]):
        doc["status"] = "Completed"
    await db.doc_requests.update_one({"request_id": doc["request_id"]},
                                     {"$set": {"items": doc["items"], "status": doc["status"]}})

    # Best-effort Google Drive auto-sync (client folder)
    drive_link = None
    try:
        from services.drive import get_drive_service, get_or_create_drive_folder
        service = await get_drive_service()
        if service:
            folder_id = await get_or_create_drive_folder(service, doc["client_name"])
            from googleapiclient.http import MediaIoBaseUpload
            import io
            media = MediaIoBaseUpload(io.BytesIO(data), mimetype=file.content_type or "application/octet-stream")
            df = service.files().create(body={"name": file.filename, "parents": [folder_id]},
                                        media_body=media, fields="id,webViewLink").execute()
            drive_link = df.get("webViewLink")
            await db.documents.update_one({"file_id": file_id},
                                          {"$set": {"drive_file_id": df["id"], "drive_link": drive_link,
                                                    "synced_at": datetime.now(timezone.utc).isoformat()}})
    except Exception:
        pass

    return {"ok": True, "file_id": file_id, "item_status": item["status"], "request_status": doc["status"],
            "drive_link": drive_link}
