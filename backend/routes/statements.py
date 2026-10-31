"""IFRS statement builder — Stage B: primary statements (P&L + balance sheet).

Built on top of the trial balance + posted adjusting entries: the FINAL
statement-line figures (GET /tb/{eid}/final) are presented as an income
statement and a statement of financial position, sign-corrected per IFRS
presentation, with the balance check (assets = liabilities + equity).
Framework default is IFRS for SMEs, switchable per engagement to full IFRS.
"""
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Response
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event
from routes.adjustments import _compute_final
from routes.trial_balance import STATEMENT_LINES, _staff_only

router = APIRouter(prefix="/api")

FRAMEWORKS = ("IFRS for SMEs", "Full IFRS")
GROUPS_BY_LINE = dict(STATEMENT_LINES)

ASSET_LINES = ["Cash and bank balances", "Trade receivables", "Other receivables and advances",
               "Inventory", "Prepayments", "Property, plant and equipment",
               "Intangible assets", "Other assets"]
LIABILITY_LINES = ["Trade payables", "Accruals and other payables", "VAT and taxes payable",
                   "Loans and borrowings", "Provisions and end-of-service", "Other liabilities"]
EQUITY_LINES = ["Share capital", "Retained earnings", "Reserves", "Owner drawings"]
INCOME_LINES = ["Revenue", "Other income"]
EXPENSE_LINES = ["Cost of sales", "Staff costs", "Depreciation and amortisation",
                 "Operating expenses", "Finance costs"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe(s):
    """Coerce to latin-1-safe text for fpdf core fonts."""
    return (str(s or "").encode("latin-1", "replace").decode("latin-1"))


def _amt(n):
    return f"{n:,.2f}"


async def _build_statements(engagement_id):
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    final = await _compute_final(engagement_id)
    if not final or not final.get("lines"):
        return None

    values = {l["line"]: l["final"] for l in final["lines"]}
    adjustments = {l["line"]: l["adj"] for l in final["lines"]}

    def pick(lines):  # (line, amount, adjustment) for non-zero lines, in presentation order
        out = []
        for line in lines:
            amt = round(values.get(line, 0.0), 2)
            out.append((line, amt, round(adjustments.get(line, 0.0), 2)))
        return out

    # Income statement (credit-nature lines are negative nets)
    income = [(line, round(-net, 2), round(-adj, 2)) for line, net, adj in pick(INCOME_LINES)]
    expenses = pick(EXPENSE_LINES)
    total_income = round(sum(a for _, a, _ in income), 2)
    total_expenses = round(sum(a for _, a, _ in expenses), 2)
    net_profit = round(total_income - total_expenses, 2)
    operating_profit = round(total_income - sum(a for ln, a, _ in expenses if ln != "Finance costs"), 2)

    # Balance sheet (credit-nature lines flip sign)
    assets = [(line, round(net, 2), adj) for line, net, adj in pick(ASSET_LINES)]
    liabilities = [(line, round(-net, 2), round(-adj, 2)) for line, net, adj in pick(LIABILITY_LINES)]
    equity_base = [(line, round(-net, 2), round(-adj, 2)) for line, net, adj in pick(EQUITY_LINES)]

    total_assets = round(sum(a for _, a, _ in assets), 2)
    total_liabilities = round(sum(a for _, a, _ in liabilities), 2)
    # Equity presentation: b/fwd items, then current-year profit
    equity_rows = [(ln, a, adj) for ln, a, adj in equity_base if abs(a) > 0.005 or abs(adj) > 0.005]
    equity_rows.append(("Net profit for the year", net_profit, 0.0))
    total_equity = round(sum(a for _, a, _ in equity_rows), 2)
    diff = round(total_assets - (total_liabilities + total_equity), 2)

    period = (eng.get("period") or eng.get("financial_year") or "")
    tb_doc = await db.tb_imports.find_one({"engagement_id": engagement_id}, {"_id": 0, "ledger_period": 1, "imported_at": 1, "file_name": 1})
    if not period and tb_doc and tb_doc.get("ledger_period"):
        p = tb_doc["ledger_period"]
        period = f"{p[0]} to {p[1]}"

    return {
        "available": True,
        "client_name": eng.get("client_name"),
        "service_type": eng.get("service_type"),
        "framework": eng.get("reporting_framework") or "IFRS for SMEs",
        "period": period or "Year ended —",
        "generated_at": _now(),
        "posted_ajes": final["posted_ajes"],
        "total_adjustments": final["total_adjustments"],
        "income_statement": {
            "income": income, "expenses": expenses,
            "total_income": total_income, "total_expenses": total_expenses,
            "operating_profit": operating_profit, "net_profit": net_profit,
        },
        "balance_sheet": {
            "assets": assets, "liabilities": liabilities, "equity": equity_rows,
            "total_assets": total_assets, "total_liabilities": total_liabilities,
            "total_equity": total_equity,
        },
        "balance_check": {"balanced": abs(diff) < 0.01, "difference": diff},
    }


@router.get("/statements/{engagement_id}")
async def get_statements(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    await _staff_only(await get_current_user(authorization, session_token))
    result = await _build_statements(engagement_id)
    return result or {"available": False}


@router.patch("/statements/{engagement_id}")
async def set_framework(engagement_id: str, body: Optional[dict] = None,
                        authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    body = body or {}
    framework = (body.get("framework") or "").strip()
    if framework not in FRAMEWORKS:
        raise HTTPException(422, f"Framework must be one of: {', '.join(FRAMEWORKS)}")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(404, "Engagement not found")
    await db.service_engagements.update_one(
        {"engagement_id": engagement_id}, {"$set": {"reporting_framework": framework}})
    await journal_event(engagement_id, "framework_changed",
                        f"Reporting framework set to {framework} for the financial statements",
                        by_name=user.get("name") or "User")
    return {"ok": True, "framework": framework}


@router.get("/statements/{engagement_id}/pdf")
async def statements_pdf(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        raise HTTPException(404, "No trial balance imported for this engagement")

    from fpdf import FPDF
    firm = await db.settings.find_one({"type": "firm"}, {"_id": 0}) or {}
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.set_font("helvetica", "B", 15)
    pdf.cell(0, 8, _safe(firm.get("firm_name", "Nair & Nelliyatt Chartered Accountants")), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    if firm.get("address"):
        pdf.cell(0, 5, _safe(firm["address"]), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 7, "FINANCIAL STATEMENTS", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("helvetica", "", 10)
    pdf.cell(0, 6, _safe(f"{data['client_name']}  —  {data['period']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "I", 8)
    pdf.cell(0, 5, _safe(f"Prepared in accordance with {data['framework']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    def table(title, rows, total_label, total_value, note=None):
        pdf.set_font("helvetica", "B", 10.5)
        pdf.cell(0, 6, _safe(title), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        for label, value, adj in rows:
            if abs(value) < 0.005 and abs(adj) < 0.005:
                continue
            pdf.set_font("helvetica", "", 9)
            pdf.cell(120, 6, _safe(label))
            pdf.set_font("helvetica", "", 9)
            pdf.cell(35, 6, _amt(value), align="right")
            pdf.set_font("helvetica", "I", 8)
            if adj:
                pdf.cell(0, 6, _safe(f"adj {adj:+,.2f}"), align="right", new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.cell(0, 6, "", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "B", 9)
        pdf.cell(120, 7, _safe(total_label))
        pdf.cell(0, 7, _amt(total_value), align="right", new_x="LMARGIN", new_y="NEXT")
        if note:
            pdf.set_font("helvetica", "I", 8)
            pdf.cell(0, 5, _safe(note), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    isd = data["income_statement"]
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 6, "Statement of profit or loss", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    table("Income", isd["income"], "Total income", isd["total_income"])
    table("Expenses", isd["expenses"], "Total expenses", isd["total_expenses"])
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(120, 7, "Net profit for the year")
    pdf.cell(0, 7, _amt(isd["net_profit"]), align="right", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    bsd = data["balance_sheet"]
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 6, "Statement of financial position", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    table("Assets", bsd["assets"], "Total assets", bsd["total_assets"])
    table("Liabilities", bsd["liabilities"], "Total liabilities", bsd["total_liabilities"])
    table("Equity", bsd["equity"], "Total equity", bsd["total_equity"])
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(120, 7, "Total liabilities and equity")
    pdf.cell(0, 7, _amt(round(bsd["total_liabilities"] + bsd["total_equity"], 2)), align="right", new_x="LMARGIN", new_y="NEXT")

    ok = data["balance_check"]["balanced"]
    pdf.ln(3)
    pdf.set_font("helvetica", "B" if ok else "B", 9.5)
    pdf.set_text_color(21, 122, 94 if ok else 0)
    pdf.cell(0, 6, _safe("Balance check: PASSED — assets equal liabilities and equity" if ok
                         else f"Balance check: FAILED — difference AED {_amt(data['balance_check']['difference'])}"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("helvetica", "I", 8)
    pdf.ln(4)
    pdf.multi_cell(0, 5, _safe(
        f"Basis of preparation: {data['framework']}. Figures are the adjusted trial balance "
        f"({data['posted_ajes']} posted adjusting entries, AED {_amt(data['total_adjustments'])} total adjustments). "
        f"Notes and disclosures are prepared at the review stage. Generated by the NNCA platform."))

    pdf_bytes = bytes(pdf.output())
    await journal_event(engagement_id, "statements_exported",
                        f"Financial statements exported to PDF ({data['framework']}, {data['period']})",
                        by_name=user.get("name") or "User")
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="financial-statements-{engagement_id}.pdf"'})
