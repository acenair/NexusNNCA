"""
Backend API Tests for Nair & Nelliyatt Practice Management System
Tests: Auth, Dashboard, Clients, Tasks, VAT, Audit, AML endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


def _login_headers(email=PARTNER_EMAIL, password=PARTNER_PASSWORD):
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['session_token']}"}


class TestHealthAndUsersList:
    """Basic health and users list tests"""

    def test_users_list_requires_auth(self):
        """SECURITY REGRESSION: users-list must NOT be readable without a session"""
        response = requests.get(f"{BASE_URL}/api/auth/users-list")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ users-list rejects anonymous access (401)")

    def test_users_list_returns_11_users(self):
        """Verify users-list endpoint returns all 11 seeded users (authed)"""
        response = requests.get(f"{BASE_URL}/api/auth/users-list", headers=_login_headers())
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        users = response.json()
        assert len(users) == 11, f"Expected 11 users, got {len(users)}"
        
        # Verify 2 partners and 9 staff
        partners = [u for u in users if u.get('role') == 'partner']
        staff = [u for u in users if u.get('role') == 'staff']
        assert len(partners) == 2, f"Expected 2 partners, got {len(partners)}"
        assert len(staff) == 9, f"Expected 9 staff, got {len(staff)}"
        
        print(f"✓ Users list returns {len(users)} users (2 partners, 9 staff)")

    def test_login_directory_is_public_but_email_free(self):
        """SECURITY: public pre-auth directory exposes names/titles only, never emails/roles"""
        response = requests.get(f"{BASE_URL}/api/auth/login-directory")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        users = response.json()
        assert len(users) >= 11
        blob = response.text
        assert "@nnadvisory.ae" not in blob, "login-directory must not leak emails"
        assert "role" not in users[0], "login-directory must not leak roles"
        print(f"✓ login-directory: {len(users)} names, no emails/roles")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_partner_login_success(self):
        """Test partner login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "session_token" in data, "Missing session_token in response"
        assert data["email"] == PARTNER_EMAIL
        assert data["role"] == "partner"
        assert data["name"] == "Arjun Srinivas"
        print(f"✓ Partner login successful: {data['name']} ({data['role']})")
        return data["session_token"]
    
    def test_staff_login_success(self):
        """Test staff login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "session_token" in data, "Missing session_token in response"
        assert data["email"] == STAFF_EMAIL
        assert data["role"] == "staff"
        print(f"✓ Staff login successful: {data['name']} ({data['role']})")
        return data["session_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_auth_me_with_valid_token(self):
        """Test /auth/me returns user data with valid token"""
        # First login to get token
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        token = login_resp.json()["session_token"]
        
        # Test /auth/me
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["email"] == PARTNER_EMAIL
        assert data["role"] == "partner"
        print(f"✓ /auth/me returns correct user: {data['name']}")
    
    def test_auth_me_without_token(self):
        """Test /auth/me returns 401 without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ /auth/me correctly rejects unauthenticated request")
    
    def test_logout(self):
        """Test logout endpoint"""
        # Login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        token = login_resp.json()["session_token"]
        
        # Logout
        response = requests.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify token is invalidated
        me_resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 401, "Token should be invalidated after logout"
        print("✓ Logout successful and token invalidated")


class TestDashboard:
    """Dashboard endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_dashboard_stats(self):
        """Test dashboard stats endpoint returns expected structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify expected fields exist
        expected_fields = ["active_clients", "open_tasks", "overdue_tasks", "filings_this_month", "aml_alerts"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Dashboard stats: clients={data['active_clients']}, tasks={data['open_tasks']}, overdue={data['overdue_tasks']}")
    
    def test_dashboard_activities(self):
        """Test dashboard activities endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activities",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Activities should be a list"
        print(f"✓ Dashboard activities: {len(data)} items")


class TestClients:
    """Client CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_clients(self):
        """Test get clients endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Clients should be a list"
        print(f"✓ Get clients: {len(data)} clients")
    
    def test_create_and_get_client(self):
        """Test create client and verify persistence"""
        # Create client
        create_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={
                "name": "TEST_Client_ABC",
                "entity_type": "LLC",
                "jurisdiction": "Dubai",
                "aml_risk_rating": "Low"
            },
            headers=self.headers
        )
        assert create_resp.status_code == 200, f"Expected 200, got {create_resp.status_code}: {create_resp.text}"
        
        client = create_resp.json()
        assert client["name"] == "TEST_Client_ABC"
        assert "client_id" in client
        
        # Verify persistence
        get_resp = requests.get(
            f"{BASE_URL}/api/clients/{client['client_id']}",
            headers=self.headers
        )
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["name"] == "TEST_Client_ABC"
        print(f"✓ Created and verified client: {client['client_id']}")


class TestTasks:
    """Task CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_tasks(self):
        """Test get tasks endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/tasks",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Tasks should be a list"
        print(f"✓ Get tasks: {len(data)} tasks")
    
    def test_create_task(self):
        """Test create task"""
        create_resp = requests.post(
            f"{BASE_URL}/api/tasks",
            params={
                "title": "TEST_Task_Review",
                "service_module": "VAT",
                "due_date": "2026-04-30",
                "priority": "High",
                "description": "Test task description"
            },
            headers=self.headers
        )
        assert create_resp.status_code == 200, f"Expected 200, got {create_resp.status_code}: {create_resp.text}"
        
        task = create_resp.json()
        assert task["title"] == "TEST_Task_Review"
        assert "task_id" in task
        print(f"✓ Created task: {task['task_id']}")


class TestVAT:
    """VAT endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_vat_registrations(self):
        """Test get VAT registrations"""
        response = requests.get(
            f"{BASE_URL}/api/vat/registrations",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Get VAT registrations: {len(response.json())} items")
    
    def test_get_vat_filings(self):
        """Test get VAT filings"""
        response = requests.get(
            f"{BASE_URL}/api/vat/filings",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Get VAT filings: {len(response.json())} items")


class TestAudit:
    """Audit endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_audit_engagements(self):
        """Test get audit engagements"""
        response = requests.get(
            f"{BASE_URL}/api/audit/engagements",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Get audit engagements: {len(response.json())} items")


class TestAML:
    """AML endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_aml_alerts(self):
        """Test get AML alerts"""
        response = requests.get(
            f"{BASE_URL}/api/aml/alerts",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Get AML alerts: {len(response.json())} items")


class TestAnalytics:
    """Analytics endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        self.token = login_resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_analytics_stats(self):
        """Test get analytics stats"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/stats",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        expected_fields = ["total_clients", "total_tasks", "completed_tasks", "completion_rate"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print(f"✓ Analytics stats: clients={data['total_clients']}, tasks={data['total_tasks']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
