"""Iteration 15 regression tests for Bearer auth, navigation APIs, and reset-data RBAC."""

import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values


FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")
TIMEOUT = 30


def credential_for(email: str) -> dict:
    if not CREDENTIALS_PATH.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = CREDENTIALS_PATH.read_text(encoding="utf-8")
    row = re.search(
        rf"(?im)^\|[^|]*\|\s*{re.escape(email)}\s*\|\s*([^|\s]+)\s*\|",
        content,
    )
    if not row:
        pytest.skip(f"Credentials for {email} are unavailable")
    return {"email": email, "password": row.group(1)}


def login(email: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/api/auth/login", json=credential_for(email), timeout=TIMEOUT
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert isinstance(body.get("session_token"), str) and body["session_token"]
    return body


@pytest.fixture(scope="module")
def partner_session():
    body = login("arjun@nnadvisory.ae")
    return body, {"Authorization": f"Bearer {body['session_token']}"}


@pytest.fixture(scope="module")
def staff_session():
    body = login("fazil@nnadvisory.ae")
    return body, {"Authorization": f"Bearer {body['session_token']}"}


class TestBearerAuthentication:
    """Validate Bearer authentication for the APIs loaded by protected routes."""

    def test_partner_login_response_and_me_via_bearer(self, partner_session):
        body, headers = partner_session
        assert body["role"] == "partner"
        assert body["title"] == "Managing Partner"
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        me = response.json()
        assert me["email"] == body["email"]
        assert me["role"] == "partner"
        assert "password" not in me and "_id" not in me

    def test_authorization_header_has_priority_over_conflicting_cookie(self, partner_session):
        body, headers = partner_session
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers,
            cookies={"session_token": "TEST_invalid_cookie"},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json()["email"] == body["email"]

    @pytest.mark.parametrize(
        ("path", "expected_type", "required_key"),
        [
            ("/api/dashboard/stats", dict, "active_clients"),
            ("/api/dashboard/activities", list, None),
            ("/api/tasks", list, None),
            ("/api/settings/rbac-public", dict, "config"),
            ("/api/settings/firm", dict, "firm_name"),
        ],
    )
    def test_protected_app_apis_accept_bearer(
        self, partner_session, path, expected_type, required_key
    ):
        _, headers = partner_session
        response = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body, expected_type)
        if required_key:
            assert required_key in body

    def test_logout_prioritizes_bearer_over_conflicting_cookie(self):
        partner = login("arjun@nnadvisory.ae")
        staff = login("fazil@nnadvisory.ae")
        partner_headers = {"Authorization": f"Bearer {partner['session_token']}"}
        staff_headers = {"Authorization": f"Bearer {staff['session_token']}"}
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/logout",
                headers=partner_headers,
                cookies={"session_token": staff["session_token"]},
                timeout=TIMEOUT,
            )
            assert response.status_code == 200, response.text
            assert response.json()["message"] == "Logged out"

            partner_me = requests.get(
                f"{BASE_URL}/api/auth/me", headers=partner_headers, timeout=TIMEOUT
            )
            staff_me = requests.get(
                f"{BASE_URL}/api/auth/me", headers=staff_headers, timeout=TIMEOUT
            )
            assert partner_me.status_code == 401, (
                "Logout should invalidate the explicit Bearer token even when a cookie is present; "
                f"got {partner_me.status_code}: {partner_me.text}"
            )
            assert staff_me.status_code == 200, (
                "A conflicting cookie session must not be logged out when an explicit Bearer token is sent; "
                f"got {staff_me.status_code}: {staff_me.text}"
            )
        finally:
            requests.post(
                f"{BASE_URL}/api/auth/logout", headers=partner_headers, timeout=TIMEOUT
            )
            requests.post(f"{BASE_URL}/api/auth/logout", headers=staff_headers, timeout=TIMEOUT)


class TestResetDataAdministration:
    """Validate stats shape, Managing Partner RBAC, and RESET confirmation safely."""

    def test_data_stats_returns_integer_collection_counts(self, partner_session):
        _, headers = partner_session
        response = requests.get(
            f"{BASE_URL}/api/admin/data-stats", headers=headers, timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        stats = response.json()
        assert isinstance(stats, dict) and stats
        for required in ("clients", "tasks", "documents", "users"):
            assert required in stats
            assert isinstance(stats[required], int) and stats[required] >= 0

    def test_data_stats_rejects_staff(self, staff_session):
        _, headers = staff_session
        response = requests.get(
            f"{BASE_URL}/api/admin/data-stats", headers=headers, timeout=TIMEOUT
        )
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Partners only"

    def test_reset_requires_authentication(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/reset-data",
            json={"confirm": "RESET", "collections": []},
            timeout=TIMEOUT,
        )
        assert response.status_code == 401, response.text
        assert response.json()["detail"] == "Not authenticated"

    def test_reset_rejects_staff_even_with_confirmation(self, staff_session):
        _, headers = staff_session
        response = requests.post(
            f"{BASE_URL}/api/admin/reset-data",
            headers=headers,
            json={"confirm": "RESET", "collections": ["TEST_not_a_collection"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Only Managing Partner can reset data"

    def test_reset_rejects_wrong_confirmation(self, partner_session):
        _, headers = partner_session
        response = requests.post(
            f"{BASE_URL}/api/admin/reset-data",
            headers=headers,
            json={"confirm": "reset", "collections": ["TEST_not_a_collection"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 400, response.text
        assert response.json()["detail"] == "Type 'RESET' to confirm"

    def test_managing_partner_with_reset_confirmation_is_accepted_safely(
        self, partner_session
    ):
        _, headers = partner_session
        response = requests.post(
            f"{BASE_URL}/api/admin/reset-data",
            headers=headers,
            json={"confirm": "RESET", "collections": ["TEST_not_a_collection"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["message"] == "Reset 0 collection(s)"
        assert body["deleted"] == {}
