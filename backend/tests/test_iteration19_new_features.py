"""
Iteration 19 Backend Tests: New Features
- Ageing Report Dashboard (GET /api/invoices/ageing-report, POST /api/invoices/follow-up)
- Proposal Manager (CRUD for proposals and templates)
- Visa Expiry Alerts (GET /api/dashboard/visa-alerts)
- Per-User Access (GET/PATCH /api/settings/user-access)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from /app/memory/test_credentials.md
PARTNER_EMAIL = "srinivas.anup@gmail.com"
PARTNER_PASSWORD = "AdminPass2026!"

@pytest.fixture(scope="module")
def partner_session():
    """Login as partner and return session with auth token"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": PARTNER_EMAIL,
        "password": PARTNER_PASSWORD
    })
    assert resp.status_code == 200, f"Partner login failed: {resp.text}"
    data = resp.json()
    token = data.get("session_token")
    assert token, "No session token returned"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session

# ============= AGEING REPORT TESTS =============

class TestAgeingReport:
    """Tests for Ageing Report Dashboard feature"""
    
    def test_ageing_report_endpoint_returns_200(self, partner_session):
        """GET /api/invoices/ageing-report should return 200 for partner"""
        resp = partner_session.get(f"{BASE_URL}/api/invoices/ageing-report")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    def test_ageing_report_structure(self, partner_session):
        """Ageing report should have summary and clients structure"""
        resp = partner_session.get(f"{BASE_URL}/api/invoices/ageing-report")
        assert resp.status_code == 200
        data = resp.json()
        
        # Check summary structure
        assert "summary" in data, "Missing 'summary' in response"
        summary = data["summary"]
        assert "total_unpaid" in summary, "Missing 'total_unpaid' in summary"
        assert "total_invoices" in summary, "Missing 'total_invoices' in summary"
        assert "bucket_totals" in summary, "Missing 'bucket_totals' in summary"
        
        # Check bucket structure
        buckets = summary["bucket_totals"]
        expected_buckets = ["current", "30", "60", "90", "120plus"]
        for bucket in expected_buckets:
            assert bucket in buckets, f"Missing bucket '{bucket}'"
            assert "count" in buckets[bucket], f"Missing 'count' in bucket '{bucket}'"
            assert "amount" in buckets[bucket], f"Missing 'amount' in bucket '{bucket}'"
        
        # Check clients array
        assert "clients" in data, "Missing 'clients' in response"
        assert isinstance(data["clients"], list), "'clients' should be a list"
    
    def test_ageing_report_client_structure(self, partner_session):
        """Each client in ageing report should have required fields"""
        resp = partner_session.get(f"{BASE_URL}/api/invoices/ageing-report")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data["clients"]) > 0:
            client = data["clients"][0]
            required_fields = ["client_id", "client_name", "total_outstanding", "invoice_count", "oldest_days", "invoices"]
            for field in required_fields:
                assert field in client, f"Missing '{field}' in client data"
            assert isinstance(client["invoices"], list), "'invoices' should be a list"
    
    def test_follow_up_creates_task(self, partner_session):
        """POST /api/invoices/follow-up should create a task"""
        # First get a client from ageing report
        resp = partner_session.get(f"{BASE_URL}/api/invoices/ageing-report")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data["clients"]) > 0:
            client = data["clients"][0]
            client_id = client["client_id"]
            client_name = client["client_name"]
            
            # Create follow-up task
            resp = partner_session.post(
                f"{BASE_URL}/api/invoices/follow-up?client_id={client_id}&client_name={client_name}"
            )
            assert resp.status_code == 200, f"Follow-up creation failed: {resp.text}"
            result = resp.json()
            assert "task_id" in result, "Missing task_id in response"
            assert result["message"] == "Follow-up task created"
        else:
            # No unpaid invoices - test with dummy data
            resp = partner_session.post(
                f"{BASE_URL}/api/invoices/follow-up?client_id=test_client&client_name=Test%20Client"
            )
            assert resp.status_code == 200
    
    def test_follow_up_requires_client_id(self, partner_session):
        """POST /api/invoices/follow-up should require client_id"""
        resp = partner_session.post(f"{BASE_URL}/api/invoices/follow-up")
        assert resp.status_code == 400, "Should return 400 when client_id is missing"

# ============= VISA ALERTS TESTS =============

class TestVisaAlerts:
    """Tests for Visa Expiry Alerts widget"""
    
    def test_visa_alerts_endpoint_returns_200(self, partner_session):
        """GET /api/dashboard/visa-alerts should return 200 for partner"""
        resp = partner_session.get(f"{BASE_URL}/api/dashboard/visa-alerts")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    def test_visa_alerts_returns_list(self, partner_session):
        """Visa alerts should return a list"""
        resp = partner_session.get(f"{BASE_URL}/api/dashboard/visa-alerts")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_visa_alert_structure(self, partner_session):
        """Each visa alert should have required fields"""
        resp = partner_session.get(f"{BASE_URL}/api/dashboard/visa-alerts")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data) > 0:
            alert = data[0]
            required_fields = ["user_id", "name", "document", "expiry_date", "days_left"]
            for field in required_fields:
                assert field in alert, f"Missing '{field}' in visa alert"

# ============= PROPOSAL TEMPLATES TESTS =============

class TestProposalTemplates:
    """Tests for Proposal Templates CRUD"""
    
    def test_get_templates_returns_200(self, partner_session):
        """GET /api/proposal-templates should return 200"""
        resp = partner_session.get(f"{BASE_URL}/api/proposal-templates")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_create_template(self, partner_session):
        """POST /api/proposal-templates should create a template"""
        template_data = {
            "name": "TEST_Standard Audit Template",
            "scope_of_work": "Full statutory audit services",
            "fee_structure": "Fixed fee: AED 25,000",
            "terms": "Payment within 30 days",
            "service_type": "statutory_audit"
        }
        resp = partner_session.post(f"{BASE_URL}/api/proposal-templates", json=template_data)
        assert resp.status_code == 200, f"Template creation failed: {resp.text}"
        data = resp.json()
        assert "template_id" in data
        assert data["name"] == template_data["name"]
        
        # Store for cleanup
        TestProposalTemplates.created_template_id = data["template_id"]
    
    def test_template_appears_in_list(self, partner_session):
        """Created template should appear in list"""
        resp = partner_session.get(f"{BASE_URL}/api/proposal-templates")
        assert resp.status_code == 200
        templates = resp.json()
        
        if hasattr(TestProposalTemplates, 'created_template_id'):
            template_ids = [t["template_id"] for t in templates]
            assert TestProposalTemplates.created_template_id in template_ids
    
    def test_delete_template(self, partner_session):
        """DELETE /api/proposal-templates/{id} should delete template"""
        if hasattr(TestProposalTemplates, 'created_template_id'):
            resp = partner_session.delete(
                f"{BASE_URL}/api/proposal-templates/{TestProposalTemplates.created_template_id}"
            )
            assert resp.status_code == 200
            assert resp.json()["message"] == "Template deleted"

# ============= PROPOSALS TESTS =============

class TestProposals:
    """Tests for Proposals CRUD"""
    
    @pytest.fixture(scope="class")
    def test_client(self, partner_session):
        """Get a client for testing proposals"""
        resp = partner_session.get(f"{BASE_URL}/api/clients")
        assert resp.status_code == 200
        clients = resp.json()
        if len(clients) > 0:
            return clients[0]
        return None
    
    def test_get_proposals_returns_200(self, partner_session):
        """GET /api/proposals should return 200"""
        resp = partner_session.get(f"{BASE_URL}/api/proposals")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_create_proposal(self, partner_session, test_client):
        """POST /api/proposals should create a proposal"""
        if not test_client:
            pytest.skip("No clients available for testing")
        
        proposal_data = {
            "client_id": test_client["client_id"],
            "client_name": test_client["name"],
            "title": "TEST_Annual Audit Engagement 2026",
            "scope_of_work": "Full statutory audit for FY 2025-26",
            "fee_structure": "Fixed fee: AED 30,000",
            "terms": "50% advance, 50% on completion",
            "total_fee": 30000,
            "status": "Draft"
        }
        resp = partner_session.post(f"{BASE_URL}/api/proposals", json=proposal_data)
        assert resp.status_code == 200, f"Proposal creation failed: {resp.text}"
        data = resp.json()
        assert "proposal_id" in data
        assert data["title"] == proposal_data["title"]
        assert data["status"] == "Draft"
        
        TestProposals.created_proposal_id = data["proposal_id"]
    
    def test_proposal_appears_in_list(self, partner_session):
        """Created proposal should appear in list"""
        resp = partner_session.get(f"{BASE_URL}/api/proposals")
        assert resp.status_code == 200
        proposals = resp.json()
        
        if hasattr(TestProposals, 'created_proposal_id'):
            proposal_ids = [p["proposal_id"] for p in proposals]
            assert TestProposals.created_proposal_id in proposal_ids
    
    def test_update_proposal_status_to_sent(self, partner_session):
        """PATCH /api/proposals/{id} should update status to Sent"""
        if not hasattr(TestProposals, 'created_proposal_id'):
            pytest.skip("No proposal created")
        
        resp = partner_session.patch(
            f"{BASE_URL}/api/proposals/{TestProposals.created_proposal_id}?status=Sent"
        )
        assert resp.status_code == 200
        
        # Verify status changed
        resp = partner_session.get(f"{BASE_URL}/api/proposals")
        proposals = resp.json()
        proposal = next((p for p in proposals if p["proposal_id"] == TestProposals.created_proposal_id), None)
        assert proposal is not None
        assert proposal["status"] == "Sent"
    
    def test_update_proposal_status_to_accepted(self, partner_session):
        """PATCH /api/proposals/{id} should update status to Accepted"""
        if not hasattr(TestProposals, 'created_proposal_id'):
            pytest.skip("No proposal created")
        
        resp = partner_session.patch(
            f"{BASE_URL}/api/proposals/{TestProposals.created_proposal_id}?status=Accepted"
        )
        assert resp.status_code == 200
        
        # Verify status changed
        resp = partner_session.get(f"{BASE_URL}/api/proposals")
        proposals = resp.json()
        proposal = next((p for p in proposals if p["proposal_id"] == TestProposals.created_proposal_id), None)
        assert proposal is not None
        assert proposal["status"] == "Accepted"
    
    def test_delete_proposal(self, partner_session):
        """DELETE /api/proposals/{id} should delete proposal"""
        if hasattr(TestProposals, 'created_proposal_id'):
            resp = partner_session.delete(
                f"{BASE_URL}/api/proposals/{TestProposals.created_proposal_id}"
            )
            assert resp.status_code == 200
            assert resp.json()["message"] == "Proposal deleted"

# ============= PER-USER ACCESS TESTS =============

class TestPerUserAccess:
    """Tests for Per-User Access feature"""
    
    def test_get_user_access_returns_200(self, partner_session):
        """GET /api/settings/user-access should return 200"""
        resp = partner_session.get(f"{BASE_URL}/api/settings/user-access")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_user_access_structure(self, partner_session):
        """Each user in access list should have required fields"""
        resp = partner_session.get(f"{BASE_URL}/api/settings/user-access")
        assert resp.status_code == 200
        users = resp.json()
        
        if len(users) > 0:
            user = users[0]
            assert "user_id" in user
            assert "name" in user
            assert "role" in user
            # hidden_sections may or may not be present
    
    def test_update_user_access(self, partner_session):
        """PATCH /api/settings/user-access/{user_id} should update hidden_sections"""
        # Get a staff user to test with
        resp = partner_session.get(f"{BASE_URL}/api/settings/user-access")
        assert resp.status_code == 200
        users = resp.json()
        
        staff_users = [u for u in users if u["role"] == "staff"]
        if len(staff_users) == 0:
            pytest.skip("No staff users available for testing")
        
        test_user = staff_users[0]
        user_id = test_user["user_id"]
        original_hidden = test_user.get("hidden_sections", [])
        
        # Toggle a section
        new_hidden = ["audit"] if "audit" not in original_hidden else []
        
        resp = partner_session.patch(
            f"{BASE_URL}/api/settings/user-access/{user_id}",
            json={"hidden_sections": new_hidden}
        )
        assert resp.status_code == 200
        
        # Verify change
        resp = partner_session.get(f"{BASE_URL}/api/settings/user-access")
        users = resp.json()
        updated_user = next((u for u in users if u["user_id"] == user_id), None)
        assert updated_user is not None
        assert updated_user.get("hidden_sections", []) == new_hidden
        
        # Restore original
        resp = partner_session.patch(
            f"{BASE_URL}/api/settings/user-access/{user_id}",
            json={"hidden_sections": original_hidden}
        )
        assert resp.status_code == 200

# ============= AUTHORIZATION TESTS =============

class TestAuthorization:
    """Tests to verify partner-only endpoints reject non-partners"""
    
    def test_ageing_report_requires_partner(self):
        """Ageing report should require partner auth"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/invoices/ageing-report")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_visa_alerts_requires_partner(self):
        """Visa alerts should require partner auth"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/dashboard/visa-alerts")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_proposals_requires_partner(self):
        """Proposals should require partner auth"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/proposals")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_user_access_requires_partner(self):
        """User access settings should require partner auth"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/settings/user-access")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
