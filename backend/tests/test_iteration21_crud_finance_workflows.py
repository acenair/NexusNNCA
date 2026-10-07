"""Iteration 21: CRUD coverage for tasks/workflows/invoices/proposals/billable-hours."""

import os
from datetime import datetime, timezone

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api" if BASE_URL else None

PARTNER_EMAIL = "srinivas.anup@gmail.com"
PARTNER_PASSWORD = "AdminPass2026!"


@pytest.fixture(scope="module")
def partner_session():
    if not API:
        pytest.skip("REACT_APP_BACKEND_URL is required")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    login = s.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=30)
    assert login.status_code == 200, f"Partner login failed: {login.status_code} {login.text}"
    token = login.json().get("session_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def any_client(partner_session):
    res = partner_session.get(f"{API}/clients", timeout=30)
    assert res.status_code == 200
    clients = res.json()
    if not clients:
        pytest.skip("No client records available")
    c = clients[0]
    return {"client_id": c["client_id"], "client_name": c.get("name", "Unknown")}


def test_client_read_smoke(partner_session, any_client):
    res = partner_session.get(f"{API}/clients/{any_client['client_id']}", timeout=30)
    assert res.status_code == 200
    body = res.json()
    assert body["client_id"] == any_client["client_id"]
    assert isinstance(body.get("name"), str)


def test_task_create_list_update(partner_session, any_client):
    due = datetime.now(timezone.utc).date().isoformat()
    payload = {
        "title": "TEST_I21_Task_CRUD",
        "service_module": "Audit",
        "due_date": due,
        "priority": "Medium",
        "client_id": any_client["client_id"],
        "client_name": any_client["client_name"],
    }
    create = partner_session.post(f"{API}/tasks", json=payload, timeout=30)
    assert create.status_code == 200, create.text
    task = create.json()
    assert task["title"] == payload["title"]
    task_id = task["task_id"]

    listed = partner_session.get(f"{API}/tasks", timeout=30)
    assert listed.status_code == 200
    rows = listed.json()
    assert any(t.get("task_id") == task_id for t in rows)

    update = partner_session.patch(f"{API}/tasks/{task_id}?status=Completed", timeout=30)
    assert update.status_code == 200
    listed2 = partner_session.get(f"{API}/tasks", timeout=30)
    assert listed2.status_code == 200
    row = next((t for t in listed2.json() if t.get("task_id") == task_id), None)
    assert row is not None
    assert row.get("status") == "Completed"


def test_workflow_create_update_delete(partner_session):
    payload = {
        "name": "TEST_I21_Workflow",
        "service_type": "statutory_audit",
        "steps": [
            {"name": "Step A", "description": "Alpha", "order": 0},
            {"name": "Step B", "description": "Beta", "order": 1},
        ],
        "is_preset": False,
    }
    create = partner_session.post(f"{API}/settings/workflows", json=payload, timeout=30)
    assert create.status_code == 200, create.text
    wf = create.json()
    workflow_id = wf["workflow_id"]
    assert wf["name"] == payload["name"]

    update = partner_session.patch(
        f"{API}/settings/workflows/{workflow_id}",
        json={"name": "TEST_I21_Workflow_Updated"},
        timeout=30,
    )
    assert update.status_code == 200

    listed = partner_session.get(f"{API}/settings/workflows", timeout=30)
    assert listed.status_code == 200
    got = next((x for x in listed.json() if x.get("workflow_id") == workflow_id), None)
    assert got is not None
    assert got["name"] == "TEST_I21_Workflow_Updated"

    delete = partner_session.delete(f"{API}/settings/workflows/{workflow_id}", timeout=30)
    assert delete.status_code == 200


def test_invoice_ageing_followup_and_delete(partner_session, any_client):
    today = datetime.now(timezone.utc).date().isoformat()
    payload = {
        "client_id": any_client["client_id"],
        "client_name": any_client["client_name"],
        "service_name": "TEST_I21_Invoice",
        "amount": 1234.5,
        "date": today,
        "status": "Unpaid",
    }
    create = partner_session.post(f"{API}/invoices", json=payload, timeout=30)
    assert create.status_code == 200, create.text
    inv = create.json()
    invoice_id = inv["invoice_id"]
    assert inv["client_id"] == any_client["client_id"]

    list_res = partner_session.get(f"{API}/invoices?client_id={any_client['client_id']}", timeout=30)
    assert list_res.status_code == 200
    assert any(i.get("invoice_id") == invoice_id for i in list_res.json())

    upd = partner_session.patch(f"{API}/invoices/{invoice_id}?status=Paid", timeout=30)
    assert upd.status_code == 200

    ageing = partner_session.get(f"{API}/invoices/ageing-report", timeout=30)
    assert ageing.status_code == 200
    assert "summary" in ageing.json()

    follow = partner_session.post(
        f"{API}/invoices/follow-up?client_id={any_client['client_id']}&client_name={any_client['client_name']}",
        timeout=30,
    )
    assert follow.status_code == 200
    assert follow.json().get("task_id", "").startswith("task_")

    delete = partner_session.delete(f"{API}/invoices/{invoice_id}", timeout=30)
    assert delete.status_code == 200


def test_proposals_and_templates_crud(partner_session, any_client):
    tpl_payload = {
        "name": "TEST_I21_Template",
        "scope_of_work": "Scope",
        "fee_structure": "Fee",
        "terms": "Terms",
        "service_type": "statutory_audit",
    }
    tpl = partner_session.post(f"{API}/proposal-templates", json=tpl_payload, timeout=30)
    assert tpl.status_code == 200, tpl.text
    template_id = tpl.json()["template_id"]

    proposal_payload = {
        "client_id": any_client["client_id"],
        "client_name": any_client["client_name"],
        "template_id": template_id,
        "title": "TEST_I21_Proposal",
        "scope_of_work": "Audit services",
        "fee_structure": "Fixed",
        "terms": "Net30",
        "total_fee": 7000,
        "status": "Draft",
    }
    proposal = partner_session.post(f"{API}/proposals", json=proposal_payload, timeout=30)
    assert proposal.status_code == 200, proposal.text
    proposal_id = proposal.json()["proposal_id"]

    listed = partner_session.get(f"{API}/proposals?client_id={any_client['client_id']}", timeout=30)
    assert listed.status_code == 200
    assert any(p.get("proposal_id") == proposal_id for p in listed.json())

    upd = partner_session.patch(f"{API}/proposals/{proposal_id}?status=Sent", timeout=30)
    assert upd.status_code == 200

    del_prop = partner_session.delete(f"{API}/proposals/{proposal_id}", timeout=30)
    assert del_prop.status_code == 200

    del_tpl = partner_session.delete(f"{API}/proposal-templates/{template_id}", timeout=30)
    assert del_tpl.status_code == 200


def test_billable_hours_log_export_summary_delete(partner_session, any_client):
    today = datetime.now(timezone.utc).date().isoformat()
    payload = {
        "client_id": any_client["client_id"],
        "client_name": any_client["client_name"],
        "hours": 1.5,
        "date": today,
        "description": "TEST_I21_Billable",
    }
    create = partner_session.post(f"{API}/billable-hours", json=payload, timeout=30)
    assert create.status_code == 200, create.text
    entry = create.json()
    entry_id = entry["entry_id"]

    listed = partner_session.get(f"{API}/billable-hours", timeout=30)
    assert listed.status_code == 200
    assert any(x.get("entry_id") == entry_id for x in listed.json())

    summary = partner_session.get(f"{API}/billable-hours/summary", timeout=30)
    assert summary.status_code == 200
    assert "total_hours" in summary.json()

    export = partner_session.get(f"{API}/billable-hours/export", timeout=30)
    assert export.status_code == 200
    assert "text/csv" in export.headers.get("content-type", "")

    delete = partner_session.delete(f"{API}/billable-hours/{entry_id}", timeout=30)
    assert delete.status_code == 200
