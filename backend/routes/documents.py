"""Routes / documents — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from core import APP_NAME
from fastapi import Cookie
from fastapi import File
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from fastapi import Query
from fastapi import Response
from fastapi import UploadFile
from datetime import datetime
from core import db
from core import get_current_user
from core import get_object
from core import put_object
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), authorization: str = Header(None), session_token: str = Cookie(None),
                     client_id: Optional[str] = None, document_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{file_id}.{ext}"
    
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    
    file_doc = {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "client_id": client_id,
        "document_type": document_type,
        "uploaded_by": user["user_id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.documents.insert_one(file_doc)
    
    return {"file_id": file_id, "filename": file.filename, "path": result["path"]}


@router.get("/documents")
async def list_documents(authorization: str = Header(None), session_token: str = Cookie(None),
                        client_id: Optional[str] = None, document_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {"is_deleted": False}
    if client_id:
        query["client_id"] = client_id
    if document_type:
        query["document_type"] = document_type
    docs = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with uploader name
    user_cache = {}
    for doc in docs:
        uid = doc.get("uploaded_by")
        if uid and uid not in user_cache:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1})
            user_cache[uid] = u.get("name", "Unknown") if u else "Unknown"
        doc["uploaded_by_name"] = user_cache.get(uid, "Unknown")
    return docs


@router.delete("/documents/{file_id}")
async def delete_document(file_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    result = await db.documents.update_one({"file_id": file_id, "is_deleted": False}, {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": user["user_id"]}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}


@router.get("/files/{file_id}")
async def download_file(file_id: str, authorization: str = Header(None), session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header, session_token)
    
    file_doc = await db.documents.find_one({"file_id": file_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # SECURITY: client-role users may only download documents belonging to
    # their own linked client record (staff/partners keep full access).
    if user.get("role") == "client":
        user_client_id = user.get("client_id")
        if not user_client_id or file_doc.get("client_id") != user_client_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this document")
    
    # Support both object storage and direct MongoDB storage
    if file_doc.get("storage_path"):
        data, content_type = get_object(file_doc["storage_path"])
        return Response(content=data, media_type=file_doc.get("content_type", content_type))
    elif file_doc.get("data"):
        return Response(content=file_doc["data"], media_type=file_doc.get("content_type", "application/octet-stream"))
    else:
        raise HTTPException(status_code=404, detail="File data not found")
