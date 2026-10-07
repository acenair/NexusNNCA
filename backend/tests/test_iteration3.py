"""
Iteration 3 Backend Tests - AI Assistant, Calendar, and Core Features
Tests for Nair & Nelliyatt Practice Management System
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nexus-compliance.preview.emergentagent.com')

class TestAuth:
    """Authentication tests"""
    
    def test_partner_login(self):
        """Test partner login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "session_token" in data
        assert data["role"] == "partner"
        assert data["name"] == "Arjun Srinivas"
        print(f"✓ Partner login successful: {data['name']}")
    
    def test_staff_login(self):
        """Test staff login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "session_token" in data
        assert data["role"] == "staff"
        print(f"✓ Staff login successful: {data['name']}")
    
    def test_invalid_login(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login rejected correctly")
    
    def test_users_list(self):
        """Test getting users list (requires auth since security fix)"""
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae", "password": "nn123456"
        })
        headers = {"Authorization": f"Bearer {login.json()['session_token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/users-list", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 11  # At least 11 seeded users
        partners = [u for u in data if u["role"] == "partner"]
        staff = [u for u in data if u["role"] == "staff"]
        assert len(partners) >= 2
        assert len(staff) >= 9
        print(f"✓ Users list: {len(partners)} partners, {len(staff)} staff")


class TestAIAssistant:
    """AI Assistant (Gemini 3 Flash) tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json().get("session_token")
    
    def test_ai_chat_vat_question(self, auth_token):
        """Test AI chat with VAT-related question"""
        session_id = f"test_vat_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "session_id": session_id,
                "message": "What is the VAT rate in UAE?"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "session_id" in data
        assert len(data["response"]) > 50  # Should have substantial response
        assert "5%" in data["response"] or "five percent" in data["response"].lower()
        print(f"✓ AI VAT question answered ({len(data['response'])} chars)")
    
    def test_ai_chat_firm_data_question(self, auth_token):
        """Test AI chat with firm data question"""
        session_id = f"test_firm_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "session_id": session_id,
                "message": "Which clients have overdue tasks?"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert len(data["response"]) > 20
        print(f"✓ AI firm data question answered ({len(data['response'])} chars)")
    
    def test_ai_get_sessions(self, auth_token):
        """Test getting AI chat sessions"""
        response = requests.get(
            f"{BASE_URL}/api/ai/sessions",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ AI sessions retrieved: {len(data)} sessions")
    
    def test_ai_get_chat_history(self, auth_token):
        """Test getting chat history for a session"""
        # First create a session
        session_id = f"test_history_{int(time.time())}"
        requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "session_id": session_id,
                "message": "Hello"
            }
        )
        
        # Get history
        response = requests.get(
            f"{BASE_URL}/api/ai/chat/{session_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # User message + AI response
        print(f"✓ Chat history retrieved: {len(data)} messages")
    
    def test_ai_delete_session(self, auth_token):
        """Test deleting a chat session"""
        session_id = f"test_delete_{int(time.time())}"
        # Create session
        requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "session_id": session_id,
                "message": "Test message to delete"
            }
        )
        
        # Delete session
        response = requests.delete(
            f"{BASE_URL}/api/ai/chat/{session_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print("✓ AI session deleted successfully")


class TestCalendar:
    """Calendar and Events tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json().get("session_token")
    
    def test_get_events_by_month(self, auth_token):
        """Test getting events for a specific month"""
        response = requests.get(
            f"{BASE_URL}/api/events?month=2026-03",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Events for March 2026: {len(data)} events")
    
    def test_create_meeting_event(self, auth_token):
        """Test creating a meeting event"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "TEST_Meeting from pytest",
                "date": "2026-04-15",
                "time": "10:00",
                "event_type": "meeting",
                "client_name": "Test Client",
                "notes": "Test meeting notes"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "event_id" in data
        assert data["title"] == "TEST_Meeting from pytest"
        print(f"✓ Meeting event created: {data['event_id']}")
        return data["event_id"]
    
    def test_create_deadline_event(self, auth_token):
        """Test creating a deadline event"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "TEST_Deadline from pytest",
                "date": "2026-04-30",
                "event_type": "deadline",
                "notes": "Test deadline"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event_type"] == "deadline"
        print(f"✓ Deadline event created: {data['event_id']}")
    
    def test_create_followup_event(self, auth_token):
        """Test creating a follow-up event"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "TEST_Followup from pytest",
                "date": "2026-04-20",
                "event_type": "followup",
                "assigned_to": "fazil@nnadvisory.ae",
                "assigned_to_name": "Fazil"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event_type"] == "followup"
        print(f"✓ Follow-up event created: {data['event_id']}")


class TestDashboard:
    """Dashboard API tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json().get("session_token")
    
    def test_dashboard_stats(self, auth_token):
        """Test dashboard statistics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "active_clients" in data
        assert "overdue_tasks" in data
        print(f"✓ Dashboard stats: {data['active_clients']} clients, {data['overdue_tasks']} overdue")
    
    def test_dashboard_activities(self, auth_token):
        """Test dashboard activities endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activities",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Dashboard activities: {len(data)} items")


class TestTasks:
    """Task management tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json().get("session_token")
    
    def test_create_task(self, auth_token):
        """Test creating a new task"""
        response = requests.post(
            f"{BASE_URL}/api/tasks",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "TEST_Task from pytest",
                "service_module": "VAT Filing",
                "client_name": "Test Client",
                "assigned_to": "fazil@nnadvisory.ae",
                "assigned_to_name": "Fazil",
                "due_date": "2026-04-25",
                "priority": "High",
                "description": "Test task description"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["title"] == "TEST_Task from pytest"
        print(f"✓ Task created: {data['task_id']}")
    
    def test_get_tasks(self, auth_token):
        """Test getting tasks list"""
        response = requests.get(
            f"{BASE_URL}/api/tasks",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Tasks retrieved: {len(data)} tasks")


class TestClients:
    """Client management tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json().get("session_token")
    
    def test_get_clients(self, auth_token):
        """Test getting clients list"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # Should have seeded clients
        print(f"✓ Clients retrieved: {len(data)} clients")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
