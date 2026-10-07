"""Routes / exports — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from fastapi.responses import StreamingResponse
from datetime import datetime
from core import db
from core import get_current_user
from datetime import timezone

router = APIRouter(prefix="/api")


@router.get("/export/audit-report/{engagement_id}")
async def export_audit_report(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    from fpdf import FPDF
    import io

    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Get firm name
    firm_doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    firm_name = firm_doc.get("firm_name", "Nair & Nelliyatt Chartered Accountants") if firm_doc else "Nair & Nelliyatt Chartered Accountants"

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 12, firm_name, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, "Engagement Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)

    # Engagement Info
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, eng.get("service_type", "").replace("_", " ").title(), new_x="LMARGIN", new_y="NEXT")

    info_lines = [
        f"Client: {eng.get('client_name', '—')}",
        f"Assigned To: {eng.get('assigned_to_name', '—')}",
        f"Status: {eng.get('status', '—')}",
        f"Current Phase: {eng.get('phase', '—')}",
        f"Created: {eng.get('created_at', '—')[:10]}",
    ]
    if eng.get("workflow_name"):
        info_lines.append(f"Workflow: {eng.get('workflow_name')}")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    for line in info_lines:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Checklist Progress
    total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
    done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
    progress = round(done / total * 100) if total > 0 else 0

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, f"Checklist Progress: {done}/{total} ({progress}%)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for group in eng.get("checklist", []):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(212, 175, 55)
        pdf.cell(0, 7, group.get("group", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(60, 60, 60)
        for item in group.get("items", []):
            mark = "[x]" if item.get("done") else "[ ]"
            pdf.cell(0, 5, f"  {mark} {item.get('label', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y at %H:%M UTC')} by {user.get('name', '—')}", new_x="LMARGIN", new_y="NEXT", align="C")

    buffer = io.BytesIO()
    pdf.output(buffer)
    buffer.seek(0)

    filename = f"Audit_Report_{eng.get('client_name', 'client').replace(' ', '_')}_{engagement_id[-6:]}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/export/vat-return/{engagement_id}")
async def export_vat_return(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    from fpdf import FPDF
    import io

    user = await get_current_user(authorization, session_token)
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    firm_doc = await db.settings.find_one({"type": "firm"}, {"_id": 0})
    firm_name = firm_doc.get("firm_name", "Nair & Nelliyatt Chartered Accountants") if firm_doc else "Nair & Nelliyatt Chartered Accountants"

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 12, firm_name, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, "VAT Return Summary", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)

    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    # Client info
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(10, 17, 40)
    pdf.cell(0, 8, f"Client: {eng.get('client_name', '—')}", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, f"Filing Status: {eng.get('status', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Current Phase: {eng.get('phase', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Prepared By: {eng.get('assigned_to_name', '—')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Period: {eng.get('created_at', '—')[:10]}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Checklist as filing steps
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(10, 17, 40)
    total = sum(len(g.get("items", [])) for g in eng.get("checklist", []))
    done = sum(1 for g in eng.get("checklist", []) for item in g.get("items", []) if item.get("done"))
    pdf.cell(0, 8, f"Filing Checklist: {done}/{total} steps completed", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for group in eng.get("checklist", []):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(212, 175, 55)
        pdf.cell(0, 7, group.get("group", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(60, 60, 60)
        for item in group.get("items", []):
            status = "Completed" if item.get("done") else "Pending"
            pdf.cell(0, 5, f"  [{status}] {item.get('label', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y at %H:%M UTC')} by {user.get('name', '—')}", new_x="LMARGIN", new_y="NEXT", align="C")

    buffer = io.BytesIO()
    pdf.output(buffer)
    buffer.seek(0)

    filename = f"VAT_Return_{eng.get('client_name', 'client').replace(' ', '_')}_{engagement_id[-6:]}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
