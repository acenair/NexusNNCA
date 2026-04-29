"""
Iteration 8 Tests: Client Activity Timeline & Export/Reporting
Tests:
- GET /api/clients/{client_id}/timeline - returns timeline with tasks, events, documents, engagements sorted by date
- GET /api/export/audit-report/{engagement_id} - returns valid PDF
- GET /api/export/vat-return/{engagement_id} - returns valid PDF for VAT engagements
- Tasks page regression - staff sees only their tasks
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests for partner and staff"""
    
    def test_partner_login(self):
        """Partner (Arjun) can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Partner login failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert data["email"] == "arjun@nnadvisory.ae"
        assert data["role"] == "partner"
        print(f"Partner login successful: {data['name']}")
        return data["session_token"]
    
    def test_staff_login(self):
        """Staff (Fazil) can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert data["email"] == "fazil@nnadvisory.ae"
        assert data["role"] == "staff"
        print(f"Staff login successful: {data['name']}")
        return data["session_token"]


class TestClientTimeline:
    """Tests for GET /api/clients/{client_id}/timeline"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and client list"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        self.token = response.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get clients list
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=self.headers)
        self.clients = clients_resp.json()
    
    def test_timeline_endpoint_exists(self):
        """Timeline endpoint returns 200 for valid client"""
        if not self.clients:
            pytest.skip("No clients in database")
        
        client_id = self.clients[0]["client_id"]
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}/timeline", headers=self.headers)
        assert response.status_code == 200, f"Timeline endpoint failed: {response.text}"
        data = response.json()
        assert "client" in data, "Response should contain 'client' key"
        assert "timeline" in data, "Response should contain 'timeline' key"
        print(f"Timeline endpoint works for client: {data['client']['name']}")
    
    def test_timeline_returns_client_info(self):
        """Timeline returns client details"""
        if not self.clients:
            pytest.skip("No clients in database")
        
        client_id = self.clients[0]["client_id"]
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}/timeline", headers=self.headers)
        data = response.json()
        
        client = data["client"]
        assert "name" in client, "Client should have name"
        assert "client_id" in client, "Client should have client_id"
        print(f"Client info returned: {client['name']}, status: {client.get('status', 'N/A')}")
    
    def test_timeline_items_have_required_fields(self):
        """Each timeline item has type, title, date, status, detail"""
        if not self.clients:
            pytest.skip("No clients in database")
        
        client_id = self.clients[0]["client_id"]
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}/timeline", headers=self.headers)
        data = response.json()
        
        timeline = data["timeline"]
        if not timeline:
            print("Timeline is empty for this client - that's OK")
            return
        
        for item in timeline:
            assert "type" in item, f"Timeline item missing 'type': {item}"
            assert "title" in item, f"Timeline item missing 'title': {item}"
            assert "date" in item, f"Timeline item missing 'date': {item}"
            assert item["type"] in ["task", "meeting", "followup", "deadline", "document", "engagement", "activity", "event"], f"Unknown type: {item['type']}"
        
        print(f"Timeline has {len(timeline)} items with valid structure")
        # Print type breakdown
        types = {}
        for item in timeline:
            types[item["type"]] = types.get(item["type"], 0) + 1
        print(f"Type breakdown: {types}")
    
    def test_timeline_sorted_by_date(self):
        """Timeline items are sorted by date (descending)"""
        if not self.clients:
            pytest.skip("No clients in database")
        
        client_id = self.clients[0]["client_id"]
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}/timeline", headers=self.headers)
        data = response.json()
        
        timeline = data["timeline"]
        if len(timeline) < 2:
            print("Not enough timeline items to verify sorting")
            return
        
        # Check dates are in descending order (most recent first)
        dates = [item.get("date", "") for item in timeline if item.get("date")]
        for i in range(len(dates) - 1):
            assert dates[i] >= dates[i+1], f"Timeline not sorted: {dates[i]} should be >= {dates[i+1]}"
        
        print(f"Timeline correctly sorted by date (descending)")
    
    def test_timeline_404_for_invalid_client(self):
        """Timeline returns 404 for non-existent client"""
        response = requests.get(f"{BASE_URL}/api/clients/invalid_client_id/timeline", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Timeline correctly returns 404 for invalid client")
    
    def test_timeline_requires_auth(self):
        """Timeline endpoint requires authentication"""
        if not self.clients:
            pytest.skip("No clients in database")
        
        client_id = self.clients[0]["client_id"]
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}/timeline")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("Timeline correctly requires authentication")


class TestExportAuditReport:
    """Tests for GET /api/export/audit-report/{engagement_id}"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and engagement list"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        self.token = response.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get engagements
        eng_resp = requests.get(f"{BASE_URL}/api/service/engagements", headers=self.headers)
        self.engagements = eng_resp.json()
    
    def test_audit_report_returns_pdf(self):
        """Audit report endpoint returns valid PDF"""
        if not self.engagements:
            pytest.skip("No engagements in database")
        
        engagement_id = self.engagements[0]["engagement_id"]
        response = requests.get(f"{BASE_URL}/api/export/audit-report/{engagement_id}", headers=self.headers)
        
        assert response.status_code == 200, f"Audit report failed: {response.text}"
        assert response.headers.get("Content-Type") == "application/pdf", f"Expected PDF, got {response.headers.get('Content-Type')}"
        
        # Check PDF magic bytes
        content = response.content
        assert content[:4] == b'%PDF', "Response is not a valid PDF (missing PDF header)"
        print(f"Audit report PDF generated successfully, size: {len(content)} bytes")
    
    def test_audit_report_has_content_disposition(self):
        """Audit report has proper filename in Content-Disposition"""
        if not self.engagements:
            pytest.skip("No engagements in database")
        
        engagement_id = self.engagements[0]["engagement_id"]
        response = requests.get(f"{BASE_URL}/api/export/audit-report/{engagement_id}", headers=self.headers)
        
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert ".pdf" in content_disp, "Filename should end with .pdf"
        print(f"Content-Disposition: {content_disp}")
    
    def test_audit_report_404_for_invalid_engagement(self):
        """Audit report returns 404 for non-existent engagement"""
        response = requests.get(f"{BASE_URL}/api/export/audit-report/invalid_eng_id", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Audit report correctly returns 404 for invalid engagement")
    
    def test_audit_report_requires_auth(self):
        """Audit report endpoint requires authentication"""
        if not self.engagements:
            pytest.skip("No engagements in database")
        
        engagement_id = self.engagements[0]["engagement_id"]
        response = requests.get(f"{BASE_URL}/api/export/audit-report/{engagement_id}")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("Audit report correctly requires authentication")


class TestExportVATReturn:
    """Tests for GET /api/export/vat-return/{engagement_id}"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and VAT engagements"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        self.token = response.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get VAT engagements specifically
        eng_resp = requests.get(f"{BASE_URL}/api/service/engagements?service_type=vat_filing", headers=self.headers)
        self.vat_engagements = eng_resp.json()
        
        # Also get all engagements as fallback
        all_eng_resp = requests.get(f"{BASE_URL}/api/service/engagements", headers=self.headers)
        self.all_engagements = all_eng_resp.json()
    
    def test_vat_return_returns_pdf(self):
        """VAT return endpoint returns valid PDF"""
        # Use VAT engagement if available, otherwise any engagement
        engagements = self.vat_engagements if self.vat_engagements else self.all_engagements
        if not engagements:
            pytest.skip("No engagements in database")
        
        engagement_id = engagements[0]["engagement_id"]
        response = requests.get(f"{BASE_URL}/api/export/vat-return/{engagement_id}", headers=self.headers)
        
        assert response.status_code == 200, f"VAT return failed: {response.text}"
        assert response.headers.get("Content-Type") == "application/pdf", f"Expected PDF, got {response.headers.get('Content-Type')}"
        
        # Check PDF magic bytes
        content = response.content
        assert content[:4] == b'%PDF', "Response is not a valid PDF (missing PDF header)"
        print(f"VAT return PDF generated successfully, size: {len(content)} bytes")
    
    def test_vat_return_has_content_disposition(self):
        """VAT return has proper filename in Content-Disposition"""
        engagements = self.vat_engagements if self.vat_engagements else self.all_engagements
        if not engagements:
            pytest.skip("No engagements in database")
        
        engagement_id = engagements[0]["engagement_id"]
        response = requests.get(f"{BASE_URL}/api/export/vat-return/{engagement_id}", headers=self.headers)
        
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert ".pdf" in content_disp, "Filename should end with .pdf"
        print(f"Content-Disposition: {content_disp}")
    
    def test_vat_return_404_for_invalid_engagement(self):
        """VAT return returns 404 for non-existent engagement"""
        response = requests.get(f"{BASE_URL}/api/export/vat-return/invalid_eng_id", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("VAT return correctly returns 404 for invalid engagement")


class TestTasksRegression:
    """Regression tests for Tasks page - staff sees only their tasks"""
    
    def test_staff_sees_only_their_tasks(self):
        """Staff user with filter=my sees only tasks assigned to them"""
        # Login as staff
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        token = response.json()["session_token"]
        user_id = response.json()["user_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get tasks with my filter
        tasks_resp = requests.get(f"{BASE_URL}/api/tasks?filter=my", headers=headers)
        assert tasks_resp.status_code == 200, f"Tasks endpoint failed: {tasks_resp.text}"
        
        tasks = tasks_resp.json()
        # All tasks should be assigned to this user
        for task in tasks:
            assert task.get("assigned_to") == user_id, f"Task not assigned to current user: {task}"
        
        print(f"Staff sees {len(tasks)} tasks assigned to them")
    
    def test_partner_sees_all_tasks(self):
        """Partner can see all tasks without filter"""
        # Login as partner
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        token = response.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get all tasks
        tasks_resp = requests.get(f"{BASE_URL}/api/tasks", headers=headers)
        assert tasks_resp.status_code == 200, f"Tasks endpoint failed: {tasks_resp.text}"
        
        tasks = tasks_resp.json()
        print(f"Partner sees {len(tasks)} total tasks")


class TestClientMasterButtons:
    """Tests for Client Master Timeline and Edit buttons"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        self.token = response.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_clients_endpoint_returns_data(self):
        """GET /api/clients returns client list for partner"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=self.headers)
        assert response.status_code == 200, f"Clients endpoint failed: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Should return a list"
        print(f"Clients endpoint returns {len(clients)} clients")
        
        if clients:
            client = clients[0]
            assert "client_id" in client, "Client should have client_id"
            assert "name" in client, "Client should have name"
            print(f"First client: {client['name']} (ID: {client['client_id']})")
    
    def test_client_update_requires_partner(self):
        """PATCH /api/clients/{id} requires partner role"""
        # Login as staff
        staff_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        staff_token = staff_resp.json()["session_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Get a client
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=self.headers)
        clients = clients_resp.json()
        if not clients:
            pytest.skip("No clients in database")
        
        client_id = clients[0]["client_id"]
        
        # Try to update as staff - should fail
        update_resp = requests.patch(
            f"{BASE_URL}/api/clients/{client_id}",
            json={"status": "Active"},
            headers=staff_headers
        )
        assert update_resp.status_code == 403, f"Staff should not be able to edit clients, got {update_resp.status_code}"
        print("Client edit correctly restricted to partners only")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
