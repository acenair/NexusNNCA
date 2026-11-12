"""Routes / drive — extracted from server.py without behavior changes."""
from fastapi import APIRouter, BackgroundTasks
from fastapi import Cookie
from services.drive import DRIVE_SCOPES
from google_auth_oauthlib.flow import Flow
from fastapi import HTTPException
from fastapi import Header
from googleapiclient.http import MediaIoBaseUpload
from datetime import datetime
from core import db
from core import get_current_user
from services.drive import get_drive_service
from services.drive import get_or_create_drive_folder
import io
import os
from core import require_partner
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/drive/connect")
async def connect_drive(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Initiate Google Drive OAuth flow."""
    user = await require_partner(authorization, session_token)

    # Get Drive config from settings
    storage_doc = await db.settings.find_one({"type": "storage"}, {"_id": 0})
    config = storage_doc.get("config", {}).get("google_drive", {}) if storage_doc else {}

    client_id = config.get("client_id") or os.environ.get("GOOGLE_DRIVE_CLIENT_ID") or os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = config.get("client_secret") or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET") or os.environ.get("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Google Drive credentials not configured. Go to Settings > Storage to add Client ID and Client Secret.")

    frontend_url = os.environ.get("FRONTEND_URL", "https://app.nairnelliyatt.com").rstrip("/")
    redirect_uri = f"{frontend_url}/api/drive/callback"

    flow = Flow.from_client_config(
        {"web": {"client_id": client_id, "client_secret": client_secret, "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "redirect_uris": [redirect_uri]}},
        scopes=DRIVE_SCOPES,
        redirect_uri=redirect_uri
    )
    flow.autogenerate_code_verifier = True
    authorization_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent', state=user["user_id"])
    # PKCE: the token exchange needs the verifier generated for this authorization URL
    await db.drive_credentials.update_one(
        {"type": f"pkce_{user['user_id']}"},
        {"$set": {"type": f"pkce_{user['user_id']}", "code_verifier": flow.code_verifier,
                  "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return {"authorization_url": authorization_url}


@router.get("/drive/callback")
async def drive_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Google Drive OAuth callback."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    storage_doc = await db.settings.find_one({"type": "storage"}, {"_id": 0})
    config = storage_doc.get("config", {}).get("google_drive", {}) if storage_doc else {}
    client_id = config.get("client_id") or os.environ.get("GOOGLE_DRIVE_CLIENT_ID") or os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = config.get("client_secret") or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET") or os.environ.get("GOOGLE_CLIENT_SECRET")

    frontend_url = os.environ.get("FRONTEND_URL", "https://app.nairnelliyatt.com").rstrip("/")
    redirect_uri = f"{frontend_url}/api/drive/callback"

    flow = Flow.from_client_config(
        {"web": {"client_id": client_id, "client_secret": client_secret, "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "redirect_uris": [redirect_uri]}},
        scopes=None,
        redirect_uri=redirect_uri
    )
    pk = await db.drive_credentials.find_one({"type": f"pkce_{state}"})
    if pk and pk.get("code_verifier"):
        flow.code_verifier = pk["code_verifier"]
        await db.drive_credentials.delete_one({"type": f"pkce_{state}"})
    flow.fetch_token(code=code)
    credentials = flow.credentials

    await db.drive_credentials.update_one(
        {"type": "firm"},
        {"$set": {
            "type": "firm",
            "connected_by": state,
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(credentials.scopes) if credentials.scopes else [],
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    from starlette.responses import RedirectResponse
    return RedirectResponse(url=f"{frontend_url}/app/settings?drive=connected")


@router.get("/drive/status")
async def drive_status(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Check if Google Drive is connected."""
    user = await get_current_user(authorization, session_token)
    creds_doc = await db.drive_credentials.find_one({"type": "firm"}, {"_id": 0})
    if not creds_doc or not creds_doc.get("access_token"):
        return {"connected": False}
    return {"connected": True, "connected_at": creds_doc.get("connected_at"), "connected_by": creds_doc.get("connected_by")}


@router.post("/drive/sync-document/{file_id}")
async def sync_document_to_drive(file_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Upload a specific document to Google Drive."""
    user = await require_partner(authorization, session_token)
    service = await get_drive_service()
    if not service:
        raise HTTPException(status_code=400, detail="Google Drive not connected")

    file_doc = await db.documents.find_one({"file_id": file_id}, {"_id": 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")

    # Get or create a folder for the client
    client_name = file_doc.get("client_name") or file_doc.get("client_id", "General")
    folder_id = await get_or_create_drive_folder(service, client_name)

    # Upload file
    file_data = file_doc.get("data")
    if not file_data:
        raise HTTPException(status_code=400, detail="No file data to sync")

    media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=file_doc.get("content_type", "application/octet-stream"))
    file_metadata = {"name": file_doc.get("filename", "document"), "parents": [folder_id]}
    drive_file = service.files().create(body=file_metadata, media_body=media, fields="id,name,webViewLink").execute()

    # Update document record with drive link
    await db.documents.update_one(
        {"file_id": file_id},
        {"$set": {"drive_file_id": drive_file["id"], "drive_link": drive_file.get("webViewLink"), "synced_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {"drive_file_id": drive_file["id"], "drive_link": drive_file.get("webViewLink"), "message": "Synced to Google Drive"}


@router.get("/drive/files")
async def list_drive_files(authorization: str = Header(None), session_token: str = Cookie(None)):
    """List files in the N&N Drive folder."""
    user = await require_partner(authorization, session_token)
    service = await get_drive_service()
    if not service:
        raise HTTPException(status_code=400, detail="Google Drive not connected")

    root_query = "name='Nair & Nelliyatt Documents' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=root_query, fields="files(id,name)", spaces='drive').execute()
    root_files = results.get("files", [])
    if not root_files:
        return {"files": [], "folder_count": 0}

    root_id = root_files[0]["id"]
    # List subfolders
    folders_query = f"'{root_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    folders = service.files().list(q=folders_query, fields="files(id,name)", spaces='drive').execute().get("files", [])

    return {"root_folder_id": root_id, "folders": folders, "folder_count": len(folders)}


@router.post("/drive/disconnect")
async def disconnect_drive(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Disconnect Google Drive."""
    user = await require_partner(authorization, session_token)
    await db.drive_credentials.delete_many({"type": "firm"})
    return {"message": "Google Drive disconnected"}


@router.post("/api/drive/provision-folders")
async def provision_client_folders(background_tasks: BackgroundTasks, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Ensure a Drive folder exists for every client (Client / Service / FY structure).
    Runs in the background — poll /drive/status for progress."""
    user = await require_partner(authorization, session_token)
    service_ok = await get_drive_service()
    if not service_ok:
        raise HTTPException(status_code=400, detail="Google Drive not connected — connect it first")

    total = await db.clients.count_documents({"status": {"$ne": "Deleted"}})
    await db.drive_credentials.update_one(
        {"type": "provision_progress"},
        {"$set": {"type": "provision_progress", "running": True, "done": 0, "total": total,
                  "folders_created": 0, "started_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    background_tasks.add_task(_provision_job)
    return {"ok": True, "started": True, "total_clients": total}


async def _provision_job():
    from services.drive import get_or_create_drive_folder, SERVICE_FOLDER_LABELS, RECURRING_SERVICES, _fy_year
    service = await get_drive_service()
    if not service:
        await db.drive_credentials.update_one({"type": "provision_progress"}, {"$set": {"running": False, "error": "Drive not connected"}})
        return
    this_year = datetime.now(timezone.utc).year
    done = 0
    created = 0
    async for c in db.clients.find({"status": {"$ne": "Deleted"}}, {"_id": 0, "client_id": 1, "name": 1}):
        try:
            folder_id = await get_or_create_drive_folder(service, c["name"])
            async for e in db.service_engagements.find({"client_id": c["client_id"], "status": {"$ne": "Deleted"}}, {"_id": 0}):
                label = SERVICE_FOLDER_LABELS.get(e.get("service_type"), (e.get("service_type") or "").replace("_", " ").title())
                subs = [label]
                if e.get("service_type") in RECURRING_SERVICES:
                    subs.append(_fy_year(e) or f"FY{this_year}")
                await get_or_create_drive_folder(service, c["name"], subs)
            already = await db.clients.find_one({"client_id": c["client_id"], "drive_folder_id": {"$exists": True}})
            await db.clients.update_one(
                {"client_id": c["client_id"]},
                {"$set": {"drive_folder_id": folder_id, "drive_folder_link": f"https://drive.google.com/drive/folders/{folder_id}"}})
            created += 0 if already else 1
        except Exception as ex:
            await db.drive_credentials.update_one({"type": "provision_progress"}, {"$set": {"last_error": str(ex)[:200]}})
        done += 1
        if done % 5 == 0 or done == 1:
            await db.drive_credentials.update_one({"type": "provision_progress"}, {"$set": {"done": done, "folders_created": created}})
    await db.drive_credentials.update_one({"type": "provision_progress"}, {"$set": {"running": False, "done": done, "folders_created": created, "finished_at": datetime.now(timezone.utc).isoformat()}})
