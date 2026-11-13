"""Routes / qm — ISQM 1 quality-management records for the firm.

kinds:
  independence  — annual/engagement independence + acceptance declarations
  monitoring    — file inspections, EQ reviews, partner reviews (findings + actions)
  cpd           — CPD hours per staff member (MOE requires ongoing development)
Aggregates power the QM dashboard (partner view).
"""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Body
from fastapi import Cookie
from fastapi import Header
from typing import Optional

from core import db, get_current_user

router = APIRouter(prefix="/api")

CPD_TARGET_HOURS = 40  # per staff per year (UAE practice standard)


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/qm/records")
async def list_qm(kind: Optional[str] = None, year: Optional[int] = None,
                  authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    q = {}
    if kind:
        q["kind"] = kind
    if year:
        q["year"] = year
    rows = await db.qm_records.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"records": rows}


@router.post("/qm/records")
async def add_qm(payload: dict = Body(default=None),
                 authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    p = payload or {}
    kind = p.get("kind")
    if kind not in ("independence", "monitoring", "cpd"):
        raise HTTPException(422, "kind must be independence | monitoring | cpd")
    doc = {
        "qm_id": f"qm_{uuid.uuid4().hex[:12]}", "kind": kind,
        "year": p.get("year") or date.today().year,
        "staff_name": p.get("staff_name") or user.get("name"),
        "engagement_ref": p.get("engagement_ref") or "",
        "title": p.get("title") or "",
        "detail": p.get("detail") or "",
        "hours": float(p.get("hours") or 0),
        "status": p.get("status") or "Recorded",
        "created_by": user.get("name"), "created_at": _now(),
    }
    await db.qm_records.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/qm/records/{qm_id}")
async def delete_qm(qm_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    res = await db.qm_records.delete_one({"qm_id": qm_id})
    if not res.deleted_count:
        raise HTTPException(404, "Record not found")
    return {"ok": True}


@router.get("/qm/dashboard")
async def qm_dashboard(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Partner view: independence coverage, CPD vs target, monitoring reviews."""
    await get_current_user(authorization, session_token)
    year = date.today().year
    records = await db.qm_records.find({"year": year}, {"_id": 0}).to_list(1000)

    staff = await db.users.find({"role": {"$nin": ["client"]}}, {"_id": 0, "name": 1, "role": 1}).to_list(50)
    staff_names = [s["name"] for s in staff]
    cpd_by_staff = {}
    for r in records:
        if r["kind"] == "cpd" and r.get("staff_name"):
            cpd_by_staff[r["staff_name"]] = round(cpd_by_staff.get(r["staff_name"], 0) + r.get("hours", 0), 1)
    cpd_rows = [{"staff": n, "hours": cpd_by_staff.get(n, 0), "target": CPD_TARGET_HOURS,
                 "ok": cpd_by_staff.get(n, 0) >= CPD_TARGET_HOURS} for n in staff_names]

    active_audits = await db.service_engagements.count_documents(
        {"service_type": "statutory_audit", "status": {"$nin": ["Deleted", "Completed"]}})
    indep = [r for r in records if r["kind"] == "independence"]
    indep_engs = {r.get("engagement_ref") for r in indep if r.get("engagement_ref")}
    monitoring = [r for r in records if r["kind"] == "monitoring"]

    return {
        "year": year,
        "independence": {
            "active_audits": active_audits,
            "declared": len(indep_engs),
            "missing": max(0, active_audits - len(indep_engs)),
        },
        "cpd": cpd_rows,
        "monitoring": {
            "total": len(monitoring),
            "open_findings": sum(1 for m in monitoring if m.get("status") not in ("Closed", "Actioned")),
            "recent": monitoring[:5],
        },
    }
