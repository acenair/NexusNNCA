"""IFRS statement builder — Stage B: primary statements (P&L + balance sheet).

Built on top of the trial balance + posted adjusting entries: the FINAL
import re
statement-line figures (GET /tb/{eid}/final) are presented as an income
statement and a statement of financial position, sign-corrected per IFRS
presentation, with the balance check (assets = liabilities + equity).
Framework default is IFRS for SMEs, switchable per engagement to full IFRS.
"""
import io
import re
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
    _pdf_header(pdf, firm, "FINANCIAL STATEMENTS", data)

    isd = data["income_statement"]
    _pdf_section(pdf, "Statement of profit or loss")
    _pdf_table(pdf, "Income", isd["income"], "Total income", isd["total_income"])
    _pdf_table(pdf, "Expenses", isd["expenses"], "Total expenses", isd["total_expenses"])
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(120, 7, "Net profit for the year")
    pdf.cell(0, 7, _amt(isd["net_profit"]), align="right", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    bsd = data["balance_sheet"]
    _pdf_section(pdf, "Statement of financial position")
    _pdf_table(pdf, "Assets", bsd["assets"], "Total assets", bsd["total_assets"])
    _pdf_table(pdf, "Liabilities", bsd["liabilities"], "Total liabilities", bsd["total_liabilities"])
    _pdf_table(pdf, "Equity", bsd["equity"], "Total equity", bsd["total_equity"])
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(120, 7, "Total liabilities and equity")
    pdf.cell(0, 7, _amt(round(bsd["total_liabilities"] + bsd["total_equity"], 2)), align="right", new_x="LMARGIN", new_y="NEXT")

    # Cash flow statement (indirect) — only when the books ledger provides opening positions
    cf = await _build_cashflow(engagement_id, data)
    if cf and cf.get("available"):
        _pdf_cashflow(pdf, cf)

    ok = data["balance_check"]["balanced"]
    pdf.ln(3)
    pdf.set_font("helvetica", "B", 9)
    (pdf.set_text_color(21, 122, 94),) if ok else (pdf.set_text_color(200, 30, 30),)
    pdf.cell(0, 6, _safe("Balance check: PASSED — assets equal liabilities and equity" if ok
                         else f"Balance check: FAILED — difference AED {_amt(data['balance_check']['difference'])}"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    await _pdf_notes(pdf, engagement_id)

    pdf.set_font("helvetica", "I", 8)
    pdf.ln(4)
    pdf.multi_cell(0, 5, _safe(
        f"Basis of preparation: {data['framework']}. Figures are the adjusted trial balance "
        f"({data['posted_ajes']} posted adjusting entries, AED {_amt(data['total_adjustments'])} total adjustments). "
        f"Notes and disclosures are prepared at the review stage. Generated by the NNCA platform."), new_x="LMARGIN", new_y="NEXT")

    pdf_bytes = bytes(pdf.output())
    await journal_event(engagement_id, "statements_exported",
                        f"Financial statements exported to PDF ({data['framework']}, {data['period']})",
                        by_name=user.get("name") or "User")
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="financial-statements-{engagement_id}.pdf"'})


# ---------- PDF drawing helpers (shared by the statements PDF and the deliverable pack) ----------

def _pdf_header(pdf, firm, title, data):
    pdf.set_font("helvetica", "B", 15)
    pdf.cell(0, 8, _safe(firm.get("firm_name", "Nair & Nelliyatt Chartered Accountants")), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    if firm.get("address"):
        pdf.cell(0, 5, _safe(firm["address"]), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 7, _safe(title), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("helvetica", "", 10)
    pdf.cell(0, 6, _safe(f"{data['client_name']}  —  {data['period']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "I", 8)
    pdf.cell(0, 5, _safe(f"Prepared in accordance with {data['framework']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)


def _pdf_section(pdf, title):
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 6, _safe(title), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)


def _pdf_table(pdf, title, rows, total_label, total_value, note=None):
    pdf.set_font("helvetica", "B", 10.5)
    pdf.cell(0, 6, _safe(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    for label, value, adj in rows:
        if abs(value) < 0.005 and abs(adj) < 0.005:
            continue
        pdf.set_font("helvetica", "", 9)
        pdf.cell(120, 6, _safe(label))
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


def _pdf_row(pdf, label, value, bold=False):
    pdf.set_font("helvetica", "B" if bold else "", 9.5)
    pdf.cell(120, 6, _safe(label))
    pdf.cell(0, 6, _amt(value), align="right", new_x="LMARGIN", new_y="NEXT")


def _pdf_cashflow(pdf, cf):
    pdf.ln(3)
    _pdf_section(pdf, "Statement of cash flows (indirect)")
    pdf.ln(1)
    o = cf["operating"]
    _pdf_row(pdf, "Net profit for the year", o["net_profit"])
    if abs(o["depreciation"]) > 0.005:
        _pdf_row(pdf, "Add back: depreciation and amortisation", o["depreciation"])
    for ln, a in o["working_capital"]:
        _pdf_row(pdf, f"(Increase) decrease in {ln.lower()}", a)
    _pdf_row(pdf, "Net cash from operating activities", o["net_operating"], bold=True)
    for ln, a in cf["investing"]["rows"]:
        _pdf_row(pdf, f"Purchase of {ln.lower()}", a)
    _pdf_row(pdf, "Net cash used in investing activities", cf["investing"]["net_investing"], bold=True)
    for ln, a in cf["financing"]["rows"]:
        _pdf_row(pdf, f"{ln} — movement", a)
    _pdf_row(pdf, "Net cash from financing activities", cf["financing"]["net_financing"], bold=True)
    _pdf_row(pdf, "Net change in cash and cash equivalents", cf["net_change"], bold=True)
    _pdf_row(pdf, "Cash at the beginning of the period", cf["cash_opening"])
    _pdf_row(pdf, "Cash at the end of the period", cf["cash_closing"], bold=True)
    ok = cf["tie"]["reconciled"]
    pdf.set_font("helvetica", "B", 9)
    (pdf.set_text_color(21, 122, 94),) if ok else (pdf.set_text_color(200, 30, 30),)
    pdf.cell(0, 6, _safe("Cash flow reconciliation: PASSED" if ok
                         else f"Cash flow reconciliation: DIFFERENCE AED {_amt(cf['tie']['difference'])}"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)


async def _pdf_notes(pdf, engagement_id):
    notes = []
    async for n in db.statement_notes.find(
            {"engagement_id": engagement_id, "status": {"$in": ("Cleared", "Pre-drafted", "Draft")}},
            {"_id": 0, "title": 1, "body": 1, "status": 1}).sort("created_at", 1):
        notes.append(n)
    if notes:
        pdf.add_page()
        _pdf_section(pdf, "Notes to the financial statements")
        pdf.ln(2)
        for n in notes:
            pdf.set_font("helvetica", "B", 9.5)
            pdf.multi_cell(0, 6, _safe(f"{n['title']}" + ("  [DRAFT — pending partner review]" if n["status"] != "Cleared" else "")), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 9)
            pdf.multi_cell(0, 5, _safe(n.get("body") or "(to be written)"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(3)


# ---------- Stage E: the full deliverable pack ----------

@router.get("/statements/{engagement_id}/pack")
async def deliverable_pack(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    """One download: cover page, the three statements, notes, the disclosure
    checklist, the adjustments register and the adjusted trial balance."""
    user = await _staff_only(await get_current_user(authorization, session_token))
    data = await _build_statements(engagement_id)
    if not data:
        raise HTTPException(404, "No trial balance imported for this engagement")

    from fpdf import FPDF
    from datetime import datetime as _dt
    firm = await db.settings.find_one({"type": "firm"}, {"_id": 0}) or {}
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0}) or {}
    final = await _compute_final(engagement_id) or {"accounts": [], "posted_ajes": 0, "total_adjustments": 0.0}
    ajes = await db.engagement_ajes.find({"engagement_id": engagement_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    disc = await db.disclosure_checklists.find_one({"engagement_id": engagement_id}, {"_id": 0})
    n_notes = {"cleared": 0, "drafted": 0}
    async for n in db.statement_notes.find({"engagement_id": engagement_id}, {"_id": 0, "status": 1}):
        if n["status"] == "Cleared":
            n_notes["cleared"] += 1
        elif n["status"] in ("Pre-drafted", "Draft"):
            n_notes["drafted"] += 1

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)

    # ---- Cover page ----
    pdf.add_page()
    pdf.ln(30)
    pdf.set_font("helvetica", "B", 19)
    pdf.set_text_color(1, 69, 124)
    pdf.cell(0, 9, _safe(firm.get("firm_name", "Nair & Nelliyatt Chartered Accountants")), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9.5)
    pdf.set_text_color(0, 0, 0)
    if firm.get("address"):
        pdf.cell(0, 5, _safe(firm["address"]), align="C", new_x="LMARGIN", new_y="NEXT")
    if firm.get("trn"):
        pdf.cell(0, 5, _safe(f"TRN: {firm['trn']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14)
    pdf.set_font("helvetica", "", 11)
    pdf.cell(0, 7, _safe(f"{data['client_name']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "B", 13)
    pdf.cell(0, 8, _safe(f"Financial Statements — {data['period']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "I", 9.5)
    pdf.cell(0, 6, _safe(f"Prepared in accordance with {data['framework']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14)

    pdf.set_font("helvetica", "", 10)
    pdf.set_x(55)
    pdf.cell(45, 6, "Balance check")
    ok = data["balance_check"]["balanced"]
    pdf.set_text_color(21, 122, 94) if ok else pdf.set_text_color(200, 30, 30)
    pdf.cell(0, 6, _safe("Passed" if ok else f"FAILED (difference AED {_amt(data['balance_check']['difference'])})"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    cf = await _build_cashflow(engagement_id, data)
    if cf and cf.get("available"):
        pdf.set_x(55)
        pdf.cell(45, 6, "Cash flow reconciliation")
        cf_ok = cf["tie"]["reconciled"]
        pdf.set_text_color(21, 122, 94) if cf_ok else pdf.set_text_color(200, 30, 30)
        pdf.cell(0, 6, _safe("Passed" if cf_ok else f"FAILED (difference AED {_amt(cf['tie']['difference'])})"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
    pdf.set_x(55)
    pdf.cell(45, 6, "Adjusting entries posted")
    pdf.cell(0, 6, _safe(f"{final['posted_ajes']} (AED {_amt(final['total_adjustments'])})"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(45, 6, "Notes cleared by partner")
    pdf.cell(0, 6, _safe(f"{n_notes['cleared']} cleared, {n_notes['drafted']} awaiting review"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(45, 6, "Service")
    pdf.cell(0, 6, _safe((eng.get("service_type") or "").replace("_", " ").title()), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(16)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_x(55)
    pdf.cell(0, 6, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9.5)
    pdf.set_x(55)
    pdf.cell(0, 6, "1.  Statement of profit or loss", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(0, 6, "2.  Statement of financial position", new_x="LMARGIN", new_y="NEXT")
    if cf and cf.get("available"):
        pdf.set_x(55)
        pdf.cell(0, 6, "3.  Statement of cash flows (indirect)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(0, 6, f"{4 if cf and cf.get('available') else 3}.  Notes and disclosures", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(0, 6, _safe("Appendix A — Adjusting entries register"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(55)
    pdf.cell(0, 6, _safe("Appendix B — Adjusted trial balance"), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(20)
    pdf.set_font("helvetica", "I", 8)
    pdf.set_text_color(110, 130, 145)
    pdf.multi_cell(0, 5, _safe(
        f"Compiled from the client's books and the engagement's adjusting entries on "
        f"{_dt.now(timezone.utc).strftime('%d %B %Y at %H:%M UTC')} by {user.get('name') or 'the NNCA platform'}. "
        f"This pack was generated by the NNCA practice platform and reflects the adjusted trial balance at the time of export."), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    # ---- Statements ----
    pdf.add_page()
    _pdf_header(pdf, firm, "FINANCIAL STATEMENTS", data)
    isd = data["income_statement"]
    _pdf_section(pdf, "Statement of profit or loss")
    _pdf_table(pdf, "Income", isd["income"], "Total income", isd["total_income"])
    _pdf_table(pdf, "Expenses", isd["expenses"], "Total expenses", isd["total_expenses"])
    _pdf_row(pdf, "Net profit for the year", isd["net_profit"], bold=True)
    pdf.ln(5)

    bsd = data["balance_sheet"]
    _pdf_section(pdf, "Statement of financial position")
    _pdf_table(pdf, "Assets", bsd["assets"], "Total assets", bsd["total_assets"])
    _pdf_table(pdf, "Liabilities", bsd["liabilities"], "Total liabilities", bsd["total_liabilities"])
    _pdf_table(pdf, "Equity", bsd["equity"], "Total equity", bsd["total_equity"])
    _pdf_row(pdf, "Total liabilities and equity", round(bsd["total_liabilities"] + bsd["total_equity"], 2), bold=True)

    if cf and cf.get("available"):
        _pdf_cashflow(pdf, cf)

    ok = data["balance_check"]["balanced"]
    pdf.ln(3)
    pdf.set_font("helvetica", "B", 9)
    (pdf.set_text_color(21, 122, 94),) if ok else (pdf.set_text_color(200, 30, 30),)
    pdf.cell(0, 6, _safe("Balance check: PASSED — assets equal liabilities and equity" if ok
                         else f"Balance check: FAILED — difference AED {_amt(data['balance_check']['difference'])}"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    # ---- Notes ----
    await _pdf_notes(pdf, engagement_id)

    # ---- Disclosure checklist summary ----
    pdf.add_page()
    _pdf_section(pdf, "Disclosure checklist")
    pdf.ln(2)
    items = (disc or {}).get("items", [])
    for it in items:
        state = "N/A" if not it.get("applies") else ("Disclosed" if it.get("done") else "Open")
        pdf.set_font("helvetica", "", 9)
        pdf.cell(130, 6, _safe(it["title"]))
        pdf.set_font("helvetica", "B", 8.5)
        (pdf.set_text_color(120, 130, 140),) if state == "N/A" else (pdf.set_text_color(21, 122, 94) if state == "Disclosed" else pdf.set_text_color(180, 83, 9),)
        pdf.cell(0, 6, state, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # ---- Appendix A: adjustments register ----
    pdf.add_page()
    _pdf_section(pdf, "Appendix A — Adjusting entries register")
    pdf.ln(2)
    if not ajes:
        pdf.set_font("helvetica", "I", 9)
        pdf.cell(0, 6, "No adjusting entries recorded for this engagement.", new_x="LMARGIN", new_y="NEXT")
    for a in ajes:
        pdf.set_font("helvetica", "B", 9)
        status = a.get("status", "")
        signoff = f" — signed off by {a['signed_off_by']}" if a.get("signed_off_by") else ""
        pdf.multi_cell(0, 5.5, _safe(f"{a.get('ref', 'AJE')}  ·  {status}{signoff}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
        pdf.multi_cell(0, 5, _safe(a.get("description", "")), new_x="LMARGIN", new_y="NEXT")
        pdf.multi_cell(0, 5, _safe(f"Dr {a.get('debit_account', '')}   /   Cr {a.get('credit_account', '')}   —   AED {_amt(a.get('amount', 0))}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # ---- Appendix B: adjusted trial balance ----
    pdf.add_page()
    _pdf_section(pdf, "Appendix B — Adjusted trial balance")
    pdf.ln(2)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(88, 6, "Account")
    pdf.cell(30, 6, "Pre", align="right")
    pdf.cell(30, 6, "Adjustments", align="right")
    pdf.cell(0, 6, "Final", align="right", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 8)
    for acc in final["accounts"]:
        if abs(acc["pre"]) < 0.005 and abs(acc["adj"]) < 0.005 and abs(acc["final"]) < 0.005:
            continue
        pdf.cell(88, 5.5, _safe(acc["account"][:44]))
        pdf.cell(30, 5.5, _amt(acc["pre"]), align="right")
        pdf.cell(30, 5.5, _amt(acc["adj"]) if acc["adj"] else "-", align="right")
        pdf.cell(0, 5.5, _amt(acc["final"]), align="right", new_x="LMARGIN", new_y="NEXT")
    totals_pre = round(sum(a["pre"] for a in final["accounts"]), 2)
    totals_adj = round(sum(a["adj"] for a in final["accounts"]), 2)
    totals_fin = round(sum(a["final"] for a in final["accounts"]), 2)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(88, 6, "Total (net of mapped presentation)")
    pdf.cell(30, 6, _amt(totals_pre), align="right")
    pdf.cell(30, 6, _amt(totals_adj), align="right")
    pdf.cell(0, 6, _amt(totals_fin), align="right", new_x="LMARGIN", new_y="NEXT")

    pdf_bytes = bytes(pdf.output())
    await journal_event(engagement_id, "pack_exported",
                        f"Deliverable pack exported (cover, statements, cash flow, notes, checklist, AJE register, adjusted TB)",
                        by_name=user.get("name") or "User")
    safe_client = re.sub(r"[^a-z0-9]+", "-", (data['client_name'] or 'client').lower()).strip('-')
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="deliverable-pack-{safe_client}.pdf"'})
