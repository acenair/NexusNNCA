"""B3 — VAT reconciliation tests: books-vs-filed comparison, review signoff.

Runs against the LIVE dev server (REACT_APP_BACKEND_URL, port 8101).
Local baseline state (no VAT seed locally, admin password AdminPass2026!):
the suite seeds its own filing + ledger-backed fixtures via the API where
possible and tolerates books-missing states.
"""
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
TIMEOUT = 90
PASSWORD = os.environ.get("NNCA_TEST_PASSWORD", "AdminPass2026!")


def login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:300]}"
    body = r.json()
    token = body.get("session_token")
    assert token, f"no session_token for {email}"
    return body, {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def partner():
    return login("srinivas.anup@gmail.com")


@pytest.fixture(scope="module")
def audit_engagement(partner):
    _, h = partner
    r2 = requests.get(f"{BASE_URL}/api/service/engagements", headers=h, timeout=TIMEOUT)
    engs = [e for e in r2.json() if e.get("service_type") == "statutory_audit"]
    assert engs, "no audit engagement available"
    return engs[0]


def test_quarter_key_unit():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "ca_ai_test")
    from routes.vat_recon import _quarter_key
    assert _quarter_key("2025-08-14") == "2025-Q3"
    assert _quarter_key("2026-01-05") == "2026-Q1"
    assert _quarter_key("2025-04-30") == "2025-Q2"
    assert _quarter_key("2025-12-31") == "2025-Q4"
    assert _quarter_key(None) is None
    assert _quarter_key("garbage") is None


def test_recon_requires_auth():
    r = requests.get(f"{BASE_URL}/api/vat/recon/fake-engagement", timeout=TIMEOUT)
    assert r.status_code in (401, 403)


def test_recon_missing_engagement_404(partner):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/vat/recon/engagement_does_not_exist", headers=h, timeout=TIMEOUT)
    assert r.status_code == 404


def test_recon_shape(partner, audit_engagement):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/vat/recon/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    for k in ("engagement_id", "client_id", "periods", "totals"):
        assert k in body, f"missing {k}"
    for k in ("periods", "reconciled", "variance", "books_missing", "not_filed"):
        assert k in body["totals"], f"totals missing {k}"
    for row in body["periods"]:
        assert row["status"] in ("Reconciled", "Variance", "Books missing", "Not filed", "No return filed")
        assert row.get("period_key")


def test_filing_patch_validations(partner):
    _, h = partner
    r = requests.patch(f"{BASE_URL}/api/vat/filings/vat_filing_missing", headers=h,
                       json={"box_1a": 5}, timeout=TIMEOUT)
    assert r.status_code == 404


def test_review_roundtrip(partner, audit_engagement):
    """Sign off a period, see the review, undo it."""
    _, h = partner
    eid = audit_engagement["engagement_id"]
    # use a synthetic period key — review is client-keyed, works without filings
    r = requests.patch(f"{BASE_URL}/api/vat/recon/{eid}/2099-Q1", headers=h,
                       json={"note": "test signoff"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["period_key"] == "2099-Q1"
    assert body["reviewed_by"], "review must be attributed"

    # visible in the recon payload
    r2 = requests.get(f"{BASE_URL}/api/vat/recon/{eid}", headers=h, timeout=TIMEOUT)
    reviews = [p.get("review") for p in r2.json()["periods"] if p["period_key"] == "2099-Q1"]
    assert reviews and reviews[0] and reviews[0]["note"] == "test signoff"

    r3 = requests.delete(f"{BASE_URL}/api/vat/recon/{eid}/2099-Q1", headers=h, timeout=TIMEOUT)
    assert r3.status_code == 200
    r4 = requests.get(f"{BASE_URL}/api/vat/recon/{eid}", headers=h, timeout=TIMEOUT)
    assert all(p["period_key"] != "2099-Q1" or not p.get("review") for p in r4.json()["periods"])


def test_recon_classify_unit():
    """Status machine: books missing → not filed → reconciled/variance."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "ca_ai_test")
    from routes.vat_recon import _classify
    assert _classify("Filed", {"entries": 0, "output": 0, "input": 0}, 100, 50) == "Books missing"
    assert _classify("Pending", {"entries": 5, "output": 100, "input": 50}, 100, 50) == "Not filed"
    assert _classify("Filed", {"entries": 5, "output": 100.5, "input": 50}, 100, 50) == "Reconciled"
    assert _classify("Filed", {"entries": 5, "output": 1100, "input": 50}, 100, 50) == "Variance"
