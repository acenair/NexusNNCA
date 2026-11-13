"""Routes / audit workpapers — structured ISA evidence per engagement.

Backs the "Audit workbook" tab in Engagement Detail:
  - risk register (ISA 315/330): identified risk → assertion → planned response → conclusion
  - materiality (ISA 320): benchmark × % → overall materiality, performance materiality, trivial threshold
  - external confirmation tracker (ISA 505): per account sent/received/exception status
  - management representation letter (ISA 580): prepared/received dates + status
Everything stores in one collection keyed by engagement_id.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter
from fastapi import Body
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from pydantic import BaseModel
from typing import Optional

from core import db, get_current_user

router = APIRouter(prefix="/api")

ISA_REFS = {
    "risk": "ISA 315 (revised 2019) / ISA 330",
    "materiality": "ISA 320",
    "confirmation": "ISA 505",
    "rep_letter": "ISA 580",
    "fraud": "ISA 240",
    "going_concern": "ISA 570",
    "tcwg": "ISA 260 / 265",
}


class WorkpaperIn(BaseModel):
    kind: str  # risk | materiality | confirmation | rep_letter
    data: dict


async def _authed(authorization, session_token):
    return await get_current_user(authorization, session_token)


async def _eng_exists(engagement_id):
    return await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0, "engagement_id": 1})


@router.get("/engagements/{engagement_id}/workpapers")
async def list_workpapers(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _authed(authorization, session_token)
    if not await _eng_exists(engagement_id):
        raise HTTPException(404, "Engagement not found")
    rows = await db.audit_workpapers.find({"engagement_id": engagement_id, "is_deleted": {"$ne": True}},
                                          {"_id": 0}).sort("created_at", 1).to_list(300)
    out = {"risk": [], "materiality": [], "confirmation": [], "rep_letter": []}
    for row in rows:
        if row.get("kind") in out:
            out[row["kind"]].append(row)
    return out


@router.post("/engagements/{engagement_id}/workpapers")
async def add_workpaper(engagement_id: str, payload: WorkpaperIn,
                        authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _authed(authorization, session_token)
    if not await _eng_exists(engagement_id):
        raise HTTPException(404, "Engagement not found")
    if payload.kind not in ("risk", "materiality", "confirmation", "rep_letter"):
        raise HTTPException(422, "kind must be risk | materiality | confirmation | rep_letter")
    wp_id = f"wp_{uuid.uuid4().hex[:12]}"
    doc = {
        "workpaper_id": wp_id, "engagement_id": engagement_id, "kind": payload.kind,
        "data": payload.data or {}, "created_by": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(), "is_deleted": False,
        "isa_ref": ISA_REFS.get(payload.kind, ""),
    }
    await db.audit_workpapers.insert_one(doc)
    return {"ok": True, "workpaper_id": wp_id, "isa_ref": doc["isa_ref"]}


@router.patch("/engagements/{engagement_id}/workpapers/{workpaper_id}")
async def update_workpaper(engagement_id: str, workpaper_id: str, payload: dict = Body(default=None),
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _authed(authorization, session_token)
    update = {"updated_by": user.get("name"), "updated_at": datetime.now(timezone.utc).isoformat()}
    if "data" in (payload or {}):
        update["data"] = payload["data"]
    if "is_deleted" in (payload or {}):
        update["is_deleted"] = bool(payload["is_deleted"])
    res = await db.audit_workpapers.update_one(
        {"workpaper_id": workpaper_id, "engagement_id": engagement_id}, {"$set": update})
    if not res.matched_count:
        raise HTTPException(404, "Workpaper not found")
    return {"ok": True}


# Materiality helper: compute derived values client-side is fine, but the canonical
# numbers live in the saved workpaper so the review trail references one source.
MATERIALITY_BENCHMARKS = {
    "profit_before_tax": (0.5, 5.0),
    "revenue": (0.5, 1.0),
    "total_assets": (0.5, 2.0),
    "equity": (0.5, 2.0),
    "cost_base": (0.5, 2.0),  # not-for-profit / cost-driven entities
}


@router.get("/engagements/{engagement_id}/materiality-calc")
async def materiality_calc(engagement_id: str, benchmark: str = "profit_before_tax",
                           benchmark_value: float = 0.0, pct: float = 5.0,
                           pm_pct: float = 50.0, trivial_pct: float = 5.0,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    """ISA 320 quick calculator: overall materiality, performance materiality, trivial threshold."""
    await _authed(authorization, session_token)
    if benchmark not in MATERIALITY_BENCHMARKS:
        raise HTTPException(422, f"benchmark must be one of {list(MATERIALITY_BENCHMARKS)}")
    lo, hi = MATERIALITY_BENCHMARKS[benchmark]
    if not lo <= pct <= hi:
        raise HTTPException(422, f"For {benchmark} the ISA-practice range is {lo}%–{hi}% (out of range = document justification)")
    om = round(benchmark_value * pct / 100, 2)
    return {"benchmark": benchmark, "benchmark_value": benchmark_value, "pct": pct,
            "overall_materiality": om, "performance_materiality": round(om * pm_pct / 100, 2),
            "trivial_threshold": round(om * trivial_pct / 100, 2),
            "guidance": MATERIALITY_BENCHMARKS[benchmark]}
