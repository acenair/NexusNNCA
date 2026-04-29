"""
Iteration 10 backend tests:
  1. PATCH /api/settings/users/{user_id} - email field + uniqueness validation
  2. GET /api/reminders - data-driven reminders
  3. POST/GET/DELETE/summary/export /api/billable-hours - billable hours flow
"""
import os
import io
import csv
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


# ---- Fixtures ----
def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["session_token"], data["user_id"]


@pytest.fixture(scope="module")
def partner_token():
    token, _ = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    return token


@pytest.fixture(scope="module")
def staff_token():
    token, _ = _login(STAFF_EMAIL, STAFF_PASSWORD)
    return token


@pytest.fixture(scope="module")
def partner_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def a_client(partner_headers):
    """Pick any existing client for billable hours tests."""
    r = requests.get(f"{BASE_URL}/api/clients", headers=partner_headers, timeout=15)
    assert r.status_code == 200
    clients = r.json()
    if not clients:
        pytest.skip("No clients seeded — can't test billable hours")
    return clients[0]


# ============= 1. EMAIL UPDATE =============
class TestUserEmailUpdate:
    """PATCH /api/settings/users/{user_id} email field"""

    def test_email_update_success_and_revert(self, partner_headers):
        # Get users list
        r = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=15)
        assert r.status_code == 200
        users = r.json()
        # Pick a staff user (not partner login itself)
        target = next((u for u in users if u.get("email") == "subin@nnadvisory.ae"), None)
        assert target, "subin@nnadvisory.ae user not found"
        original_email = target["email"]
        new_email = f"subin_test_{uuid.uuid4().hex[:6]}@nnadvisory.ae"

        # Update email
        r = requests.patch(
            f"{BASE_URL}/api/settings/users/{target['user_id']}",
            headers=partner_headers,
            json={"email": new_email},
            timeout=15,
        )
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"

        # Verify via GET
        r = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=15)
        users2 = r.json()
        updated = next(u for u in users2 if u["user_id"] == target["user_id"])
        assert updated["email"] == new_email

        # Revert
        r = requests.patch(
            f"{BASE_URL}/api/settings/users/{target['user_id']}",
            headers=partner_headers,
            json={"email": original_email},
            timeout=15,
        )
        assert r.status_code == 200

    def test_email_uniqueness_rejected(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=15)
        users = r.json()
        target = next((u for u in users if u.get("email") == "subin@nnadvisory.ae"), None)
        assert target
        # Attempt to set email to an already-used one
        r = requests.patch(
            f"{BASE_URL}/api/settings/users/{target['user_id']}",
            headers=partner_headers,
            json={"email": "fazil@nnadvisory.ae"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "already in use" in r.text.lower() or "duplicate" in r.text.lower()

    def test_email_update_requires_partner(self, staff_headers, partner_headers):
        r = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=15)
        target = next(u for u in r.json() if u.get("email") == "subin@nnadvisory.ae")
        r = requests.patch(
            f"{BASE_URL}/api/settings/users/{target['user_id']}",
            headers=staff_headers,
            json={"email": "x@nnadvisory.ae"},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ============= 2. REMINDERS =============
class TestReminders:
    """GET /api/reminders data-driven"""

    def test_reminders_partner(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/reminders", headers=partner_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # If data is present, validate shape
        for rem in data[:5]:
            assert "reminder_id" in rem
            assert "type" in rem and rem["type"] in ("task", "event", "engagement")
            assert "title" in rem
            assert "severity" in rem and rem["severity"] in ("urgent", "warning", "info")
            assert "priority" in rem
            assert "status" in rem

    def test_reminders_staff_scoped(self, staff_headers):
        r = requests.get(f"{BASE_URL}/api/reminders", headers=staff_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_reminders_sorted_by_severity(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/reminders", headers=partner_headers, timeout=20)
        data = r.json()
        if len(data) >= 2:
            order = {"urgent": 0, "warning": 1, "info": 2}
            severities = [order.get(d["severity"], 2) for d in data]
            assert severities == sorted(severities), "Reminders not sorted by severity"


# ============= 3. BILLABLE HOURS =============
class TestBillableHours:
    """POST/GET/DELETE/summary/export /api/billable-hours"""

    def test_log_hours_partner(self, partner_headers, a_client):
        payload = {
            "client_id": a_client["client_id"],
            "client_name": a_client.get("name"),
            "hours": 2.5,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "description": "TEST_iter10 partner log",
        }
        r = requests.post(
            f"{BASE_URL}/api/billable-hours", headers=partner_headers, json=payload, timeout=15
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        entry = r.json()
        assert entry["hours"] == 2.5
        assert entry["client_id"] == a_client["client_id"]
        assert "entry_id" in entry
        TestBillableHours.partner_entry_id = entry["entry_id"]

    def test_log_hours_staff(self, staff_headers, a_client):
        payload = {
            "client_id": a_client["client_id"],
            "hours": 1.0,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "description": "TEST_iter10 staff log",
        }
        r = requests.post(
            f"{BASE_URL}/api/billable-hours", headers=staff_headers, json=payload, timeout=15
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry["staff_email"] == STAFF_EMAIL
        TestBillableHours.staff_entry_id = entry["entry_id"]

    def test_get_partner_sees_all(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/billable-hours", headers=partner_headers, timeout=15)
        assert r.status_code == 200
        entries = r.json()
        emails = {e.get("staff_email") for e in entries}
        # Partner should see both their own and staff's entries
        assert PARTNER_EMAIL in emails
        assert STAFF_EMAIL in emails

    def test_get_staff_sees_only_own(self, staff_headers):
        r = requests.get(f"{BASE_URL}/api/billable-hours", headers=staff_headers, timeout=15)
        assert r.status_code == 200
        entries = r.json()
        for e in entries:
            assert e.get("staff_email") == STAFF_EMAIL, "Staff sees other user's entries"

    def test_summary_partner_only(self, partner_headers, staff_headers):
        r = requests.get(
            f"{BASE_URL}/api/billable-hours/summary", headers=partner_headers, timeout=15
        )
        assert r.status_code == 200
        data = r.json()
        assert "by_staff" in data and isinstance(data["by_staff"], list)
        assert "by_client" in data and isinstance(data["by_client"], list)
        assert "total_hours" in data
        assert "total_entries" in data

        # Staff cannot access summary
        r2 = requests.get(
            f"{BASE_URL}/api/billable-hours/summary", headers=staff_headers, timeout=15
        )
        assert r2.status_code == 403

    def test_export_csv(self, partner_headers, staff_headers):
        r = requests.get(
            f"{BASE_URL}/api/billable-hours/export", headers=partner_headers, timeout=20
        )
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, f"Expected csv, got {ct}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".csv" in cd
        # Validate parsable CSV with expected header
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert rows[0] == ["Date", "Staff", "Email", "Client", "Task", "Hours", "Description"]

        # Staff blocked from export
        r2 = requests.get(
            f"{BASE_URL}/api/billable-hours/export", headers=staff_headers, timeout=15
        )
        assert r2.status_code == 403

    def test_staff_cannot_delete_partner_entry(self, staff_headers):
        eid = getattr(TestBillableHours, "partner_entry_id", None)
        if not eid:
            pytest.skip("partner entry id missing")
        r = requests.delete(
            f"{BASE_URL}/api/billable-hours/{eid}", headers=staff_headers, timeout=15
        )
        assert r.status_code == 403

    def test_delete_own_entries(self, partner_headers, staff_headers):
        # Staff deletes own
        seid = getattr(TestBillableHours, "staff_entry_id", None)
        if seid:
            r = requests.delete(
                f"{BASE_URL}/api/billable-hours/{seid}", headers=staff_headers, timeout=15
            )
            assert r.status_code == 200

        # Partner deletes own
        peid = getattr(TestBillableHours, "partner_entry_id", None)
        if peid:
            r = requests.delete(
                f"{BASE_URL}/api/billable-hours/{peid}", headers=partner_headers, timeout=15
            )
            assert r.status_code == 200

        # Verify deletion - 404 on retry delete
        if peid:
            r = requests.delete(
                f"{BASE_URL}/api/billable-hours/{peid}", headers=partner_headers, timeout=15
            )
            assert r.status_code == 404
