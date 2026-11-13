"""Routes / transfer pricing — related party register, threshold monitor, disclosure form,
arm's length test (UAE CT: Federal Decree-Law 47/2022 Art. 34-35 + 55, MD 97/2023, CD 44/2020).

Provider-agnostic by design: comparables may come from internal CUP evidence, an
outsourced benchmarking study, or any export — the app owns the register, thresholds,
FAR/method guidance, disclosure-form data and the interquartile-range test.

Thresholds (verified against MD 97/2023 + FTA TP Guide Oct 2023):
  - TP Disclosure Form: related-party transactions > AED 40M aggregate (categories
    > AED 4M each), or connected-person payments > AED 500K per person — filed with
    the CT return (9 months after FY end).
  - Master + Local File: own revenue >= AED 200M, or MNE group consolidated >= AED 3.15B.
  - CbCR: UAE ultimate parent, group consolidated >= AED 3.15B.
  - Arm's length principle: everyone, no threshold.
"""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter
from fastapi import Body
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional

from core import db, get_current_user

router = APIRouter(prefix="/api")

RPT_DISCLOSURE_TOTAL = 40_000_000
RPT_DISCLOSURE_CATEGORY = 4_000_000
CONNECTED_PERSON_LIMIT = 500_000
LOCAL_FILE_REVENUE = 200_000_000
MNE_GROUP_REVENUE = 3_150_000_000

TXN_TYPES = ["Goods", "Services", "Interest / Loans", "Royalties / IP", "Asset transfer", "Guarantees", "Cost sharing", "Other"]
METHODS = ["CUP", "Resale Price", "Cost Plus", "TNMM", "Profit Split", "Not set"]
RELATIONSHIPS = ["Parent / Subsidiary", "Same ownership", "Director / Owner", "Relative of owner", "Associate / Partner", "Other"]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _client_or_404(client_id):
    c = await db.clients.find_one({"client_id": client_id}, {"_id": 0, "client_id": 1, "name": 1,
                                                             "entity_type": 1, "jurisdiction": 1, "emirate": 1,
                                                             "free_zone": 1, "industry": 1,
                                                             "annual_revenue_aed": 1, "mne_group": 1,
                                                             "mne_group_revenue_aed": 1})
    if not c:
        raise HTTPException(404, "Unknown client")
    return c


# ---------------- counterparties ----------------

@router.get("/tp/{client_id}/counterparties")
async def list_counterparties(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    await _client_or_404(client_id)
    rows = await db.tp_counterparties.find({"client_id": client_id}, {"_id": 0}).sort("name", 1).to_list(300)
    return {"counterparties": rows}


@router.post("/tp/{client_id}/counterparties")
async def add_counterparty(client_id: str, payload: dict = Body(default=None),
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await _client_or_404(client_id)
    p = payload or {}
    if not p.get("name"):
        raise HTTPException(422, "Counterparty name is required")
    doc = {
        "cp_id": f"tcp_{uuid.uuid4().hex[:12]}", "client_id": client_id,
        "name": p.get("name"), "jurisdiction": p.get("jurisdiction") or "UAE",
        "relationship": p.get("relationship") or "Other",
        "ct_rate": p.get("ct_rate", 9),  # 0 = free zone qualifying, 9 = mainland, other = foreign
        "is_connected_person": bool(p.get("is_connected_person", False)),
        "notes": p.get("notes") or "",
        "created_by": user.get("name"), "created_at": _now(),
    }
    await db.tp_counterparties.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/tp/{client_id}/counterparties/{cp_id}")
async def update_counterparty(client_id: str, cp_id: str, payload: dict = Body(default=None),
                              authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    payload = payload or {}
    payload.pop("cp_id", None); payload.pop("client_id", None); payload.pop("_id", None)
    res = await db.tp_counterparties.update_one({"cp_id": cp_id, "client_id": client_id}, {"$set": payload})
    if not res.matched_count:
        raise HTTPException(404, "Counterparty not found")
    return {"ok": True}


@router.delete("/tp/{client_id}/counterparties/{cp_id}")
async def delete_counterparty(client_id: str, cp_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    used = await db.tp_transactions.count_documents({"counterparty_id": cp_id})
    if used:
        raise HTTPException(409, f"Counterparty has {used} transaction(s) — delete those first")
    res = await db.tp_counterparties.delete_one({"cp_id": cp_id, "client_id": client_id})
    if not res.deleted_count:
        raise HTTPException(404, "Counterparty not found")
    return {"ok": True}


# ---------------- transactions ----------------

@router.get("/tp/{client_id}/transactions")
async def list_transactions(client_id: str, fy: Optional[str] = None,
                            authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    await _client_or_404(client_id)
    q = {"client_id": client_id}
    if fy:
        q["fy"] = fy
    rows = await db.tp_transactions.find(q, {"_id": 0}).sort("fy", -1).to_list(500)
    return {"transactions": rows}


@router.post("/tp/{client_id}/transactions")
async def add_transaction(client_id: str, payload: dict = Body(default=None),
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    await _client_or_404(client_id)
    p = payload or {}
    if not p.get("counterparty_id"):
        raise HTTPException(422, "counterparty_id is required")
    cp = await db.tp_counterparties.find_one({"cp_id": p["counterparty_id"], "client_id": client_id})
    if not cp:
        raise HTTPException(404, "Counterparty not found for this client")
    doc = {
        "txn_id": f"ttxn_{uuid.uuid4().hex[:12]}", "client_id": client_id,
        "counterparty_id": p["counterparty_id"], "counterparty_name": cp.get("name"),
        "txn_type": p.get("txn_type") or "Other", "fy": p.get("fy") or str(date.today().year),
        "amount_aed": float(p.get("amount_aed") or 0), "method": p.get("method") or "Not set",
        "far_note": p.get("far_note") or "",   # functions / assets / risks note
        "arm_length_note": p.get("arm_length_note") or "",
        "created_by": user.get("name"), "created_at": _now(),
    }
    await db.tp_transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/tp/{client_id}/transactions/{txn_id}")
async def update_transaction(client_id: str, txn_id: str, payload: dict = Body(default=None),
                             authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    payload = payload or {}
    for k in ("txn_id", "client_id", "counterparty_id", "_id"):
        payload.pop(k, None)
    if "amount_aed" in payload:
        payload["amount_aed"] = float(payload["amount_aed"] or 0)
    res = await db.tp_transactions.update_one({"txn_id": txn_id, "client_id": client_id}, {"$set": payload})
    if not res.matched_count:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@router.delete("/tp/{client_id}/transactions/{txn_id}")
async def delete_transaction(client_id: str, txn_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    res = await db.tp_transactions.delete_one({"txn_id": txn_id, "client_id": client_id})
    if not res.deleted_count:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


# ---------------- threshold monitor + disclosure form data ----------------

@router.get("/tp/{client_id}/summary")
async def tp_summary(client_id: str, fy: Optional[str] = None,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    """Threshold monitor: what is this client required to file, computed from the register."""
    await get_current_user(authorization, session_token)
    client = await _client_or_404(client_id)
    fy = fy or str(date.today().year)
    txns = await db.tp_transactions.find({"client_id": client_id, "fy": fy}, {"_id": 0}).to_list(1000)
    cps = {c["cp_id"]: c for c in await db.tp_counterparties.find({"client_id": client_id}, {"_id": 0}).to_list(500)}

    by_category, by_counterparty, total = {}, {}, 0.0
    connected_total = 0.0
    freezone_flags = []
    for t in txns:
        amt = t.get("amount_aed") or 0
        total += amt
        by_category[t["txn_type"]] = round(by_category.get(t["txn_type"], 0) + amt, 2)
        by_counterparty[t["counterparty_id"]] = round(by_counterparty.get(t["counterparty_id"], 0) + amt, 2)
        cp = cps.get(t["counterparty_id"]) or {}
        rate = cp.get("ct_rate", 9)
        if rate != 9:  # 0% qualifying free zone person, exempt person, or foreign rate
            freezone_flags.append({"counterparty": cp.get("name"), "ct_rate": rate,
                                   "reason": "Different CT rate — MUST be included in the Local File (MD 97/2023 Art. 2(2))" if rate == 0 else "Non-standard CT rate"})
        if cp.get("is_connected_person"):
            connected_total += amt

    client_revenue = float(client.get("annual_revenue_aed") or 0)
    mne_group = bool(client.get("mne_group", False))
    group_revenue = float(client.get("mne_group_revenue_aed") or 0)

    disclosure_required = total > RPT_DISCLOSURE_TOTAL or connected_total > CONNECTED_PERSON_LIMIT
    disclosable_categories = {k: v for k, v in by_category.items() if v > RPT_DISCLOSURE_CATEGORY}
    files_required = client_revenue >= LOCAL_FILE_REVENUE or (mne_group and group_revenue >= MNE_GROUP_REVENUE)
    cbcr_required = mne_group and group_revenue >= MNE_GROUP_REVENUE  # UAE UPE case (simplified)

    methods_missing = [t["txn_id"] for t in txns if (t.get("method") or "Not set") == "Not set"]

    return {
        "client_id": client_id, "client_name": client["name"], "fy": fy,
        "totals": {"rpt_total": round(total, 2), "connected_person_total": round(connected_total, 2)},
        "by_category": by_category,
        "thresholds": {
            "disclosure_form_required": disclosure_required,
            "disclosure_reason": ("RPT total > AED 40M" if total > RPT_DISCLOSURE_TOTAL else
                                  "Connected person payments > AED 500K" if connected_total > CONNECTED_PERSON_LIMIT else
                                  "Below thresholds — arm's length still applies, form not required this year"),
            "disclosable_categories_over_4m": disclosable_categories,
            "local_master_file_required": files_required,
            "files_reason": ("Revenue >= AED 200M" if client_revenue >= LOCAL_FILE_REVENUE else
                             "MNE group consolidated >= AED 3.15B" if files_required else
                             "Below both MD 97 thresholds"),
            "cbcr_required": cbcr_required,
            "freezone_rate_flags": freezone_flags,
        },
        "completeness": {"transactions": len(txns), "methods_not_set": len(methods_missing),
                         "counterparties": len(cps)},
    }


@router.post("/tp/{client_id}/arm-length-test")
async def arm_length_test(client_id: str, payload: dict = Body(default=None),
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    """Provider-agnostic interquartile-range test: pass any comparables set
    (percentiles or raw margins) + the client's actual result."""
    await get_current_user(authorization, session_token)
    p = payload or {}
    values = p.get("comparables") or []   # raw PLI values (e.g. operating margins as %)
    q1 = p.get("q1"); med = p.get("median"); q3 = p.get("q3")
    if len(values) >= 4:
        vs = sorted(float(v) for v in values)
        n = len(vs)

        def pctile(k):
            pos = k * (n - 1)
            lo = int(pos)
            frac = pos - lo
            return vs[lo] if lo + 1 >= n else vs[lo] * (1 - frac) + vs[lo + 1] * frac
        q1, med, q3 = round(pctile(0.25), 4), round(pctile(0.5), 4), round(pctile(0.75), 4)
    elif None in (q1, med, q3):
        raise HTTPException(422, "Provide either 4+ comparables values or q1/median/q3")
    actual = p.get("actual")
    if actual is None:
        raise HTTPException(422, "actual (the client's tested margin/price) is required")
    q1f, medf, q3f = float(q1), float(med), float(q3)
    actualf = float(actual)
    inside = q1f <= actualf <= q3f
    med = medf
    return {"q1": q1f, "median": medf, "q3": q3f, "actual": actualf,
            "inside_iqr": inside,
            "exposure": "" if inside else "Outside range — FTA may adjust to the median and tax the difference at 9%",
            "adjustment_note": ("" if inside else f"Adjustment target: {med}"),
            "tested_by": p.get("tested_by") or "", "source_note": p.get("source_note") or ""}


@router.post("/tp/{client_id}/disclosure-form")
async def disclosure_form(client_id: str, payload: dict = Body(default=None),
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    """Pre-filled TP Disclosure Form data for EmaraTax (category aggregates + methods)."""
    await get_current_user(authorization, session_token)
    s = await tp_summary(client_id, (payload or {}).get("fy"), authorization, session_token)
    cps = await db.tp_counterparties.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    form_rows = []
    for t in await db.tp_transactions.find({"client_id": client_id, "fy": s["fy"]}, {"_id": 0}).to_list(1000):
        cp = next((c for c in cps if c["cp_id"] == t["counterparty_id"]), {})
        form_rows.append({
            "category": t["txn_type"], "counterparty": t["counterparty_name"],
            "jurisdiction": cp.get("jurisdiction") or "UAE", "amount_aed": t["amount_aed"],
            "method": t["method"],
            "disclose": (t["txn_type"] in s["thresholds"]["disclosable_categories_over_4m"]),
        })
    return {"client_name": s["client_name"], "fy": s["fy"], "total_rpt": s["totals"]["rpt_total"],
            "connected_person_total": s["totals"]["connected_person_total"],
            "disclosure_form_required": s["thresholds"]["disclosure_form_required"],
            "rows": form_rows,
            "generated_at": _now()}




# ---------------- Local File generator (OECD Ch. V aligned structure) ----------------

@router.post("/tp/{client_id}/local-file")
async def local_file(client_id: str, payload: dict = Body(default=None),
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    """Assemble Local File content (OECD Ch. V structure) from the register, FAR notes,
    tax profile and threshold position. Rendered as a printable document."""
    user = await get_current_user(authorization, session_token)
    client = await _client_or_404(client_id)
    fy = (payload or {}).get("fy") or str(date.today().year)
    s = await tp_summary(client_id, fy, authorization, session_token)
    txns = await db.tp_transactions.find({"client_id": client_id, "fy": fy}, {"_id": 0}).to_list(1000)

    by_method = {}
    for t in txns:
        by_method.setdefault(t.get("method") or "Not set", []).append(t)

    org = (f"{client['name']} - {client.get('entity_type') or 'Entity'} in {client.get('jurisdiction') or 'UAE'}"
           + (f" ({client.get('free_zone')})" if client.get("free_zone") else "")
           + f". Industry: {client.get('industry') or '-'}.")
    if client.get("mne_group"):
        org += f" Part of an MNE group with consolidated revenue of AED {float(client.get('mne_group_revenue_aed') or 0):,.0f}."
    else:
        org += " Standalone entity (not part of an MNE group)."

    far_txt = " | ".join(f"{t['counterparty_name']}: {t.get('far_note') or 'not documented'}" for t in txns) if txns else "No controlled transactions recorded for this period."
    method_txt = "; ".join(f"{m2}: {len(ts)} txn(s)" for m2, ts in by_method.items()) or "No methods selected yet."
    th = s["thresholds"]
    threshold_txt = (f"Related-party total: AED {s['totals']['rpt_total']:,.0f}. Connected persons: AED {s['totals']['connected_person_total']:,.0f}. "
                     f"Disclosure form required: {'Yes' if th['disclosure_form_required'] else 'No'}. "
                     f"Master + Local File required: {'Yes - ' + th['files_reason'] if th['local_master_file_required'] else 'No - below both thresholds'}. "
                     f"Counterparties at a different CT rate (Local File mandatory, MD 97 Art. 2(2)): {len(th['freezone_rate_flags'])}.")

    sections = [
        {"title": "1. Organisational structure", "body": org, "rows": []},
        {"title": "2. Controlled transactions (FY " + fy + ")", "body": "", "rows": [
            {"counterparty": t.get("counterparty_name"), "type": t.get("txn_type"),
             "amount_aed": t.get("amount_aed"), "method": t.get("method"), "far": t.get("far_note") or "-"}
            for t in txns]},
        {"title": "3. Functional analysis (FAR)", "body": far_txt, "rows": []},
        {"title": "4. Method selection", "body": method_txt, "rows": []},
        {"title": "5. Comparability / benchmarking", "body": (
            "Attach the benchmarking study (internal comparables, outsourced study or database export) "
            "and record the interquartile range test result here (Arm's length test tab)."), "rows": []},
        {"title": "6. Threshold position (MD 97/2023)", "body": threshold_txt, "rows": [
            {"counterparty": f["counterparty"], "type": f["reason"], "amount_aed": None, "method": "", "far": ""}
            for f in th["freezone_rate_flags"]]},
        {"title": "7. Declaration", "body": (
            f"Prepared contemporaneously for FY {fy}. To be produced to the FTA within 30 days of a written request "
            f"(CT Law Art. 55). Prepared by {user.get('name')} on {date.today().isoformat()}."), "rows": []},
    ]
    return {"client_name": client["name"], "fy": fy, "sections": sections,
            "local_master_file_required": s["thresholds"]["local_master_file_required"],
            "generated_at": _now()}
