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


async def get_or_create_drive_folder(service, folder_name):
    """Get or create a folder in Drive for organizing client docs."""
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
        return client_files[0]["id"]
    else:
        client_meta = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder", "parents": [root_id]}
        client_folder = service.files().create(body=client_meta, fields="id").execute()
        return client_folder["id"]
