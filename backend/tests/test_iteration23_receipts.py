"""B2 — Receipt inbox tests: upload guards, duplicate firewall, review workflow.

Runs against the LIVE dev server (REACT_APP_BACKEND_URL / frontend/.env, port 8101).
AI parsing needs GEMINI_API_KEY — when absent locally the upload endpoint must
fail CLEANLY (503), never 500; tests accept either a clean AI-unavailable skip
or a full successful parse depending on environment.
"""
import io
import os
import struct
import zlib
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
# local test-DB password (see nexusnnca-verify: test DB uses the tests' password)
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
    r = requests.post(
        f"{BASE_URL}/api/service/engagements", headers=h,
        json={"client_name": "Test Receipt Co (Demo)", "service_type": "statutory_audit",
              "fee_amount": 12000},
        timeout=TIMEOUT,
    )
    if r.status_code not in (200, 201):
        # fallback: reuse the first audit engagement
        r2 = requests.get(f"{BASE_URL}/api/service/engagements", headers=h, timeout=TIMEOUT)
        engs = [e for e in r2.json() if e.get("service_type") == "statutory_audit"]
        assert engs, "no audit engagement available"
        return engs[0]
    eng = r.json()
    return eng.get("engagement") or eng


def _png_bytes(w=8, h=8, rgb=(200, 60, 60)):
    """Minimal valid PNG built in-process (no fixture files)."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def test_receipt_endpoints_require_auth():
    r = requests.get(f"{BASE_URL}/api/receipts/fake-engagement", timeout=TIMEOUT)
    assert r.status_code in (401, 403), f"unauthenticated listing must be rejected, got {r.status_code}"


def test_receipts_reject_client_role_db():
    """The module guard: client-role users hit 403 via _staff_only (unit)."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "ca_ai_test")
    from routes.receipts import _staff_only
    from fastapi import HTTPException
    import asyncio
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_staff_only({"role": "client"}))
    assert exc.value.status_code == 403
    # staff/partner pass through untouched
    assert asyncio.run(_staff_only({"role": "staff"}))["role"] == "staff"
    assert asyncio.run(_staff_only({"role": "partner"}))["role"] == "partner"


def test_upload_rejects_non_receipt_mime(partner, audit_engagement):
    _, h = partner
    r = requests.post(
        f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/upload",
        headers=h, files={"file": ("notes.txt", io.BytesIO(b"not a receipt"), "text/plain")},
        timeout=TIMEOUT,
    )
    assert r.status_code == 400, f"txt upload should 400, got {r.status_code}: {r.text[:200]}"


def test_upload_rejects_oversize(partner, audit_engagement):
    _, h = partner
    big = _png_bytes() + b"\x00" * (9 * 1024 * 1024)
    r = requests.post(
        f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/upload",
        headers=h, files={"file": ("big.png", io.BytesIO(big), "image/png")},
        timeout=TIMEOUT,
    )
    assert r.status_code == 413, f"9MB upload should 413, got {r.status_code}"


def test_upload_clean_when_ai_unavailable(partner, audit_engagement):
    """With no GEMINI_API_KEY the upload must 503 cleanly; with a key it must
    either parse (200) or reject non-receipts (422) — never 500."""
    _, h = partner
    r = requests.post(
        f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/upload",
        headers=h, files={"file": ("r.png", io.BytesIO(_png_bytes()), "image/png")},
        timeout=TIMEOUT,
    )
    assert r.status_code in (200, 422, 503), f"unexpected {r.status_code}: {r.text[:300]}"
    if r.status_code == 200:
        doc = r.json()
        for field in ("receipt_id", "status", "vendor_key", "currency"):
            assert field in doc, f"parsed receipt missing {field}"
        assert doc["status"] in ("Pending review", "Flagged duplicate")


def test_exact_duplicate_blocked(partner, audit_engagement):
    """Same bytes twice: second upload must 409 — even when AI is configured."""
    _, h = partner
    png = _png_bytes(10, 10, (10, 120, 200))
    files = {"file": ("dupe.png", io.BytesIO(png), "image/png")}
    r1 = requests.post(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/upload",
                       headers=h, files=files, timeout=TIMEOUT)
    if r1.status_code not in (200, 409):
        pytest.skip(f"AI unavailable locally ({r1.status_code}) — duplicate firewall needs a parse first")
    if r1.status_code == 409:
        return  # already uploaded by an earlier test in this module
    r2 = requests.post(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/upload",
                       headers=h, files={"file": ("dupe.png", io.BytesIO(png), "image/png")}, timeout=TIMEOUT)
    assert r2.status_code == 409, f"exact duplicate must 409, got {r2.status_code}"
    body = r2.json()
    assert "existing_receipt_id" in str(body) or "Duplicate" in str(body), body


def test_list_and_totals(partner, audit_engagement):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT)
    assert r.status_code == 200
    body = r.json()
    assert "receipts" in body and "totals" in body
    for k in ("count", "accepted", "pending", "flagged", "vat_total", "total_spend"):
        assert k in body["totals"], f"totals missing {k}"
    for row in body["receipts"]:
        assert row.get("status") in ("Pending review", "Accepted", "Flagged duplicate", "Rejected")


def test_patch_rejects_bad_status(partner, audit_engagement):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT)
    rows = r.json()["receipts"]
    if not rows:
        pytest.skip("no receipts stored (AI unavailable locally)")
    rid = rows[0]["receipt_id"]
    bad = requests.patch(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/{rid}",
                         headers=h, json={"status": "Bogus"}, timeout=TIMEOUT)
    assert bad.status_code == 400, f"bogus status must 400, got {bad.status_code}"


def test_patch_vendor_and_status_roundtrip(partner, audit_engagement):
    _, h = partner
    r = requests.get(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}", headers=h, timeout=TIMEOUT)
    rows = r.json()["receipts"]
    if not rows:
        pytest.skip("no receipts stored (AI unavailable locally)")
    rid = rows[0]["receipt_id"]
    upd = requests.patch(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/{rid}",
                         headers=h, json={"vendor": "Zayed Stationery", "total": 118.75,
                                          "vat_amount": 5.88, "status": "Accepted"}, timeout=TIMEOUT)
    assert upd.status_code == 200, upd.text[:300]
    body = upd.json()
    assert body["vendor"] == "Zayed Stationery"
    assert body["vendor_key"] == "zayedstationery"
    assert body["status"] == "Accepted"


def test_delete_missing_receipt_404(partner, audit_engagement):
    _, h = partner
    r = requests.delete(f"{BASE_URL}/api/receipts/{audit_engagement['engagement_id']}/rcp_does_not_exist",
                        headers=h, timeout=TIMEOUT)
    assert r.status_code == 404


def test_norm_vendor_unit():
    """Pure-function check on the duplicate-firewall key."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "ca_ai_test")
    from routes.receipts import _norm_vendor, RECEIPT_STATUSES
    assert _norm_vendor("Zayed Stationery LLC.") == _norm_vendor("zayed  stationery llc")
    assert _norm_vendor("Al-Fahad") != _norm_vendor("Al Fahad Traders")
    assert len(RECEIPT_STATUSES) == 4
