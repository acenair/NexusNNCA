"""Iteration 20 backend tests for client onboarding + stage tracker pipeline safeguards."""

import os
import uuid
from io import BytesIO

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api" if BASE_URL else None

PARTNER_EMAIL = "srinivas.anup@gmail.com"
PARTNER_PASSWORD = "AdminPass2026!"


@pytest.fixture(scope="module")
def partner_session():
    """Auth setup for partner-only onboarding APIs."""
    if not API:
        pytest.skip("REACT_APP_BACKEND_URL is required")

    session = requests.Session()
    login = session.post(
        f"{API}/auth/login",
        json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD},
        timeout=30,
    )
    assert login.status_code == 200, f"Partner login failed: {login.status_code} {login.text}"
    token = login.json().get("session_token")
    assert isinstance(token, str) and token
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="module")
def onboarding_seed(partner_session):
    """Create one Audit onboarding, then reuse ids across stage tests."""
    unique = uuid.uuid4().hex[:8]
    legal_name = f"TEST_I20_Onboard_{unique} LLC"

    payload = {
        "name": legal_name,
        "entity_type": "LLC",
        "jurisdiction": "Mainland",
        "service_type": "Audit",
        "pipeline_stage": "stage_1",
        "contact_person": "TEST Primary Contact",
        "contact_email": "test.onboarding@example.test",
        "contact_phone": "+971500000001",
        "audit_purpose": "Statutory requirement",
        "service_period": "FY 2025",
    }
    create = partner_session.post(f"{API}/onboarding", json=payload, timeout=40)
    assert create.status_code == 200, f"Onboarding create failed: {create.status_code} {create.text}"
    created = create.json()

    assert created["client_name"] == legal_name
    assert created["crm_sheet"] == "Master Sheet"
    assert created["status"] == "Stage 1: New Lead / Inquiry"
    assert isinstance(created.get("onboarding_id"), str) and created["onboarding_id"].startswith("onb_")
    assert isinstance(created.get("client_id"), str) and created["client_id"].startswith("client_")

    onboarding_id = created["onboarding_id"]
    client_id = created["client_id"]

    # Create a second service onboarding with SAME legal name (must keep same client_id)
    vat_payload = {
        "name": legal_name,
        "entity_type": "LLC",
        "jurisdiction": "Mainland",
        "service_type": "Vat consultancy",
        "pipeline_stage": "stage_1",
        "contact_person": "TEST Primary Contact",
        "service_purpose": "VAT advisory",
    }
    vat_create = partner_session.post(f"{API}/onboarding", json=vat_payload, timeout=40)
    assert vat_create.status_code == 200, f"Second onboarding create failed: {vat_create.status_code} {vat_create.text}"
    vat_data = vat_create.json()
    assert vat_data["client_id"] == client_id
    assert vat_data["onboarding_id"] != onboarding_id
    assert vat_data["crm_sheet"] == "VAT Consultancy"

    return {
        "legal_name": legal_name,
        "client_id": client_id,
        "audit_onboarding_id": onboarding_id,
        "vat_onboarding_id": vat_data["onboarding_id"],
    }


class TestOnboardingPipeline:
    """Client onboarding + staged pipeline behavior for requested flow."""

    def test_create_record_persists_and_tracker_loads(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        res = partner_session.get(f"{API}/onboarding/{onboarding_id}", timeout=30)
        assert res.status_code == 200, f"Get onboarding failed: {res.status_code} {res.text}"
        record = res.json()

        assert record["onboarding_id"] == onboarding_id
        assert record["client_id"] == onboarding_seed["client_id"]
        assert record["name"] == onboarding_seed["legal_name"]
        assert record["service_type"] == "Audit"
        assert record["contact_person"] == "TEST Primary Contact"
        assert record["stage_tracker"]["stage"] == "stage_1"
        assert record["stage_tracker"]["documents"] == []

    def test_stage_2_labels(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        patch = partner_session.patch(
            f"{API}/onboarding/{onboarding_id}",
            json={"pipeline_stage": "stage_2", "advance_payment_confirmed": False},
            timeout=30,
        )
        assert patch.status_code == 200, f"Stage 2 update failed: {patch.status_code} {patch.text}"
        docs = patch.json()["stage_tracker"]["documents"]
        assert docs == ["Trade License", "Passport/EID of Owners", "VAT Certificate"]

    def test_stage_3_labels(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        patch = partner_session.patch(
            f"{API}/onboarding/{onboarding_id}",
            json={"pipeline_stage": "stage_3", "advance_payment_confirmed": False},
            timeout=30,
        )
        assert patch.status_code == 200
        assert patch.json()["stage_tracker"]["documents"] == ["Audit Proposal Document"]

    def test_stage_4_labels(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        patch = partner_session.patch(
            f"{API}/onboarding/{onboarding_id}",
            json={"pipeline_stage": "stage_4", "advance_payment_confirmed": False},
            timeout=30,
        )
        assert patch.status_code == 200
        assert patch.json()["stage_tracker"]["documents"] == ["Signed Engagement Letter", "Payment Receipt / Proof"]

    def test_stage_5_requires_advance_confirmation(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        blocked = partner_session.patch(
            f"{API}/onboarding/{onboarding_id}",
            json={"pipeline_stage": "stage_5", "advance_payment_confirmed": False},
            timeout=30,
        )
        assert blocked.status_code == 400
        assert "advance payment" in blocked.json().get("detail", "").lower()

    def test_stage_5_with_advance_creates_engagement(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]

        staff_res = partner_session.get(f"{API}/auth/users-list", timeout=30)
        assert staff_res.status_code == 200
        users = staff_res.json()
        assign_email = users[0]["email"] if users else None

        allowed = partner_session.patch(
            f"{API}/onboarding/{onboarding_id}",
            json={
                "pipeline_stage": "stage_5",
                "advance_payment_confirmed": True,
                "audit_partner": assign_email,
                "audit_manager": assign_email,
            },
            timeout=40,
        )
        assert allowed.status_code == 200, f"Stage 5 update failed: {allowed.status_code} {allowed.text}"
        body = allowed.json()
        assert body["pipeline_stage"] == "stage_5"
        assert isinstance(body.get("engagement_id"), str) and body["engagement_id"].startswith("eng_")

        # Verify persisted stage+docs after update
        get_after = partner_session.get(f"{API}/onboarding/{onboarding_id}", timeout=30)
        assert get_after.status_code == 200
        persisted = get_after.json()
        assert persisted["pipeline_stage"] == "stage_5"
        assert persisted["stage_tracker"]["documents"] == ["Audit Request Checklist (PBC List)", "Trial Balance"]

    def test_stage_document_upload_persists(self, partner_session, onboarding_seed):
        onboarding_id = onboarding_seed["audit_onboarding_id"]
        file_content = BytesIO(b"test,trial,balance\n100,200,300\n")

        upload = partner_session.post(
            f"{API}/onboarding/{onboarding_id}/documents",
            params={"document_label": "Trial Balance"},
            files={"file": ("trial_balance.csv", file_content, "text/csv")},
            timeout=40,
        )
        assert upload.status_code == 200, f"Upload failed: {upload.status_code} {upload.text}"
        up_data = upload.json()
        assert up_data["document_label"] == "Trial Balance"
        assert up_data["filename"] == "trial_balance.csv"

        check = partner_session.get(f"{API}/onboarding/{onboarding_id}", timeout=30)
        assert check.status_code == 200
        docs = check.json().get("documents", [])
        matches = [d for d in docs if d.get("document_label") == "Trial Balance" and d.get("original_filename") == "trial_balance.csv"]
        assert len(matches) >= 1
