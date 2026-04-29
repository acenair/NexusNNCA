"""
Iteration 6 Backend Tests
Testing: RBAC dynamic filtering, Notifications, Service Engagements, Workflow-linked engagements
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


class TestAuth:
    """Authentication tests"""
    
    def test_partner_login(self):
        """Test partner (Arjun) can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        assert response.status_code == 200, f"Partner login failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert data["role"] == "partner"
        assert data["title"] == "Managing Partner"
        print(f"✓ Partner login successful: {data['name']}")
    
    def test_staff_login(self):
        """Test staff (Fazil) can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert data["role"] == "staff"
        print(f"✓ Staff login successful: {data['name']}")


class TestRBACPublic:
    """Test RBAC public endpoint - any authenticated user can fetch"""
    
    @pytest.fixture
    def partner_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    @pytest.fixture
    def staff_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_rbac_public_partner_access(self, partner_session):
        """Partner can access RBAC public endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/settings/rbac-public",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"RBAC public failed: {response.text}"
        data = response.json()
        assert "config" in data
        assert "staff" in data["config"]
        assert "partner" in data["config"]
        print(f"✓ Partner can access RBAC public config")
    
    def test_rbac_public_staff_access(self, staff_session):
        """Staff can access RBAC public endpoint (for sidebar filtering)"""
        response = requests.get(
            f"{BASE_URL}/api/settings/rbac-public",
            cookies={"session_token": staff_session}
        )
        assert response.status_code == 200, f"Staff RBAC public failed: {response.text}"
        data = response.json()
        assert "config" in data
        # Verify staff config exists
        assert "staff" in data["config"]
        print(f"✓ Staff can access RBAC public config for sidebar filtering")
    
    def test_rbac_public_returns_correct_structure(self, partner_session):
        """RBAC config has correct structure with all sections"""
        response = requests.get(
            f"{BASE_URL}/api/settings/rbac-public",
            cookies={"session_token": partner_session}
        )
        data = response.json()
        expected_sections = ["overview", "audit", "vat", "corporate", "advisory", "aml"]
        for section in expected_sections:
            assert section in data["config"]["staff"], f"Missing section: {section}"
            assert section in data["config"]["partner"], f"Missing section: {section}"
        print(f"✓ RBAC config has all expected sections: {expected_sections}")


class TestNotifications:
    """Test notifications endpoint"""
    
    @pytest.fixture
    def partner_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    @pytest.fixture
    def staff_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_get_notifications_partner(self, partner_session):
        """Partner can get notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Partner notifications returned: {len(data)} items")
        
        # Check notification structure if any exist
        if len(data) > 0:
            notif = data[0]
            assert "notification_id" in notif
            assert "title" in notif
            assert "message" in notif
            assert "severity" in notif
            print(f"  First notification: {notif['title']} ({notif['severity']})")
    
    def test_get_notifications_staff(self, staff_session):
        """Staff can get notifications (filtered to their tasks)"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            cookies={"session_token": staff_session}
        )
        assert response.status_code == 200, f"Staff notifications failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Staff notifications returned: {len(data)} items")
    
    def test_dismiss_notification(self, partner_session):
        """Test dismissing a notification"""
        # First get notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            cookies={"session_token": partner_session}
        )
        notifications = response.json()
        
        if len(notifications) > 0:
            notif_id = notifications[0]["notification_id"]
            # Dismiss it
            dismiss_response = requests.patch(
                f"{BASE_URL}/api/notifications/{notif_id}/dismiss",
                cookies={"session_token": partner_session}
            )
            assert dismiss_response.status_code == 200, f"Dismiss failed: {dismiss_response.text}"
            print(f"✓ Notification dismissed: {notif_id}")
            
            # Verify it's no longer in the list
            response2 = requests.get(
                f"{BASE_URL}/api/notifications",
                cookies={"session_token": partner_session}
            )
            notif_ids = [n["notification_id"] for n in response2.json()]
            assert notif_id not in notif_ids, "Dismissed notification still in list"
            print(f"✓ Dismissed notification no longer in list")
        else:
            print("⚠ No notifications to dismiss (test skipped)")


class TestServiceEngagements:
    """Test service engagements CRUD"""
    
    @pytest.fixture
    def partner_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_get_statutory_audit_engagements(self, partner_session):
        """Get statutory audit engagements"""
        response = requests.get(
            f"{BASE_URL}/api/service/engagements?service_type=statutory_audit",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get engagements failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Statutory audit engagements: {len(data)} found")
        
        if len(data) > 0:
            eng = data[0]
            assert "engagement_id" in eng
            assert "client_name" in eng
            assert "checklist" in eng
            assert eng["service_type"] == "statutory_audit"
            print(f"  First engagement: {eng['client_name']} - {eng['status']}")
    
    def test_get_vat_filing_engagements(self, partner_session):
        """Get VAT filing engagements"""
        response = requests.get(
            f"{BASE_URL}/api/service/engagements?service_type=vat_filing",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get VAT engagements failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ VAT filing engagements: {len(data)} found")
    
    def test_get_aml_review_engagements(self, partner_session):
        """Get AML review engagements"""
        response = requests.get(
            f"{BASE_URL}/api/service/engagements?service_type=aml_review",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get AML engagements failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ AML review engagements: {len(data)} found")
    
    def test_create_engagement_with_default_checklist(self, partner_session):
        """Create engagement without workflow - uses default checklist template"""
        # First get a client
        clients_response = requests.get(
            f"{BASE_URL}/api/clients",
            cookies={"session_token": partner_session}
        )
        clients = clients_response.json()
        assert len(clients) > 0, "No clients found"
        client_id = clients[0]["client_id"]
        
        # Create engagement
        response = requests.post(
            f"{BASE_URL}/api/service/engagements",
            json={
                "service_type": "statutory_audit",
                "client_id": client_id,
                "notes": "TEST_engagement_default_checklist"
            },
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create engagement failed: {response.text}"
        data = response.json()
        assert "engagement_id" in data
        assert "checklist" in data
        assert len(data["checklist"]) > 0, "Checklist should have groups"
        print(f"✓ Created engagement with default checklist: {data['engagement_id']}")
        print(f"  Checklist groups: {[g['group'] for g in data['checklist']]}")
        return data["engagement_id"]
    
    def test_toggle_checklist_item(self, partner_session):
        """Toggle a checklist item"""
        # Get engagements
        response = requests.get(
            f"{BASE_URL}/api/service/engagements?service_type=statutory_audit",
            cookies={"session_token": partner_session}
        )
        engagements = response.json()
        
        if len(engagements) > 0:
            eng = engagements[0]
            eng_id = eng["engagement_id"]
            
            # Toggle first item in first group
            toggle_response = requests.patch(
                f"{BASE_URL}/api/service/engagements/{eng_id}/checklist",
                json={"group_index": 0, "item_index": 0, "done": True},
                cookies={"session_token": partner_session}
            )
            assert toggle_response.status_code == 200, f"Toggle failed: {toggle_response.text}"
            data = toggle_response.json()
            assert "progress" in data
            assert "phase" in data
            print(f"✓ Toggled checklist item - Progress: {data['progress']}%, Phase: {data['phase']}")
        else:
            print("⚠ No engagements to test toggle (skipped)")


class TestWorkflowLinkedEngagements:
    """Test workflow-linked engagement creation"""
    
    @pytest.fixture
    def partner_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_get_workflows_for_service_type(self, partner_session):
        """Get workflows available for a service type"""
        response = requests.get(
            f"{BASE_URL}/api/service/workflows-for-type?service_type=statutory_audit",
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Get workflows failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Workflows for statutory_audit: {len(data)} found")
        
        if len(data) > 0:
            wf = data[0]
            assert "workflow_id" in wf
            assert "name" in wf
            assert "steps" in wf
            print(f"  First workflow: {wf['name']} ({len(wf['steps'])} steps)")
    
    def test_create_engagement_with_workflow(self, partner_session):
        """Create engagement with workflow - checklist from workflow steps"""
        # Get workflows
        wf_response = requests.get(
            f"{BASE_URL}/api/service/workflows-for-type?service_type=statutory_audit",
            cookies={"session_token": partner_session}
        )
        workflows = wf_response.json()
        
        if len(workflows) == 0:
            print("⚠ No workflows found - skipping workflow-linked test")
            return
        
        workflow_id = workflows[0]["workflow_id"]
        workflow_name = workflows[0]["name"]
        
        # Get a client
        clients_response = requests.get(
            f"{BASE_URL}/api/clients",
            cookies={"session_token": partner_session}
        )
        clients = clients_response.json()
        client_id = clients[0]["client_id"]
        
        # Create engagement with workflow
        response = requests.post(
            f"{BASE_URL}/api/service/engagements",
            json={
                "service_type": "statutory_audit",
                "client_id": client_id,
                "workflow_id": workflow_id,
                "notes": "TEST_engagement_with_workflow"
            },
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data.get("workflow_id") == workflow_id
        assert data.get("workflow_name") == workflow_name
        assert "checklist" in data
        print(f"✓ Created engagement with workflow: {workflow_name}")
        print(f"  Checklist groups from workflow: {[g['group'] for g in data['checklist']]}")


class TestRBACDynamicFiltering:
    """Test that RBAC settings affect sidebar visibility"""
    
    @pytest.fixture
    def partner_session(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PARTNER_PASSWORD
        })
        return response.json()["session_token"]
    
    def test_set_rbac_disable_corporate_advisory_for_staff(self, partner_session):
        """Set RBAC to disable Corporate and Advisory for staff"""
        # First get current config
        get_response = requests.get(
            f"{BASE_URL}/api/settings/rbac",
            cookies={"session_token": partner_session}
        )
        current_config = get_response.json().get("config", {})
        
        # Update to disable Corporate and Advisory for staff
        new_config = {
            "staff": {
                "overview": True,
                "audit": True,
                "vat": True,
                "corporate": False,  # Disabled
                "advisory": False,   # Disabled
                "aml": True
            },
            "partner": {
                "overview": True,
                "audit": True,
                "vat": True,
                "corporate": True,
                "advisory": True,
                "aml": True
            }
        }
        
        response = requests.patch(
            f"{BASE_URL}/api/settings/rbac",
            json={"config": new_config},
            cookies={"session_token": partner_session}
        )
        assert response.status_code == 200, f"RBAC update failed: {response.text}"
        print(f"✓ RBAC updated: Corporate=False, Advisory=False for staff")
        
        # Verify the change
        verify_response = requests.get(
            f"{BASE_URL}/api/settings/rbac-public",
            cookies={"session_token": partner_session}
        )
        verify_data = verify_response.json()
        assert verify_data["config"]["staff"]["corporate"] == False
        assert verify_data["config"]["staff"]["advisory"] == False
        assert verify_data["config"]["partner"]["corporate"] == True
        assert verify_data["config"]["partner"]["advisory"] == True
        print(f"✓ RBAC verified: Staff cannot see Corporate/Advisory, Partner can see all")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
