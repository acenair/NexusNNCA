"""Iteration 13 tests for login, Google approval administration, and user status APIs."""

import re
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values


FRONTEND_ENV = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
# The environment variable (how the suite is invoked) wins over frontend/.env
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "")
).rstrip("/")
CREDENTIALS_PATH = Path(__file__).resolve().parents[1] / "test_credentials.md"


def credential_for(email: str) -> dict:
    content = CREDENTIALS_PATH.read_text(encoding="utf-8")
    row = re.search(
        rf"(?im)^\|[^|]*\|\s*{re.escape(email)}\s*\|\s*([^|\s]+)\s*\|",
        content,
    )
    if not row:
        pytest.skip(f"Credentials for {email} are unavailable")
    return {"email": email, "password": row.group(1)}


@pytest.fixture(scope="module")
def partner_auth():
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=credential_for("srinivas.anup@gmail.com"),
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "srinivas.anup@gmail.com"
    assert body["role"] == "partner"
    assert body["title"] == "Managing Partner"
    assert isinstance(body["session_token"], str) and body["session_token"]
    return {"Authorization": f"Bearer {body['session_token']}"}


@pytest.fixture(scope="module")
def staff_auth():
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=credential_for("fazil@nnadvisory.ae"),
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "staff"
    return {"Authorization": f"Bearer {body['session_token']}"}


def register_test_user(label: str, partner_headers: dict) -> dict:
    """Register through the public endpoint; current behavior returns a
    pending-approval acknowledgment (no session, no user payload). The created
    record is looked up via the partner users list."""
    unique = uuid.uuid4().hex[:10]
    email = f"TEST_{label}_{unique}@example.test"
    response = requests.post(
        f"{BASE_URL}/api/auth/register",
        params={"email": email, "password": "TEST_password_123", "name": f"TEST {label}"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "pending" in body.get("message", "").lower()
    # Security: public registration must NOT issue a session or user payload
    assert "session_token" not in body
    assert body.get("error") == "pending_approval"
    users_response = requests.get(
        f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=20
    )
    assert users_response.status_code == 200, users_response.text
    created = next(user for user in users_response.json() if user["email"] == email)
    assert created["status"] == "pending_approval"
    return {"email": email, "name": f"TEST {label}", "user_id": created["user_id"]}


class TestAuthAndUserStatuses:
    def test_partner_login_and_me(self, partner_auth):
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=partner_auth, timeout=20)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["email"] == "srinivas.anup@gmail.com"
        assert body["role"] == "partner"
        assert body["title"] == "Managing Partner"
        assert "_id" not in body and "password" not in body

    def test_settings_users_exposes_status_without_secrets(self, partner_auth):
        response = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_auth, timeout=20)
        assert response.status_code == 200, response.text
        users = response.json()
        assert isinstance(users, list) and users
        assert all("_id" not in user and "password" not in user for user in users)
        arjun = next(user for user in users if user["email"] == "srinivas.anup@gmail.com")
        assert arjun.get("status") in (None, "approved")

    def test_staff_cannot_approve_or_reject(self, staff_auth):
        for action in ("approve", "reject"):
            response = requests.patch(
                f"{BASE_URL}/api/settings/users/nonexistent/{action}",
                headers=staff_auth,
                json={},
                timeout=20,
            )
            assert response.status_code == 403, response.text
            assert response.json()["detail"] == "Partners only"

    def test_partner_gets_404_for_unknown_approval_targets(self, partner_auth):
        for action in ("approve", "reject"):
            response = requests.patch(
                f"{BASE_URL}/api/settings/users/TEST_missing/{action}",
                headers=partner_auth,
                json={},
                timeout=20,
            )
            assert response.status_code == 404, response.text
            assert response.json()["detail"] == "User not found"

    def test_partner_approve_persists_and_reject_removes(self, partner_auth):
        approve_user = register_test_user("approve", partner_auth)
        reject_user = register_test_user("reject", partner_auth)
        try:
            approve_response = requests.patch(
                f"{BASE_URL}/api/settings/users/{approve_user['user_id']}/approve",
                headers=partner_auth,
                json={},
                timeout=20,
            )
            assert approve_response.status_code == 200, approve_response.text
            assert "approved" in approve_response.json()["message"].lower()

            users_response = requests.get(
                f"{BASE_URL}/api/settings/users", headers=partner_auth, timeout=20
            )
            assert users_response.status_code == 200, users_response.text
            approved = next(
                user for user in users_response.json() if user["user_id"] == approve_user["user_id"]
            )
            assert approved["status"] == "approved"

            reject_response = requests.patch(
                f"{BASE_URL}/api/settings/users/{reject_user['user_id']}/reject",
                headers=partner_auth,
                json={},
                timeout=20,
            )
            assert reject_response.status_code == 200, reject_response.text
            assert "rejected and removed" in reject_response.json()["message"].lower()

            users_after = requests.get(
                f"{BASE_URL}/api/settings/users", headers=partner_auth, timeout=20
            ).json()
            assert all(user["user_id"] != reject_user["user_id"] for user in users_after)
        finally:
            for user_id in (approve_user["user_id"], reject_user["user_id"]):
                requests.patch(
                    f"{BASE_URL}/api/settings/users/{user_id}/reject",
                    headers=partner_auth,
                    json={},
                    timeout=20,
                )

    def test_public_register_does_not_issue_usable_session(self, partner_auth):
        """Registration must leave the account pending_approval with NO usable
        session — the approval flow is the only path to an active account."""
        created = register_test_user("approval_bypass", partner_auth)
        # Even if the pending user somehow obtains a token by logging in,
        # every gated lookup must reject the not-yet-approved account.
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": created["email"], "password": "TEST_password_123"},
            timeout=20,
        )
        assert login_response.status_code == 200, login_response.text
        pending_token = login_response.json().get("session_token")
        assert pending_token  # login itself is allowed; API access is not
        gated_response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {pending_token}"},
            timeout=20,
        )
        assert gated_response.status_code == 403, gated_response.text
        assert "pending" in gated_response.json()["detail"].lower()
        requests.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {pending_token}"},
            timeout=20,
        )
