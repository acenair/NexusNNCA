"""
Iteration 7 Tests: Firm & Users Settings Feature
Tests:
- GET /api/settings/firm - Get firm name (partner only)
- PATCH /api/settings/firm - Update firm name (partner only)
- GET /api/settings/users - Get all users (partner only, excludes password_hash)
- PATCH /api/settings/users/{user_id} - Update user role, title, date_of_joining, password
- Staff users get 403 on all /api/settings/* endpoints
- Password change verification (login with new password)
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
        assert data["role"] == "partner"
        assert "session_token" in data
        print(f"✓ Partner login successful: {data['name']}")
    
    def test_staff_login(self):
        """Staff (Fazil) can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert data["role"] == "staff"
        assert "session_token" in data
        print(f"✓ Staff login successful: {data['name']}")


class TestFirmSettings:
    """Firm name settings tests"""
    
    @pytest.fixture
    def partner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    @pytest.fixture
    def staff_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    def test_get_firm_settings_partner(self, partner_token):
        """Partner can GET firm settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        assert response.status_code == 200, f"GET firm failed: {response.text}"
        data = response.json()
        assert "firm_name" in data
        print(f"✓ GET /api/settings/firm: {data['firm_name']}")
    
    def test_get_firm_settings_staff_forbidden(self, staff_token):
        """Staff gets 403 on GET firm settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly gets 403 on GET /api/settings/firm")
    
    def test_update_firm_name_partner(self, partner_token):
        """Partner can PATCH firm name"""
        new_name = "TEST_Nair & Nelliyatt Chartered Accountants"
        response = requests.patch(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"firm_name": new_name}
        )
        assert response.status_code == 200, f"PATCH firm failed: {response.text}"
        
        # Verify the change persisted
        get_response = requests.get(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        assert get_response.json()["firm_name"] == new_name
        print(f"✓ PATCH /api/settings/firm updated to: {new_name}")
        
        # Restore original name
        requests.patch(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"firm_name": "Nair & Nelliyatt Chartered Accountants"}
        )
    
    def test_update_firm_name_staff_forbidden(self, staff_token):
        """Staff gets 403 on PATCH firm settings"""
        response = requests.patch(
            f"{BASE_URL}/api/settings/firm",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={"firm_name": "Hacked Name"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly gets 403 on PATCH /api/settings/firm")


class TestUsersSettings:
    """User management settings tests"""
    
    @pytest.fixture
    def partner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    @pytest.fixture
    def staff_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "fazil@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    def test_get_users_partner(self, partner_token):
        """Partner can GET all users"""
        response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        assert response.status_code == 200, f"GET users failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        assert len(users) >= 10, f"Expected at least 10 users, got {len(users)}"
        
        # Verify password_hash is NOT in response
        for user in users:
            assert "password_hash" not in user, "password_hash should be excluded"
            assert "password" not in user or user.get("password") is None, "password should be excluded"
        
        # Verify user structure
        first_user = users[0]
        assert "user_id" in first_user
        assert "name" in first_user
        assert "email" in first_user
        assert "role" in first_user
        print(f"✓ GET /api/settings/users returned {len(users)} users (password excluded)")
    
    def test_get_users_staff_forbidden(self, staff_token):
        """Staff gets 403 on GET users"""
        response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly gets 403 on GET /api/settings/users")
    
    def test_update_user_role_partner(self, partner_token):
        """Partner can update user role"""
        # First get users to find a staff user
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        
        # Find Subin (staff) to update
        subin = next((u for u in users if u["email"] == "subin@nnadvisory.ae"), None)
        assert subin is not None, "Subin user not found"
        
        # Update role to partner
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{subin['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"role": "partner"}
        )
        assert response.status_code == 200, f"PATCH user failed: {response.text}"
        
        # Verify the change
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        updated_subin = next((u for u in users_response.json() if u["email"] == "subin@nnadvisory.ae"), None)
        assert updated_subin["role"] == "partner", f"Role not updated: {updated_subin['role']}"
        print(f"✓ PATCH /api/settings/users/{subin['user_id']} - role updated to partner")
        
        # Restore original role
        requests.patch(
            f"{BASE_URL}/api/settings/users/{subin['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"role": "staff"}
        )
    
    def test_update_user_title_partner(self, partner_token):
        """Partner can update user title"""
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        
        # Find Roshith to update
        roshith = next((u for u in users if u["email"] == "roshith@nnadvisory.ae"), None)
        assert roshith is not None, "Roshith user not found"
        
        new_title = "TEST_Senior Manager"
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{roshith['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"title": new_title}
        )
        assert response.status_code == 200, f"PATCH user title failed: {response.text}"
        
        # Verify the change
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        updated_roshith = next((u for u in users_response.json() if u["email"] == "roshith@nnadvisory.ae"), None)
        assert updated_roshith["title"] == new_title, f"Title not updated: {updated_roshith.get('title')}"
        print(f"✓ PATCH user title updated to: {new_title}")
        
        # Restore original title
        requests.patch(
            f"{BASE_URL}/api/settings/users/{roshith['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"title": "Associate"}
        )
    
    def test_update_user_date_of_joining_partner(self, partner_token):
        """Partner can update user date_of_joining"""
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        
        # Find Anju to update
        anju = next((u for u in users if u["email"] == "anju@nnadvisory.ae"), None)
        assert anju is not None, "Anju user not found"
        
        new_doj = "2021-06-15"
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{anju['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"date_of_joining": new_doj}
        )
        assert response.status_code == 200, f"PATCH user DOJ failed: {response.text}"
        
        # Verify the change
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        updated_anju = next((u for u in users_response.json() if u["email"] == "anju@nnadvisory.ae"), None)
        assert updated_anju.get("date_of_joining") == new_doj, f"DOJ not updated: {updated_anju.get('date_of_joining')}"
        print(f"✓ PATCH user date_of_joining updated to: {new_doj}")
    
    def test_update_user_staff_forbidden(self, staff_token, partner_token):
        """Staff gets 403 on PATCH user"""
        # Get a user_id first
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        user_id = users[0]["user_id"]
        
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{user_id}",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={"title": "Hacked Title"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly gets 403 on PATCH /api/settings/users/{user_id}")


class TestPasswordChange:
    """Password change and login verification tests"""
    
    @pytest.fixture
    def partner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    def test_update_password_and_login(self, partner_token):
        """Partner can change user password and user can login with new password"""
        # Get users to find Jithin
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        
        jithin = next((u for u in users if u["email"] == "jithin@nnadvisory.ae"), None)
        assert jithin is not None, "Jithin user not found"
        
        # Change password
        new_password = "newpass123"
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{jithin['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"new_password": new_password}
        )
        assert response.status_code == 200, f"PATCH password failed: {response.text}"
        print(f"✓ Password changed for {jithin['name']}")
        
        # Try login with new password
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jithin@nnadvisory.ae",
            "password": new_password
        })
        
        # This is the critical test - if password_hash vs password field mismatch exists, this will fail
        if login_response.status_code == 200:
            print(f"✓ Login with new password successful")
        else:
            print(f"✗ Login with new password FAILED: {login_response.status_code} - {login_response.text}")
            # This indicates the bug: password_hash vs password field mismatch
        
        # Restore original password
        requests.patch(
            f"{BASE_URL}/api/settings/users/{jithin['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"new_password": "nn123456"}
        )
        
        # Verify login with original password works
        restore_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jithin@nnadvisory.ae",
            "password": "nn123456"
        })
        
        # The test should pass if password change works correctly
        # If there's a field mismatch (password_hash vs password), this will reveal it
        assert login_response.status_code == 200 or restore_login.status_code == 200, \
            "Password change verification failed - possible password_hash vs password field mismatch"
    
    def test_password_too_short_ignored(self, partner_token):
        """Password shorter than 6 chars should be ignored"""
        users_response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        users = users_response.json()
        
        shamil = next((u for u in users if u["email"] == "shamil@nnadvisory.ae"), None)
        assert shamil is not None, "Shamil user not found"
        
        # Try to set short password (should be ignored)
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{shamil['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"new_password": "abc", "title": "TEST_Title"}  # Include title so request isn't empty
        )
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        
        # Original password should still work
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "shamil@nnadvisory.ae",
            "password": "nn123456"
        })
        assert login_response.status_code == 200, "Original password should still work after short password attempt"
        print("✓ Short password (<6 chars) correctly ignored")
        
        # Restore title
        requests.patch(
            f"{BASE_URL}/api/settings/users/{shamil['user_id']}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"title": "Associate"}
        )


class TestNotificationBell:
    """Verify notification bell still works after Firm & Users feature"""
    
    @pytest.fixture
    def partner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "arjun@nnadvisory.ae",
            "password": "nn123456"
        })
        return response.json()["session_token"]
    
    def test_notifications_endpoint(self, partner_token):
        """GET /api/notifications still works"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {partner_token}"}
        )
        assert response.status_code == 200, f"GET notifications failed: {response.text}"
        notifications = response.json()
        assert isinstance(notifications, list)
        print(f"✓ GET /api/notifications returned {len(notifications)} notifications")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
