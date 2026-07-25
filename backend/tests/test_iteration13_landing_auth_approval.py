"""Iteration 13 tests for login, Google approval administration, and user status APIs."""

import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values


frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")


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
        json=credential_for("arjun@nnadvisory.ae"),
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "arjun@nnadvisory.ae"
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


def register_test_user(label: str) -> dict:
    unique = uuid.uuid4().hex[:10]
    email = f"TEST_{label}_{unique}@example.test"
    response = requests.post(
        f"{BASE_URL}/api/auth/register",
        params={"email": email, "password": "TEST_password_123", "name": f"TEST {label}"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert body["name"] == f"TEST {label}"
    assert isinstance(body["user_id"], str) and body["user_id"].startswith("user_")
    return body


class TestAuthAndUserStatuses:
    def test_partner_login_and_me(self, partner_auth):
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=partner_auth, timeout=20)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["email"] == "arjun@nnadvisory.ae"
        assert body["role"] == "partner"
        assert body["title"] == "Managing Partner"
        assert "_id" not in body and "password" not in body

    def test_settings_users_exposes_status_without_secrets(self, partner_auth):
        response = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_auth, timeout=20)
        assert response.status_code == 200, response.text
        users = response.json()
        assert isinstance(users, list) and users
        assert all("_id" not in user and "password" not in user for user in users)
        arjun = next(user for user in users if user["email"] == "arjun@nnadvisory.ae")
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
        approve_user = register_test_user("approve")
        reject_user = register_test_user("reject")
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

    def test_public_register_issues_immediately_usable_session(self, partner_auth):
        """Capture the current approval-bypass behavior for security review."""
        created = register_test_user("approval_bypass")
        try:
            auth = {"Authorization": f"Bearer {created['session_token']}"}
            me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth, timeout=20)
            assert me_response.status_code == 200, me_response.text
            assert me_response.json()["email"] == created["email"]
        finally:
            requests.patch(
                f"{BASE_URL}/api/settings/users/{created['user_id']}/reject",
                headers=partner_auth,
                json={},
                timeout=20,
            )
