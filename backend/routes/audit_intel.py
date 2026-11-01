"""Audit intelligence: materiality engine, journal-entry testing pack, corporate
tax computation (UAE 9%) and an AI risk memo — all computed from the adjusted
trial balance and the ingested books, so one engagement answers every question.

Changed-after-export detection: the deliverable pack stamps the engagement with
last_pack_exported_at; any later TB/AJE/ledger change makes the pack stale.
"""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event
from routes.statements import _build_statements, _build_cashflow
from routes.trial_balance import _staff_only

router = APIRouter(prefix="/api")

CT_RATE = 0.09
CT_THRESHOLD = 375000.0  # 0% band below AED 375,000 of taxable income
SMALL_BUSINESS_RELIEF = 3_000_000.0  # revenue under AED 3m can elect 0% (through 2026)

# Materiality benchmarks (IFRS for SMEs practice norms): benchmark -> % of the base
MATERIALITY_NORMS = {
    "Revenue": 0.005,
    "Net profit": 0.05,
    "Total assets": 0.01,
    "Gross expenses": 0.01,
}
CLEARLY_TRIVIAL = 0.05  # of materiality


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _staff(user):
    return await _staff_only(user)


def _pct(n):
    return f"{n * 100:g}%"


# ---------- Materiality ----------

@router.get("/audit/{engagement_id}/materiality")
async def get_materiality(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        return {"available": False, "reason": "Import the books or trial balance first"}
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0}) or {}
    override = eng.get("materiality_basis") or {}

    isd = data["income_statement"]
    bsd = data["balance_sheet"]
    gross_expenses = round(sum(a for _, a, _ in isd["expenses"]), 2)
    benchmarks = {
        "Revenue": isd["total_income"],
        "Net profit": isd["net_profit"],
        "Total assets": bsd["total_assets"],
        "Gross expenses": gross_expenses,
    }
    basis = override.get("benchmark") or _default_benchmark(benchmarks)
    pct_override = override.get("pct")
    pct_used = MATERIALITY_NORMS[basis] if basis in MATERIALITY_NORMS else 0.005
    if isinstance(pct_override, (int, float)) and 0 < pct_override < 1:
        pct_used = pct_override
    materiality = round(benchmarks[basis] * pct_used, 2)
    return {
        "available": True,
        "benchmarks": benchmarks,
        "basis": basis,
        "pct": pct_used,
        "norm": MATERIALITY_NORMS.get(basis),
        "materiality": materiality,
        "performance": round(materiality * 0.75, 2),
        "clearly_trivial": round(materiality * CLEARLY_TRIVIAL, 2),
        "lock": override.get("locked_at"),
    }


def _default_benchmark(benchmarks):
    """Practice default: revenue when positive; else total assets."""
    if benchmarks.get("Revenue", 0) > 0:
        return "Revenue"
    return "Total assets"


@router.patch("/audit/{engagement_id}/materiality")
async def set_materiality(engagement_id: str, body: Optional[dict] = None,
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    basis = body.get("benchmark")
    if basis and basis not in MATERIALITY_NORMS:
        raise HTTPException(422, f"Benchmark must be one of: {', '.join(MATERIALITY_NORMS)}")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    update = {"materiality_basis": {
        **(eng.get("materiality_basis") or {}),
        **({"benchmark": basis} if basis else {}),
        **({"pct": float(body["pct"])} if body.get("pct") is not None else {}),
        "locked_at": _now(), "locked_by": user.get("name") or "User",
    }}
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": update})
    await journal_event(engagement_id, "materiality_set",
                        f"Materiality basis set to {basis or 'default'} — recomputed on next view",
                        by_name=user.get("name") or "User")
    return {"ok": True, **update}


# ---------- Journal-entry testing pack ----------

JE_TESTS = [
    ("round_amounts", "Round-amount entries", "whole 100s/1000s may indicate estimates or manipulated figures"),
    ("weekend_postings", "Weekend / holiday postings", "entries posted on Fridays (UAE weekend) or Saturdays deserve explanation"),
    ("late_night", "Unusual period-end clustering", "vouchers dated on the first or last day of a month"),
    ("duplicate_pairs", "Duplicate payment pairs", "same vendor, date and amount posted twice"),
    ("large_singles", "Large single entries", "materiality-scaled: any single voucher above the materiality threshold"),
]


@router.get("/audit/{engagement_id}/je-tests")
async def je_tests(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    mat = await get_materiality(engagement_id, authorization, session_token)
    materiality = mat.get("materiality", 0.0) if mat.get("available") else 0.0

    entries = await db.ledger_entries.find({"engagement_id": engagement_id}, {"_id": 0}).to_list(20000)
    if not entries:
        return {"available": False, "reason": "Ingest the client's books (general ledger) first — the tests run on the ledger, not the summary"}

    vouchers = {}
    for e in entries:
        key = (e.get("voucher_no"), e.get("date"))
        vouchers.setdefault(key, []).append(e)

    flagged = {t[0]: [] for t in JE_TESTS}
    for (vno, date), legs in vouchers.items():
        amount = round(sum(l.get("debit", 0) for l in legs), 2) or round(sum(l.get("credit", 0) for l in legs), 2)
        description = next((l.get("narration") or l.get("account") for l in legs if l.get("narration")), legs[0].get("account", ""))
        entry_info = {"voucher_no": vno or "—", "date": date, "amount": amount, "description": (description or "")[:120]}

        if amount and amount % 100 == 0:
            flagged["round_amounts"].append({**entry_info, "note": f"exact multiple of 100 (AED {amount:,.0f})"})

        if date:
            try:
                d = datetime.fromisoformat(date).date()
                if d.weekday() in (4, 5):  # Fri/Sat — UAE weekend
                    flagged["weekend_postings"].append({**entry_info, "note": f"posted on {d.strftime('%A')}"})
                if d.day in (1, 28, 29, 30, 31):
                    flagged["late_night"].append({**entry_info, "note": f"period-edge date ({d.strftime('%d %b')})"})
            except ValueError:
                pass

        if materiality and amount >= materiality:
            flagged["large_singles"].append({**entry_info, "note": f"exceeds materiality (AED {materiality:,.2f})"})

    seen_pairs = {}
    for (vno, date), legs in vouchers.items():
        vendor = next((l.get("account") for l in legs if "payab" in l.get("account", "").lower()
                       or "creditor" in l.get("account", "").lower()), None)
        amount = round(sum(l.get("credit", 0) for l in legs), 2)
        if vendor and amount:
            key = (vendor, date, amount)
            if key in seen_pairs:
                flagged["duplicate_pairs"].append({
                    "voucher_no": vno or "—", "date": date, "amount": amount,
                    "description": f"{vendor} — same vendor/date/amount as voucher {seen_pairs[key]}"})
            else:
                seen_pairs[key] = vno or "?"

    results = []
    for key, title, why in JE_TESTS:
        hits = flagged[key]
        results.append({"test": key, "title": title, "why": why, "hits": len(hits),
                        "sample": hits[:8], "severity": "high" if len(hits) > 10 else ("medium" if hits else "clean")})

    return {"available": True, "entries_tested": len(entries), "vouchers_tested": len(vouchers),
            "materiality": materiality, "results": results,
            "total_flags": sum(r["hits"] for r in results)}


# ---------- Corporate tax (UAE 9%) ----------

@router.get("/audit/{engagement_id}/corporate-tax")
async def corporate_tax(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        return {"available": False, "reason": "Import the books or trial balance first"}

    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0}) or {}
    adj = eng.get("ct_adjustments") or {}
    isd = data["income_statement"]
    accounting_income = isd["net_profit"]

    # Tax adjustments (partner-editable; common UAE CT add-backs)
    defaults = [
        ("non_deductible_fines", "Fines and penalties (not deductible)", 0.0),
        ("entertainment_excess", "Entertainment above allowable limit", 0.0),
        ("non_business_expenses", "Non-business / personal expenses", 0.0),
        ("exempt_income", "Exempt income (deduct)", 0.0),
    ]
    adjustments = []
    for key, label, default in defaults:
        val = round(float(adj.get(key, default) or 0.0), 2)
        adjustments.append({"key": key, "label": label, "amount": val})

    add_backs = sum(a["amount"] for a in adjustments if a["amount"] > 0)
    deducts = sum(-a["amount"] for a in adjustments if a["amount"] < 0)
    taxable_before_relief = round(accounting_income + add_backs - deducts, 2)

    small_business = eng.get("small_business_election", data.get("revenue_total", 0) is not None and False)
    revenue = data["income_statement"]["total_income"]
    sb_eligible = revenue <= SMALL_BUSINESS_RELIEF
    relief_applied = bool(eng.get("small_business_election")) and sb_eligible

    if relief_applied:
        taxable = 0.0
        tax = 0.0
    else:
        taxable_band = max(taxable_before_relief - CT_THRESHOLD, 0.0)
        taxable = round(taxable_band, 2)
        tax = round(taxable * CT_RATE, 2)

    year_end = (data.get("period") or "").split(" to ")[-1] if data.get("period") else None
    filing_deadline = None
    if year_end:
        try:
            ye = datetime.fromisoformat(year_end).date()
            filing_deadline = (ye.replace(year=ye.year + 1, month=ye.month + 9 if ye.month + 9 <= 12 else ye.month - 3, day=ye.day) if ye.month <= 3 else ye.replace(year=ye.year + 2))if False else None
            # 9 months after period end
            m = ye.month + 9
            y = ye.year + (m - 1) // 12
            m = (m - 1) % 12 + 1
            d = min(ye.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
            filing_deadline = f"{y}-{m:02d}-{d:02d}"
        except ValueError:
            pass

    return {
        "available": True, "framework": data["framework"], "period": data["period"],
        "accounting_income": accounting_income, "adjustments": adjustments,
        "add_backs": round(add_backs, 2), "deducts": round(deducts, 2),
        "taxable_before_relief": taxable_before_relief,
        "small_business_election": bool(eng.get("small_business_election")),
        "small_business_eligible": sb_eligible, "relief_applied": relief_applied,
        "threshold": CT_THRESHOLD, "rate": CT_RATE,
        "taxable_income": taxable, "tax_payable": tax,
        "filing_deadline": filing_deadline,
    }


@router.patch("/audit/{engagement_id}/corporate-tax")
async def set_ct_adjustments(engagement_id: str, body: Optional[dict] = None,
                             authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    update = {}
    if "adjustments" in body:
        clean = {}
        allowed = ("non_deductible_fines", "entertainment_excess", "non_business_expenses", "exempt_income")
        for k in allowed:
            if k in body["adjustments"]:
                try:
                    clean[k] = round(float(body["adjustments"][k] or 0), 2)
                except (TypeError, ValueError):
                    clean[k] = 0.0
        update["ct_adjustments"] = clean
    if "small_business_election" in body:
        update["small_business_election"] = bool(body["small_business_election"])
    await db.service_engagements.update_one({"engagement_id": engagement_id}, {"$set": update})
    await journal_event(engagement_id, "ct_computation_updated",
                        "Corporate tax computation updated", by_name=user.get("name") or "User")
    return {"ok": True, **update}


# ---------- AI risk memo ----------

@router.get("/audit/{engagement_id}/risk-memo")
async def risk_memo(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        return {"available": False, "reason": "Import the books or trial balance first"}
    mat = await get_materiality(engagement_id, authorization, session_token)
    je = await je_tests(engagement_id, authorization, session_token)
    notes = []
    async for n in db.statement_notes.find({"engagement_id": engagement_id}, {"_id": 0, "status": 1, "title": 1}):
        notes.append(n)

    memo = await _generate_memo(data, mat, je, notes)
    return {"available": True, **memo}


async def _generate_memo(data, mat, je, notes):
    hot_tests = [r for r in je.get("results", []) if r.get("hits")]
    facts = (
        f"Client: {data['client_name']} ({data['framework']}, {data['period']}). "
        f"Revenue AED {data['income_statement']['total_income']:,.2f}, net profit AED {data['income_statement']['net_profit']:,.2f}, "
        f"total assets AED {data['balance_sheet']['total_assets']:,.2f}. "
        f"Materiality AED {mat.get('materiality', 0):,.2f} ({mat.get('basis')} @ {_pct(mat.get('pct', 0))}). "
        f"JE testing: {je.get('total_flags', 0)} flags across {len(hot_tests)} tests "
        f"({'; '.join(r['title'] + ': ' + str(r['hits']) for r in hot_tests) or 'none'}). "
        f"Notes: {sum(1 for n in notes if n['status'] == 'Cleared')} cleared, "
        f"{sum(1 for n in notes if n['status'] != 'Cleared')} outstanding.")

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            from services.llm import LlmChat, UserMessage
            chat = LlmChat(api_key=api_key, session_id=f"risk_{data['client_name']}",
                           system_message=("You are an audit partner drafting the Analytical Risk Memo. "
                                           "5-8 bullet points, each a risk or audit response, firm tone, no preamble. "
                                           "Reference the figures given. End with a materiality line."))
            response = await chat.send_message(UserMessage(text=facts))
            return {"memo": response.strip(), "generated_by": "AI", "facts": facts}
        except Exception:
            pass

    # Deterministic fallback memo
    lines = [f"• Engagement scope: statutory audit of {data['client_name']} for {data['period']} under {data['framework']}.",
             f"• Financial profile: revenue AED {data['income_statement']['total_income']:,.2f}; net profit AED {data['income_statement']['net_profit']:,.2f}; total assets AED {data['balance_sheet']['total_assets']:,.2f}."]
    for r in hot_tests:
        lines.append(f"• {r['title']}: {r['hits']} flagged — {r['why']}. Sample: " +
                     "; ".join(f"{s.get('voucher_no')} ({s.get('note', '')})" for s in r.get("sample", [])[:3]) + ".")
    if not hot_tests:
        lines.append("• Journal-entry testing raised no flags on the ingested books.")
    lines.append(f"• Working capital and cash-flow checks {'passed' if data['balance_check']['balanced'] else 'FAILED — investigate before sign-off'}.")
    lines.append(f"• Materiality: AED {mat.get('materiality', 0):,.2f} ({mat.get('basis')} @ {_pct(mat.get('pct', 0))}); "
                 f"performance AED {mat.get('performance', 0):,.2f}; clearly-trivial AED {mat.get('clearly_trivial', 0):,.2f}.")
    outstanding = sum(1 for n in notes if n["status"] != "Cleared")
    if outstanding:
        lines.append(f"• {outstanding} disclosure note(s) not yet cleared by the partner.")
    return {"memo": "\n".join(lines), "generated_by": "Template (AI unavailable)", "facts": facts}


# ---------- Changed-after-export detection ----------

@router.get("/audit/{engagement_id}/pack-staleness")
async def pack_staleness(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    eng = await db.service_engagements.find_one(
        {"engagement_id": engagement_id},
        {"_id": 0, "last_pack_exported_at": 1, "last_tb_changed_at": 1, "last_aje_changed_at": 1})
    if eng is None:
        raise HTTPException(404, "Engagement not found")
    exported = eng.get("last_pack_exported_at")
    if not exported:
        return {"available": True, "stale": None, "detail": "No deliverable pack exported yet"}

    changes = []
    for field, label in (("last_tb_changed_at", "trial balance / books"), ("last_aje_changed_at", "adjustments register")):
        changed = eng.get(field)
        if changed and changed > exported:
            changes.append(f"{label} changed {changed[:16].replace('T', ' ')}")
    return {"available": True, "stale": bool(changes), "changes": changes,
            "exported_at": exported}
