"""
Backend tests for NEW features in iteration 2:
- POST/GET /api/events (calendar events)
- POST/GET /api/appreciations (staff appreciation)
- Login flow verification
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


class TestAuth:
    """Authentication tests"""
    
    def test_partner_login(self):
        """Test partner login returns session token and correct role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "No session_token in response"
        assert data["role"] == "partner", f"Expected role 'partner', got '{data.get('role')}'"
        assert data["email"] == PARTNER_EMAIL
        print(f"SUCCESS: Partner login works, role={data['role']}")
    
    def test_staff_login(self):
        """Test staff login returns session token and correct role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "No session_token in response"
        assert data["role"] == "staff", f"Expected role 'staff', got '{data.get('role')}'"
        print(f"SUCCESS: Staff login works, role={data['role']}")
    
    def test_invalid_login(self):
        """Test invalid credentials return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Invalid login returns 401")


class TestEvents:
    """Calendar events API tests"""
    
    @pytest.fixture
    def partner_session(self):
        """Get partner session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_create_meeting_event(self, partner_session):
        """Test creating a meeting event"""
        event_data = {
            "title": "TEST_Meeting_Event",
            "event_type": "meeting",
            "date": "2026-04-15",
            "time": "10:00",
            "client_name": "Test Client",
            "notes": "Test meeting notes"
        }
        response = requests.post(
            f"{BASE_URL}/api/events",
            json=event_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create event failed: {response.text}"
        data = response.json()
        assert "event_id" in data, "No event_id in response"
        assert data["title"] == "TEST_Meeting_Event"
        assert data["event_type"] == "meeting"
        print(f"SUCCESS: Meeting event created with id={data['event_id']}")
        return data["event_id"]
    
    def test_create_followup_event(self, partner_session):
        """Test creating a follow-up event"""
        event_data = {
            "title": "TEST_Followup_Event",
            "event_type": "followup",
            "date": "2026-04-16",
            "time": "14:00",
            "notes": "Follow up on audit progress"
        }
        response = requests.post(
            f"{BASE_URL}/api/events",
            json=event_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create followup failed: {response.text}"
        data = response.json()
        assert data["event_type"] == "followup"
        print(f"SUCCESS: Follow-up event created with id={data['event_id']}")
    
    def test_create_task_event(self, partner_session):
        """Test creating a task event"""
        event_data = {
            "title": "TEST_Task_Event",
            "event_type": "task",
            "date": "2026-04-17"
        }
        response = requests.post(
            f"{BASE_URL}/api/events",
            json=event_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create task failed: {response.text}"
        data = response.json()
        assert data["event_type"] == "task"
        print(f"SUCCESS: Task event created with id={data['event_id']}")
    
    def test_create_deadline_event(self, partner_session):
        """Test creating a deadline event"""
        event_data = {
            "title": "TEST_Deadline_Event",
            "event_type": "deadline",
            "date": "2026-04-20"
        }
        response = requests.post(
            f"{BASE_URL}/api/events",
            json=event_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create deadline failed: {response.text}"
        data = response.json()
        assert data["event_type"] == "deadline"
        print(f"SUCCESS: Deadline event created with id={data['event_id']}")
    
    def test_get_events_by_month(self, partner_session):
        """Test getting events filtered by month"""
        response = requests.get(
            f"{BASE_URL}/api/events?month=2026-04",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get events failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of events"
        # Check that our test events are in the list
        test_events = [e for e in data if e["title"].startswith("TEST_")]
        print(f"SUCCESS: Got {len(data)} events for 2026-04, {len(test_events)} are test events")
    
    def test_get_all_events(self, partner_session):
        """Test getting all events without filter"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get all events failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of events"
        print(f"SUCCESS: Got {len(data)} total events")
    
    def test_delete_event(self, partner_session):
        """Test deleting an event"""
        # First create an event to delete
        event_data = {
            "title": "TEST_Delete_Event",
            "event_type": "meeting",
            "date": "2026-04-25"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/events",
            json=event_data,
            cookies={"session_token": partner_session}
        )
        event_id = create_response.json()["event_id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/events/{event_id}",
            cookies={"session_token": partner_session}
        )
        assert delete_response.status_code == 200, f"Delete event failed: {delete_response.text}"
        print(f"SUCCESS: Event {event_id} deleted")


class TestAppreciations:
    """Staff appreciation API tests"""
    
    @pytest.fixture
    def partner_session(self):
        """Get partner session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    @pytest.fixture
    def staff_session(self):
        """Get staff session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_partner_can_create_appreciation(self, partner_session):
        """Test that partners can create appreciations"""
        appr_data = {
            "staff_email": "fazil@nnadvisory.ae",
            "staff_name": "Fazil",
            "categories": ["Hard Work", "Commitment"],
            "rating": 5,
            "month": "2026-03",
            "message": "TEST appreciation message"
        }
        response = requests.post(
            f"{BASE_URL}/api/appreciations",
            json=appr_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create appreciation failed: {response.text}"
        data = response.json()
        assert "appreciation_id" in data, "No appreciation_id in response"
        assert data["staff_name"] == "Fazil"
        assert data["rating"] == 5
        assert "Hard Work" in data["categories"]
        print(f"SUCCESS: Appreciation created with id={data['appreciation_id']}")
    
    def test_staff_cannot_create_appreciation(self, staff_session):
        """Test that staff cannot create appreciations (403)"""
        appr_data = {
            "staff_email": "subin@nnadvisory.ae",
            "staff_name": "Subin",
            "categories": ["Teamwork"],
            "rating": 4,
            "month": "2026-03"
        }
        response = requests.post(
            f"{BASE_URL}/api/appreciations",
            json=appr_data,
            cookies={"session_token": staff_session}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Staff correctly blocked from creating appreciations (403)")
    
    def test_get_all_appreciations(self, partner_session):
        """Test getting all appreciations"""
        response = requests.get(
            f"{BASE_URL}/api/appreciations",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get appreciations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of appreciations"
        print(f"SUCCESS: Got {len(data)} appreciations")
    
    def test_get_appreciations_by_staff(self, partner_session):
        """Test getting appreciations filtered by staff email"""
        response = requests.get(
            f"{BASE_URL}/api/appreciations?staff_email=fazil@nnadvisory.ae",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get filtered appreciations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of appreciations"
        # All returned appreciations should be for Fazil
        for appr in data:
            assert appr["staff_email"] == "fazil@nnadvisory.ae"
        print(f"SUCCESS: Got {len(data)} appreciations for Fazil")


class TestTasks:
    """Task creation with client_name and assigned_to_name"""
    
    @pytest.fixture
    def partner_session(self):
        """Get partner session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_create_task_with_names(self, partner_session):
        """Test creating a task with client_name and assigned_to_name"""
        task_data = {
            "title": "TEST_Task_With_Names",
            "service_module": "VAT Filing",
            "due_date": "2026-04-30",
            "priority": "High",
            "client_name": "Al Baraka Trading LLC",
            "assigned_to": "fazil@nnadvisory.ae",
            "assigned_to_name": "Fazil",
            "description": "Test task description"
        }
        response = requests.post(
            f"{BASE_URL}/api/tasks",
            json=task_data,
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create task failed: {response.text}"
        data = response.json()
        assert "task_id" in data, "No task_id in response"
        assert data["client_name"] == "Al Baraka Trading LLC"
        assert data["assigned_to_name"] == "Fazil"
        print(f"SUCCESS: Task created with client_name and assigned_to_name")


class TestClients:
    """Client API tests"""
    
    @pytest.fixture
    def partner_session(self):
        """Get partner session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_get_clients(self, partner_session):
        """Test getting clients list"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get clients failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of clients"
        assert len(data) >= 10, f"Expected at least 10 seeded clients, got {len(data)}"
        print(f"SUCCESS: Got {len(data)} clients")


class TestDashboard:
    """Dashboard API tests"""
    
    @pytest.fixture
    def partner_session(self):
        """Get partner session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_get_dashboard_stats(self, partner_session):
        """Test getting dashboard stats"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get stats failed: {response.text}"
        data = response.json()
        assert "active_clients" in data
        assert "open_tasks" in data
        print(f"SUCCESS: Dashboard stats - clients={data['active_clients']}, tasks={data['open_tasks']}")
    
    def test_get_dashboard_activities(self, partner_session):
        """Test getting recent activities"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activities",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get activities failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of activities"
        print(f"SUCCESS: Got {len(data)} recent activities")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
