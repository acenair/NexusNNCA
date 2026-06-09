"""Backend tests for Iteration 12 - Bulk Task Upload (CSV/XLSX).

Covers:
- POST /api/tasks/bulk-preview (CSV)
- POST /api/tasks/bulk-upload (CSV)
- Header auto-mapping with various aliases (Task Name, Deadline, Assignee, Company, etc.)
- Staff name -> email + client name -> client_id resolution
- RBAC: partner-only (staff -> 403)
- Validation: unsupported file format (400), missing title column (400)
- XLSX file format support
"""
import io
import os
import csv
import time
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

PARTNER_EMAIL = "arjun@nnadvisory.ae"
STAFF_EMAIL = "fazil@nnadvisory.ae"
PASSWORD = "nn123456"


# -------- Auth fixtures --------
@pytest.fixture(scope="session")
def partner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": PARTNER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Partner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": STAFF_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Staff login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _auth_hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# -------- Sample file builders --------
def _make_csv_bytes(rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rows:
        w.writerow(r)
    return buf.getvalue().encode("utf-8")


def _make_xlsx_bytes(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# -------- Bulk Preview --------
class TestBulkPreview:
    def test_preview_csv_returns_headers_and_mapping(self, partner_token):
        csv_bytes = _make_csv_bytes([
            ["Task Name", "Description", "Client", "Assignee", "Deadline", "Priority"],
            ["TEST_BP File VAT Return", "Q4 VAT filing", "Al Baraka Trading LLC", "Fazil", "2026-02-15", "High"],
            ["TEST_BP Audit Prep", "Annual audit", "Falcon Logistics Co.", "Anju", "15/03/2026", "Medium"],
        ])
        files = {"file": ("preview.csv", csv_bytes, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-preview", files=files, headers=_auth_hdr(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["filename"] == "preview.csv"
        assert data["headers"] == ["Task Name", "Description", "Client", "Assignee", "Deadline", "Priority"]
        mapped = data["mapped_columns"]
        # All 6 columns should be auto-mapped
        assert mapped.get("Task Name") == "title"
        assert mapped.get("Description") == "description"
        assert mapped.get("Client") == "client_name"
        assert mapped.get("Assignee") == "assigned_to_name"
        assert mapped.get("Deadline") == "due_date"
        assert mapped.get("Priority") == "priority"
        assert data["unmapped_columns"] == []
        assert len(data["preview_rows"]) == 2
        assert data["preview_rows"][0][0] == "TEST_BP File VAT Return"

    def test_preview_unsupported_format_returns_400(self, partner_token):
        files = {"file": ("bad.txt", b"hello world", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-preview", files=files, headers=_auth_hdr(partner_token), timeout=15)
        assert r.status_code == 400


# -------- Bulk Upload --------
class TestBulkUpload:
    def test_upload_csv_creates_tasks_and_resolves_staff_client(self, partner_token):
        unique = f"TEST_BU_{int(time.time())}"
        csv_bytes = _make_csv_bytes([
            ["Task Title", "Description", "Company", "Assigned To", "Due Date", "Priority", "Status", "Service"],
            [f"{unique}_T1", "Filing", "Al Baraka Trading LLC", "Fazil", "2026-02-20", "High", "Pending", "VAT"],
            [f"{unique}_T2", "Audit", "Falcon Logistics Co.", "Anju", "15/03/2026", "Medium", "In Progress", "Audit"],
            # row with unknown staff & client - should still be created
            [f"{unique}_T3", "Misc", "NotARealClient XYZ", "GhostUser", "01-04-2026", "Low", "Pending", "General"],
        ])
        files = {"file": ("upload.csv", csv_bytes, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-upload", files=files, headers=_auth_hdr(partner_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] == 3
        assert data["errors"] == 0
        assert data["total_rows"] == 3
        mc = data["mapped_columns"]
        # Header aliases auto-mapped:
        assert mc.get("Task Title") == "title"
        assert mc.get("Description") == "description"
        assert mc.get("Company") == "client_name"
        assert mc.get("Assigned To") == "assigned_to_name"
        assert mc.get("Due Date") == "due_date"
        assert mc.get("Priority") == "priority"
        assert mc.get("Status") == "status"
        assert mc.get("Service") == "service_module"

        # Verify via GET /api/tasks that resolution worked
        r2 = requests.get(f"{BASE_URL}/api/tasks", headers=_auth_hdr(partner_token), timeout=20)
        assert r2.status_code == 200
        all_tasks = r2.json()
        created_titles = {t["title"]: t for t in all_tasks if t["title"].startswith(unique)}
        assert f"{unique}_T1" in created_titles
        t1 = created_titles[f"{unique}_T1"]
        assert t1["source"] == "bulk_upload"
        assert t1["priority"] == "High"
        assert t1["status"] == "Pending"
        assert t1["assigned_to"] == "fazil@nnadvisory.ae", f"Expected staff email resolved, got {t1.get('assigned_to')}"
        assert t1["assigned_to_name"].lower() == "fazil"
        assert t1["client_name"] == "Al Baraka Trading LLC"
        # client_id should be resolved (non-empty)
        assert t1.get("client_id"), f"client_id not resolved for known client, got {t1.get('client_id')}"
        assert t1["due_date"] == "2026-02-20"

        # T2 - DD/MM/YYYY date parsing
        t2 = created_titles[f"{unique}_T2"]
        assert t2["due_date"] == "2026-03-15", f"Date DD/MM/YYYY not parsed correctly: {t2['due_date']}"
        assert t2["status"] == "In Progress"
        assert t2["assigned_to"] == "anju@nnadvisory.ae"

        # T3 - unknown staff/client fallback
        t3 = created_titles[f"{unique}_T3"]
        # Falls back to partner email when staff name unresolved
        assert t3["assigned_to"] == PARTNER_EMAIL
        assert t3["client_id"] == ""  # unresolved
        assert t3["service_module"] == "General"

    def test_upload_xlsx_works(self, partner_token):
        unique = f"TEST_BUX_{int(time.time())}"
        xlsx_bytes = _make_xlsx_bytes([
            ["Title", "Client Name", "Owner", "Deadline"],
            [f"{unique}_X1", "Gulf Pharma Group", "Subin", "2026-05-10"],
        ])
        files = {"file": ("upload.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-upload", files=files, headers=_auth_hdr(partner_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] == 1
        assert data["mapped_columns"].get("Title") == "title"
        assert data["mapped_columns"].get("Client Name") == "client_name"
        assert data["mapped_columns"].get("Owner") == "assigned_to_name"
        assert data["mapped_columns"].get("Deadline") == "due_date"

    def test_upload_staff_403(self, staff_token):
        csv_bytes = _make_csv_bytes([["Title"], ["TEST_BU_staff_x"]])
        files = {"file": ("x.csv", csv_bytes, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-upload", files=files, headers=_auth_hdr(staff_token), timeout=15)
        assert r.status_code == 403

    def test_upload_unsupported_format_400(self, partner_token):
        files = {"file": ("bad.pdf", b"%PDF-1.4 fake", "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-upload", files=files, headers=_auth_hdr(partner_token), timeout=15)
        assert r.status_code == 400

    def test_upload_missing_title_column_400(self, partner_token):
        csv_bytes = _make_csv_bytes([
            ["Random Col", "Other"],
            ["abc", "xyz"],
        ])
        files = {"file": ("notitle.csv", csv_bytes, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/tasks/bulk-upload", files=files, headers=_auth_hdr(partner_token), timeout=15)
        assert r.status_code == 400
        assert "Title" in r.text or "title" in r.text


# -------- Cleanup: remove TEST_ tasks created during this run --------
@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_tasks(partner_token):
    yield
    # Best-effort cleanup
    try:
        r = requests.get(f"{BASE_URL}/api/tasks", headers=_auth_hdr(partner_token), timeout=20)
        if r.status_code == 200:
            for t in r.json():
                if t.get("title", "").startswith("TEST_BU") or t.get("title", "").startswith("TEST_BP"):
                    tid = t.get("task_id")
                    if tid:
                        requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_auth_hdr(partner_token), timeout=10)
    except Exception as e:
        print(f"Cleanup warning: {e}")
