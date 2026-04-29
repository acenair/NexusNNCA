"""
Test Settings API endpoints - RBAC, Storage, Workflows
Iteration 5: Testing partner-only Settings page features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSettingsRBAC:
    """Test RBAC settings endpoints - Partner only access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as partner (Arjun) for tests"""
        self.session = requests.Session()
        # Login as Managing Partner (Arjun)
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_resp.status_code == 200, f"Partner login failed: {login_resp.text}"
        self.partner_token = login_resp.json().get("session_token")
        self.partner_headers = {"Authorization": f"Bearer {self.partner_token}"}
        
        # Login as Staff (Fazil)
        staff_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert staff_resp.status_code == 200, f"Staff login failed: {staff_resp.text}"
        self.staff_token = staff_resp.json().get("session_token")
        self.staff_headers = {"Authorization": f"Bearer {self.staff_token}"}
    
    # --- RBAC Endpoint Tests ---
    def test_get_rbac_partner_success(self):
        """Partner can GET RBAC settings"""
        resp = self.session.get(f"{BASE_URL}/api/settings/rbac", headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "config" in data or "type" in data, "Response should have config or type"
        print(f"PASS: Partner GET /api/settings/rbac - {resp.status_code}")
    
    def test_get_rbac_staff_denied(self):
        """Staff cannot GET RBAC settings (403)"""
        resp = self.session.get(f"{BASE_URL}/api/settings/rbac", headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff GET /api/settings/rbac denied - {resp.status_code}")
    
    def test_patch_rbac_partner_success(self):
        """Partner can PATCH RBAC settings"""
        rbac_config = {
            "config": {
                "staff": {"overview": True, "audit": True, "vat": True, "corporate": False, "advisory": False, "aml": True},
                "partner": {"overview": True, "audit": True, "vat": True, "corporate": True, "advisory": True, "aml": True}
            }
        }
        resp = self.session.patch(f"{BASE_URL}/api/settings/rbac", json=rbac_config, headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify persistence with GET
        get_resp = self.session.get(f"{BASE_URL}/api/settings/rbac", headers=self.partner_headers)
        assert get_resp.status_code == 200
        saved_config = get_resp.json().get("config", {})
        assert saved_config.get("staff", {}).get("corporate") == False, "Corporate should be False for staff"
        print(f"PASS: Partner PATCH /api/settings/rbac - saved and verified")
    
    def test_patch_rbac_staff_denied(self):
        """Staff cannot PATCH RBAC settings (403)"""
        rbac_config = {"config": {"staff": {"overview": True}, "partner": {"overview": True}}}
        resp = self.session.patch(f"{BASE_URL}/api/settings/rbac", json=rbac_config, headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff PATCH /api/settings/rbac denied - {resp.status_code}")


class TestSettingsStorage:
    """Test Storage settings endpoints - Partner only access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as partner and staff"""
        self.session = requests.Session()
        # Partner login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_resp.status_code == 200
        self.partner_token = login_resp.json().get("session_token")
        self.partner_headers = {"Authorization": f"Bearer {self.partner_token}"}
        
        # Staff login
        staff_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert staff_resp.status_code == 200
        self.staff_token = staff_resp.json().get("session_token")
        self.staff_headers = {"Authorization": f"Bearer {self.staff_token}"}
    
    def test_get_storage_partner_success(self):
        """Partner can GET storage settings"""
        resp = self.session.get(f"{BASE_URL}/api/settings/storage", headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "config" in data or "type" in data
        print(f"PASS: Partner GET /api/settings/storage - {resp.status_code}")
    
    def test_get_storage_staff_denied(self):
        """Staff cannot GET storage settings (403)"""
        resp = self.session.get(f"{BASE_URL}/api/settings/storage", headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff GET /api/settings/storage denied - {resp.status_code}")
    
    def test_patch_storage_aws_s3(self):
        """Partner can save AWS S3 config"""
        storage_config = {
            "config": {
                "provider": "aws_s3",
                "aws_s3": {
                    "bucket_name": "test-bucket",
                    "region": "me-south-1",
                    "access_key_id": "AKIATEST123",
                    "secret_access_key": "testsecret"
                },
                "google_drive": {},
                "onedrive": {}
            }
        }
        resp = self.session.patch(f"{BASE_URL}/api/settings/storage", json=storage_config, headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify persistence
        get_resp = self.session.get(f"{BASE_URL}/api/settings/storage", headers=self.partner_headers)
        assert get_resp.status_code == 200
        saved = get_resp.json().get("config", {})
        assert saved.get("provider") == "aws_s3", "Provider should be aws_s3"
        assert saved.get("aws_s3", {}).get("bucket_name") == "test-bucket"
        print(f"PASS: Partner PATCH /api/settings/storage (AWS S3) - saved and verified")
    
    def test_patch_storage_google_drive(self):
        """Partner can save Google Drive config"""
        storage_config = {
            "config": {
                "provider": "google_drive",
                "aws_s3": {},
                "google_drive": {
                    "folder_id": "test-folder-id",
                    "service_account_email": "test@project.iam.gserviceaccount.com"
                },
                "onedrive": {}
            }
        }
        resp = self.session.patch(f"{BASE_URL}/api/settings/storage", json=storage_config, headers=self.partner_headers)
        assert resp.status_code == 200
        print(f"PASS: Partner PATCH /api/settings/storage (Google Drive) - {resp.status_code}")
    
    def test_patch_storage_staff_denied(self):
        """Staff cannot PATCH storage settings (403)"""
        storage_config = {"config": {"provider": "default"}}
        resp = self.session.patch(f"{BASE_URL}/api/settings/storage", json=storage_config, headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff PATCH /api/settings/storage denied - {resp.status_code}")


class TestSettingsWorkflows:
    """Test Workflows settings endpoints - Partner only access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as partner and staff"""
        self.session = requests.Session()
        # Partner login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_resp.status_code == 200
        self.partner_token = login_resp.json().get("session_token")
        self.partner_headers = {"Authorization": f"Bearer {self.partner_token}"}
        
        # Staff login
        staff_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert staff_resp.status_code == 200
        self.staff_token = staff_resp.json().get("session_token")
        self.staff_headers = {"Authorization": f"Bearer {self.staff_token}"}
        
        self.created_workflow_id = None
    
    def test_get_workflows_partner_success(self):
        """Partner can GET workflows"""
        resp = self.session.get(f"{BASE_URL}/api/settings/workflows", headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list of workflows"
        print(f"PASS: Partner GET /api/settings/workflows - {len(data)} workflows found")
    
    def test_get_workflows_staff_denied(self):
        """Staff cannot GET workflows (403)"""
        resp = self.session.get(f"{BASE_URL}/api/settings/workflows", headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff GET /api/settings/workflows denied - {resp.status_code}")
    
    def test_create_workflow_partner_success(self):
        """Partner can POST new workflow"""
        workflow_data = {
            "name": "TEST_Custom Onboarding Workflow",
            "service_type": "statutory_audit",
            "steps": [
                {"name": "Initial Contact", "description": "First client meeting", "order": 0},
                {"name": "Document Collection", "description": "Gather required docs", "order": 1},
                {"name": "Review & Approval", "description": "Partner review", "order": 2}
            ],
            "is_preset": False
        }
        resp = self.session.post(f"{BASE_URL}/api/settings/workflows", json=workflow_data, headers=self.partner_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "workflow_id" in data, "Response should have workflow_id"
        assert data["name"] == "TEST_Custom Onboarding Workflow"
        assert len(data["steps"]) == 3
        self.created_workflow_id = data["workflow_id"]
        print(f"PASS: Partner POST /api/settings/workflows - created {data['workflow_id']}")
        
        # Verify with GET
        get_resp = self.session.get(f"{BASE_URL}/api/settings/workflows", headers=self.partner_headers)
        workflows = get_resp.json()
        found = any(w["workflow_id"] == self.created_workflow_id for w in workflows)
        assert found, "Created workflow should appear in GET list"
        print(f"PASS: Created workflow verified in GET list")
    
    def test_create_workflow_staff_denied(self):
        """Staff cannot POST workflows (403)"""
        workflow_data = {
            "name": "Staff Workflow",
            "service_type": "vat_filing",
            "steps": [{"name": "Step 1", "description": "", "order": 0}]
        }
        resp = self.session.post(f"{BASE_URL}/api/settings/workflows", json=workflow_data, headers=self.staff_headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print(f"PASS: Staff POST /api/settings/workflows denied - {resp.status_code}")
    
    def test_update_workflow_partner_success(self):
        """Partner can PATCH existing workflow"""
        # First create a workflow to update
        workflow_data = {
            "name": "TEST_Workflow To Update",
            "service_type": "vat_filing",
            "steps": [{"name": "Original Step", "description": "", "order": 0}]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/settings/workflows", json=workflow_data, headers=self.partner_headers)
        assert create_resp.status_code == 200
        wf_id = create_resp.json()["workflow_id"]
        
        # Update it
        update_data = {
            "name": "TEST_Updated Workflow Name",
            "steps": [
                {"name": "Updated Step 1", "description": "New desc", "order": 0},
                {"name": "New Step 2", "description": "", "order": 1}
            ]
        }
        patch_resp = self.session.patch(f"{BASE_URL}/api/settings/workflows/{wf_id}", json=update_data, headers=self.partner_headers)
        assert patch_resp.status_code == 200, f"Expected 200, got {patch_resp.status_code}: {patch_resp.text}"
        print(f"PASS: Partner PATCH /api/settings/workflows/{wf_id} - updated")
        
        # Cleanup - delete the test workflow
        self.session.delete(f"{BASE_URL}/api/settings/workflows/{wf_id}", headers=self.partner_headers)
    
    def test_delete_workflow_partner_success(self):
        """Partner can DELETE custom workflow"""
        # Create a workflow to delete
        workflow_data = {
            "name": "TEST_Workflow To Delete",
            "service_type": "aml_review",
            "steps": [{"name": "Step", "description": "", "order": 0}],
            "is_preset": False
        }
        create_resp = self.session.post(f"{BASE_URL}/api/settings/workflows", json=workflow_data, headers=self.partner_headers)
        assert create_resp.status_code == 200
        wf_id = create_resp.json()["workflow_id"]
        
        # Delete it
        del_resp = self.session.delete(f"{BASE_URL}/api/settings/workflows/{wf_id}", headers=self.partner_headers)
        assert del_resp.status_code == 200, f"Expected 200, got {del_resp.status_code}: {del_resp.text}"
        
        # Verify it's gone (soft delete - is_deleted: true)
        get_resp = self.session.get(f"{BASE_URL}/api/settings/workflows", headers=self.partner_headers)
        workflows = get_resp.json()
        found = any(w["workflow_id"] == wf_id for w in workflows)
        assert not found, "Deleted workflow should not appear in GET list"
        print(f"PASS: Partner DELETE /api/settings/workflows/{wf_id} - deleted and verified")
    
    def test_delete_workflow_staff_denied(self):
        """Staff cannot DELETE workflows (403)"""
        # Get any existing workflow
        get_resp = self.session.get(f"{BASE_URL}/api/settings/workflows", headers=self.partner_headers)
        workflows = get_resp.json()
        if workflows:
            wf_id = workflows[0]["workflow_id"]
            del_resp = self.session.delete(f"{BASE_URL}/api/settings/workflows/{wf_id}", headers=self.staff_headers)
            assert del_resp.status_code == 403, f"Expected 403, got {del_resp.status_code}: {del_resp.text}"
            print(f"PASS: Staff DELETE /api/settings/workflows denied - {del_resp.status_code}")
        else:
            print("SKIP: No workflows to test delete denial")


class TestRegressionDocuments:
    """Regression test - Documents page still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("session_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_documents_list(self):
        """GET /api/documents returns list"""
        resp = self.session.get(f"{BASE_URL}/api/documents", headers=self.headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert isinstance(resp.json(), list)
        print(f"PASS: Regression - GET /api/documents works - {resp.status_code}")


class TestRegressionAIAssistant:
    """Regression test - AI Assistant still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("session_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_ai_chat_endpoint(self):
        """POST /api/ai/chat works"""
        import uuid
        chat_data = {
            "session_id": f"test_{uuid.uuid4().hex[:8]}",
            "message": "What is UAE VAT rate?"
        }
        resp = self.session.post(f"{BASE_URL}/api/ai/chat", json=chat_data, headers=self.headers, timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "response" in data, "AI response should have 'response' field"
        print(f"PASS: Regression - POST /api/ai/chat works - got response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
