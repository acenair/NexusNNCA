"""Routes / drive — extracted from server.py without behavior changes."""
from fastapi import APIRouter
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

    client_id = config.get("client_id") or os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
    client_secret = config.get("client_secret") or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Google Drive credentials not configured. Go to Settings > Storage to add Client ID and Client Secret.")

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    redirect_uri = f"{frontend_url}/api/drive/callback"

    flow = Flow.from_client_config(
        {"web": {"client_id": client_id, "client_secret": client_secret, "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "redirect_uris": [redirect_uri]}},
        scopes=DRIVE_SCOPES,
        redirect_uri=redirect_uri
    )
    authorization_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent', state=user["user_id"])
    return {"authorization_url": authorization_url}


@router.get("/drive/callback")
async def drive_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Google Drive OAuth callback."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    storage_doc = await db.settings.find_one({"type": "storage"}, {"_id": 0})
    config = storage_doc.get("config", {}).get("google_drive", {}) if storage_doc else {}
    client_id = config.get("client_id") or os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
    client_secret = config.get("client_secret") or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    redirect_uri = f"{frontend_url}/api/drive/callback"

    flow = Flow.from_client_config(
        {"web": {"client_id": client_id, "client_secret": client_secret, "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "redirect_uris": [redirect_uri]}},
        scopes=None,
        redirect_uri=redirect_uri
    )
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
