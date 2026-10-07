"""
Security regression tests: cross-tenant file download authorization.

Requires a running backend (REACT_APP_BACKEND_URL) with seeded data.
Creates two clients, links a portal user to client A, then verifies the
client-A user cannot download a document belonging to client B.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PARTNER_EMAIL = "arjun@nnadvisory.ae"
PARTNER_PASSWORD = "nn123456"
TEST_PASSWORD = "TEST_client_scoped_123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def partner_headers():
    return {"Authorization": f"Bearer {_login(PARTNER_EMAIL, PARTNER_PASSWORD)}"}


@pytest.fixture(scope="module")
def scoping_context(partner_headers):
    """Two clients + one client-role portal user linked to client A."""
    marker = uuid.uuid4().hex[:10]
    client_a = requests.post(
        f"{BASE_URL}/api/clients",
        params={"name": f"TEST ScopedA {marker}", "entity_type": "LLC"},
        headers=partner_headers, timeout=20,
    ).json()["client_id"]
    client_b = requests.post(
        f"{BASE_URL}/api/clients",
        params={"name": f"TEST ScopedB {marker}", "entity_type": "LLC"},
        headers=partner_headers, timeout=20,
    ).json()["client_id"]

    email = f"TEST_scoped_{marker}@example.test"
    requests.post(
        f"{BASE_URL}/api/auth/register",
        params={"email": email, "password": TEST_PASSWORD, "name": "TEST Scoped User"},
        timeout=20,
    )
    users = requests.get(f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=20).json()
    uid = [u["user_id"] for u in users if u.get("email") == email][0]
    requests.patch(f"{BASE_URL}/api/settings/users/{uid}/approve", headers=partner_headers, timeout=20)
    requests.patch(
        f"{BASE_URL}/api/settings/users/{uid}",
        headers=partner_headers, json={"role": "client", "client_id": client_a}, timeout=20,
    )
    token = _login(email, TEST_PASSWORD)
    yield {
        "partner_headers": partner_headers,
        "client_headers": {"Authorization": f"Bearer {token}"},
        "client_a": client_a,
        "client_b": client_b,
        "test_email": email,
        "test_user_id": uid,
    }
    # cleanup: remove test user so seeded-count assertions stay valid
    import subprocess
    mongo_url = os.environ.get("MONGO_URL_TEST", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME_TEST", "ca_ai_test")
    subprocess.run(
        ["/opt/homebrew/bin/mongosh", "--quiet", f"{mongo_url}/{db_name}", "--eval",
         f'db.users.deleteOne({{user_id: "{uid}"}}); db.user_sessions.deleteMany({{user_id: "{uid}"}})'],
        capture_output=True, text=True)
    requests.delete(f"{BASE_URL}/api/clients/{client_a}", headers=partner_headers, timeout=20)
    requests.delete(f"{BASE_URL}/api/clients/{client_b}", headers=partner_headers, timeout=20)


def test_client_cannot_read_other_clients_documents(scoping_context):
    """SECURITY REGRESSION: client-role user must get 403 for another client's file."""
    # Insert doc records directly scoped to each client via the Mongo-backed test route
    # (uses the API: partner uploads require object storage; use documents metadata route)
    # Instead: create a doc record through seed via the /documents POST if present,
    # else assert via direct Mongo-independent flow: try downloading a non-existent
    # file first to confirm the route 404s before the 403 path.
    import subprocess
    mongo_url = os.environ.get("MONGO_URL_TEST", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME_TEST", "ca_ai_test")
    file_b = f"file_sec_{uuid.uuid4().hex[:10]}"
    script = (
        f'db.documents.insertOne({{file_id: "{file_b}", original_filename: "b.txt", '
        f'content_type: "text/plain", client_id: "{scoping_context["client_b"]}", '
        f'uploaded_by: "tester", is_deleted: false, data: BinData(0, "636f6e666964656e7469616c"), '
        f'created_at: new Date().toISOString()}});'
    )
    subprocess.run(["/opt/homebrew/bin/mongosh", "--quiet", f"{mongo_url}/{db_name}", "--eval", script],
                   capture_output=True, text=True)

    resp = requests.get(f"{BASE_URL}/api/files/{file_b}", headers=scoping_context["client_headers"], timeout=20)
    assert resp.status_code == 403, f"Expected 403 for cross-tenant download, got {resp.status_code}"
    print("✓ client-role user blocked from another client's document (403)")


def test_client_can_read_own_documents(scoping_context):
    import subprocess
    mongo_url = os.environ.get("MONGO_URL_TEST", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME_TEST", "ca_ai_test")
    file_a = f"file_sec_{uuid.uuid4().hex[:10]}"
    script = (
        f'db.documents.insertOne({{file_id: "{file_a}", original_filename: "a.txt", '
        f'content_type: "text/plain", client_id: "{scoping_context["client_a"]}", '
        f'uploaded_by: "tester", is_deleted: false, data: BinData(0, "6f776e"), '
        f'created_at: new Date().toISOString()}});'
    )
    subprocess.run(["/opt/homebrew/bin/mongosh", "--quiet", f"{mongo_url}/{db_name}", "--eval", script],
                   capture_output=True, text=True)

    resp = requests.get(f"{BASE_URL}/api/files/{file_a}", headers=scoping_context["client_headers"], timeout=20)
    assert resp.status_code == 200, f"Expected 200 for own document, got {resp.status_code}"
    print("✓ client-role user can download own client's document (200)")


def test_anonymous_cannot_download(scoping_context):
    resp = requests.get(f"{BASE_URL}/api/files/file_whatever", timeout=20)
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    print("✓ anonymous download rejected (401)")
