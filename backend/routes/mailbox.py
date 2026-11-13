"""Routes / mailbox — client-email nudges from the firm's shared Google Workspace inboxes.

Reads recent mail from the configured mailboxes (care@, tax@, audit@, ...) via a
service account with domain-wide delegation (gmail.readonly), matches senders
against the client master, and surfaces unread client emails as bell notifications.

Env (VPS .env): GOOGLE_SERVICE_ACCOUNT_JSON = the service-account key JSON (inline
or a path), MAILBOXES = comma-separated addresses (default: the firm's shared boxes).
"""
from fastapi import APIRouter
from fastapi import Body
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from datetime import datetime, timezone, timedelta, date
from core import db, get_current_user, put_object, APP_NAME
import base64
import json
import os
import re as _re
import uuid

router = APIRouter(prefix="/api")

DEFAULT_MAILBOXES = "care@nairnelliyatt.com,tax@nairnelliyatt.com,audit@nairnelliyatt.com,compliance@nairnelliyatt.com,info@nairnelliyatt.com"
GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"


def _gmail_service(scopes=(GMAIL_READONLY,), subject=None):
    sa, _ = _sa_info()
    if not sa:
        return None
    from google.oauth2 import service_account as sa_creds
    from googleapiclient.discovery import build
    creds = sa_creds.Credentials.from_service_account_info(sa, scopes=list(scopes))
    if subject:
        creds = creds.with_subject(subject)  # impersonate the mailbox the mail was polled from
    return build("gmail", "v1", credentials=creds)


def _mailboxes():
    raw = os.environ.get("MAILBOXES", DEFAULT_MAILBOXES)
    return [m.strip().lower() for m in raw.split(",") if m.strip()]


def _sa_info():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        return None, None
    if raw.strip().startswith("{"):
        try:
            return json.loads(raw), raw
        except Exception:
            return None, None
    try:
        with open(raw) as f:
            return json.load(f), raw
    except Exception:
        return None, None


@router.get("/mailbox/status")
async def mailbox_status(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    sa, _ = _sa_info()
    boxes = _mailboxes()
    unread = await db.mailbox_emails.count_documents({"seen": {"$ne": True}})
    filed = await db.mailbox_emails.count_documents({"filed": True})
    last = await db.mailbox_polls.find_one({"type": "last_poll"}, {"_id": 0})
    return {"configured": bool(sa), "mailboxes": boxes, "unread_emails": unread, "filed_emails": filed, "last_poll": last}


@router.post("/mailbox/poll")
async def mailbox_poll(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Manual check — same job the background loop runs."""
    user = await get_current_user(authorization, session_token)
    result = await poll_mailboxes()
    return result


@router.post("/mailbox/emails/{email_id}/dismiss")
async def dismiss_mail(email_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await db.mailbox_emails.update_one({"email_id": email_id}, {"$set": {"seen": True, "seen_by": user.get("name")}})
    return {"ok": True}


@router.get("/mailbox/emails")
async def list_mail_emails(days: int = 14, mailbox: str = None, filing_state: str = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = {"date": {"$gte": since[:10]}}
    if mailbox:
        q["mailbox"] = mailbox
    if filing_state == "filed":
        q["filed"] = True
    elif filing_state == "unfiled":
        q["filed"] = {"$ne": True}
    rows = await db.mailbox_emails.find(q, {"_id": 0}).sort("date", -1).to_list(100)
    return {"emails": rows}


@router.get("/mailbox/emails/{email_id}")
async def email_detail(email_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Stored metadata + live attachment list from Gmail."""
    user = await get_current_user(authorization, session_token)
    stored = await db.mailbox_emails.find_one({"email_id": email_id}, {"_id": 0})
    if not stored:
        raise HTTPException(404, "Email not in the poll cache")
    attachments = []
    snippet = stored.get("subject", "")
    try:
        service = _gmail_service(subject=stored.get("mailbox"))
        if service:
            msg = service.users().messages().get(userId="me", id=email_id, format="full").execute()
            for part in msg.get("payload", {}).get("parts", []):
                fn = part.get("filename")
                body = part.get("body", {})
                if fn and body.get("attachmentId"):
                    attachments.append({"attachment_id": body["attachmentId"], "filename": fn,
                                        "mime_type": part.get("mimeType", "application/octet-stream"),
                                        "size": body.get("size", 0)})
            if msg.get("snippet"):
                snippet = msg["snippet"]
    except Exception as e:
        stored["gmail_error"] = str(e)[:200]
    stored["attachments"] = attachments
    stored["snippet"] = snippet[:500]
    return stored


@router.post("/mailbox/emails/{email_id}/file")
async def file_email(email_id: str, payload: dict = Body(default=None),
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    """File an email to a client: attachments (and the original .eml) land in the
    Documents module and sync to the client's Drive folder. Marks the nudge handled."""
    user = await get_current_user(authorization, session_token)
    client_id = (payload or {}).get("client_id")
    document_type = (payload or {}).get("document_type") or "Client email"
    if not client_id:
        raise HTTPException(422, "client_id is required")
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0, "name": 1})
    if not client:
        raise HTTPException(404, "Unknown client")

    stored = await db.mailbox_emails.find_one({"email_id": email_id})
    if not stored:
        raise HTTPException(404, "Email not in the poll cache")
    if stored.get("filed"):
        return {"ok": True, "already_filed": True, "filed_file_ids": stored.get("filed_file_ids", [])}

    service = _gmail_service(subject=stored.get("mailbox"))
    if not service:
        raise HTTPException(503, "Gmail service account not configured")
    try:
        msg = service.users().messages().get(userId="me", id=email_id, format="full").execute()
    except Exception as e:
        raise HTTPException(502, f"Could not read the email from Gmail: {str(e)[:150]}")

    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    subject = headers.get("subject", "(no subject)")
    date_hdr = headers.get("date", "")
    try:
        from email.utils import parsedate_to_datetime
        received = parsedate_to_datetime(date_hdr)
    except Exception:
        received = datetime.now(timezone.utc)
    received_str = received.strftime("%Y-%m-%d")

    filed_file_ids = []
    client_name = client["name"]

    async def _store(filename, data, mime, ftype):
        ext = filename.rsplit(".", 1)[-1][:8] if "." in filename else "bin"
        file_id = f"file_{uuid.uuid4().hex[:12]}"
        path = f"{APP_NAME}/uploads/{user['user_id']}/{file_id}.{ext}"
        result = put_object(path, data, mime)
        doc = {
            "file_id": file_id, "storage_path": result["path"],
            "original_filename": filename, "filename": filename, "content_type": mime,
            "size": result["size"], "client_id": client_id, "client_name": client_name,
            "document_type": ftype, "uploaded_by": user["user_id"],
            "uploaded_via": "email-filing", "source_email_id": email_id,
            "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # best-effort Drive sync — same as the manual upload route
        try:
            from services.drive import get_drive_service, get_or_create_drive_folder, resolve_upload_subfolders
            dsvc = await get_drive_service()
            if dsvc:
                subs = await resolve_upload_subfolders(db, client_id, ftype, received.year)
                folder_id = await get_or_create_drive_folder(dsvc, client_name, subs)
                from googleapiclient.http import MediaIoBaseUpload
                import io as _io
                media = MediaIoBaseUpload(_io.BytesIO(data), mimetype=mime)
                drive_file = dsvc.files().create(
                    body={"name": filename, "parents": [folder_id]},
                    media_body=media, fields="id,name,webViewLink").execute()
                doc["drive_file_id"] = drive_file["id"]
                doc["drive_link"] = drive_file.get("webViewLink")
                doc["synced_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as drive_err:
            doc["drive_sync_error"] = str(drive_err)[:200]
        await db.documents.insert_one(doc)
        filed_file_ids.append(file_id)
        return file_id

    # 1) attachments
    for part in msg.get("payload", {}).get("parts", []):
        fn = part.get("filename")
        body = part.get("body", {})
        if fn and body.get("attachmentId"):
            try:
                att = service.users().messages().attachments().get(
                    userId="me", messageId=email_id, id=body["attachmentId"]).execute()
                data = base64.urlsafe_b64decode(att["data"])
                safe_fn = _re.sub(r'[^\w\-. ()\[\]]', '_', fn)[:120]
                await _store(safe_fn, data, part.get("mimeType", "application/octet-stream"), document_type)
            except Exception as att_err:
                await db.mailbox_emails.update_one({"email_id": email_id},
                    {"$push": {"file_errors": f"{fn}: {str(att_err)[:150]}"}})

    # 2) the original email as .eml for the audit trail
    try:
        raw = service.users().messages().get(userId="me", id=email_id, format="raw").execute()
        eml = base64.urlsafe_b64decode(raw["raw"])
        eml_name = f"Email - {subject[:80].strip() or 'no-subject'} - {received_str}.eml"
        eml_name = _re.sub(r'[^\w\-. ()\[\]]', '_', eml_name)
        await _store(eml_name, eml, "message/rfc822", "Client email")
    except Exception as eml_err:
        await db.mailbox_emails.update_one({"email_id": email_id},
            {"$push": {"file_errors": f"eml: {str(eml_err)[:150]}"}})

    await db.mailbox_emails.update_one({"email_id": email_id}, {"$set": {
        "filed": True, "filed_client_id": client_id, "filed_client_name": client_name,
        "filed_file_ids": filed_file_ids, "filed_by": user.get("name"),
        "filed_at": datetime.now(timezone.utc).isoformat(), "seen": True,
        "seen_by": user.get("name")}})
    return {"ok": True, "filed_file_ids": filed_file_ids, "client_name": client_name}


# ---------------- Google Calendar: compliance deadline sync ----------------

def _calendar_service():
    sa, _ = _sa_info()
    if not sa:
        return None
    from google.oauth2 import service_account as sa_creds
    from googleapiclient.discovery import build
    creds = sa_creds.Credentials.from_service_account_info(sa, scopes=[CALENDAR_SCOPE])
    return build("calendar", "v3", credentials=creds)


@router.post("/calendar/sync-deadlines")
async def sync_deadlines(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Upsert upcoming regulatory deadlines + task due dates onto a dedicated
    'NNCA Compliance' Google Calendar. Idempotent via deterministic event ids."""
    user = await get_current_user(authorization, session_token)
    cal = _calendar_service()
    if not cal:
        raise HTTPException(503, "Google service account not configured")
    from googleapiclient.errors import HttpError
    try:
        cal_list = cal.calendarList().list().execute().get("items", [])
        cal_obj = next((c for c in cal_list if c.get("summary") == "NNCA Compliance"), None)
        if not cal_obj:
            cal_obj = cal.calendars().insert(body={"summary": "NNCA Compliance",
                                                   "timeZone": "Asia/Dubai"}).execute()
        cal_id = cal_obj["id"]
    except HttpError as e:
        detail = b""
        if getattr(e, "content", None):
            detail = e.content[:220]
        raise HTTPException(502, f"Calendar API not available yet — add the calendar scope to the domain-wide delegation entry. {detail}")
    except Exception as e:
        raise HTTPException(502, f"Calendar error: {str(e)[:180]}")

    try:
        from routes.insights import regulatory_deadlines
        reg = await regulatory_deadlines(within_days=90, authorization=authorization, session_token=session_token)
        reg_items = reg.get("deadlines", []) if isinstance(reg, dict) else reg
    except Exception:
        reg_items = []
    today = date.today()
    upcoming_tasks = await db.tasks.find(
        {"due_date": {"$gte": today.isoformat(), "$lte": (today + timedelta(days=90)).isoformat()},
         "status": {"$ne": "Completed"}},
        {"_id": 0, "task_id": 1, "title": 1, "due_date": 1, "client_name": 1}).to_list(200)

    pushed, updated = 0, 0

    async def _upsert(kind, ref_id, title, due_iso, color):
        nonlocal pushed, updated
        nnca_key = f"{kind}-{ref_id}"  # single colon rule: the filter param is key:value
        body = {"summary": title, "start": {"date": due_iso}, "end": {"date": due_iso},
                "colorId": color, "transparency": "transparent",
                "extendedProperties": {"private": {"nnca_key": nnca_key, "nnca_kind": kind, "nnca_ref": ref_id}}}
        # Custom event ids are rejected on some calendars — match on our private property instead.
        existing = cal.events().list(calendarId=cal_id, privateExtendedProperty=f"nnca_key:{nnca_key}",
                                     maxResults=1).execute().get("items", [])
        if existing:
            cal.events().update(calendarId=cal_id, eventId=existing[0]["id"], body=body).execute()
            updated += 1
        else:
            cal.events().insert(calendarId=cal_id, body=body).execute()
            pushed += 1

    for d in (reg_items or []):
        due = d.get("due") or d.get("due_date")
        if not due:
            continue
        due_iso = str(due)[:10]
        label = d.get("label") or d.get("title") or "Regulatory deadline"
        client = d.get("client") or ""
        title = f"{label}" + (f" — {client}" if client else "")
        await _upsert("reg", str(d.get("ref_id") or label)[:40], title, due_iso, "11")
    for t in upcoming_tasks:
        if not t.get("due_date"):
            continue
        title = (t.get("title", "Task") + (f" — {t['client_name']}" if t.get("client_name") else ""))[:200]
        await _upsert("task", str(t.get("task_id"))[:40], title, str(t["due_date"])[:10], "5")

    await db.calendar_syncs.update_one({"type": "last_sync"}, {"$set": {
        "type": "last_sync", "at": datetime.now(timezone.utc).isoformat(),
        "by": user.get("name"), "pushed": pushed, "updated": updated}}, upsert=True)
    return {"ok": True, "calendar_id": cal_id, "pushed": pushed, "updated": updated}


@router.get("/calendar/sync-status")
async def calendar_sync_status(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    last = await db.calendar_syncs.find_one({"type": "last_sync"}, {"_id": 0})
    sa, _ = _sa_info()
    return {"configured": bool(sa), "last_sync": last}


async def poll_mailboxes():
    """Read recent messages from each mailbox; store unseen ones with client matching."""
    sa, _ = _sa_info()
    if not sa:
        return {"ok": False, "reason": "Service account not configured (GOOGLE_SERVICE_ACCOUNT_JSON)"}
    try:
        from google.oauth2 import service_account as sa_creds
        from googleapiclient.discovery import build
        creds = sa_creds.Credentials.from_service_account_info(sa, scopes=["https://www.googleapis.com/auth/gmail.readonly"])
    except Exception as e:
        return {"ok": False, "reason": f"Service account key invalid: {str(e)[:150]}"}

    client_emails = {}
    async for c in db.clients.find({"status": {"$ne": "Deleted"}}, {"_id": 0, "name": 1, "contact_email": 1, "secondary_contact": 1}):
        for e in [c.get("contact_email"), c.get("secondary_contact")]:
            if e:
                client_emails[str(e).strip().lower()] = c["name"]
        client_emails[(c.get("name") or "").lower()] = c["name"]

    new_count = 0
    checked = []
    for box in _mailboxes():
        try:
            box_creds = creds.with_subject(box)
            service = build("gmail", "v1", credentials=box_creds)
            poll_state = await db.mailbox_polls.find_one({"type": "mailbox", "mailbox": box}) or {}
            last_id = poll_state.get("last_message_id")
            msgs = service.users().messages().list(userId="me", maxResults=15, q="in:inbox").execute().get("messages", [])
            if not msgs:
                checked.append({"mailbox": box, "new": 0})
                continue
            box_new = 0
            stop_at = None
            for m in msgs:
                mid = m["id"]
                if last_id and mid == last_id:
                    break  # reached what we saw last time
                stop_at = mid  # remember the newest for the state
                meta = service.users().messages().get(userId="me", id=mid, format="metadata",
                                                      metadataHeaders=["From", "Subject", "Date"]).execute()
                headers = {h["name"].lower(): h["value"] for h in meta.get("payload", {}).get("headers", [])}
                frm = headers.get("from", "")
                subject = headers.get("subject", "(no subject)")
                date_hdr = headers.get("date", "")
                try:
                    from email.utils import parsedate_to_datetime
                    date_iso = parsedate_to_datetime(date_hdr).isoformat()
                except Exception:
                    date_iso = datetime.now(timezone.utc).isoformat()
                frm_email = ""
                mm = _re.search(r"<([^>]+)>", frm)
                frm_email = (mm.group(1) if mm else frm).strip().lower()
                client_match = client_emails.get(frm_email) or client_emails.get(frm_email.split("@")[-1] and "") or None
                if not client_match:
                    # match by domain too (client domains are unique enough)
                    dom = frm_email.split("@")[-1] if "@" in frm_email else ""
                    client_match = next((cname for cdom, cname in _domain_map(client_emails).items() if cdom == dom), None)
                exists = await db.mailbox_emails.find_one({"email_id": mid})
                if exists:
                    continue
                box_new += 1
                await db.mailbox_emails.insert_one({
                    "email_id": mid, "mailbox": box, "from_email": frm_email, "from_name": frm,
                    "subject": subject[:200], "date": date_iso[:19],
                    "client_name": client_match, "is_client": bool(client_match),
                    "seen": False, "fetched_at": datetime.now(timezone.utc).isoformat(),
                })
                new_count += 1
            if stop_at:
                await db.mailbox_polls.update_one(
                    {"type": "mailbox", "mailbox": box},
                    {"$set": {"type": "mailbox", "mailbox": box, "last_message_id": stop_at,
                              "polled_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True)
            checked.append({"mailbox": box, "new": box_new})
        except Exception as e:
            checked.append({"mailbox": box, "error": str(e)[:150]})

    await db.mailbox_polls.update_one(
        {"type": "last_poll"},
        {"$set": {"type": "last_poll", "at": datetime.now(timezone.utc).isoformat(), "new": new_count,
                  "mailboxes": [c.get("mailbox") + (":" + str(c.get("new", 0)) if "new" in c else ":error") for c in checked]}},
        upsert=True)
    return {"ok": True, "new": new_count, "checked": checked}


def _domain_map(client_emails):
    """client email domain -> client name (first hit wins)."""
    out = {}
    for e, name in client_emails.items():
        if "@" in e:
            dom = e.split("@")[-1]
            out.setdefault(dom, name)
    return out
