"""Routes / audit — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from core import APP_NAME
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import File
from fastapi import HTTPException
from fastapi import Header
from googleapiclient.http import MediaIoBaseUpload
from typing import Optional
from fastapi import Query
from fastapi import Response
from fastapi.responses import StreamingResponse
from fastapi import UploadFile
import audit_workbook
from datetime import datetime
from core import db
from core import get_current_user
from services.drive import get_drive_service
from core import get_object
from services.drive import get_or_create_drive_folder
import io
from core import log_activity
from core import logger
from core import put_object
from services.push import send_push_to_user
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/audit/engagements")
async def get_audit_engagements(authorization: str = Header(None), session_token: str = Cookie(None), engagement_type: Optional[str] = None):
    user = await get_current_user(authorization, session_token)
    query = {"engagement_type": engagement_type} if engagement_type else {}
    engagements = await db.audit_engagements.find(query, {"_id": 0}).to_list(1000)
    return engagements


@router.post("/audit/engagements")
async def create_audit_engagement(client_id: str, engagement_type: str, period_start: str, period_end: str,
                                 lead_auditor: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    engagement_id = f"audit_{uuid.uuid4().hex[:12]}"
    engagement_doc = {
        "engagement_id": engagement_id,
        "client_id": client_id,
        "client_name": client["name"],
        "engagement_type": engagement_type,
        "period_start": period_start,
        "period_end": period_end,
        "lead_auditor": lead_auditor,
        "phase": "Planning",
        "risk_level": "Medium",
        "status": "Active",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_engagements.insert_one(engagement_doc)
    await log_activity("Audit engagement", f"{engagement_type} audit started for {client['name']}", user["user_id"], client_id, client["name"])
    
    # Return without _id
    return {
        "engagement_id": engagement_id,
        "client_id": client_id,
        "client_name": client["name"],
        "engagement_type": engagement_type,
        "period_start": period_start,
        "period_end": period_end,
        "lead_auditor": lead_auditor,
        "phase": "Planning",
        "risk_level": "Medium",
        "status": "Active",
        "created_at": engagement_doc["created_at"]
    }


def _find_question(template: dict, code: str):
    for sec in template.get("sections", []):
        for q in sec["questions"]:
            if q["code"] == code:
                return sec, q
    return None, None


async def _get_audit_manager_and_partners(client_id: str):
    """Returns (audit_manager_user_id_or_None, [partner_user_ids])"""
    reminder_cfg = await db.settings.find_one({"type": "reminder_config"}, {"_id": 0})
    audit_mapping = reminder_cfg.get("audit_client_mapping", {}) if reminder_cfg else {}
    manager_email = audit_mapping.get(client_id)
    manager_uid = None
    if manager_email:
        manager_doc = await db.users.find_one({"email": manager_email}, {"_id": 0, "user_id": 1})
        manager_uid = manager_doc["user_id"] if manager_doc else None
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "user_id": 1}).to_list(50)
    return manager_uid, [p["user_id"] for p in partners]


@router.get("/audit/template")
async def get_audit_template(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    template = await db.audit_templates.find_one({"template_id": audit_workbook.TEMPLATE_ID}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Audit template not found")
    return template


class StartAuditRequest(BaseModel):
    period: str
    roll_forward_from: Optional[str] = None


@router.post("/audit/engagements/{engagement_id}/start")
async def start_client_audit(engagement_id: str, req: StartAuditRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    eng = await db.service_engagements.find_one({"engagement_id": engagement_id}, {"_id": 0})
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    template = await db.audit_templates.find_one({"template_id": audit_workbook.TEMPLATE_ID}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Audit template not found")

    responses = {}
    rolled_from = None
    if req.roll_forward_from:
        source = await db.client_audits.find_one({"audit_id": req.roll_forward_from, "client_id": eng["client_id"]}, {"_id": 0})
        if source:
            responses = audit_workbook.roll_forward_responses(template, source.get("responses", {}))
            rolled_from = req.roll_forward_from

    audit_id = f"audit_{uuid.uuid4().hex[:12]}"
    audit_doc = {
        "audit_id": audit_id,
        "engagement_id": engagement_id,
        "client_id": eng["client_id"],
        "client_name": eng.get("client_name"),
        "template_id": audit_workbook.TEMPLATE_ID,
        "period": req.period,
        "status": "in_progress",
        "responses": responses,
        "rolled_forward_from": rolled_from,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    }
    await db.client_audits.insert_one(audit_doc)
    audit_doc.pop("_id", None)
    await log_activity("Audit workbook started", f"{req.period} audit started for {eng.get('client_name')}", user["user_id"], eng["client_id"], eng.get("client_name"))
    return audit_doc


@router.get("/audit/engagements/{engagement_id}")
async def list_engagement_audits(engagement_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    template = await db.audit_templates.find_one({"template_id": audit_workbook.TEMPLATE_ID}, {"_id": 0})
    audits = await db.client_audits.find({"engagement_id": engagement_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for a in audits:
        _, overall_pct, done, total = audit_workbook.compute_progress(template, a.get("responses", {}))
        a["overall_pct"] = overall_pct
        a["questions_done"] = done
        a["questions_total"] = total
    return audits


@router.get("/audit/client/{client_id}/history")
async def get_client_audit_history(client_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    audits = await db.client_audits.find({"client_id": client_id}, {"_id": 0, "responses": 0}).sort("created_at", -1).to_list(100)
    return audits


@router.get("/audit/clients-summary")
async def get_audit_clients_summary(authorization: str = Header(None), session_token: str = Cookie(None)):
    """Latest audit snapshot per client — for the Client Master dashboard card."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    template = await db.audit_templates.find_one({"template_id": audit_workbook.TEMPLATE_ID}, {"_id": 0})
    all_audits = await db.client_audits.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    summary = {}
    for a in all_audits:
        cid = a.get("client_id")
        if not cid or cid in summary:
            continue
        responses = a.get("responses", {})
        flagged_count = sum(1 for r in responses.values() if r.get("flagged"))
        overall_pct, done, total = 0, 0, 0
        if template:
            _, overall_pct, done, total = audit_workbook.compute_progress(template, responses)
        summary[cid] = {
            "audit_id": a["audit_id"], "engagement_id": a["engagement_id"], "period": a["period"],
            "status": a["status"], "overall_pct": overall_pct, "flagged_count": flagged_count,
            "questions_done": done, "questions_total": total,
        }
    return summary


@router.get("/audit/{audit_id}")
async def get_client_audit(audit_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    template = await db.audit_templates.find_one({"template_id": audit["template_id"]}, {"_id": 0})
    section_progress, overall_pct, done, total = audit_workbook.compute_progress(template, audit.get("responses", {}))
    return {"audit": audit, "template": template, "section_progress": section_progress, "overall_pct": overall_pct, "questions_done": done, "questions_total": total}


class SaveResponseRequest(BaseModel):
    value: Optional[str] = None
    remarks: Optional[str] = None


@router.patch("/audit/{audit_id}/responses/{code}")
async def save_audit_response(audit_id: str, code: str, req: SaveResponseRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    template = await db.audit_templates.find_one({"template_id": audit["template_id"]}, {"_id": 0})
    sec, question = _find_question(template, code)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in template")

    previous = (audit.get("responses", {}) or {}).get(code, {})
    was_flagged = previous.get("flagged", False)
    is_flagged = question["type"] == "yes_no" and (req.value or "").strip().lower() == "no"

    update = {
        f"responses.{code}.value": req.value,
        f"responses.{code}.remarks": req.remarks,
        f"responses.{code}.flagged": is_flagged,
        f"responses.{code}.updated_by": user["user_id"],
        f"responses.{code}.updated_by_name": user.get("name"),
        f"responses.{code}.updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_audits.update_one({"audit_id": audit_id}, {"$set": update})

    if is_flagged and not was_flagged:
        manager_uid, partner_uids = await _get_audit_manager_and_partners(audit["client_id"])
        title = f"Audit Flag — {audit.get('client_name')}"
        body = f"{sec['name']}: \"{question['text'][:80]}\" answered No"
        notify_uids = set(partner_uids)
        if manager_uid:
            notify_uids.add(manager_uid)
        for uid in notify_uids:
            await send_push_to_user(uid, title, body, f"/app/service/engagements/{audit['engagement_id']}", "nn-audit-flag")
        await log_activity("Audit flag raised", f"{body} for {audit.get('client_name')}", user["user_id"], audit["client_id"], audit.get("client_name"))

    updated = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    section_progress, overall_pct, done, total = audit_workbook.compute_progress(template, updated.get("responses", {}))
    return {"response": updated["responses"].get(code), "overall_pct": overall_pct, "section_progress": section_progress}


@router.post("/audit/{audit_id}/responses/{code}/upload")
async def upload_audit_attachment(audit_id: str, code: str, file: UploadFile = File(...), authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/audits/{audit_id}/{code}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")

    drive_link = None
    try:
        service = await get_drive_service()
        if service:
            folder_name = f"{audit.get('client_name', 'Client')} - Audit {audit.get('period', '')}"
            folder_id = await get_or_create_drive_folder(service, folder_name)
            media = MediaIoBaseUpload(io.BytesIO(data), mimetype=file.content_type or "application/octet-stream")
            drive_file = service.files().create(body={"name": file.filename, "parents": [folder_id]}, media_body=media, fields="id,webViewLink").execute()
            drive_link = drive_file.get("webViewLink")
    except Exception as e:
        logger.warning(f"Audit attachment Drive sync skipped: {e}")

    update = {
        f"responses.{code}.attachment_path": result["path"],
        f"responses.{code}.attachment_name": file.filename,
        f"responses.{code}.drive_link": drive_link,
        f"responses.{code}.updated_by": user["user_id"],
        f"responses.{code}.updated_by_name": user.get("name"),
        f"responses.{code}.updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_audits.update_one({"audit_id": audit_id}, {"$set": update})
    return {"attachment_name": file.filename, "drive_link": drive_link}


@router.get("/audit/{audit_id}/responses/{code}/download")
async def download_audit_attachment(audit_id: str, code: str, authorization: str = Header(None), session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header, session_token)
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    resp = (audit.get("responses", {}) or {}).get(code, {})
    if not resp.get("attachment_path"):
        raise HTTPException(status_code=404, detail="No attachment found")
    data, content_type = get_object(resp["attachment_path"])
    return Response(content=data, media_type=content_type)


@router.post("/audit/{audit_id}/complete")
async def complete_client_audit(audit_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Not available for this role")
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    await db.client_audits.update_one(
        {"audit_id": audit_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat(), "completed_by": user["user_id"], "completed_by_name": user.get("name")}}
    )
    await log_activity("Audit workbook completed", f"{audit.get('period')} audit completed for {audit.get('client_name')}", user["user_id"], audit["client_id"], audit.get("client_name"))
    return {"message": "Audit marked as completed"}


@router.get("/audit/{audit_id}/export.xlsx")
async def export_audit_xlsx(audit_id: str, authorization: str = Header(None), session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header, session_token)
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    template = await db.audit_templates.find_one({"template_id": audit["template_id"]}, {"_id": 0})
    buffer = audit_workbook.generate_xlsx_export(template, audit)
    filename = f"Audit_{audit.get('client_name','client').replace(' ', '_')}_{audit.get('period','').replace(' ', '_')}.xlsx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/audit/{audit_id}/export.pdf")
async def export_audit_pdf(audit_id: str, authorization: str = Header(None), session_token: str = Cookie(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header, session_token)
    audit = await db.client_audits.find_one({"audit_id": audit_id}, {"_id": 0})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    template = await db.audit_templates.find_one({"template_id": audit["template_id"]}, {"_id": 0})
    buffer = audit_workbook.generate_pdf_export(template, audit)
    filename = f"Audit_{audit.get('client_name','client').replace(' ', '_')}_{audit.get('period','').replace(' ', '_')}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
