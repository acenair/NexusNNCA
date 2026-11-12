"""Services / drive — extracted from server.py without behavior changes."""
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from core import db

DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']


async def get_drive_service():
    """Get an authenticated Drive service with auto-refresh."""
    creds_doc = await db.drive_credentials.find_one({"type": "firm"}, {"_id": 0})
    if not creds_doc or not creds_doc.get("access_token"):
        return None

    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc["token_uri"],
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc.get("scopes"),
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        await db.drive_credentials.update_one(
            {"type": "firm"},
            {"$set": {"access_token": creds.token, "expiry": creds.expiry.isoformat() if creds.expiry else None}}
        )

    return build('drive', 'v3', credentials=creds)


async def get_or_create_drive_folder(service, folder_name, subfolders=None):
    """Get or create a folder in Drive: Root / {client} / {subfolders...} (e.g. Service / Year)."""
    # First check if we have a root NN folder
    root_query = "name='Nair & Nelliyatt Documents' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=root_query, fields="files(id,name)", spaces='drive').execute()
    root_files = results.get("files", [])

    if root_files:
        root_id = root_files[0]["id"]
    else:
        root_meta = {"name": "Nair & Nelliyatt Documents", "mimeType": "application/vnd.google-apps.folder"}
        root_folder = service.files().create(body=root_meta, fields="id").execute()
        root_id = root_folder["id"]

    # Now get or create client subfolder
    client_query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and '{root_id}' in parents and trashed=false"
    results = service.files().list(q=client_query, fields="files(id,name)", spaces='drive').execute()
    client_files = results.get("files", [])

    if client_files:
        parent_id = client_files[0]["id"]
    else:
        client_meta = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder", "parents": [root_id]}
        client_folder = service.files().create(body=client_meta, fields="id").execute()
        parent_id = client_folder["id"]

    # Walk nested service/year levels (e.g. ["External Audit", "FY2026"])
    for sub in (subfolders or []):
        sub = str(sub).strip()
        if not sub:
            continue
        q = f"name='{sub}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"
        found = service.files().list(q=q, fields="files(id,name)", spaces='drive').execute().get("files", [])
        if found:
            parent_id = found[0]["id"]
        else:
            created = service.files().create(
                body={"name": sub, "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id]},
                fields="id").execute()
            parent_id = created["id"]
    return parent_id


# services that repeat every year -> year subfolder; everything else is one-off
RECURRING_SERVICES = {"statutory_audit", "internal_audit", "stock_audit", "fraud_audit",
                      "vat_filing", "vat_registration", "vat_amendments", "corporate_tax",
                      "accounting", "aml_review", "aml_filing", "goaml", "aml_reports"}

SERVICE_FOLDER_LABELS = {
    "statutory_audit": "External Audit", "audit": "External Audit", "internal_audit": "Internal Audit",
    "stock_audit": "Stock Audit", "fraud_audit": "Fraud Audit", "vat": "VAT",
    "vat_registration": "VAT Registration", "vat_filing": "VAT", "vat_amendments": "VAT Amendments",
    "corporate_tax": "Corporate Tax", "tax": "Corporate Tax", "corporate": "Corporate Tax",
    "corporate_registration": "Corporate Registration", "company_formation": "Company Formation",
    "company_liquidation": "Liquidation", "liquidation": "Liquidation",
    "advisory_valuation": "Valuation", "advisory_due_diligence": "Due Diligence",
    "aml": "AML", "aml_review": "AML Review", "aml_filing": "AML Filing", "goaml": "goAML",
    "aml_reports": "AML Reports", "accounting": "Accounting",
}


def _fy_year(eng):
    """Pull a year/FY label out of the engagement's period fields."""
    for key in ("audit_period", "tax_period", "fy", "financial_year"):
        val = str((eng.get("terms") or {}).get(key) or eng.get(key) or "")
        import re as _re
        m = _re.search(r"(20\d{2})", val)
        if m:
            return f"FY{m.group(1)}"
    return None


async def resolve_upload_subfolders(db, client_id, document_type, default_year):
    """Decide the service/year subfolders for an upload based on the client's engagements."""
    engs = await db.service_engagements.find(
        {"client_id": client_id, "status": {"$ne": "Deleted"}}, {"_id": 0}).to_list(50)
    if not engs:
        return None
    doc = (document_type or "").lower()
    target = None
    # obvious doc-type -> service mappings
    if "vat" in doc:
        target = next((e for e in engs if "vat" in (e.get("service_type") or "")), None)
    elif "audit" in doc:
        target = next((e for e in engs if "audit" in (e.get("service_type") or "")), None)
    elif "tax" in doc:
        target = next((e for e in engs if "tax" in (e.get("service_type") or "")), None)
    if not target and len(engs) == 1:
        target = engs[0]
    if not target:
        return None  # ambiguous + no doc-type hint -> General folder
    label = SERVICE_FOLDER_LABELS.get(target.get("service_type"), (target.get("service_type") or "General").replace("_", " ").title())
    subs = [label]
    if target.get("service_type") in RECURRING_SERVICES:
        subs.append(_fy_year(target) or f"FY{default_year}")
    return subs
