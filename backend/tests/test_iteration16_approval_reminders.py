"""Iteration 16 tests for bypass approval and service-based reminder routing."""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values


BASE_URL = (dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL") or "").rstrip("/")
CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")
TIMEOUT = 30


def credentials_for(email: str) -> dict:
    """Read the requested account from the required shared credentials file."""
    if not CREDENTIALS_PATH.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = CREDENTIALS_PATH.read_text(encoding="utf-8")
    password_match = re.search(
        rf"(?im)^.*`{re.escape(email)}`\s*/\s*`([^`]+)`.*$", content
    )
    if not password_match:
        pytest.skip(f"Credentials for {email} are unavailable")
    return {"email": email, "password": password_match.group(1)}


def login(email: str) -> tuple[dict, dict]:
    response = requests.post(
        f"{BASE_URL}/api/auth/login", json=credentials_for(email), timeout=TIMEOUT
    )
    if response.status_code != 200:
        pytest.fail(f"Authentication failed for {email}: {response.status_code} {response.text}")
    body = response.json()
    assert body["email"] == email
    assert isinstance(body.get("session_token"), str) and body["session_token"]
    return body, {"Authorization": f"Bearer {body['session_token']}"}


@pytest.fixture(scope="module")
def partner_session():
    return login("arjun@nnadvisory.ae")


@pytest.fixture(scope="module")
def staff_session():
    return login("fazil@nnadvisory.ae")


@pytest.fixture(scope="module")
def other_staff_session():
    return login("subin@nnadvisory.ae")


@pytest.fixture(scope="module")
def first_client(partner_session):
    _, headers = partner_session
    response = requests.get(f"{BASE_URL}/api/clients", headers=headers, timeout=TIMEOUT)
    assert response.status_code == 200, response.text
    clients = response.json()
    assert isinstance(clients, list) and clients, "At least one seeded client is required"
    assert isinstance(clients[0].get("client_id"), str)
    return clients[0]


@pytest.fixture(scope="module")
def original_reminder_config(partner_session):
    _, headers = partner_session
    response = requests.get(
        f"{BASE_URL}/api/settings/reminder-config", headers=headers, timeout=TIMEOUT
    )
    assert response.status_code == 200, response.text
    body = response.json()
    yield {
        "aml_designated_staff": body.get("aml_designated_staff", ""),
        "audit_client_mapping": body.get("audit_client_mapping", {}),
    }
    requests.patch(
        f"{BASE_URL}/api/settings/reminder-config",
        headers=headers,
        json={
            "aml_designated_staff": body.get("aml_designated_staff", ""),
            "audit_client_mapping": body.get("audit_client_mapping", {}),
        },
        timeout=TIMEOUT,
    )


def create_engagement(headers: dict, client: dict, suffix: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/api/service/engagements",
        headers=headers,
        json={
            "service_type": "aml_review",
            "client_id": client["client_id"],
            "notes": f"TEST_iter16_{suffix}",
        },
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    engagement = response.json()
    assert engagement["status"] == "Active"
    assert engagement["checklist"]
    return engagement


def find_engagement(headers: dict, engagement_id: str) -> dict:
    response = requests.get(
        f"{BASE_URL}/api/service/engagements", headers=headers, timeout=TIMEOUT
    )
    assert response.status_code == 200, response.text
    return next(e for e in response.json() if e["engagement_id"] == engagement_id)


def archive_engagement(headers: dict, engagement_id: str) -> None:
    requests.patch(
        f"{BASE_URL}/api/service/engagements/{engagement_id}",
        headers=headers,
        params={"status": "Deleted"},
        json={},
        timeout=TIMEOUT,
    )


class TestEngagementBypassApproval:
    """Validate partner-only approval, persisted checklist completion, and normal toggling."""

    def test_staff_is_forbidden_and_partner_approval_persists(
        self, partner_session, staff_session, first_client
    ):
        partner, partner_headers = partner_session
        _, staff_headers = staff_session
        engagement = create_engagement(partner_headers, first_client, "approve")
        engagement_id = engagement["engagement_id"]
        try:
            denied = requests.post(
                f"{BASE_URL}/api/service/engagements/{engagement_id}/approve",
                headers=staff_headers,
                json={},
                timeout=TIMEOUT,
            )
            assert denied.status_code == 403, denied.text
            assert denied.json()["detail"] == "Only partners can bypass-approve"

            approved = requests.post(
                f"{BASE_URL}/api/service/engagements/{engagement_id}/approve",
                headers=partner_headers,
                json={},
                timeout=TIMEOUT,
            )
            assert approved.status_code == 200, approved.text
            result = approved.json()
            assert result["status"] == "Completed"
            assert result["phase"] == engagement["checklist"][-1]["group"]
            assert partner["name"] in result["message"]

            persisted = find_engagement(partner_headers, engagement_id)
            assert persisted["status"] == "Completed"
            assert persisted["approved_by"] == partner["user_id"]
            assert persisted["approved_by_name"] == partner["name"]
            assert isinstance(persisted.get("approved_at"), str) and persisted["approved_at"]
            assert all(
                item["done"]
                for group in persisted["checklist"]
                for item in group["items"]
            )
        finally:
            archive_engagement(partner_headers, engagement_id)

    def test_existing_checklist_toggle_still_persists(
        self, partner_session, first_client
    ):
        _, headers = partner_session
        engagement = create_engagement(headers, first_client, "toggle")
        engagement_id = engagement["engagement_id"]
        try:
            response = requests.patch(
                f"{BASE_URL}/api/service/engagements/{engagement_id}/checklist",
                headers=headers,
                json={"group_index": 0, "item_index": 0, "done": True},
                timeout=TIMEOUT,
            )
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["status"] == "Active"
            assert result["progress"] > 0
            persisted = find_engagement(headers, engagement_id)
            assert persisted["checklist"][0]["items"][0]["done"] is True
        finally:
            archive_engagement(headers, engagement_id)


class TestReminderConfigurationAndRouting:
    """Validate partner settings CRUD and AML task routing to designated staff."""

    def test_get_and_patch_reminder_config_persist(
        self,
        partner_session,
        staff_session,
        first_client,
        original_reminder_config,
    ):
        _, partner_headers = partner_session
        _, staff_headers = staff_session
        mapping = dict(original_reminder_config["audit_client_mapping"])
        mapping[first_client["client_id"]] = "fazil@nnadvisory.ae"
        payload = {
            "aml_designated_staff": "fazil@nnadvisory.ae",
            "audit_client_mapping": mapping,
        }
        saved = requests.patch(
            f"{BASE_URL}/api/settings/reminder-config",
            headers=partner_headers,
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["message"] == "Reminder config updated"

        fetched = requests.get(
            f"{BASE_URL}/api/settings/reminder-config",
            headers=partner_headers,
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["type"] == "reminder_config"
        assert body["aml_designated_staff"] == "fazil@nnadvisory.ae"
        assert body["audit_client_mapping"][first_client["client_id"]] == "fazil@nnadvisory.ae"

        denied_get = requests.get(
            f"{BASE_URL}/api/settings/reminder-config",
            headers=staff_headers,
            timeout=TIMEOUT,
        )
        assert denied_get.status_code == 403, denied_get.text

    def test_aml_reminder_is_routed_to_designated_staff(
        self,
        partner_session,
        staff_session,
        other_staff_session,
        first_client,
        original_reminder_config,
    ):
        _, partner_headers = partner_session
        _, fazil_headers = staff_session
        _, subin_headers = other_staff_session
        config = requests.patch(
            f"{BASE_URL}/api/settings/reminder-config",
            headers=partner_headers,
            json={"aml_designated_staff": "fazil@nnadvisory.ae"},
            timeout=TIMEOUT,
        )
        assert config.status_code == 200, config.text

        title = f"TEST_iter16_AML_routing_{datetime.now(timezone.utc).timestamp()}"
        created = requests.post(
            f"{BASE_URL}/api/tasks",
            headers=partner_headers,
            json={
                "title": title,
                "service_module": "AML Review",
                "due_date": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d"),
                "priority": "High",
                "client_id": first_client["client_id"],
                "client_name": first_client["name"],
                "assigned_to": "subin@nnadvisory.ae",
                "assigned_to_name": "Subin",
            },
            timeout=TIMEOUT,
        )
        assert created.status_code == 200, created.text
        task = created.json()
        try:
            fazil = requests.get(
                f"{BASE_URL}/api/reminders", headers=fazil_headers, timeout=TIMEOUT
            )
            assert fazil.status_code == 200, fazil.text
            fazil_item = next(
                r for r in fazil.json() if r.get("ref_id") == task["task_id"]
            )
            assert fazil_item["type"] == "task"
            assert fazil_item["title"] == title
            assert fazil_item["service_module"] == "AML Review"
            subin = requests.get(
                f"{BASE_URL}/api/reminders", headers=subin_headers, timeout=TIMEOUT
            )
            assert subin.status_code == 200, subin.text
            subin_has_task = any(
                r.get("ref_id") == task["task_id"] for r in subin.json()
            )
            assert (
                fazil_item["assigned_to"] in ("Fazil", "fazil@nnadvisory.ae")
                and not subin_has_task
            ), (
                "AML reminders must be assigned exclusively to designated staff; "
                f"response assigned_to={fazil_item['assigned_to']!r}, "
                f"original assignee still sees reminder={subin_has_task}"
            )
        finally:
            requests.patch(
                f"{BASE_URL}/api/tasks/{task['task_id']}",
                headers=partner_headers,
                params={"status": "Completed"},
                timeout=TIMEOUT,
            )
