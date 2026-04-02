"""
Test Client Master Feature - Iteration 4
Tests:
- PATCH /api/clients/{client_id} for Managing Partner (should succeed)
- PATCH /api/clients/{client_id} for Senior Partner (should return 403)
- PATCH /api/clients/{client_id} for Staff (should return 403)
- GET /api/clients (all authenticated users can view)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClientMasterRBAC:
    """Test Client Master RBAC - Only Managing Partner can edit clients"""
    
    @pytest.fixture(scope="class")
    def managing_partner_session(self):
        """Login as Arjun (Managing Partner) and get session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Managing Partner login failed: {response.text}"
        data = response.json()
        assert data.get("title") == "Managing Partner", f"Expected Managing Partner, got {data.get('title')}"
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def senior_partner_session(self):
        """Login as Sooraj (Senior Partner) and get session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "sooraj@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Senior Partner login failed: {response.text}"
        data = response.json()
        assert data.get("title") == "Senior Partner", f"Expected Senior Partner, got {data.get('title')}"
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def staff_session(self):
        """Login as Fazil (Staff/Associate) and get session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "staff", f"Expected staff role, got {data.get('role')}"
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def test_client_id(self, managing_partner_session):
        """Get a client ID to test with"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {managing_partner_session}"}
        )
        assert response.status_code == 200
        clients = response.json()
        assert len(clients) > 0, "No clients found in database"
        return clients[0]["client_id"]
    
    def test_managing_partner_can_view_clients(self, managing_partner_session):
        """Managing Partner can view all clients"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {managing_partner_session}"}
        )
        assert response.status_code == 200
        clients = response.json()
        assert isinstance(clients, list)
        assert len(clients) > 0
        print(f"Managing Partner can view {len(clients)} clients")
    
    def test_managing_partner_can_edit_client(self, managing_partner_session, test_client_id):
        """Managing Partner can PATCH client data"""
        # Get original client data
        response = requests.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"}
        )
        assert response.status_code == 200
        original = response.json()
        original_name = original.get("name")
        
        # Update client name
        test_name = f"TEST_{original_name}"
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"name": test_name}
        )
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        updated = response.json()
        assert updated["name"] == test_name, f"Name not updated: {updated['name']}"
        print(f"Managing Partner successfully updated client name to: {test_name}")
        
        # Verify persistence with GET
        response = requests.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"}
        )
        assert response.status_code == 200
        fetched = response.json()
        assert fetched["name"] == test_name, "Update not persisted"
        
        # Restore original name
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"name": original_name}
        )
        assert response.status_code == 200
        print(f"Restored original client name: {original_name}")
    
    def test_managing_partner_can_update_services(self, managing_partner_session, test_client_id):
        """Managing Partner can update active_services"""
        # Get original services
        response = requests.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"}
        )
        original_services = response.json().get("active_services", [])
        
        # Update services
        new_services = ["Statutory Audit", "VAT Filing", "Corporate Tax"]
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"active_services": new_services}
        )
        assert response.status_code == 200
        updated = response.json()
        assert set(updated["active_services"]) == set(new_services)
        print(f"Managing Partner updated services to: {new_services}")
        
        # Restore original services
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"active_services": original_services}
        )
        assert response.status_code == 200
    
    def test_managing_partner_can_update_aml_risk(self, managing_partner_session, test_client_id):
        """Managing Partner can update AML risk rating"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"aml_risk_rating": "High"}
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["aml_risk_rating"] == "High"
        print("Managing Partner updated AML risk to High")
        
        # Restore to Low
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"aml_risk_rating": "Low"}
        )
        assert response.status_code == 200
    
    def test_managing_partner_can_update_status(self, managing_partner_session, test_client_id):
        """Managing Partner can update client status"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"status": "Inactive"}
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["status"] == "Inactive"
        print("Managing Partner updated status to Inactive")
        
        # Restore to Active
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"status": "Active"}
        )
        assert response.status_code == 200
    
    def test_senior_partner_cannot_edit_client(self, senior_partner_session, test_client_id):
        """Senior Partner (Sooraj) should get 403 when trying to PATCH client"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {senior_partner_session}"},
            json={"name": "Should Not Update"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        error = response.json()
        assert "Managing Partner" in error.get("detail", ""), f"Error message should mention Managing Partner: {error}"
        print(f"Senior Partner correctly denied: {error.get('detail')}")
    
    def test_staff_cannot_edit_client(self, staff_session, test_client_id):
        """Staff (Fazil) should get 403 when trying to PATCH client"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {staff_session}"},
            json={"name": "Should Not Update"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        error = response.json()
        assert "Managing Partner" in error.get("detail", ""), f"Error message should mention Managing Partner: {error}"
        print(f"Staff correctly denied: {error.get('detail')}")
    
    def test_senior_partner_can_view_clients(self, senior_partner_session):
        """Senior Partner can still view clients (just not edit)"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {senior_partner_session}"}
        )
        assert response.status_code == 200
        clients = response.json()
        assert len(clients) > 0
        print(f"Senior Partner can view {len(clients)} clients")
    
    def test_staff_can_view_clients(self, staff_session):
        """Staff can still view clients (just not edit)"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {staff_session}"}
        )
        assert response.status_code == 200
        clients = response.json()
        assert len(clients) > 0
        print(f"Staff can view {len(clients)} clients")
    
    def test_patch_nonexistent_client_returns_404(self, managing_partner_session):
        """PATCH on non-existent client should return 404"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/nonexistent_client_id",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={"name": "Test"}
        )
        assert response.status_code == 404
        print("Non-existent client correctly returns 404")
    
    def test_patch_empty_payload_returns_400(self, managing_partner_session, test_client_id):
        """PATCH with empty payload should return 400"""
        response = requests.patch(
            f"{BASE_URL}/api/clients/{test_client_id}",
            headers={"Authorization": f"Bearer {managing_partner_session}"},
            json={}
        )
        assert response.status_code == 400
        print("Empty payload correctly returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
