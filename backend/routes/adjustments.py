"""Adjusting journal entries (AJEs) for audit engagements.

Caseware-style adjustments register: auditors propose corrections to the
client's trial balance (accruals, depreciation, provisions, reclassifications);
each AJE is one debit + one equal credit against TB accounts, sign-off-able by
the partner. Posted AJEs net into the final statement-line figures
(GET /tb/{eid}/final), which later feed the IFRS statement builder.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event
from routes.trial_balance import LINE_NAMES, _norm_key, _load_tb, _staff_only

router = APIRouter(prefix="/api")


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _eng(engagement_id):
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    return eng


async def _tb_accounts(engagement_id):
    tb = await _load_tb(engagement_id)
    if not tb or not tb.get("rows"):
        return None
    return {r["account"]: r.get("mapping") for r in tb["rows"]}


async def _line_of(account, tb_accounts):
    """Statement line for a TB account name (falls back to memory)."""
    if tb_accounts and account in tb_accounts:
        return tb_accounts[account]
    mem = await db.tb_mapping_memory.find_one({"key": _norm_key(account)})
    return mem.get("mapping") if mem else None


# ---------- CRUD ----------

@router.get("/service/engagements/{engagement_id}/ajes")
async def list_ajes(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    items = await db.engagement_ajes.find(
        {"engagement_id": engagement_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    proposed = [a for a in items if a.get("status") == "Proposed"]
    posted = [a for a in items if a.get("status") == "Posted"]
    return {
        "ajes": items,
        "counts": {
            "proposed": len(proposed), "proposed_value": sum(a["amount"] for a in proposed),
            "posted": len(posted), "posted_value": sum(a["amount"] for a in posted),
        },
    }


@router.post("/service/engagements/{engagement_id}/ajes")
async def create_aje(engagement_id: str, body: Optional[dict] = None,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    eng = await _eng(engagement_id)
    description = str(body.get("description") or "").strip()
    amount = body.get("amount")
    debit_account = str(body.get("debit_account") or "").strip()
    credit_account = str(body.get("credit_account") or "").strip()
    if not description:
        raise HTTPException(422, "Description is required")
    try:
        amount = round(float(amount if amount is not None else 0), 2)
    except (TypeError, ValueError):
        raise HTTPException(422, "Amount must be a number")
    if amount <= 0:
        raise HTTPException(422, "Amount must be positive")
    if not debit_account or not credit_account:
        raise HTTPException(422, "Choose both the debit and credit account")
    if debit_account == credit_account:
        raise HTTPException(422, "Debit and credit accounts must differ")

    tb_accounts = await _tb_accounts(engagement_id)
    if tb_accounts is None:
        raise HTTPException(422, "Import the trial balance first — adjustments are booked against its accounts")
    for acct in (debit_account, credit_account):
        if acct not in tb_accounts:
            raise HTTPException(422, f"'{acct}' is not in the imported trial balance")

    seq = await db.engagement_ajes.count_documents({"engagement_id": engagement_id}) + 1
    aje = {
        "aje_id": f"aje_{uuid.uuid4().hex[:12]}",
        "engagement_id": engagement_id,
        "client_id": eng.get("client_id"),
        "client_name": eng.get("client_name"),
        "ref": f"AJE-{seq:03d}",
        "description": description[:2000],
        "amount": amount,
        "debit_account": debit_account,
        "credit_account": credit_account,
        "debit_line": await _line_of(debit_account, tb_accounts),
        "credit_line": await _line_of(credit_account, tb_accounts),
        "status": "Proposed",
        "raised_by": user.get("name") or user.get("email"),
        "signed_off_by": None, "signed_off_at": None,
        "source": body.get("source") or "auditor",
        "created_at": _now(),
    }
    await db.engagement_ajes.insert_one(aje)
    aje.pop("_id", None)
    await journal_event(engagement_id, "aje_proposed",
                        f"{aje['ref']} proposed: {description[:150]} — Dr {debit_account} / Cr {credit_account} AED {amount:,.2f}",
                        by_name=user.get("name") or "User",
                        client_id=eng.get("client_id") or "", client_name=eng.get("client_name") or "")
    return aje


@router.patch("/ajes/{aje_id}")
async def update_aje(aje_id: str, body: Optional[dict] = None,
                     authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    aje = await db.engagement_ajes.find_one({"aje_id": aje_id})
    if not aje:
        raise HTTPException(404, "AJE not found")
    if aje.get("status") == "Posted":
        raise HTTPException(422, "Posted AJEs are locked — unsign-off first (partner)")
    updates = {}
    if body.get("description") is not None:
        d = str(body["description"]).strip()
        if not d:
            raise HTTPException(422, "Description cannot be empty")
        updates["description"] = d[:2000]
    if body.get("amount") is not None:
        try:
            amt = round(float(body["amount"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(422, "Amount must be a number")
        if amt <= 0:
            raise HTTPException(422, "Amount must be positive")
        updates["amount"] = amt
    if body.get("debit_account") or body.get("credit_account"):
        tb_accounts = await _tb_accounts(aje["engagement_id"])
        if tb_accounts is None:
            raise HTTPException(422, "Trial balance not imported")
        debit = str(body.get("debit_account") or aje["debit_account"])
        credit = str(body.get("credit_account") or aje["credit_account"])
        for acct in (debit, credit):
            if acct not in tb_accounts:
                raise HTTPException(422, f"'{acct}' is not in the imported trial balance")
        if debit == credit:
            raise HTTPException(422, "Debit and credit accounts must differ")
        updates["debit_account"], updates["credit_account"] = debit, credit
        updates["debit_line"] = await _line_of(debit, tb_accounts)
        updates["credit_line"] = await _line_of(credit, tb_accounts)
    if not updates:
        raise HTTPException(422, "Nothing to update")
    updates["updated_by"] = user.get("name") or user.get("email")
    await db.engagement_ajes.update_one({"aje_id": aje_id}, {"$set": updates})
    await journal_event(aje["engagement_id"], "aje_updated",
                        f"{aje['ref']} updated: {', '.join(k for k in updates if k not in ('updated_by',))}",
                        by_name=user.get("name") or "User")
    doc = await db.engagement_ajes.find_one({"aje_id": aje_id}, {"_id": 0})
    return doc


@router.post("/ajes/{aje_id}/signoff")
async def signoff_aje(aje_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    if user.get("role") != "partner":
        raise HTTPException(403, "Only the partner can sign off adjustments")
    aje = await db.engagement_ajes.find_one({"aje_id": aje_id})
    if not aje:
        raise HTTPException(404, "AJE not found")
    if aje.get("status") == "Posted":
        raise HTTPException(422, "Already signed off")
    await db.engagement_ajes.update_one(
        {"aje_id": aje_id},
        {"$set": {"status": "Posted", "signed_off_by": user.get("name"), "signed_off_at": _now()}})
    await journal_event(aje["engagement_id"], "aje_signed",
                        f"{aje['ref']} signed off by partner — Dr {aje['debit_account']} / Cr {aje['credit_account']} AED {aje['amount']:,.2f}",
                        by_name=user.get("name") or "User")
    doc = await db.engagement_ajes.find_one({"aje_id": aje_id}, {"_id": 0})
    return doc


@router.post("/ajes/{aje_id}/unsignoff")
async def unsignoff_aje(aje_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    if user.get("role") != "partner":
        raise HTTPException(403, "Only the partner can reverse a sign-off")
    aje = await db.engagement_ajes.find_one({"aje_id": aje_id})
    if not aje:
        raise HTTPException(404, "AJE not found")
    if aje.get("status") != "Posted":
        raise HTTPException(422, "Not signed off")
    await db.engagement_ajes.update_one(
        {"aje_id": aje_id},
        {"$set": {"status": "Proposed", "signed_off_by": None, "signed_off_at": None}})
    await journal_event(aje["engagement_id"], "aje_unsigned",
                        f"{aje['ref']} sign-off reversed — back to Proposed",
                        by_name=user.get("name") or "User")
    doc = await db.engagement_ajes.find_one({"aje_id": aje_id}, {"_id": 0})
    return doc


@router.delete("/ajes/{aje_id}")
async def delete_aje(aje_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    if user.get("role") != "partner":
        raise HTTPException(403, "Only the partner can delete adjustments")
    aje = await db.engagement_ajes.find_one({"aje_id": aje_id})
    if not aje:
        raise HTTPException(404, "AJE not found")
    if aje.get("status") == "Posted":
        raise HTTPException(422, "Posted AJEs are locked — unsign-off first")
    await db.engagement_ajes.delete_one({"aje_id": aje_id})
    await journal_event(aje["engagement_id"], "aje_deleted",
                        f"{aje['ref']} deleted: {aje['description'][:120]}",
                        by_name=user.get("name") or "User")
    return {"ok": True}


# ---------- Final (adjusted) figures ----------

@router.get("/tb/{engagement_id}/final")
async def tb_final(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Statement lines and account balances as adjusted by POSTED AJEs."""
    await _staff_only(await get_current_user(authorization, session_token))
    tb = await _load_tb(engagement_id)
    if not tb or not tb.get("rows"):
        return {"available": False}
    ajes = await db.engagement_ajes.find(
        {"engagement_id": engagement_id, "status": "Posted"}, {"_id": 0}).to_list(500)

    lines = {}
    accounts = {}
    for r in tb["rows"]:
        net = round((r.get("debit") or 0) - (r.get("credit") or 0), 2)
        accounts[r["account"]] = {"account": r["account"], "pre": net, "adj": 0.0, "final": net}
        line = r.get("mapping")
        if line:
            L = lines.setdefault(line, {"line": line, "pre": 0.0, "adj": 0.0, "final": 0.0})
            L["pre"] = round(L["pre"] + net, 2)
            L["final"] = round(L["final"] + net, 2)

    for a in ajes:
        for side in ("debit", "credit"):
            acct, sign = a[f"{side}_account"], (1.0 if side == "debit" else -1.0)
            entry = accounts.get(acct)
            if entry:
                entry["adj"] = round(entry["adj"] + sign * a["amount"], 2)
                entry["final"] = round(entry["final"] + sign * a["amount"], 2)
            line = a.get(f"{side}_line")
            if line and line in lines:
                L = lines[line]
                L["adj"] = round(L["adj"] + sign * a["amount"], 2)
                L["final"] = round(L["final"] + sign * a["amount"], 2)

    total_adj = round(sum(a["amount"] for a in ajes), 2)
    return {"available": True, "lines": list(lines.values()), "accounts": list(accounts.values()),
            "posted_ajes": len(ajes), "total_adjustments": total_adj}
