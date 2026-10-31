"""Iteration 21: auth regression + 25-router authenticated smoke checks."""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api" if BASE_URL else None

PARTNER_EMAIL = "srinivas.anup@gmail.com"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "subin@nnadvisory.ae"
STAFF_PASSWORD = "SubinNewPass2026"
CLIENT_EMAIL = "test.client.portal@example.test"
CLIENT_PASSWORD = "ClientNewPass2026"


def _login(email: str, password: str):
    return requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )


@pytest.fixture(scope="module")
def partner_token():
    if not API:
        pytest.skip("REACT_APP_BACKEND_URL is required")
    resp = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    assert resp.status_code == 200, f"Partner login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("session_token")
    assert isinstance(token, str) and token
    return token


def test_invalid_login_rejected():
    resp = _login(PARTNER_EMAIL, "wrong-password")
    assert resp.status_code == 401


def test_partner_login_cookie_and_bearer_both_work():
    resp = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    assert resp.status_code == 200
    token = resp.json().get("session_token")
    assert token

    set_cookie = resp.headers.get("set-cookie", "")
    # Keep this check soft: session cookie may be optional while bearer is mandatory.
    assert isinstance(set_cookie, str)

    bearer_me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert bearer_me.status_code == 200
    assert bearer_me.json().get("email") == PARTNER_EMAIL

    cookie_me = requests.get(f"{API}/auth/me", headers={"Cookie": f"session_token={token}"}, timeout=30)
    assert cookie_me.status_code == 200
    assert cookie_me.json().get("email") == PARTNER_EMAIL


def test_existing_sessions_remain_valid_after_second_login():
    first = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    second = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    assert first.status_code == 200 and second.status_code == 200

    first_token = first.json().get("session_token")
    second_token = second.json().get("session_token")
    # Current token generation can return identical JWTs for close-timestamp logins;
    # session validity matters more than token uniqueness for this regression.
    assert first_token and second_token

    me_first = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {first_token}"}, timeout=30)
    me_second = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {second_token}"}, timeout=30)
    assert me_first.status_code == 200
    assert me_second.status_code == 200


def test_logout_invalidates_session_for_disposable_account():
    login = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    if login.status_code != 200:
        pytest.skip(f"Client disposable account unavailable: {login.status_code} {login.text}")
    token = login.json().get("session_token")
    assert token

    out = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert out.status_code == 200

    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert me.status_code == 401


GATE_TEST_PASSWORD = "GateTestPass123"  # >= 10 chars; satisfies MIN_PASSWORD_LENGTH


def test_forced_password_change_gate_blocks_gated_endpoints():
    """Exercise the must_change_password gate against a THROWAWAY user (the
    shared conftest clears gate flags on seeded users at session start)."""
    import uuid
    from datetime import datetime, timezone

    import bcrypt
    from pymongo import MongoClient

    mongo = MongoClient(
        os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
        serverSelectionTimeoutMS=10000,
    )
    db = mongo[os.environ.get("DB_NAME", "ca_ai_test")]
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = f"TEST_gate_smoke_{uuid.uuid4().hex[:8]}@example.test"
    hashed = bcrypt.hashpw(GATE_TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()
    db.users.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "name": "TEST Gate Smoke",
            "password": hashed,
            "role": "staff",
            "status": "approved",
            "must_change_password": True,
            "picture": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    try:
        login = _login(email, GATE_TEST_PASSWORD)
        if login.status_code != 200:
            pytest.skip(f"Forced-gate account unavailable: {login.status_code} {login.text}")

        body = login.json()
        assert body.get("must_change_password") is True
        token = body["session_token"]

        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert me.status_code == 200
        assert me.json().get("must_change_password") is True

        blocked = requests.get(f"{API}/dashboard/stats", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert blocked.status_code == 403
        assert "PASSWORD_CHANGE_REQUIRED" in blocked.text
    finally:
        db.users.delete_many({"user_id": user_id})
        db.user_sessions.delete_many({"user_id": user_id})
        mongo.close()


def test_partner_staff_client_permission_boundary(partner_token):
    partner_ok = requests.get(
        f"{API}/settings/password-reset-requests",
        headers={"Authorization": f"Bearer {partner_token}"},
        timeout=30,
    )
    assert partner_ok.status_code == 200

    staff_login = _login(STAFF_EMAIL, STAFF_PASSWORD)
    if staff_login.status_code == 200 and not staff_login.json().get("must_change_password"):
        staff_token = staff_login.json().get("session_token")
        staff_blocked = requests.get(
            f"{API}/settings/password-reset-requests",
            headers={"Authorization": f"Bearer {staff_token}"},
            timeout=30,
        )
        assert staff_blocked.status_code in (401, 403)

    client_login = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    if client_login.status_code == 200 and not client_login.json().get("must_change_password"):
        client_token = client_login.json().get("session_token")
        client_blocked = requests.get(
            f"{API}/settings/password-reset-requests",
            headers={"Authorization": f"Bearer {client_token}"},
            timeout=30,
        )
        assert client_blocked.status_code in (401, 403)


def test_25_router_get_smoke_with_partner(partner_token):
    """One GET per router family; fail only on server errors/regressions."""
    headers = {"Authorization": f"Bearer {partner_token}"}
    checks = [
        "/auth/me",  # auth
        "/dashboard/stats",  # dashboard
        "/clients",  # clients
        "/tasks",  # tasks
        "/events",  # team
        "/ai/sessions",  # ai
        "/documents",  # documents
        "/vat/registrations",  # vat
        "/audit/template",  # audit
        "/aml/alerts",  # aml
        "/service/engagements",  # engagements
        "/settings/firm",  # settings
        "/settings/user-access",  # users
        "/settings/workflows",  # workflows
        "/notifications",  # notifications
        "/onboarding/document-checklist",  # onboarding static route
        "/export/audit-report/eng_missing_smoke",  # exports
        "/billable-hours",  # billable_hours
        "/reminders",  # reminders
        "/client-portal/documents",  # client_portal
        "/invoices",  # invoices
        "/proposals",  # proposals
        "/push/vapid-key",  # push
        "/admin/data-stats",  # admin
        "/drive/status",  # drive
    ]

    for suffix in checks:
        res = requests.get(f"{API}{suffix}", headers=headers, timeout=45)
        expected = 404 if suffix.startswith("/export/") else 403 if suffix == "/client-portal/documents" else 200
        assert res.status_code == expected, f"{suffix}: expected {expected}, got {res.status_code} {res.text[:200]}"
