"""Routes / invoices — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
from datetime import datetime
from fastapi.responses import Response
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
    amount: float  # gross total (net + VAT)
    net_amount: Optional[float] = None  # amount excluding VAT; if omitted, treated as tax-exclusive legacy (VAT 0)
    vat_percent: float = 0.0
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
    # VAT breakdown: net + vat% = gross. Legacy invoices (no net_amount) stay tax-exclusive as entered.
    if req.net_amount is not None:
        net = round(req.net_amount, 2)
        vat = round(net * req.vat_percent / 100, 2)
        total = round(net + vat, 2)
        if abs(total - req.amount) > 0.01:
            total = total  # trust computed gross; keep amount consistent
        net_amount, vat_amount, vat_percent = net, vat, req.vat_percent
    else:
        net_amount, vat_amount, vat_percent = round(req.amount, 2), 0.0, 0.0
    doc = {
        "invoice_id": invoice_id,
        "invoice_number": f"INV-{year}-{seq:03d}",
        "client_id": req.client_id,
        "client_name": client_name,
        "service_name": req.service_name,
        "amount": total if req.net_amount is not None else req.amount,
        "net_amount": net_amount,
        "vat_amount": vat_amount,
        "vat_percent": vat_percent,
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


def _safe(text) -> str:
    """Coerce to latin-1-safe text for fpdf core fonts (em-dashes, smart quotes, etc.)."""
    if text is None:
        return ""
    return str(text).encode("latin-1", "replace").decode("latin-1")


def _amount_in_words(amount: float) -> str:
    """Amount in words (AED, UAE tax invoice requirement)."""
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
            "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def below_thousand(n):
        words = []
        if n >= 100:
            words.append(ones[n // 100] + " Hundred")
            n %= 100
        if n >= 20:
            words.append(tens[n // 10])
            n %= 10
        if n:
            words.append(ones[n])
        return " ".join(words)

    n = int(amount)
    fils = round((amount - n) * 100)
    parts = []
    for value, label in [(n // 1_000_000, "Million"), ((n // 1000) % 1000, "Thousand")]:
        if value:
            parts.append(below_thousand(value) + " " + label)
    remainder = n % 1000
    if remainder or not parts:
        parts.append(below_thousand(remainder))
    words = " ".join(parts).strip() or "Zero"
    words += " Dirhams"
    if fils:
        words += f" and {below_thousand(fils)} Fils"
    return words + " only"


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """UAE-compliant tax invoice PDF (firm TRN, client TRN, net/VAT/gross breakdown, amount in words)."""
    from fpdf import FPDF
    import io

    user = await require_partner(authorization, session_token)
    inv = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    firm_doc = await db.settings.find_one({"type": "firm"}, {"_id": 0}) or {}
    client = await db.clients.find_one({"client_id": inv.get("client_id")}, {"_id": 0, "trn": 1, "corporate_tax_trn": 1, "address": 1, "contact_email": 1}) or {}

    net = inv.get("net_amount", inv.get("amount", 0))
    vat = inv.get("vat_amount", 0)
    vat_pct = inv.get("vat_percent", 0)
    gross = inv.get("amount", 0)

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header: firm block + TAX INVOICE
    pdf.set_font("helvetica", "B", 16)
    pdf.cell(0, 8, _safe(firm_doc.get("firm_name", "Nair & Nelliyatt Chartered Accountants")), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    if firm_doc.get("address"):
        pdf.cell(0, 5, _safe(firm_doc["address"]), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _safe(f"TRN: {firm_doc.get('trn') or '-'}") + (f"   |   {firm_doc.get('phone')}" if firm_doc.get("phone") else "") + (f"   |   {firm_doc.get('email')}" if firm_doc.get("email") else ""), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 8, "TAX INVOICE", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    # Invoice meta + client block (two columns)
    y0 = pdf.get_y()
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(95, 6, "Invoice details", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    for label, val in [("Invoice No", inv.get("invoice_number", "")), ("Invoice Date", inv.get("date", "")), ("Due Date", inv.get("due_date") or "—"), ("Status", inv.get("status", ""))]:
        pdf.cell(40, 5, _safe(label), new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(45, pdf.get_y() - 5)
        pdf.cell(50, 5, _safe(str(val)))
    pdf.set_xy(110, y0)
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(0, 6, "Billed to")
    pdf.set_xy(110, pdf.get_y() + 6)
    pdf.set_font("helvetica", "", 9)
    pdf.multi_cell(0, 5, _safe(f"{inv.get('client_name', '')}\nTRN: {client.get('trn') or '-'}") + (f"\n{client['address']}" if client.get("address") else ""))
    pdf.ln(4)

    # Line items table
    pdf.set_fill_color(234, 243, 251)
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(95, 8, "DESCRIPTION", border=1, fill=True)
    pdf.cell(30, 8, "QTY", border=1, fill=True, align="C")
    pdf.cell(25, 8, "NET (AED)", border=1, fill=True, align="R")
    pdf.cell(20, 8, "VAT %", border=1, fill=True, align="R")
    pdf.cell(25, 8, "AMOUNT (AED)", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    desc = _safe(inv.get("service_name", "Professional services"))
    if inv.get("notes"):
        desc += "\n" + _safe(inv["notes"][:120])
    pdf.multi_cell(95, 8, desc, border=1)
    y_after = pdf.get_y() - (8 if "\n" not in desc else 16)
    pdf.set_xy(95, y0 + 22)
    pdf.set_y(y_after)
    pdf.cell(95, 8, "", border=1)
    pdf.set_xy(95, pdf.get_y())
    pdf.cell(30, 8, "1", border=1, align="C")
    pdf.cell(25, 8, f"{net:,.2f}", border=1, align="R")
    pdf.cell(20, 8, f"{vat_pct:g}%", border=1, align="R")
    pdf.cell(25, 8, f"{gross:,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")

    # Totals
    pdf.set_x(140)
    pdf.cell(30, 7, "Net amount", border=1)
    pdf.cell(25, 7, f"{net:,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(140)
    pdf.cell(30, 7, f"VAT {vat_pct:g}%", border=1)
    pdf.cell(25, 7, f"{vat:,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "B", 10)
    pdf.set_x(140)
    pdf.cell(30, 7, "Total due", border=1, fill=True)
    pdf.cell(25, 7, f"{gross:,.2f}", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 8.5)
    pdf.ln(4)
    pdf.multi_cell(0, 5, _safe(f"Amount in words: {_amount_in_words(gross)}"))

    # Receipts summary
    paid = inv.get("amount_paid", 0)
    balance = round(gross - paid, 2)
    pdf.ln(2)
    pdf.cell(0, 5, f"Amount received to date: AED {paid:,.2f}    |    Balance due: AED {balance:,.2f}", new_x="LMARGIN", new_y="NEXT")
    if firm_doc.get("bank_details"):
        pdf.ln(3)
        pdf.multi_cell(0, 5, _safe("Bank details: " + firm_doc["bank_details"]))
    pdf.ln(4)
    pdf.set_font("helvetica", "I", 7.5)
    pdf.set_text_color(120, 120, 120)
    pdf.multi_cell(0, 4, "This is a computer-generated tax invoice issued in accordance with UAE Federal Decree-Law No. 8 of 2017 (VAT). "
                        "No signature or stamp is required. Credits, if any, are issued as separate credit notes.")

    pdf_bytes = bytes(pdf.output())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{inv.get("invoice_number", "invoice")}.pdf"'},
    )

