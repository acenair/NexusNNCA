"""Iteration 14 coverage for the client portal, invoice administration, and client linking."""

import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient


FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")


def credential_for(email: str) -> dict:
    """Read an approved test credential from the shared credential file."""
    content = CREDENTIALS_PATH.read_text(encoding="utf-8")
    row = re.search(
        rf"(?im)^\|[^|]*\|\s*{re.escape(email)}\s*\|\s*([^|\s]+)\s*\|",
        content,
    )
    if not row:
        pytest.skip(f"Credentials for {email} are unavailable")
    return {"email": email, "password": row.group(1)}


def login(email: str) -> tuple[dict, dict]:
    response = requests.post(
        f"{BASE_URL}/api/auth/login", json=credential_for(email), timeout=20
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert isinstance(body["session_token"], str) and body["session_token"]
    return {"Authorization": f"Bearer {body['session_token']}"}, body


@pytest.fixture(scope="module")
def portal_context():
    """Create an approved linked client user and isolated invoice/engagement data."""
    partner_headers, partner = login("arjun@nnadvisory.ae")
    staff_headers, staff = login("fazil@nnadvisory.ae")
    assert partner["role"] == "partner"
    assert staff["role"] == "staff"

    clients_response = requests.get(
        f"{BASE_URL}/api/clients", headers=partner_headers, timeout=20
    )
    assert clients_response.status_code == 200, clients_response.text
    clients = clients_response.json()
    assert isinstance(clients, list) and clients, "At least one seeded client is required"
    client = clients[0]
    other_client = clients[1] if len(clients) > 1 else None

    mongo = MongoClient(BACKEND_ENV["MONGO_URL"])
    db = mongo[BACKEND_ENV["DB_NAME"]]
    original_checklist = db.client_doc_checklists.find_one({"client_id": client["client_id"]})

    marker = uuid.uuid4().hex[:10]
    email = f"TEST_client_portal_{marker}@example.test"
    password = "TEST_client_password_123"
    register_response = requests.post(
        f"{BASE_URL}/api/auth/register",
        params={"email": email, "password": password, "name": "TEST Client Portal"},
        timeout=20,
    )
    assert register_response.status_code == 200, register_response.text
    register_body = register_response.json()
    assert register_body["error"] == "pending_approval"

    users_response = requests.get(
        f"{BASE_URL}/api/settings/users", headers=partner_headers, timeout=20
    )
    assert users_response.status_code == 200, users_response.text
    test_user = next(user for user in users_response.json() if user["email"] == email)
    user_id = test_user["user_id"]

    approve_response = requests.patch(
        f"{BASE_URL}/api/settings/users/{user_id}/approve",
        headers=partner_headers,
        json={},
        timeout=20,
    )
    assert approve_response.status_code == 200, approve_response.text
    link_response = requests.patch(
        f"{BASE_URL}/api/settings/users/{user_id}",
        headers=partner_headers,
        json={"role": "client", "client_id": client["client_id"]},
        timeout=20,
    )
    assert link_response.status_code == 200, link_response.text

    client_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert client_login.status_code == 200, client_login.text
    client_body = client_login.json()
    assert client_body["role"] == "client"
    client_headers = {"Authorization": f"Bearer {client_body['session_token']}"}

    engagement_payload = {
        "service_type": "statutory_audit",
        "client_id": client["client_id"],
        "phase": "Planning",
        "notes": "TEST client portal engagement",
    }
    engagement_response = requests.post(
        f"{BASE_URL}/api/service/engagements",
        headers=partner_headers,
        json=engagement_payload,
        timeout=20,
    )
    assert engagement_response.status_code == 200, engagement_response.text
    engagement_id = engagement_response.json()["engagement_id"]

    context = {
        "partner_headers": partner_headers,
        "staff_headers": staff_headers,
        "client_headers": client_headers,
        "client": client,
        "other_client": other_client,
        "user_id": user_id,
        "email": email,
        "password": password,
        "engagement_id": engagement_id,
        "created_invoice_ids": [],
        "created_file_ids": [],
        "db": db,
    }

    yield context

    for invoice_id in context["created_invoice_ids"]:
        requests.delete(
            f"{BASE_URL}/api/invoices/{invoice_id}",
            headers=partner_headers,
            timeout=20,
        )
    requests.patch(
        f"{BASE_URL}/api/settings/users/{user_id}/reject",
        headers=partner_headers,
        json={},
        timeout=20,
    )
    db.service_engagements.delete_one({"engagement_id": engagement_id})
    if original_checklist is None:
        db.client_doc_checklists.delete_one({"client_id": client["client_id"]})
    else:
        original_checklist.pop("_id", None)
        db.client_doc_checklists.replace_one(
            {"client_id": client["client_id"]}, original_checklist, upsert=True
        )
    if context["created_file_ids"]:
        db.documents.delete_many({"file_id": {"$in": context["created_file_ids"]}})
    mongo.close()


class TestClientRoleLinking:
    """Settings client-role assignment and persistence."""

    def test_partner_can_assign_client_role_and_link(self, portal_context):
        response = requests.get(
            f"{BASE_URL}/api/settings/users",
            headers=portal_context["partner_headers"],
            timeout=20,
        )
        assert response.status_code == 200, response.text
        linked = next(
            user for user in response.json() if user["user_id"] == portal_context["user_id"]
        )
        assert linked["role"] == "client"
        assert linked["client_id"] == portal_context["client"]["client_id"]
        assert "password" not in linked and "_id" not in linked

    def test_staff_cannot_assign_client_role(self, portal_context):
        response = requests.patch(
            f"{BASE_URL}/api/settings/users/{portal_context['user_id']}",
            headers=portal_context["staff_headers"],
            json={"role": "client", "client_id": portal_context["client"]["client_id"]},
            timeout=20,
        )
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Partners only"

    def test_changing_client_back_to_staff_clears_client_link(self, portal_context):
        try:
            response = requests.patch(
                f"{BASE_URL}/api/settings/users/{portal_context['user_id']}",
                headers=portal_context["partner_headers"],
                json={"role": "staff"},
                timeout=20,
            )
            assert response.status_code == 200, response.text
            users = requests.get(
                f"{BASE_URL}/api/settings/users",
                headers=portal_context["partner_headers"],
                timeout=20,
            ).json()
            changed = next(
                user for user in users if user["user_id"] == portal_context["user_id"]
            )
            assert changed["role"] == "staff"
            assert not changed.get("client_id"), "Non-client role retained access to linked client data"
        finally:
            requests.patch(
                f"{BASE_URL}/api/settings/users/{portal_context['user_id']}",
                headers=portal_context["partner_headers"],
                json={"role": "client", "client_id": portal_context["client"]["client_id"]},
                timeout=20,
            )


class TestClientPortal:
    """Client-only checklist, workflow, invoice filtering, and upload flows."""

    def test_documents_returns_predefined_checklist(self, portal_context):
        response = requests.get(
            f"{BASE_URL}/api/client-portal/documents",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["client_name"] == portal_context["client"]["name"]
        assert body["service_type"] in {"aml", "company_formation", "vat_registration", "audit"}
        assert isinstance(body["checklist"], list) and body["checklist"]
        for item in body["checklist"]:
            assert isinstance(item["item_id"], str) and item["item_id"].startswith("dci_")
            assert isinstance(item["label"], str) and item["label"]
            assert isinstance(item["required"], bool)
            assert isinstance(item["uploaded"], bool)

    def test_workflow_returns_linked_engagement_stages(self, portal_context):
        response = requests.get(
            f"{BASE_URL}/api/client-portal/workflow",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body["engagements"], list)
        engagement = next(
            item
            for item in body["engagements"]
            if item["engagement_id"] == portal_context["engagement_id"]
        )
        assert engagement["service_type"] == "Statutory Audit"
        assert engagement["status"] == "Active"
        assert engagement["phase"] == "Planning"
        assert isinstance(engagement["stages"], list) and engagement["stages"]
        assert all(stage["status"] in {"Pending", "In Progress", "Completed"} for stage in engagement["stages"])

    def test_client_cannot_access_firmwide_client_list(self, portal_context):
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Partners or staff only"

    def test_upload_updates_checklist_and_uploaded_file_is_downloadable(self, portal_context):
        checklist_response = requests.get(
            f"{BASE_URL}/api/client-portal/documents",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        item = checklist_response.json()["checklist"][0]
        upload_response = requests.post(
            f"{BASE_URL}/api/client-portal/documents/{item['item_id']}/upload",
            headers=portal_context["client_headers"],
            files={"file": ("TEST_portal_document.txt", b"client portal test", "text/plain")},
            timeout=30,
        )
        assert upload_response.status_code == 200, upload_response.text
        upload_body = upload_response.json()
        assert upload_body["filename"] == "TEST_portal_document.txt"
        assert isinstance(upload_body["file_id"], str) and upload_body["file_id"].startswith("file_")
        portal_context["created_file_ids"].append(upload_body["file_id"])

        updated_response = requests.get(
            f"{BASE_URL}/api/client-portal/documents",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        updated_item = next(
            row for row in updated_response.json()["checklist"] if row["item_id"] == item["item_id"]
        )
        assert updated_item["uploaded"] is True
        assert updated_item["file_id"] == upload_body["file_id"]
        assert updated_item["filename"] == "TEST_portal_document.txt"

        download_response = requests.get(
            f"{BASE_URL}/api/files/{upload_body['file_id']}",
            headers=portal_context["client_headers"],
            timeout=30,
        )
        assert download_response.status_code == 200, download_response.text
        assert download_response.content == b"client portal test"

    def test_upload_rejects_unknown_checklist_item(self, portal_context):
        response = requests.post(
            f"{BASE_URL}/api/client-portal/documents/TEST_missing_item/upload",
            headers=portal_context["client_headers"],
            files={"file": ("TEST_invalid_item.txt", b"invalid", "text/plain")},
            timeout=30,
        )
        if response.status_code == 200 and response.json().get("file_id"):
            portal_context["created_file_ids"].append(response.json()["file_id"])
        assert response.status_code == 404, response.text
        assert response.json()["detail"] == "Checklist item not found"


class TestInvoiceAdministration:
    """Partner invoice CRUD, persistence, RBAC, validation, and client isolation."""

    def test_partner_crud_and_client_portal_filtering(self, portal_context):
        payload = {
            "client_id": portal_context["client"]["client_id"],
            "service_name": "TEST Statutory Audit",
            "amount": 1234.5,
            "date": "2026-07-25",
            "status": "Unpaid",
            "notes": "TEST invoice",
        }
        create_response = requests.post(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["partner_headers"],
            json=payload,
            timeout=20,
        )
        assert create_response.status_code == 200, create_response.text
        invoice = create_response.json()
        invoice_id = invoice["invoice_id"]
        portal_context["created_invoice_ids"].append(invoice_id)
        assert invoice["client_name"] == portal_context["client"]["name"]
        assert invoice["service_name"] == payload["service_name"]
        assert invoice["amount"] == payload["amount"]
        assert invoice["status"] == "Unpaid"
        assert "_id" not in invoice

        all_response = requests.get(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["partner_headers"],
            timeout=20,
        )
        assert all_response.status_code == 200, all_response.text
        persisted = next(row for row in all_response.json() if row["invoice_id"] == invoice_id)
        assert persisted["notes"] == "TEST invoice"

        patch_response = requests.patch(
            f"{BASE_URL}/api/invoices/{invoice_id}",
            headers=portal_context["partner_headers"],
            params={"status": "Paid", "amount": 1300},
            timeout=20,
        )
        assert patch_response.status_code == 200, patch_response.text
        assert patch_response.json()["message"] == "Invoice updated"
        filtered_response = requests.get(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["partner_headers"],
            params={"client_id": portal_context["client"]["client_id"]},
            timeout=20,
        )
        updated = next(row for row in filtered_response.json() if row["invoice_id"] == invoice_id)
        assert updated["status"] == "Paid"
        assert updated["amount"] == 1300

        client_response = requests.get(
            f"{BASE_URL}/api/client-portal/invoices",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        assert client_response.status_code == 200, client_response.text
        client_invoices = client_response.json()
        visible = next(row for row in client_invoices if row["invoice_id"] == invoice_id)
        assert visible["service_name"] == "TEST Statutory Audit"
        assert visible["status"] == "Paid"
        assert all(
            row["client_id"] == portal_context["client"]["client_id"]
            for row in client_invoices
        )

        delete_response = requests.delete(
            f"{BASE_URL}/api/invoices/{invoice_id}",
            headers=portal_context["partner_headers"],
            timeout=20,
        )
        assert delete_response.status_code == 200, delete_response.text
        portal_context["created_invoice_ids"].remove(invoice_id)
        after_delete = requests.get(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["partner_headers"],
            timeout=20,
        ).json()
        assert all(row["invoice_id"] != invoice_id for row in after_delete)

    @pytest.mark.parametrize("method", ["post", "get", "patch", "delete"])
    def test_staff_cannot_manage_invoices(self, portal_context, method):
        kwargs = {"headers": portal_context["staff_headers"], "timeout": 20}
        url = f"{BASE_URL}/api/invoices"
        if method == "post":
            kwargs["json"] = {
                "client_id": portal_context["client"]["client_id"],
                "service_name": "TEST denied",
                "amount": 1,
                "date": "2026-07-25",
            }
        elif method in {"patch", "delete"}:
            url += "/TEST_missing"
            if method == "patch":
                kwargs["params"] = {"status": "Paid"}
        response = getattr(requests, method)(url, **kwargs)
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Partners only"

    def test_client_cannot_manage_admin_invoices(self, portal_context):
        response = requests.get(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["client_headers"],
            timeout=20,
        )
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Partners only"

    def test_invoice_rejects_invalid_status(self, portal_context):
        response = requests.post(
            f"{BASE_URL}/api/invoices",
            headers=portal_context["partner_headers"],
            json={
                "client_id": portal_context["client"]["client_id"],
                "service_name": "TEST invalid status",
                "amount": 100,
                "date": "2026-07-25",
                "status": "Overdue",
            },
            timeout=20,
        )
        if response.status_code == 200 and response.json().get("invoice_id"):
            invoice_id = response.json()["invoice_id"]
            requests.delete(
                f"{BASE_URL}/api/invoices/{invoice_id}",
                headers=portal_context["partner_headers"],
                timeout=20,
            )
        assert response.status_code == 422, response.text

    def test_delete_unknown_invoice_returns_404(self, portal_context):
        response = requests.delete(
            f"{BASE_URL}/api/invoices/TEST_missing",
            headers=portal_context["partner_headers"],
            timeout=20,
        )
        assert response.status_code == 404, response.text
        assert response.json()["detail"] == "Invoice not found"
