"""
Iteration 11 backend tests — Browser Push Notifications (Web Push / VAPID)
Covers:
  - GET  /api/push/vapid-key
  - POST /api/push/subscribe (auth-gated, upsert)
  - POST /api/push/unsubscribe
  - POST /api/push/test (gracefully handles 0 subs or fake/invalid subs)
  - POST /api/push/send-deadline-alerts (partner-only, 403 for staff)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
STAFF_EMAIL = "fazil@nnadvisory.ae"
STAFF_PASSWORD = "nn123456"


# ---- Fixtures ----
def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["session_token"], data["user_id"]


@pytest.fixture(scope="module")
def partner_auth():
    token, uid = _login(PARTNER_EMAIL, PARTNER_PASSWORD)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, uid


@pytest.fixture(scope="module")
def staff_auth():
    token, uid = _login(STAFF_EMAIL, STAFF_PASSWORD)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, uid


def _fake_subscription(endpoint_suffix=None):
    """Construct a plausible-looking but fake Web Push subscription payload."""
    suffix = endpoint_suffix or uuid.uuid4().hex
    return {
        "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{suffix}",
        "expirationTime": None,
        "keys": {
            # 65-byte uncompressed P-256 public key, base64url-encoded (32-byte x/y)
            "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
            "auth": "tBHItJI5svbpez7KI4CCXg",
        },
    }


# ---- Tests ----

# Feature: VAPID public-key endpoint
class TestVapidKey:
    def test_vapid_key_is_public(self):
        """VAPID public key should be reachable without authentication."""
        r = requests.get(f"{BASE_URL}/api/push/vapid-key", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "public_key" in data
        assert isinstance(data["public_key"], str)
        # VAPID public keys are base64url-encoded 65-byte P-256 keys → 87 chars
        assert len(data["public_key"]) >= 80, f"Suspiciously short VAPID key: {data['public_key']!r}"
        # Match frontend env so subscribe-side encryption works
        assert data["public_key"].startswith("B"), "VAPID P-256 keys begin with uncompressed-point 0x04 → 'B' in base64url"


# Feature: Push subscribe / unsubscribe lifecycle (authenticated)
class TestSubscribeLifecycle:
    def test_subscribe_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json={"subscription": _fake_subscription()},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected auth failure, got {r.status_code}: {r.text}"

    def test_subscribe_stores_subscription(self, staff_auth):
        headers, _ = staff_auth
        sub = _fake_subscription("subscribe_lifecycle")
        r = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json={"subscription": sub},
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body
        assert "stored" in body["message"].lower()

    def test_subscribe_is_idempotent_upsert(self, staff_auth):
        """Same endpoint posted twice should not error (upsert)."""
        headers, _ = staff_auth
        sub = _fake_subscription("upsert_check")
        for _ in range(2):
            r = requests.post(
                f"{BASE_URL}/api/push/subscribe",
                json={"subscription": sub},
                headers=headers,
                timeout=15,
            )
            assert r.status_code == 200, r.text

    def test_unsubscribe_removes_subscription(self, staff_auth):
        headers, _ = staff_auth
        sub = _fake_subscription("unsubscribe_check")
        # First subscribe
        r = requests.post(f"{BASE_URL}/api/push/subscribe",
                          json={"subscription": sub}, headers=headers, timeout=15)
        assert r.status_code == 200
        # Then unsubscribe
        r = requests.post(f"{BASE_URL}/api/push/unsubscribe",
                          json={"subscription": sub}, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "removed" in body.get("message", "").lower()


# Feature: Test push (should gracefully report device count even with fake/invalid subs)
class TestTestPush:
    def test_test_push_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/push/test", timeout=15)
        assert r.status_code in (401, 403)

    def test_test_push_returns_device_count(self, partner_auth):
        """Partner has a fake sub stored; webpush will fail to deliver but
        endpoint should still return 200 with a device-count message,
        not 500. Sent count may be 0."""
        headers, _ = partner_auth
        r = requests.post(f"{BASE_URL}/api/push/test", json={}, headers=headers, timeout=30)
        assert r.status_code == 200, f"Test push failed: {r.status_code} {r.text}"
        msg = r.json().get("message", "")
        assert "device" in msg.lower(), f"Unexpected message: {msg}"


# Feature: Partner-only deadline push trigger (RBAC + business logic)
class TestDeadlinePushAlerts:
    def test_staff_cannot_trigger_deadline_alerts(self, staff_auth):
        headers, _ = staff_auth
        r = requests.post(
            f"{BASE_URL}/api/push/send-deadline-alerts",
            json={}, headers=headers, timeout=30,
        )
        assert r.status_code == 403, f"Expected 403 for staff, got {r.status_code}: {r.text}"

    def test_partner_can_trigger_deadline_alerts(self, partner_auth):
        headers, _ = partner_auth
        r = requests.post(
            f"{BASE_URL}/api/push/send-deadline-alerts",
            json={}, headers=headers, timeout=60,
        )
        assert r.status_code == 200, f"Partner trigger failed: {r.status_code} {r.text}"
        body = r.json()
        assert "message" in body
        # Message format: "Pushed alerts to N user(s), M device(s)"
        assert "user" in body["message"].lower() or "device" in body["message"].lower()

    def test_deadline_alerts_unauthenticated(self):
        r = requests.post(f"{BASE_URL}/api/push/send-deadline-alerts", json={}, timeout=15)
        assert r.status_code in (401, 403)
