"""Backend tests for Client Onboarding Workflow (iteration 9)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nexus-compliance.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_EMAIL = "srinivas.anup@gmail.com"
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
            "service_type": "Audit",
            "auto_create_engagements": True,
        }
        r = partner_client.post(f"{API}/onboarding", json=payload, timeout=30)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        # Data assertions — onboarding starts at the pipeline stage label; engagements
        # are only created when the tracker reaches Stage 5
        assert data["client_name"] == name
        assert "Stage 1" in data["status"]
        assert "client_id" in data and data["client_id"].startswith("client_")
        assert data["tasks_created"] >= 2
        assert data["engagements_created"] == 0  # engagements come at Stage 5
        assert isinstance(data["document_checklist"], list)
        created_clients_cleanup.append(data["client_id"])

        # Verify persistence: client appears in /api/clients
        r2 = partner_client.get(f"{API}/clients", timeout=15)
        assert r2.status_code == 200
        clients = r2.json()
        match = [c for c in clients if c.get("client_id") == data["client_id"]]
        assert len(match) == 1, f"Created client not found in /api/clients"
        assert match[0]["name"] == name

        # Verify tasks created (stage 1: detail-capture + audit kickoff)
        r3 = partner_client.get(f"{API}/tasks", timeout=15)
        assert r3.status_code == 200
        tasks = r3.json()
        client_tasks = [t for t in tasks if t.get("client_id") == data["client_id"]]
        assert len(client_tasks) >= 2, f"Expected >=2 tasks, got {len(client_tasks)}"

    def test_staff_cannot_onboard_returns_403(self, staff_client):
        unique = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_StaffBlocked_{unique}",
            "entity_type": "LLC",
            "service_type": "Vat consultancy",
        }
        r = staff_client.post(f"{API}/onboarding", json=payload, timeout=20)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
        body = r.json()
        assert "partner" in (body.get("detail") or "").lower()

    def test_duplicate_client_name_reuses_client_master(self, partner_client, created_clients_cleanup):
        """Current behaviour: the client master is reused; each service gets its own onboarding record."""
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_Dup_{unique}"
        p1 = {"name": name, "entity_type": "LLC", "service_type": "Vat consultancy", "auto_create_engagements": False}
        r1 = partner_client.post(f"{API}/onboarding", json=p1, timeout=20)
        assert r1.status_code == 200
        client_id = r1.json()["client_id"]
        created_clients_cleanup.append(client_id)
        # same legal name, different service → reuses the master record, new onboarding doc
        p2 = {"name": name, "entity_type": "LLC", "service_type": "Audit", "auto_create_engagements": False}
        r2 = partner_client.post(f"{API}/onboarding", json=p2, timeout=20)
        assert r2.status_code == 200, f"Got {r2.status_code}: {r2.text}"
        assert r2.json()["client_id"] == client_id, "Same legal name must reuse the client master"

    def test_high_risk_adds_aml_docs(self, partner_client, created_clients_cleanup):
        unique = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_HighRisk_{unique}",
            "entity_type": "Group",
            "aml_risk_rating": "High",
            "pep_flag": True,
            "service_type": "AML consultancy",
            "auto_create_engagements": True,
        }
        r = partner_client.post(f"{API}/onboarding", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        created_clients_cleanup.append(data["client_id"])
        # risk rating persists on the client master
        clients = partner_client.get(f"{API}/clients", timeout=15).json()
        match = [c for c in clients if c.get("client_id") == data["client_id"]]
        assert match and match[0].get("aml_risk_rating") == "High"
        # the AML document set is exposed through the checklist preview (risk=High)
        preview = partner_client.get(
            f"{API}/onboarding/document-checklist", params={"services": "", "risk": "High"}, timeout=15
        ).json()
        assert any("Source of Funds" in d for d in preview["checklist"])
        assert any("Beneficial" in d for d in preview["checklist"])


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
