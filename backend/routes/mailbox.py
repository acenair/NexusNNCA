"""Routes / mailbox — client-email nudges from the firm's shared Google Workspace inboxes.

Reads recent mail from the configured mailboxes (care@, tax@, audit@, ...) via a
service account with domain-wide delegation (gmail.readonly), matches senders
against the client master, and surfaces unread client emails as bell notifications.

Env (VPS .env): GOOGLE_SERVICE_ACCOUNT_JSON = the service-account key JSON (inline
or a path), MAILBOXES = comma-separated addresses (default: the firm's shared boxes).
"""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from datetime import datetime, timezone
from core import db, get_current_user
import json
import os
import re as _re

router = APIRouter(prefix="/api")

DEFAULT_MAILBOXES = "care@nairnelliyatt.com,tax@nairnelliyatt.com,audit@nairnelliyatt.com,compliance@nairnelliyatt.com,info@nairnelliyatt.com"


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
    last = await db.mailbox_polls.find_one({"type": "last_poll"}, {"_id": 0})
    return {"configured": bool(sa), "mailboxes": boxes, "unread_emails": unread, "last_poll": last}


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
async def list_mail_emails(days: int = 14, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    cutoff = datetime.now(timezone.utc).isoformat()
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = await db.mailbox_emails.find({"date": {"$gte": since[:10]}}, {"_id": 0}).sort("date", -1).to_list(100)
    return {"emails": rows}


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
