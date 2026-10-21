"""Google OAuth sign-in for firm staff (self-hosted, no platform dependency).

Flow:
  GET /api/auth/google/status  -> {enabled}
  GET /api/auth/google/start   -> 302 to Google consent (CSRF state stored in DB, 10-min TTL)
  GET /api/auth/google/callback -> exchange code, verify email domain, create session,
                                   redirect to /login?token=<jwt> (frontend stores it)

Access rules: the Google email must be on an allowed firm domain
(GOOGLE_ALLOWED_DOMAINS, default nairnelliyatt.com,nn-ca.com) AND match an
existing user account. Unknown emails are redirected with an error — accounts
are provisioned by partners (register flow keeps pending-approval semantics).

Env (set in the VPS .env, never in the repo):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  GOOGLE_REDIRECT_URI (default: https://app.nairnelliyatt.com/api/auth/google/callback)
  GOOGLE_ALLOWED_DOMAINS (default: nairnelliyatt.com,nn-ca.com)
"""
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import APIRouter
from fastapi import Cookie
from fastapi.responses import RedirectResponse

from core import db, create_jwt_token

router = APIRouter(prefix="/api")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _client_id():
    return os.environ.get("GOOGLE_CLIENT_ID", "")


def _client_secret():
    return os.environ.get("GOOGLE_CLIENT_SECRET", "")


def _redirect_uri():
    return os.environ.get("GOOGLE_REDIRECT_URI", "https://app.nairnelliyatt.com/api/auth/google/callback")


def _allowed_domains():
    raw = os.environ.get("GOOGLE_ALLOWED_DOMAINS", "nairnelliyatt.com,nn-ca.com")
    return {d.strip().lower() for d in raw.split(",") if d.strip()}


@router.get("/auth/google/status")
async def google_status():
    return {"enabled": bool(_client_id() and _client_secret())}


@router.get("/auth/google/start")
async def google_start():
    if not (_client_id() and _client_secret()):
        return RedirectResponse("/login?google_error=disabled")
    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })
    params = urlencode({
        "client_id": _client_id(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    })
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/auth/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse(f"/login?google_error={error}")
    if not code or not state:
        return RedirectResponse("/login?google_error=missing_code")

    st = await db.oauth_states.find_one({"state": state})
    if not st:
        return RedirectResponse("/login?google_error=bad_state")
    await db.oauth_states.delete_one({"state": state})
    if st.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        return RedirectResponse("/login?google_error=expired_state")

    token_res = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": _redirect_uri(),
        "grant_type": "authorization_code",
    }, timeout=15)
    if token_res.status_code != 200:
        return RedirectResponse("/login?google_error=token_exchange")
    id_token_info = requests.get(
        GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token_res.json()['access_token']}"}, timeout=15)
    if id_token_info.status_code != 200:
        return RedirectResponse("/login?google_error=userinfo")
    info = id_token_info.json()
    email = (info.get("email") or "").strip().lower()
    if not email:
        return RedirectResponse("/login?google_error=no_email")

    domain = email.split("@")[-1]
    if domain not in _allowed_domains():
        return RedirectResponse("/login?google_error=domain_not_allowed")

    user_doc = await db.users.find_one({"email": email})
    if not user_doc:
        return RedirectResponse("/login?google_error=not_registered")
    if user_doc.get("status") == "pending_approval":
        return RedirectResponse("/login?google_error=pending_approval")

    session_token = create_jwt_token(user_doc["user_id"])
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "via": "google",
    })
    return RedirectResponse(f"/login?token={session_token}")


@router.post("/auth/google/exchange")
async def google_exchange(token: str = ""):
    """Frontend trades the one-time ?token= for the user profile (validates the JWT)."""
    from fastapi import HTTPException
    from fastapi import Header
    if not token:
        raise HTTPException(status_code=400, detail="Missing token")
    from core import get_current_user_raw  # local import: validates session JWT
    class _Stub:
        def __init__(self, t): self.authorization = f"Bearer {t}"
    try:
        user = await get_current_user_raw(_Stub(token).authorization, "")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    return {
        "user_id": user["user_id"], "email": user.get("email"), "name": user.get("name"),
        "title": user.get("title"), "role": user.get("role", "staff"),
        "picture": user.get("picture"),
        "must_change_password": bool(user.get("must_change_password")),
    }
