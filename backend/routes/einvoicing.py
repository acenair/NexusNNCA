"""E-invoicing (UAE) readiness tracker — per-client compliance state.

UAE eInvoicing (DCTCE / 5-corner, PINT AE): voluntary since 1 Jul 2026;
mandatory 1 Jan 2027 for revenue >= AED 50m (ASP by 30 Oct 2026), 1 Jul 2027
for smaller businesses (ASP by 31 Mar 2027), 1 Oct 2027 for government
entities. NNCA as Corner 1 system: tracks every client's readiness.
"""
from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event

router = APIRouter(prefix="/api")

PHASES = {
    "phase1": {"label": "Revenue ≥ AED 50m", "asp_by": "2026-10-30", "go_live": "2027-01-01"},
    "phase2": {"label": "Revenue < AED 50m", "asp_by": "2027-03-31", "go_live": "2027-07-01"},
    "gov": {"label": "Government entity", "asp_by": "2027-03-31", "go_live": "2027-10-01"},
}

# readiness checklist items (PINT AE data + appointment steps)
CHECK_ITEMS = [
    ("tin_confirmed", "TIN confirmed (first 10 digits of TRN)"),
    ("fields_ready", "Invoice data covers the 51 mandatory PINT AE fields"),
    ("asp_appointed", "ASP appointed via EmaraTax (on MoF accredited register)"),
    ("peppol_id", "Peppol participant ID issued (0235 + TIN)"),
    ("tested", "Test invoice exchanged end-to-end with the ASP"),
]


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


async def _partner(user):
    if user.get("role") != "partner":
        raise HTTPException(403, "Partners only")
    return user


def _phase_of(rec):
    return rec.get("phase") if rec and rec.get("phase") in PHASES else None


def _decorate(rec):
    """Add phase dates + derived readiness state to a client record."""
    from datetime import date
    phase = _phase_of(rec)
    checks = {k: bool(rec.get(k)) for k, _ in CHECK_ITEMS if k != "label"}
    done = sum(1 for v in checks.values() if v)
    out = {
        **rec,
        "checks": checks,
        "ready_count": f"{done}/{len(checks)}",
        "phase_label": PHASES[phase]["label"] if phase else "— not classified —",
        "asp_by": PHASES[phase]["asp_by"] if phase else None,
        "go_live": PHASES[phase]["go_live"] if phase else None,
    }
    if phase:
        d = date.fromisoformat(PHASES[phase]["asp_by"])
        days = (d - date.today()).days
        out["asp_due_days"] = days
        out["urgency"] = "overdue" if days < 0 and not checks.get("asp_appointed") else (
            "urgent" if days <= 60 and not checks.get("asp_appointed") else "ok")
    return out


@router.get("/einvoicing/overview")
async def overview(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    recs = {r["client_id"]: r async for r in db.einvoicing_readiness.find({}, {"_id": 0})}
    clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1, "trn": 1, "status": 1}).to_list(2000)
    out = []
    for c in clients:
        if c.get("status") == "Inactive":
            continue
        out.append(_decorate({**recs.get(c["client_id"], {"client_id": c["client_id"], "client_name": c["name"]}),
                              "client_name": c["name"], "trn": c.get("trn")}))
    out.sort(key=lambda r: (r.get("urgency") != "overdue", r.get("urgency") != "urgent", r.get("client_name", "")))
    return {"clients": out, "phases": PHASES}


@router.patch("/einvoicing/readiness/{client_id}")
async def update_readiness(client_id: str, body: Optional[dict] = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _partner(await get_current_user(authorization, session_token))
    body = body or {}
    client = await db.clients.find_one({"client_id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    allowed = {k for k, _ in CHECK_ITEMS} | {"phase", "asp_name", "asp_notes", "annual_revenue_aed"}
    updates = {k: body[k] for k in allowed if k in body}
    if "phase" in updates and updates["phase"] not in (None, "") and updates["phase"] not in PHASES:
        raise HTTPException(422, "Unknown phase")
    if "annual_revenue_aed" in updates and updates["annual_revenue_aed"] not in (None, ""):
        try:
            updates["annual_revenue_aed"] = float(updates["annual_revenue_aed"])
        except (TypeError, ValueError):
            raise HTTPException(422, "Revenue must be a number")
    if not updates:
        raise HTTPException(422, "Nothing to update")
    updates.update({"client_name": client["name"], "updated_by": user.get("name"), "updated_at": _now()})
    await db.einvoicing_readiness.update_one({"client_id": client_id}, {"$set": updates}, upsert=True)
    return _decorate({**updates, "client_id": client_id})


@router.get("/einvoicing/deadlines")
async def deadlines(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    return {"phases": PHASES,
            "penalties": {
                "not_appointed": "AED 5,000 / month",
                "late_invoice": "AED 100 per invoice (cap AED 5,000 / month)",
                "late_credit_note": "AED 100 per credit note (cap AED 5,000 / month)",
                "data_change_unnotified": "AED 1,000 / day",
            },
            "facts": {
                "format": "PINT AE (UBL 2.1 XML) — 51 mandatory fields for a tax invoice",
                "scope": "B2B / B2G (B2C excluded for now)",
                "participant_id": "0235 + 10-digit TIN",
                "voluntary_since": "2026-07-01",
            }}
