"""Backend tests for Client Onboarding Workflow (iteration 9)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nexus-compliance.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    token = r.json()["session_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, r.json()


@pytest.fixture(scope="module")
def partner_client():
    s, _ = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    return s


@pytest.fixture(scope="module")
def staff_client():
    s, _ = _login(STAFF_EMAIL, STAFF_PASSWORD)
    return s


@pytest.fixture(scope="module")
def created_clients_cleanup():
    created_ids = []
    yield created_ids
    # Best-effort cleanup using Mongo via clients API isn't exposed for delete; just leave for next run
    # Names are TEST_ prefixed, easy to identify


# ---------- POST /api/onboarding ----------
class TestOnboardingCreate:
    def test_partner_can_create_onboarding(self, partner_client, created_clients_cleanup):
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_Onboard_{unique} LLC"
        payload = {
            "name": name,
            "entity_type": "LLC",
            "jurisdiction": "Dubai Mainland",
            "trade_licence_no": "TL-12345",
            "trn": "100123456700003",
            "ct_registration_no": "CT-9876",
            "aml_risk_rating": "Medium",
            "pep_flag": False,
            "active_services": ["Statutory Audit", "VAT Filing", "Corporate Tax"],
            "auto_create_engagements": True,
        }
        r = partner_client.post(f"{API}/onboarding", json=payload, timeout=30)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        # Data assertions
        assert data["client_name"] == name
        assert data["status"] == "Onboarding"
        assert "client_id" in data and data["client_id"].startswith("client_")
        assert data["tasks_created"] >= 3
        assert data["engagements_created"] >= 3  # 3 distinct service types
        assert isinstance(data["document_checklist"], list)
        # Medium risk → AML docs added
        assert any("AML" in d or "Sanctions" in d or "Beneficial" in d or "Source of Funds" in d for d in data["document_checklist"])
        # VAT services chosen → VAT docs included
        assert any("VAT" in d or "IBAN" in d or "Turnover" in d for d in data["document_checklist"])
        created_clients_cleanup.append(data["client_id"])

        # Verify persistence: client appears in /api/clients
        r2 = partner_client.get(f"{API}/clients", timeout=15)
        assert r2.status_code == 200
        clients = r2.json()
        match = [c for c in clients if c.get("client_id") == data["client_id"]]
        assert len(match) == 1, f"Created client not found in /api/clients"
        assert match[0]["name"] == name
        assert match[0]["status"] == "Onboarding"

        # Verify tasks created
        r3 = partner_client.get(f"{API}/tasks", timeout=15)
        assert r3.status_code == 200
        tasks = r3.json()
        client_tasks = [t for t in tasks if t.get("client_id") == data["client_id"]]
        assert len(client_tasks) >= 3, f"Expected >=3 tasks, got {len(client_tasks)}"

    def test_staff_cannot_onboard_returns_403(self, staff_client):
        unique = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_StaffBlocked_{unique}",
            "entity_type": "LLC",
            "active_services": ["VAT Filing"],
        }
        r = staff_client.post(f"{API}/onboarding", json=payload, timeout=20)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
        body = r.json()
        assert "partner" in (body.get("detail") or "").lower()

    def test_duplicate_client_name_returns_400(self, partner_client, created_clients_cleanup):
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_Dup_{unique}"
        p = {"name": name, "entity_type": "LLC", "active_services": ["VAT Filing"], "auto_create_engagements": False}
        r1 = partner_client.post(f"{API}/onboarding", json=p, timeout=20)
        assert r1.status_code == 200
        created_clients_cleanup.append(r1.json()["client_id"])
        r2 = partner_client.post(f"{API}/onboarding", json=p, timeout=20)
        assert r2.status_code == 400, f"Expected 400, got {r2.status_code}: {r2.text}"
        assert "already exists" in (r2.json().get("detail") or "").lower()

    def test_high_risk_adds_aml_docs(self, partner_client, created_clients_cleanup):
        unique = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_HighRisk_{unique}",
            "entity_type": "Group",
            "aml_risk_rating": "High",
            "pep_flag": True,
            "active_services": ["AML Review"],
            "auto_create_engagements": True,
        }
        r = partner_client.post(f"{API}/onboarding", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        created_clients_cleanup.append(data["client_id"])
        docs = data["document_checklist"]
        assert any("Source of Funds" in d for d in docs)
        assert any("Beneficial" in d for d in docs)


# ---------- GET /api/onboarding/document-checklist ----------
class TestDocumentChecklistPreview:
    def test_default_low_risk_no_services(self, partner_client):
        r = partner_client.get(f"{API}/onboarding/document-checklist", params={"services": "", "risk": "Low"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "checklist" in data
        # Only general items
        assert any("Trade Licence" in d for d in data["checklist"])
        assert not any("IBAN" in d for d in data["checklist"])
        assert not any("Source of Funds" in d for d in data["checklist"])

    def test_vat_service_adds_vat_docs(self, partner_client):
        r = partner_client.get(f"{API}/onboarding/document-checklist", params={"services": "VAT Filing", "risk": "Low"}, timeout=15)
        assert r.status_code == 200
        docs = r.json()["checklist"]
        assert any("IBAN" in d or "Turnover" in d for d in docs)

    def test_high_risk_adds_aml(self, partner_client):
        r = partner_client.get(f"{API}/onboarding/document-checklist", params={"services": "Corporate Tax", "risk": "High"}, timeout=15)
        assert r.status_code == 200
        docs = r.json()["checklist"]
        assert any("Source of Funds" in d for d in docs)
        assert any("Financial Statements" in d for d in docs)
