"""Iteration 17 backend tests: Digital Audit Workbook (/api/audit/*) + AML reminder exclusivity regression."""
import io
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
TIMEOUT = 60
PASSWORD = "nn123456"


def login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:300]}"
    body = r.json()
    token = body.get("session_token")
    assert token, f"no session_token for {email}"
    return body, {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def partner():
    return login("arjun@nnadvisory.ae")


@pytest.fixture(scope="module")
def fazil():
    return login("fazil@nnadvisory.ae")


@pytest.fixture(scope="module")
def subin():
    return login("subin@nnadvisory.ae")


@pytest.fixture(scope="module")
def some_client(partner):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/clients", headers=h, timeout=TIMEOUT)
    assert r.status_code == 200
    clients = r.json()
    assert clients, "no clients seeded"
    return clients[0]


@pytest.fixture(scope="module")
def audit_engagement(partner, some_client):
    """Create a dedicated statutory_audit engagement for workbook testing."""
    _, h = partner
    r = requests.post(
        f"{BASE_URL}/api/service/engagements",
        headers=h,
        json={"service_type": "statutory_audit", "client_id": some_client["client_id"], "notes": "TEST_iter17_audit_workbook"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text[:300]
    eng = r.json()
    yield eng
    requests.patch(f"{BASE_URL}/api/service/engagements/{eng['engagement_id']}?status=Archived", headers=h, timeout=TIMEOUT)


# ---------- Audit template ----------
class TestAuditTemplate:
    def test_template_parsed_and_seeded(self, partner):
        _, h = partner
        r = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        t = r.json()
        assert t["template_id"] == "std_statutory_audit_v1"
        sections = t["sections"]
        assert len(sections) == 25, f"expected 25 sections, got {len(sections)}"
        answerable = [q for s in sections for q in s["questions"] if q["is_input"]]
        assert len(answerable) >= 250, f"only {len(answerable)} answerable questions"
        # No dotted codes (would corrupt Mongo $set paths)
        bad = [q["code"] for s in sections for q in s["questions"] if "." in q["code"] or "$" in q["code"]]
        assert not bad, f"question codes with dots/$: {bad[:10]}"
        # section ids/order sane
        assert {s["order"] for s in sections} == set(range(25))
        types = {q["type"] for s in sections for q in s["questions"]}
        assert {"yes_no", "text"}.issubset(types)

    def test_template_forbidden_without_auth(self):
        r = requests.get(f"{BASE_URL}/api/audit/template", timeout=TIMEOUT)
        assert r.status_code in (401, 403), r.status_code


# ---------- Start / list / detail ----------
class TestAuditLifecycle:
    audit_id = None

    def test_no_audits_initially(self, partner, audit_engagement):
        _, h = partner
        r = requests.get(f"{BASE_URL}/api/audit/engagements/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json() == []

    def test_start_audit(self, partner, audit_engagement):
        _, h = partner
        r = requests.post(
            f"{BASE_URL}/api/audit/engagements/{audit_engagement['engagement_id']}/start",
            headers=h, json={"period": "TEST_FY 2025-26"}, timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text[:300]
        doc = r.json()
        assert doc["audit_id"].startswith("audit_")
        assert doc["period"] == "TEST_FY 2025-26"
        assert doc["status"] == "in_progress"
        assert doc["client_id"] == audit_engagement["client_id"]
        assert "_id" not in doc
        TestAuditLifecycle.audit_id = doc["audit_id"]

        # GET verify persistence
        d = requests.get(f"{BASE_URL}/api/audit/{doc['audit_id']}", headers=h, timeout=TIMEOUT)
        assert d.status_code == 200
        detail = d.json()
        assert detail["audit"]["period"] == "TEST_FY 2025-26"
        assert detail["questions_total"] >= 250
        assert detail["questions_done"] == 0
        assert detail["overall_pct"] == 0
        assert len(detail["section_progress"]) == 25

    def test_start_on_unknown_engagement_404(self, partner):
        _, h = partner
        r = requests.post(f"{BASE_URL}/api/audit/engagements/eng_does_not_exist/start", headers=h,
                          json={"period": "X"}, timeout=TIMEOUT)
        assert r.status_code == 404

    def test_save_yes_no_response(self, partner):
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        tmpl = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT).json()
        yn = next(q for s in tmpl["sections"] for q in s["questions"] if q["type"] == "yes_no" and q["is_input"])
        r = requests.patch(f"{BASE_URL}/api/audit/{aid}/responses/{yn['code']}", headers=h,
                           json={"value": "Yes", "remarks": "TEST ok"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["response"]["value"] == "Yes"
        assert body["response"]["flagged"] is False
        assert body["response"]["remarks"] == "TEST ok"
        assert body["overall_pct"] >= 0
        # persistence
        detail = requests.get(f"{BASE_URL}/api/audit/{aid}", headers=h, timeout=TIMEOUT).json()
        assert detail["audit"]["responses"][yn["code"]]["value"] == "Yes"
        assert detail["questions_done"] >= 1

    def test_save_no_sets_flag(self, partner):
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        tmpl = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT).json()
        yns = [q for s in tmpl["sections"] for q in s["questions"] if q["type"] == "yes_no" and q["is_input"]]
        target = yns[1]
        r = requests.patch(f"{BASE_URL}/api/audit/{aid}/responses/{target['code']}", headers=h,
                           json={"value": "No"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["response"]["flagged"] is True
        # activity logged
        act = requests.get(f"{BASE_URL}/api/dashboard/activities", headers=h, timeout=TIMEOUT)
        assert act.status_code == 200
        titles = [a.get("event_type", "") for a in act.json()]
        assert any("Audit flag raised" in t for t in titles), f"no flag activity, got {titles[:5]}"
        # toggling back to Yes clears flag
        r2 = requests.patch(f"{BASE_URL}/api/audit/{aid}/responses/{target['code']}", headers=h,
                            json={"value": "Yes"}, timeout=TIMEOUT)
        assert r2.json()["response"]["flagged"] is False

    def test_save_underscore_subquestion_code(self, partner):
        """Codes like J3_1 must not corrupt Mongo $set paths."""
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        tmpl = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT).json()
        underscored = [q for s in tmpl["sections"] for q in s["questions"] if "_" in q["code"] and q["is_input"]]
        assert underscored, "no underscore sub-question codes found in template"
        q = underscored[0]
        r = requests.patch(f"{BASE_URL}/api/audit/{aid}/responses/{q['code']}", headers=h,
                           json={"value": "TEST subq value"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        detail = requests.get(f"{BASE_URL}/api/audit/{aid}", headers=h, timeout=TIMEOUT).json()
        assert detail["audit"]["responses"][q["code"]]["value"] == "TEST subq value"

    def test_save_unknown_code_404(self, partner):
        _, h = partner
        r = requests.patch(f"{BASE_URL}/api/audit/{TestAuditLifecycle.audit_id}/responses/ZZZ999",
                           headers=h, json={"value": "x"}, timeout=TIMEOUT)
        assert r.status_code == 404

    def test_upload_and_download_attachment(self, partner):
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        tmpl = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT).json()
        fu = next((q for s in tmpl["sections"] for q in s["questions"] if q["type"] == "file_upload" and q["is_input"]), None)
        assert fu, "no file_upload question in template"
        files = {"file": ("TEST_schedule.txt", io.BytesIO(b"fixed asset schedule test"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/audit/{aid}/responses/{fu['code']}/upload", headers=h, files=files, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["attachment_name"] == "TEST_schedule.txt"
        d = requests.get(f"{BASE_URL}/api/audit/{aid}/responses/{fu['code']}/download", headers=h, timeout=TIMEOUT)
        assert d.status_code == 200, d.text[:200]
        assert d.content == b"fixed asset schedule test"

    def test_exports(self, partner):
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        x = requests.get(f"{BASE_URL}/api/audit/{aid}/export.xlsx", headers=h, timeout=TIMEOUT)
        assert x.status_code == 200, x.text[:200]
        assert x.content[:2] == b"PK" and len(x.content) > 5000
        p = requests.get(f"{BASE_URL}/api/audit/{aid}/export.pdf", headers=h, timeout=TIMEOUT)
        assert p.status_code == 200, p.text[:200]
        assert p.content[:4] == b"%PDF" and len(p.content) > 3000

    def test_export_with_query_token(self, partner):
        """Frontend uses plain <a href> links; verify ?auth= token path works too."""
        body, _ = partner
        aid = TestAuditLifecycle.audit_id
        r = requests.get(f"{BASE_URL}/api/audit/{aid}/export.pdf?auth={body['session_token']}", timeout=TIMEOUT)
        assert r.status_code == 200, f"query-token export failed: {r.status_code} {r.text[:200]}"

    def test_complete_and_roll_forward(self, partner, audit_engagement):
        _, h = partner
        aid = TestAuditLifecycle.audit_id
        # Answer a roll-forward eligible question (Cover Page / Legal Docs = order 0/1)
        tmpl = requests.get(f"{BASE_URL}/api/audit/template", headers=h, timeout=TIMEOUT).json()
        rf_q = next(q for s in tmpl["sections"] if s["order"] in (0, 1) for q in s["questions"] if q["is_input"] and q["type"] == "text")
        requests.patch(f"{BASE_URL}/api/audit/{aid}/responses/{rf_q['code']}", headers=h,
                       json={"value": "TEST_ROLLFWD_VALUE"}, timeout=TIMEOUT)

        c = requests.post(f"{BASE_URL}/api/audit/{aid}/complete", headers=h, json={}, timeout=TIMEOUT)
        assert c.status_code == 200, c.text[:200]
        detail = requests.get(f"{BASE_URL}/api/audit/{aid}", headers=h, timeout=TIMEOUT).json()
        assert detail["audit"]["status"] == "completed"

        # history shows the completed audit (no responses payload)
        hist = requests.get(f"{BASE_URL}/api/audit/client/{audit_engagement['client_id']}/history", headers=h, timeout=TIMEOUT)
        assert hist.status_code == 200
        assert any(a["audit_id"] == aid for a in hist.json())
        assert all("responses" not in a for a in hist.json())

        # start new period rolling forward
        r = requests.post(f"{BASE_URL}/api/audit/engagements/{audit_engagement['engagement_id']}/start", headers=h,
                          json={"period": "TEST_FY 2026-27", "roll_forward_from": aid}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        new_id = r.json()["audit_id"]
        nd = requests.get(f"{BASE_URL}/api/audit/{new_id}", headers=h, timeout=TIMEOUT).json()
        assert nd["audit"].get("rolled_forward_from") == aid
        assert nd["audit"]["responses"].get(rf_q["code"], {}).get("value") == "TEST_ROLLFWD_VALUE"
        assert nd["audit"]["responses"][rf_q["code"]].get("rolled_forward") is True
        # non-rollforward question NOT copied
        other = next(q for s in tmpl["sections"] if s["order"] > 1 for q in s["questions"] if q["is_input"])
        assert nd["audit"]["responses"].get(other["code"], {}).get("value") in (None, "")

        # list both audits for engagement with progress
        lst = requests.get(f"{BASE_URL}/api/audit/engagements/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT).json()
        assert len(lst) == 2
        assert all("overall_pct" in a and "questions_total" in a for a in lst)

    def test_staff_can_access_audit(self, fazil):
        _, h = fazil
        r = requests.get(f"{BASE_URL}/api/audit/{TestAuditLifecycle.audit_id}", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:200]

    def test_unknown_audit_404(self, partner):
        _, h = partner
        r = requests.get(f"{BASE_URL}/api/audit/audit_nonexistent999", headers=h, timeout=TIMEOUT)
        assert r.status_code == 404


# ---------- AML reminder exclusivity regression ----------
class TestAMLReminderExclusivity:
    task_id = None
    prev_cfg = None

    def test_setup_designate_fazil(self, partner):
        _, h = partner
        cur = requests.get(f"{BASE_URL}/api/settings/reminder-config", headers=h, timeout=TIMEOUT)
        assert cur.status_code == 200
        TestAMLReminderExclusivity.prev_cfg = cur.json().get("aml_designated_staff", "")
        r = requests.patch(f"{BASE_URL}/api/settings/reminder-config", headers=h,
                           json={"aml_designated_staff": "fazil@nnadvisory.ae"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:200]
        after = requests.get(f"{BASE_URL}/api/settings/reminder-config", headers=h, timeout=TIMEOUT).json()
        assert after["aml_designated_staff"] == "fazil@nnadvisory.ae"

    def test_create_aml_task_for_subin(self, partner, some_client):
        _, h = partner
        due = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d")
        r = requests.post(f"{BASE_URL}/api/tasks", headers=h, json={
            "title": "TEST_iter17 AML routing task",
            "service_module": "AML Review",
            "due_date": due,
            "priority": "High",
            "client_id": some_client["client_id"],
            "client_name": some_client["name"],
            "assigned_to": "subin@nnadvisory.ae",
            "assigned_to_name": "Subin",
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        TestAMLReminderExclusivity.task_id = r.json()["task_id"]

    def test_fazil_sees_task_as_own(self, fazil):
        _, h = fazil
        r = requests.get(f"{BASE_URL}/api/reminders", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200
        match = [x for x in r.json() if x.get("ref_id") == TestAMLReminderExclusivity.task_id]
        assert match, "designated AML staff (Fazil) does not see the rerouted AML task"
        assert match[0]["assigned_to_email"] == "fazil@nnadvisory.ae"
        assert match[0]["assigned_to"] == "Fazil"

    def test_subin_does_not_see_task(self, subin):
        _, h = subin
        r = requests.get(f"{BASE_URL}/api/reminders", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200
        match = [x for x in r.json() if x.get("ref_id") == TestAMLReminderExclusivity.task_id]
        assert not match, "original assignee (Subin) still sees the AML task routed away"

    def test_partner_sees_task(self, partner):
        _, h = partner
        r = requests.get(f"{BASE_URL}/api/reminders", headers=h, timeout=TIMEOUT)
        assert r.status_code == 200
        match = [x for x in r.json() if x.get("ref_id") == TestAMLReminderExclusivity.task_id]
        assert match, "partner does not see all reminders"
        assert match[0]["assigned_to_email"] == "fazil@nnadvisory.ae"

    def test_cleanup(self, partner):
        _, h = partner
        if TestAMLReminderExclusivity.task_id:
            r = requests.patch(f"{BASE_URL}/api/tasks/{TestAMLReminderExclusivity.task_id}?status=Completed",
                               headers=h, timeout=TIMEOUT)
            assert r.status_code in (200, 204), r.text[:200]
        requests.patch(f"{BASE_URL}/api/settings/reminder-config", headers=h,
                       json={"aml_designated_staff": TestAMLReminderExclusivity.prev_cfg or ""}, timeout=TIMEOUT)
