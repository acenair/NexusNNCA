"""Routes / audit workpapers — structured ISA evidence per engagement.

Backs the "Audit workbook" tab in Engagement Detail:
  - risk register (ISA 315/330): identified risk → assertion → planned response → conclusion
  - materiality (ISA 320): benchmark × % → overall materiality, performance materiality, trivial threshold
  - external confirmation tracker (ISA 505): per account sent/received/exception status
  - management representation letter (ISA 580): prepared/received dates + status
Everything stores in one collection keyed by engagement_id.
"""
import uuid
from datetime import datetime, timezone, date
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
    "sampling": "ISA 530",
    "group": "ISA 600 (Revised)",
    "report": "ISA 700",
}

# Poisson reliability factors (zero expected deviations) + UDL factors by deviations found
SAMPLING_FACTORS = {
    90: [2.3, 3.9, 5.3, 6.7],
    95: [3.0, 4.8, 6.3, 7.7],
    99: [3.7, 5.4, 7.0, 8.5],
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
    out = {"risk": [], "materiality": [], "confirmation": [], "rep_letter": [], "sampling": [], "tcwg": [], "group": [], "report": []}
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
    if payload.kind not in ("risk", "materiality", "confirmation", "rep_letter", "sampling", "tcwg", "group", "report"):
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


# ---------------- ISA 530 attribute sampling ----------------

@router.get("/engagements/{engagement_id}/sampling-calc")
async def sampling_calc(engagement_id: str, confidence: int = 95, tolerable_rate: float = 5.0,
                        population: int = 0, deviations: int = 0,
                        authorization: str = Header(None), session_token: str = Cookie(None)):
    """Attribute sampling (Poisson): sample size for the confidence level and tolerable
    deviation rate; evaluates deviations found against the upper deviation limit."""
    await _authed(authorization, session_token)
    if confidence not in SAMPLING_FACTORS:
        raise HTTPException(422, "confidence must be 90, 95 or 99")
    if not 0 < tolerable_rate <= 20:
        raise HTTPException(422, "tolerable_rate is a %, e.g. 5 for 5%")
    rf_zero = SAMPLING_FACTORS[confidence][0]
    sample_size = max(1, int(rf_zero / (tolerable_rate / 100) + 0.999)) if tolerable_rate else 0
    evaluated = None
    if population and deviations:
        k = min(deviations, len(SAMPLING_FACTORS[confidence]) - 1)
        udl = SAMPLING_FACTORS[confidence][k] / sample_size * 100 if sample_size else 0
        evaluated = {
            "deviations": deviations, "upper_deviation_limit_pct": round(udl, 2),
            "within_tolerance": udl <= tolerable_rate,
            "conclusion": ("Deviation rate supported — control/test conclusion stands" if udl <= tolerable_rate
                           else "UDL exceeds the tolerable rate — extend the sample, test alternatives, or qualify the conclusion"),
        }
    return {"confidence_pct": confidence, "tolerable_rate_pct": tolerable_rate,
            "population": population, "sample_size": sample_size, "method": "Poisson attribute sampling, zero expected deviations",
            "evaluation": evaluated}


# ---------------- ISA 210 engagement letter generator ----------------

@router.post("/engagements/{engagement_id}/engagement-letter")
async def engagement_letter(engagement_id: str, payload: dict = Body(default=None),
                            authorization: str = Header(None), session_token: str = Cookie(None)):
    """Assemble an ISA 210 engagement letter from the engagement + client + firm data."""
    user = await _authed(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    client = await db.clients.find_one({"client_id": eng.get("client_id")}, {"_id": 0}) or {}
    firm = await db.settings.find_one({"type": "firm_identity"}, {"_id": 0}) or {}
    firm_name = firm.get("firm_name") or "Nair & Nelliyatt Chartered Accountants"
    licence = firm.get("moe_license_no") or firm.get("license_no") or "[firm licence no.]"
    auditor = firm.get("moe_auditor_license_no") or "[auditor licence no.]"
    fee = eng.get("fee_amount") or client.get("fee_amount")
    milestones = eng.get("milestones") or []
    p = payload or {}

    sections = [
        {"title": "Addressee", "body": f"To the Board of Directors / Owners of {client.get('name') or '[client]'}"},
        {"title": "Scope of the audit", "body": (
            f"We will audit the financial statements of {client.get('name') or '[client]'} for the period "
            f"{eng.get('terms', {}).get('audit_period') or client.get('financial_year_end') or '[period]'}, which comprise the statement of financial position as at that date, "
            "the statement of profit or loss and other comprehensive income, statement of changes in equity and statement of cash flows, "
            "and notes to the financial statements, including material accounting policy information. "
            "We will conduct the audit in accordance with International Standards on Auditing (ISAs) as adopted in the UAE, "
            "and the requirements of UAE Federal Decree-Law No. 41 of 2023 and applicable UAE law.")},
        {"title": "Responsibilities of the auditor", "body": (
            "We will exercise professional judgment and maintain professional scepticism, obtain reasonable assurance about whether the financial "
            "statements are free from material misstatement whether due to fraud or error, and communicate with those charged with governance. "
            "An audit does not provide legal advice or guarantee the future viability of the entity.")},
        {"title": "Responsibilities of management", "body": (
            "Management is responsible for the preparation and fair presentation of the financial statements in accordance with International Financial "
            "Reporting Standards (IFRS) as issued by the IASB and applicable UAE law, for the design and maintenance of internal control, for providing us with "
            "unrestricted access to all records and information, and for the accuracy and completeness of the information provided. "
            "Management will provide us with written representations, including a representation letter at the conclusion of the audit.")},
        {"title": "Compliance and reporting obligations", "body": (
            "Audit reports will bear the auditor's and the firm's licence numbers as required by the UAE Auditors Law. "
            "Where we become aware of fraud or suspected money laundering, we are required to report to the UAE Ministry of Economy and the competent authorities. "
            "Where required, audited financial statements will be filed with the relevant authorities on your instruction and in your name.")},
        {"title": "Fees", "body": (
            (f"Our fee is AED {fee:,.0f}" + (", payable " + " and ".join(f"{m['label']} {m['percent']}% (AED {m['amount']:,.0f})" for m in milestones) if milestones else ", payable as invoiced")
             + ". Fees are exclusive of VAT where applicable.") if fee else "Fees: to be agreed and recorded in the engagement record.")},
        {"title": "Confidentiality, retention and limitation", "body": (
            "Your records and information are held in strict confidence and protected per UAE data-protection requirements. "
            "Engagement documents are retained for ten years from report issuance as required by the UAE Auditors Law. "
            "This letter, together with the terms stated, constitutes the entire understanding of our engagement.")},
        {"title": "Acceptance", "body": (
            "Please sign and return a copy of this letter to confirm that the arrangements reflect your understanding of the audit engagement. "
            f"Yours faithfully — {firm_name}, {p.get('signatory') or user.get('name')}, Licence No. {auditor} (Firm licence {licence}).")},
    ]
    return {"client_name": client.get("name"), "letter_ref": f"EL-{engagement_id[-8:]}",
            "sections": sections, "generated_at": datetime.now(timezone.utc).isoformat()}


# ---------------- ISA 700 independent auditor's report builder ----------------

OPINIONS = {
    "unmodified": "In our opinion, the accompanying financial statements present fairly, in all material respects, the financial position of the Company as at {fye}, and its financial performance and its cash flows for the period then ended, in accordance with International Financial Reporting Standards (IFRS) as issued by the International Accounting Standards Board and applicable UAE Federal law.",
    "qualified": "Except for the possible effects of the matters described in the Basis for Qualified Opinion section, in our opinion the accompanying financial statements present fairly, in all material respects, the financial position of the Company as at {fye}, and its financial performance and its cash flows for the period then ended, in accordance with IFRS as issued by the IASB and applicable UAE Federal law.",
    "adverse": "In our opinion, because of the significance of the matters described in the Basis for Adverse Opinion section, the accompanying financial statements do not present fairly the financial position of the Company as at {fye}, nor its financial performance and its cash flows for the period then ended, in accordance with IFRS as issued by the IASB.",
    "disclaimer": "Because of the significance of the matters described in the Basis for Disclaimer of Opinion section, we have not been able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion on the accompanying financial statements. Accordingly, we do not express an opinion on the financial statements.",
}


@router.post("/engagements/{engagement_id}/audit-report")
async def audit_report(engagement_id: str, payload: dict = Body(default=None),
                       authorization: str = Header(None), session_token: str = Cookie(None)):
    """Assemble an ISA 700 independent auditor's report with the MOE-required licence numbers."""
    user = await _authed(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    client = await db.clients.find_one({"client_id": eng.get("client_id")}, {"_id": 0}) or {}
    firm = await db.settings.find_one({"type": "firm_identity"}, {"_id": 0}) or {}
    firm_name = firm.get("firm_name") or "Nair & Nelliyatt Chartered Accountants"
    firm_lic = firm.get("moe_license_no") or firm.get("license_no") or "[firm licence no.]"
    auditor_name = (payload or {}).get("signatory") or user.get("name")
    auditor_lic = firm.get("moe_auditor_license_no") or "[auditor licence no.]"
    opinion_type = (payload or {}).get("opinion") or "unmodified"
    if opinion_type not in OPINIONS:
        raise HTTPException(422, f"opinion must be one of {list(OPINIONS)}")
    fye = str(client.get("financial_year_end") or "12-31")
    fye_label = f"31 December {date.today().year - 1}" if fye == "12-31" else fye
    basis = (payload or {}).get("basis") or ""
    kams = (payload or {}).get("key_audit_matters") or []
    report_date = (payload or {}).get("report_date") or date.today().isoformat()

    sections = [
        {"title": "Opinion", "body": OPINIONS[opinion_type].format(fye=fye_label), "items": []},
        {"title": "Basis for Opinion" + {"qualified": " for Qualified Opinion", "adverse": " for Adverse Opinion", "disclaimer": " for Disclaimer of Opinion"}.get(opinion_type, ""), "body": basis or "We conducted our audit in accordance with International Standards on Auditing (ISAs) as adopted in the UAE. Our responsibilities under those standards are further described in the Auditor's Responsibilities for the Audit of the Financial Statements section of our report. We are independent of the Company in accordance with the ethical requirements relevant to our audit in the UAE, and we have fulfilled our other ethical responsibilities in accordance with those requirements. We believe that the audit evidence we have obtained is sufficient and appropriate to provide a basis for our opinion.", "items": []},
        {"title": "Key Audit Matters", "body": "" if kams else "No key audit matters arose from our audit that required communication in the auditor's report.",
         "items": [str(k) for k in kams]},
        {"title": "Other Information", "body": "Management is responsible for the other information. Our opinion does not cover the other information, and we do not express any form of assurance conclusion thereon. In connection with our audit, our responsibility is to read the other information and consider whether it is materially inconsistent with the financial statements or our knowledge obtained in the audit.", "items": []},
        {"title": "Responsibilities of Management and Those Charged with Governance", "body": "Management is responsible for the preparation and fair presentation of the financial statements in accordance with IFRS and applicable UAE law, and for such internal control as management determines is necessary to enable the preparation of financial statements that are free from material misstatement, whether due to fraud or error.", "items": []},
        {"title": "Auditor's Responsibilities for the Audit of the Financial Statements", "body": "Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor's report that includes our opinion. Reasonable assurance is a high level of assurance but does not guarantee that an audit conducted in accordance with ISAs will always detect a material misstatement when it exists.", "items": []},
        {"title": "Signature", "body": f"For and on behalf of {firm_name} — {auditor_name}, Auditor's Licence No. {auditor_lic}. Firm Licence No. {firm_lic}. Report dated {report_date}.", "items": []},
    ]
    doc = {"engagement_id": engagement_id, "client_name": client.get("name"), "opinion": opinion_type,
           "sections": sections, "report_date": report_date, "firm_name": firm_name,
           "generated_by": user.get("name"), "generated_at": datetime.now(timezone.utc).isoformat()}
    # persist as the engagement's report workpaper (latest wins)
    await db.audit_workpapers.update_many({"engagement_id": engagement_id, "kind": "report"}, {"$set": {"is_deleted": True}})
    await db.audit_workpapers.insert_one({"workpaper_id": f"wp_{uuid.uuid4().hex[:12]}", "engagement_id": engagement_id,
                                          "kind": "report", "data": doc, "isa_ref": ISA_REFS["report"],
                                          "created_by": user.get("name"), "created_at": doc["generated_at"], "is_deleted": False})
    return doc


@router.get("/engagements/{engagement_id}/group-audit-components")
async def group_components(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _authed(authorization, session_token)
    rows = await db.audit_workpapers.find({"engagement_id": engagement_id, "kind": "group", "is_deleted": {"$ne": True}},
                                          {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"components": rows}
