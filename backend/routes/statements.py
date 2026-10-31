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


@router.get("/statements/{engagement_id}/cashflow")
async def get_cashflow(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """Statement of cash flows (indirect method): movements derived from the
    adjusted closing position vs the opening position in the ingested books."""
    await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        return {"available": False, "reason": "Import the books or trial balance first"}
    cf = await _build_cashflow(engagement_id, data)
    return cf or {"available": False,
                  "reason": "The cash flow needs the ingested general ledger (Books ledger) to determine opening balances — ingest the books in the Trial Balance tab"}


async def _build_cashflow(engagement_id, data):
    """Indirect cash flow from closing (adjusted) vs opening (pre-period GL) positions.
    Double-entry guarantees the sections reconcile to the movement in cash."""
    tb_doc = await db.tb_imports.find_one(
        {"engagement_id": engagement_id}, {"_id": 0, "ledger_period": 1, "rows": 1})
    if not tb_doc:
        return None
    period_from = (tb_doc.get("ledger_period") or [None])[0]
    has_gl = await db.ledger_entries.count_documents({"engagement_id": engagement_id}, limit=1) > 0
    if not has_gl:
        return None

    line_of = {r["account"]: r.get("mapping") for r in (tb_doc.get("rows") or [])}

    async def opening_positions():
        """Pre-period movements aggregated to statement lines (net = debit - credit)."""
        if not period_from:
            return {}
        opening = {}
        async for e in db.ledger_entries.find(
                {"engagement_id": engagement_id, "date": {"$lt": period_from}},
                {"_id": 0, "account": 1, "debit": 1, "credit": 1}):
            line = line_of.get(e.get("account"))
            if line:
                opening[line] = round(opening.get(line, 0.0) + (e.get("debit") or 0) - (e.get("credit") or 0), 2)
        return opening

    opening = await opening_positions()
    final = await _compute_final(engagement_id)
    closing = {l["line"]: l["final"] for l in (final or {}).get("lines", [])}

    def movement(line):
        """In-period movement of a statement line, sign-corrected for presentation:
        all groups except Expenses carry credit-nature nets (negative = a growing
        balance), so flip to balance-positive; asset increases then show as outflows."""
        line_open = round(opening.get(line, 0.0), 2)
        line_close = round(closing.get(line, 0.0), 2)
        group = GROUPS_BY_LINE.get(line, "")
        raw = round(line_close - line_open, 2)
        shown = raw if group == "Expenses" else -raw
        return {"opening": line_open if group == "Assets" else -line_open,
                "closing": line_close if group == "Assets" else -line_close,
                "movement": round(shown, 2)}

    isd = data["income_statement"]
    net_profit = isd["net_profit"]

    # Operating: profit + non-cash + working-capital movements
    dep = movement("Depreciation and amortisation")["movement"]
    wc_lines = ["Trade receivables", "Other receivables and advances", "Inventory", "Prepayments",
                "Trade payables", "Accruals and other payables", "VAT and taxes payable",
                "Provisions and end-of-service", "Other liabilities"]
    wc = [(ln, movement(ln)["movement"]) for ln in wc_lines if abs(movement(ln)["movement"]) > 0.005]
    operating = round(net_profit + dep + sum(a for _, a in wc), 2)

    # Investing: capex (net movement in long-term assets)
    invest_lines = ["Property, plant and equipment", "Intangible assets"]
    investing_rows = [(ln, movement(ln)["movement"]) for ln in invest_lines if abs(movement(ln)["movement"]) > 0.005]
    investing = round(sum(a for _, a in investing_rows), 2)

    # Financing: equity and borrowing movements (brought-forward opening equity included
    # when the books were opened in-period)
    fin_lines = ["Share capital", "Loans and borrowings", "Owner drawings", "Retained earnings", "Reserves"]
    financing_rows = [(ln, movement(ln)["movement"]) for ln in fin_lines if abs(movement(ln)["movement"]) > 0.005]
    financing = round(sum(a for _, a in financing_rows), 2)

    net_change = round(operating + investing + financing, 2)

    cash = movement("Cash and bank balances")
    actual_change = round(cash["closing"] - cash["opening"], 2)
    diff = round(net_change - actual_change, 2)

    return {
        "available": True,
        "method": "indirect",
        "period": data["period"],
        "framework": data["framework"],
        "operating": {"net_profit": net_profit, "depreciation": dep, "working_capital": wc,
                      "net_operating": operating},
        "investing": {"rows": investing_rows, "net_investing": investing},
        "financing": {"rows": financing_rows, "net_financing": financing},
        "cash_opening": cash["opening"], "cash_closing": cash["closing"],
        "net_change": net_change, "actual_change": actual_change,
        "tie": {"reconciled": abs(diff) < 0.01, "difference": diff},
    }


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

    # Cash flow statement (indirect) — only when the books ledger provides opening positions
    cf = await _build_cashflow(engagement_id, data)
    if cf and cf.get("available"):
        pdf.ln(3)
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(1, 69, 124)
        pdf.cell(0, 6, "Statement of cash flows (indirect)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)
        def cfrow(label, value, bold=False):
            pdf.set_font("helvetica", "B" if bold else "", 9.5)
            pdf.cell(120, 6, _safe(label))
            pdf.cell(0, 6, _amt(value), align="right", new_x="LMARGIN", new_y="NEXT")
        o = cf["operating"]
        cfrow("Net profit for the year", o["net_profit"])
        if abs(o["depreciation"]) > 0.005:
            cfrow("Add back: depreciation and amortisation", o["depreciation"])
        for ln, a in o["working_capital"]:
            cfrow(f"(Increase) decrease in {ln.lower()}", a)
        cfrow("Net cash from operating activities", o["net_operating"], bold=True)
        for ln, a in cf["investing"]["rows"]:
            cfrow(f"Purchase of {ln.lower()}", a)
        cfrow("Net cash used in investing activities", cf["investing"]["net_investing"], bold=True)
        for ln, a in cf["financing"]["rows"]:
            cfrow(f"{ln} — movement", a)
        cfrow("Net cash from financing activities", cf["financing"]["net_financing"], bold=True)
        cfrow("Net change in cash and cash equivalents", cf["net_change"], bold=True)
        cfrow("Cash at the beginning of the period", cf["cash_opening"])
        cfrow("Cash at the end of the period", cf["cash_closing"], bold=True)
        ok = cf["tie"]["reconciled"]
        pdf.set_font("helvetica", "B", 9)
        pdf.set_text_color(21, 122, 94) if ok else pdf.set_text_color(200, 30, 30)
        pdf.cell(0, 6, _safe("Cash flow reconciliation: PASSED" if ok
                             else f"Cash flow reconciliation: DIFFERENCE AED {_amt(cf['tie']['difference'])}"),
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)

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
