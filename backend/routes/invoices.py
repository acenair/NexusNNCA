"""Routes / invoices — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from datetime import datetime
from core import db
from core import log_activity
from core import require_partner
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


class InvoiceRequest(BaseModel):
    client_id: str
    client_name: Optional[str] = None
    service_name: str
    amount: float
    date: str
    due_date: Optional[str] = None
    status: str = "Unpaid"
    notes: Optional[str] = None
    staff: Optional[str] = None


@router.post("/invoices")
async def create_invoice(req: InvoiceRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    if req.status not in ("Paid", "Unpaid", "Draft"):
        raise HTTPException(status_code=400, detail="Status must be 'Paid', 'Unpaid' or 'Draft'")
    if req.amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")
    invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
    client_name = req.client_name
    if not client_name:
        c = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
        client_name = c["name"] if c else "Unknown"

    year = req.date[:4] if req.date else str(datetime.now(timezone.utc).year)
    seq = await db.invoices.count_documents({}) + 1
    doc = {
        "invoice_id": invoice_id,
        "invoice_number": f"INV-{year}-{seq:03d}",
        "client_id": req.client_id,
        "client_name": client_name,
        "service_name": req.service_name,
        "amount": req.amount,
        "date": req.date,
        "due_date": req.due_date,
        "status": req.status,
        "notes": req.notes,
        "staff": req.staff or user.get("name"),
        "amount_paid": req.amount if req.status == "Paid" else 0,
        "receipts": [],
        "credits": [],
        "cancelled": False,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/invoices")
async def get_all_invoices(authorization: str = Header(None), session_token: str = Cookie(None), client_id: Optional[str] = None):
    user = await require_partner(authorization, session_token)
    query = {}
    if client_id:
        query["client_id"] = client_id
    invoices = await db.invoices.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return invoices


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, authorization: str = Header(None), session_token: str = Cookie(None), status: Optional[str] = None, amount: Optional[float] = None, notes: Optional[str] = None):
    user = await require_partner(authorization, session_token)
    inv = await db.invoices.find_one({"invoice_id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    update = {}
    if status:
        if status not in ("Paid", "Unpaid"):
            raise HTTPException(status_code=400, detail="Status must be 'Paid' or 'Unpaid'")
        update["status"] = status
    if amount is not None:
        update["amount"] = amount
    if notes is not None:
        update["notes"] = notes
    if update:
        await db.invoices.update_one({"invoice_id": invoice_id}, {"$set": update})
    return {"message": "Invoice updated"}


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    result = await db.invoices.delete_one({"invoice_id": invoice_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice deleted"}


@router.get("/invoices/ageing-report")
async def get_ageing_report(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    unpaid = await db.invoices.find({"status": "Unpaid"}, {"_id": 0}).to_list(1000)
    today = datetime.now(timezone.utc).date()
    buckets = {"current": [], "30": [], "60": [], "90": [], "120plus": []}
    client_summary = {}
    for inv in unpaid:
        inv_date = datetime.fromisoformat(inv["date"]).date() if isinstance(inv["date"], str) else inv["date"]
        days = (today - inv_date).days
        inv["days_overdue"] = days
        if days <= 0:
            buckets["current"].append(inv)
        elif days <= 30:
            buckets["30"].append(inv)
        elif days <= 60:
            buckets["60"].append(inv)
        elif days <= 90:
            buckets["90"].append(inv)
        else:
            buckets["120plus"].append(inv)
        cid = inv.get("client_id", "unknown")
        if cid not in client_summary:
            client_summary[cid] = {"client_id": cid, "client_name": inv.get("client_name", "Unknown"), "total_outstanding": 0, "invoice_count": 0, "oldest_days": 0, "invoices": []}
        client_summary[cid]["total_outstanding"] += inv.get("amount", 0)
        client_summary[cid]["invoice_count"] += 1
        client_summary[cid]["oldest_days"] = max(client_summary[cid]["oldest_days"], days)
        client_summary[cid]["invoices"].append(inv)
    # Sort by oldest overdue first
    clients_sorted = sorted(client_summary.values(), key=lambda x: -x["oldest_days"])
    summary = {
        "total_unpaid": sum(i.get("amount", 0) for i in unpaid),
        "total_invoices": len(unpaid),
        "bucket_totals": {k: {"count": len(v), "amount": sum(i.get("amount", 0) for i in v)} for k, v in buckets.items()},
    }
    return {"summary": summary, "clients": clients_sorted}


@router.post("/invoices/follow-up")
async def create_follow_up(client_id: str = "", client_name: str = "", authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id required")
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task = {
        "task_id": task_id, "title": f"Follow up: Unpaid invoices — {client_name or client_id}",
        "description": f"Outstanding invoices require follow-up. Review the ageing report and contact the client.",
        "status": "Pending", "priority": "High", "client_id": client_id, "client_name": client_name,
        "created_by": user["user_id"], "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.insert_one(task)
    await log_activity("Follow-up task created", f"Ageing follow-up for {client_name}", user["user_id"], client_id, client_name)
    return {"message": "Follow-up task created", "task_id": task_id}


def _inv_status(inv) -> str:
    """Display status per the Auditflow billing workspace."""
    if inv.get("cancelled"):
        return "Cancelled"
    due = inv.get("amount", 0) - inv.get("amount_paid", 0) - sum(c.get("amount", 0) for c in inv.get("credits", []))
    if due <= 0.009:
        return "Paid"
    if inv.get("amount_paid", 0) > 0:
        return "Part paid"
    if inv.get("due_date") and inv["due_date"] < datetime.now(timezone.utc).date().isoformat():
        return "Overdue"
    return "Unpaid"


@router.post("/invoices/{invoice_id}/receipts")
async def add_receipt(invoice_id: str, amount: float, method: str = "Bank transfer", reference: str = "", date: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    inv = await db.invoices.find_one({"invoice_id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("cancelled"):
        raise HTTPException(status_code=400, detail="Invoice is cancelled")
    amount = round(amount, 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    receipt = {
        "receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}",
        "amount": amount,
        "method": method,
        "reference": reference,
        "date": date or datetime.now(timezone.utc).date().isoformat(),
        "recorded_by": user.get("name"),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    paid = round(inv.get("amount_paid", 0) + amount, 2)
    update = {"$push": {"receipts": receipt}, "$set": {"amount_paid": paid}}
    if paid >= inv.get("amount", 0) - 0.009 - sum(c.get("amount", 0) for c in inv.get("credits", [])):
        update["$set"]["status"] = "Paid"
    await db.invoices.update_one({"invoice_id": invoice_id}, update)
    return {"ok": True, "receipt": receipt, "amount_paid": paid, "status": _inv_status({**inv, "amount_paid": paid})}


@router.post("/invoices/{invoice_id}/credit")
async def add_credit(invoice_id: str, amount: float, reason: str = "", authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    inv = await db.invoices.find_one({"invoice_id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    amount = round(amount, 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    credit = {"credit_id": f"CN-{uuid.uuid4().hex[:8].upper()}", "amount": amount, "reason": reason,
              "date": datetime.now(timezone.utc).date().isoformat(), "created_by": user.get("name")}
    await db.invoices.update_one({"invoice_id": invoice_id}, {"$push": {"credits": credit}})
    return {"ok": True, "credit": credit}


@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(invoice_id: str, reason: str = "", authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    res = await db.invoices.update_one({"invoice_id": invoice_id}, {"$set": {"cancelled": True, "cancel_reason": reason, "status": "Cancelled"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}


@router.post("/invoices/{invoice_id}/issue")
async def issue_draft(invoice_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Draft -> issued (Unpaid) with today's date if unset."""
    user = await require_partner(authorization, session_token)
    inv = await db.invoices.find_one({"invoice_id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Only drafts can be issued")
    today = datetime.now(timezone.utc).date().isoformat()
    await db.invoices.update_one({"invoice_id": invoice_id}, {"$set": {
        "status": "Unpaid", "date": inv.get("date") or today, "issued_at": today}})
    return {"ok": True}


@router.get("/invoices/billing-summary")
async def billing_summary(month: Optional[str] = None, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Auditflow billing-workspace aggregates for the selected month (YYYY-MM)."""
    await require_partner(authorization, session_token)
    today = datetime.now(timezone.utc).date().isoformat()
    if not month:
        month = today[:7]
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(2000)
    live = [i for i in invoices if not i.get("cancelled") and i.get("status") != "Draft"]
    credits_sum = lambda invs: sum(sum(c.get("amount", 0) for c in i.get("credits", [])) for i in invs)
    collected_in = lambda invs: sum(r.get("amount", 0) for i in invs for r in i.get("receipts", []) if (r.get("date") or "")[:7] == month)

    month_inv = [i for i in live if (i.get("date") or "")[:7] == month]
    pending_m = sum(max(0, i.get("amount", 0) - i.get("amount_paid", 0) - sum(c.get("amount", 0) for c in i.get("credits", []))) for i in month_inv)
    pending_all = [(i, max(0, i.get("amount", 0) - i.get("amount_paid", 0) - sum(c.get("amount", 0) for c in i.get("credits", [])))) for i in live]
    pending_all = [(i, p) for i, p in pending_all if p > 0.009]
    overdue = [(i, p) for i, p in pending_all if i.get("due_date") and i["due_date"] < today]

    # pending by staff
    by_staff = {}
    for i, p in pending_all:
        s = i.get("staff") or "Unassigned"
        st = by_staff.setdefault(s, {"pending": 0, "count": 0, "overdue": 0, "overdue_amt": 0})
        st["pending"] += p; st["count"] += 1
        if i.get("due_date") and i["due_date"] < today:
            st["overdue"] += 1; st["overdue_amt"] += p

    # ageing buckets on unpaid balances
    ageing = {"current": 0, "d30": 0, "d60": 0, "d90": 0, "p90": 0}
    for i, p in pending_all:
        dd = i.get("due_date") or i.get("date") or today
        try:
            days = (datetime.fromisoformat(today).date() - datetime.fromisoformat(dd).date()).days
        except ValueError:
            days = 0
        if days <= 0: ageing["current"] += p
        elif days <= 30: ageing["d30"] += p
        elif days <= 60: ageing["d60"] += p
        elif days <= 90: ageing["d90"] += p
        else: ageing["p90"] += p

    return {
        "month": month,
        "billed_month": sum(i.get("amount", 0) for i in month_inv),
        "count_month": len(month_inv),
        "credits_month": credits_sum(month_inv),
        "collected_month": collected_in(live),
        "collected_month_current": sum(r.get("amount", 0) for i in month_inv for r in i.get("receipts", []) if (r.get("date") or "")[:7] == month),
        "collected_month_older": collected_in([i for i in live if (i.get("date") or "")[:7] != month]),
        "pending_month": pending_m,
        "billed_total": sum(i.get("amount", 0) for i in live),
        "collected_total": sum(r.get("amount", 0) for i in live for r in i.get("receipts", [])),
        "credits_total": credits_sum(live),
        "pending_total": sum(p for _, p in pending_all),
        "pending_count": len(pending_all),
        "overdue_total": sum(p for _, p in overdue),
        "overdue_count": len(overdue),
        "cancelled_total": sum(i.get("amount", 0) for i in invoices if i.get("cancelled")),
        "drafts_total": sum(i.get("amount", 0) for i in invoices if i.get("status") == "Draft"),
        "drafts_count": sum(1 for i in invoices if i.get("status") == "Draft"),
        "pending_by_staff": by_staff,
        "ageing": ageing,
        "status": "ok",
    }
