"""IFRS Stage D — notes to the financial statements + disclosure checklist.

- Disclosure checklist: the standard IFRS for SMEs note set, auto-created per
  engagement, with applicability and completion tracking.
- Notes builder: each note can be AI pre-drafted (Gemini, using the engagement's
  actual figures + the firm's policy library) with a deterministic template
  fallback so the flow never breaks when AI isn't configured. Staff edit,
  partners clear.
- Policy library: firm-wide accounting-policy texts, injected into pre-drafts.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event
from routes.statements import _build_statements, _safe, _amt
from routes.trial_balance import _staff_only

router = APIRouter(prefix="/api")

DISCLOSURE_TEMPLATE = [
    ("basis", "Note 1 — Basis of preparation and going concern", True),
    ("revenue", "Note 2 — Revenue from services", True),
    ("staff_costs", "Note 3 — Staff costs and end-of-service", True),
    ("ppe", "Note 4 — Property, plant and equipment", True),
    ("receivables", "Note 5 — Trade and other receivables", True),
    ("cash", "Note 6 — Cash and bank balances", True),
    ("payables", "Note 7 — Trade and other payables", True),
    ("tax", "Note 8 — Taxation (VAT and corporate tax)", True),
    ("related", "Note 9 — Related parties and key management", True),
    ("capital", "Note 10 — Share capital and reserves", True),
    ("provisions", "Note 11 — Provisions and commitments", False),
    ("financial_risk", "Note 12 — Financial risk and liquidity", True),
    ("events_after", "Note 13 — Events after the reporting period", True),
]

NOTE_TITLES = {k: t for k, t, _ in DISCLOSURE_TEMPLATE}


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _ensure_notes(engagement_id):
    """Create the checklist + the note shells on first access."""
    if not await db.disclosure_checklists.find_one({"engagement_id": engagement_id}):
        await db.disclosure_checklists.insert_one({
            "engagement_id": engagement_id,
            "items": [{"key": k, "title": t, "applies": a, "done": False} for k, t, a in DISCLOSURE_TEMPLATE],
            "created_at": _now(), "source": "template"})
    if await db.statement_notes.count_documents({"engagement_id": engagement_id}) == 0:
        now = _now()
        await db.statement_notes.insert_many([
            {"note_id": f"note_{uuid.uuid4().hex[:12]}", "engagement_id": engagement_id,
             "key": k, "title": t, "body": "", "status": "Shell",
             "author": None, "cleared_by": None, "cleared_at": None, "created_at": now}
            for k, t in NOTE_TITLES.items()])


async def _eng(engagement_id):
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    return eng


@router.get("/disclosure/{engagement_id}")
async def get_disclosure(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    await _eng(engagement_id)
    await _ensure_notes(engagement_id)
    doc = await db.disclosure_checklists.find_one({"engagement_id": engagement_id}, {"_id": 0})
    items = doc["items"]
    relevant = [i for i in items if i.get("applies")]
    return {"items": items, "relevant": len(relevant),
            "done": sum(1 for i in relevant if i.get("done")),
            "progress": round(100 * sum(1 for i in relevant if i.get("done")) / max(len(relevant), 1))}


@router.patch("/disclosure/{engagement_id}")
async def patch_disclosure(engagement_id: str, body: Optional[dict] = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    key = body.get("key") or ""
    await _ensure_notes(engagement_id)
    doc = await db.disclosure_checklists.find_one({"engagement_id": engagement_id})
    item = next((i for i in doc["items"] if i["key"] == key), None)
    if not item:
        raise HTTPException(404, "Unknown disclosure item")
    if "applies" in body:
        item["applies"] = bool(body["applies"])
        if not item["applies"]:
            item["done"] = False
    if "done" in body and item.get("applies"):
        item["done"] = bool(body["done"])
    await db.disclosure_checklists.update_one(
        {"engagement_id": engagement_id},
        {"$set": {"items": doc["items"], "updated_by": user.get("name") or "User", "updated_at": _now()}})
    await journal_event(engagement_id, "disclosure_updated",
                        f"Disclosure checklist: '{item['title']}' — applies: {item['applies']}, complete: {item['done']}",
                        by_name=user.get("name") or "User")
    return {"ok": True, "item": item}


async def _note_context(engagement_id):
    """Figures + framework for drafting."""
    data = await _build_statements(engagement_id)
    if not data:
        return None
    isd, bsd = data["income_statement"], data["balance_sheet"]
    fig = {l[0]: l[1] for l in (isd["income"] + isd["expenses"] + bsd["assets"] + bsd["liabilities"] + bsd["equity"])}
    return {
        "client": data["client_name"], "framework": data["framework"], "period": data["period"],
        "revenue": fig.get("Revenue", 0.0), "other_income": fig.get("Other income", 0.0),
        "staff_costs": fig.get("Staff costs", 0.0), "operating_expenses": fig.get("Operating expenses", 0.0),
        "depreciation": fig.get("Depreciation and amortisation", 0.0), "finance_costs": fig.get("Finance costs", 0.0),
        "net_profit": isd["net_profit"], "cash": fig.get("Cash and bank balances", 0.0),
        "receivables": fig.get("Trade receivables", 0.0), "ppe": fig.get("Property, plant and equipment", 0.0),
        "payables": fig.get("Trade payables", 0.0), "share_capital": fig.get("Share capital", 0.0),
        "posted_ajes": data["posted_ajes"], "total_adjustments": data["total_adjustments"],
    }


_TEMPLATE_BODIES = {
    "basis": lambda c: (f"These financial statements of {c['client']} have been prepared in accordance with "
                        f"{c['framework']} and the requirements of UAE Federal Decree-Law No. 47 of 2022 (as amended). "
                        f"They cover the period {c['period']} and are stated in United Arab Emirates Dirhams (AED), "
                        f"the functional currency of the entity. The financial statements incorporate the adjusted trial "
                        f"balance, including {c['posted_ajes']} adjusting entries (AED {c['total_adjustments']:,.2f}) approved "
                        f"during the engagement. The entity anticipates continuing to operate for the foreseeable future."),
    "revenue": lambda c: (f"Revenue comprises service income recognised as the services are performed. Revenue for the "
                          f"period amounts to AED {c['revenue']:,.2f} "
                          f"(other income AED {c['other_income']:,.2f}). All revenue for the period was earned within the UAE."),
    "staff_costs": lambda c: (f"Staff costs for the period amount to AED {c['staff_costs']:,.2f}, comprising salaries and "
                              f"wages, visa and medical costs, and the movement in the end-of-service benefit obligation "
                              f"measured under IAS 19 as adopted by {c['framework']}."),
    "ppe": lambda c: (f"Property, plant and equipment is stated at cost less accumulated depreciation. Depreciation is "
                      f"charged so as to write off the cost of assets over their estimated useful lives on a straight-line "
                      f"basis. Net carrying amount at period end: AED {c['ppe']:,.2f}; depreciation charge for the period: "
                      f"AED {c['depreciation']:,.2f}."),
    "receivables": lambda c: (f"Trade and other receivables of AED {c['receivables']:,.2f} are stated net of expected credit "
                              f"losses assessed on a lifetime basis. All receivables are due within normal credit terms."),
    "cash": lambda c: (f"Cash and bank balances of AED {c['cash']:,.2f} comprise balances held with UAE banks and petty cash "
                       f"at period end."),
    "payables": lambda c: (f"Trade and other payables of AED {c['payables']:,.2f} are stated at amounts owed to suppliers and "
                           f"accrued expenses, all falling due within one year."),
    "tax": lambda c: (f"The entity is registered for VAT and files returns on the statutory due dates. Corporate tax is "
                      f"computed under UAE Federal Decree-Law No. 47 of 2022 at 9% on taxable income exceeding AED 375,000. "
                      f"VAT and taxes payable at period end: AED {c.get('payables', 0):,.2f} (see note 7 for composition)."),
    "related": lambda c: (f"The entity transactions with related parties in the ordinary course of business on terms "
                          f"equivalent to arm's length. Key management compensation and balances with related parties "
                          f"are disclosed on the accompanying register maintained by the entity."),
    "capital": lambda c: (f"Share capital of AED {c['share_capital']:,.2f} comprises fully paid shares held by the shareholders "
                          f"of record at period end. Movements in reserves are set out in the statement of changes in equity."),
    "provisions": lambda c: ("Provisions are recognised when the entity has a present obligation as a result of a past event, "
                             "it is probable that an outflow will be required, and the amount can be reliably estimated. "
                             "There were no material provisions or contingent commitments requiring separate disclosure."),
    "financial_risk": lambda c: ("The entity's financial risk management objective is to manage market, credit and liquidity "
                                 "risk. Liquidity risk is monitored through rolling cash-flow projections; credit risk is "
                                 "limited to trade receivables assessed for expected credit losses; market risk is limited to "
                                 "bank deposit interest movements."),
    "events_after": lambda c: ("Management has evaluated events and transactions after the reporting date up to the date these "
                               "financial statements were authorised for issue and identified no material adjusting events."),
}


async def _gemini_draft(note_key, note_title, ctx, policy_text):
    """AI pre-draft with the engagement's real figures. Raises on any failure —
    callers fall back to the deterministic template."""
    import asyncio as _asyncio
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = (
        f"You are preparing the notes to financial statements for {ctx['client']} "
        f"(period {ctx['period']}) under {ctx['framework']}. "
        f"Write ONLY the note titled '{note_title}' — 1 to 3 short paragraphs, formal review-ready language, "
        f"AED amounts with thousands separators, no headings, no bullet points, no preamble.\n"
        f"Key figures: revenue {ctx['revenue']}, other income {ctx['other_income']}, staff costs {ctx['staff_costs']}, "
        f"depreciation {ctx['depreciation']}, finance costs {ctx['finance_costs']}, net profit {ctx['net_profit']}, "
        f"cash {ctx['cash']}, receivables {ctx['receivables']}, PPE {ctx['ppe']}, payables {ctx['payables']}, "
        f"share capital {ctx['share_capital']}.\n"
        + (f"Use this firm policy wording as the basis:\n{policy_text}\n" if policy_text else ""))

    def _sync():
        return model.generate_content(prompt).text

    text = await _asyncio.to_thread(_sync)
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text).rsplit("```", 1)[0].strip()
    return text


@router.post("/statements/{engagement_id}/notes/{note_id}/predraft")
async def predraft_note(engagement_id: str, note_id: str,
                        authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    await _eng(engagement_id)
    note = await db.statement_notes.find_one({"engagement_id": engagement_id, "note_id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(404, "Note not found")
    if note.get("status") == "Cleared":
        raise HTTPException(422, "This note is cleared by the partner — reopen it before re-drafting")

    ctx = await _note_context(engagement_id)
    if not ctx:
        raise HTTPException(422, "Build the statements first (import the books/trial balance)")
    policy = await db.policy_library.find_one({"key": note["key"]}, {"_id": 0}) or {}

    drafted_by, body = "Template", ""
    try:
        body = await _gemini_draft(note["key"], note["title"], ctx, policy.get("text") or "")
        drafted_by = "AI pre-draft"
    except RuntimeError:
        body = _TEMPLATE_BODIES.get(note["key"], lambda c: "")(ctx)
        if not body:
            raise HTTPException(422, "No template available for this note — write it manually")
    except HTTPException:
        raise
    except Exception:
        body = _TEMPLATE_BODIES.get(note["key"], lambda c: "")(ctx)
        drafted_by = "Template (AI unavailable)"

    if note.get("status") == "Cleared":
        raise HTTPException(422, "Note is cleared — reopen first")
    await db.statement_notes.update_one(
        {"engagement_id": engagement_id, "note_id": note_id},
        {"$set": {"body": body, "status": "Pre-drafted", "drafted_by": drafted_by,
                  "author": user.get("name") or "User", "updated_at": _now()}})
    await journal_event(engagement_id, "note_predrafted",
                        f"Note '{note['title']}' pre-drafted ({drafted_by})",
                        by_name=user.get("name") or "User")
    return {"ok": True, "body": body, "drafted_by": drafted_by}


@router.patch("/statements/{engagement_id}/notes/{note_id}")
async def edit_note(engagement_id: str, note_id: str, body: Optional[dict] = None,
                    authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    note = await db.statement_notes.find_one({"engagement_id": engagement_id, "note_id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(404, "Note not found")
    update = {"author": user.get("name") or "User", "updated_at": _now()}
    if "body" in body:
        if note.get("status") == "Cleared":
            raise HTTPException(422, "Cleared note — reopen before editing")
        update["body"] = str(body["body"] or "")[:8000]
        update["status"] = "Draft" if body["body"] else "Shell"
    await db.statement_notes.update_one({"engagement_id": engagement_id, "note_id": note_id}, {"$set": update})
    return {"ok": True}


@router.post("/statements/{engagement_id}/notes/{note_id}/clear")
async def clear_note(engagement_id: str, note_id: str, body: Optional[dict] = None,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    if user.get("role") != "partner":
        raise HTTPException(403, "Partner role required to clear notes")
    body = body or {}
    note = await db.statement_notes.find_one({"engagement_id": engagement_id, "note_id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(404, "Note not found")
    cleared = note.get("status") != "Cleared"
    await db.statement_notes.update_one(
        {"engagement_id": engagement_id, "note_id": note_id},
        {"$set": {"status": "Cleared" if cleared else "Draft",
                  "cleared_by": user.get("name") if cleared else None,
                  "cleared_at": _now() if cleared else None}})
    await journal_event(engagement_id, "note_reviewed",
                        f"Note '{note['title']}' {'cleared by partner' if cleared else 'reopened for review'} — {user.get('name')}",
                        by_name=user.get("name") or "User")
    return {"ok": True, "status": "Cleared" if cleared else "Draft"}


@router.get("/statements/{engagement_id}/notes")
async def get_notes(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    await _eng(engagement_id)
    await _ensure_notes(engagement_id)
    notes = []
    async for n in db.statement_notes.find({"engagement_id": engagement_id}, {"_id": 0}).sort("created_at", 1):
        notes.append(n)
    disc = await db.disclosure_checklists.find_one({"engagement_id": engagement_id}, {"_id": 0})
    policies = {p["key"]: p["text"] async for p in db.policy_library.find({}, {"_id": 0, "key": 1, "text": 1})}
    return {"notes": notes, "checklist": (disc or {}).get("items", []),
            "progress": round(100 * sum(1 for i in (disc or {}).get("items", []) if i.get("applies") and i.get("done"))
                              / max(len([i for i in (disc or {}).get("items", []) if i.get("applies")]), 1)),
            "policies": policies}


# ---------- Firm policy library ----------

@router.get("/policy-library")
async def get_policy_library(authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    return {"policies": [{k: p[k] for k in ("key", "title", "text", "updated_by", "updated_at") if k in p}
                         async for p in db.policy_library.find({}, {"_id": 0}).sort("key", 1)]}


@router.put("/policy-library/{key}")
async def put_policy(key: str, body: Optional[dict] = None,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(422, "Policy text is required")
    if len(text) > 8000:
        raise HTTPException(422, "Policy text too long (max 8000 characters)")
    title = NOTE_TITLES.get(key, body.get("title") or key.replace("_", " ").title())
    await db.policy_library.update_one(
        {"key": key},
        {"$set": {"key": key, "title": title, "text": text,
                  "updated_by": user.get("name") or "User", "updated_at": _now()}},
        upsert=True)
    return {"ok": True, "key": key, "title": title}
