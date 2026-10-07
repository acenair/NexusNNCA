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
    status: str = "Unpaid"
    notes: Optional[str] = None


@router.post("/invoices")
async def create_invoice(req: InvoiceRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    if req.status not in ("Paid", "Unpaid"):
        raise HTTPException(status_code=400, detail="Status must be 'Paid' or 'Unpaid'")
    if req.amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")
    invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
    client_name = req.client_name
    if not client_name:
        c = await db.clients.find_one({"client_id": req.client_id}, {"_id": 0, "name": 1})
        client_name = c["name"] if c else "Unknown"

    doc = {
        "invoice_id": invoice_id,
        "client_id": req.client_id,
        "client_name": client_name,
        "service_name": req.service_name,
        "amount": req.amount,
        "date": req.date,
        "status": req.status,
        "notes": req.notes,
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
