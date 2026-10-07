"""Routes / workflows — extracted from server.py without behavior changes."""
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi import Cookie
from fastapi import HTTPException
from fastapi import Header
from typing import List
from typing import Optional
from datetime import datetime
from core import db
from core import require_partner
from datetime import timezone
import uuid

router = APIRouter(prefix="/api")


@router.get("/settings/workflows")
async def get_workflows(authorization: str = Header(None), session_token: str = Cookie(None), service_type: Optional[str] = None):
    user = await require_partner(authorization, session_token)
    query = {"is_deleted": {"$ne": True}}
    if service_type:
        query["service_type"] = service_type
    wfs = await db.workflows.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    return wfs


class WorkflowStep(BaseModel):
    name: str
    description: Optional[str] = ""
    order: int


class CreateWorkflowRequest(BaseModel):
    name: str
    service_type: str
    steps: List[WorkflowStep]
    is_preset: bool = False


@router.post("/settings/workflows")
async def create_workflow(req: CreateWorkflowRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    wf_id = f"wf_{uuid.uuid4().hex[:12]}"
    wf_doc = {
        "workflow_id": wf_id,
        "name": req.name,
        "service_type": req.service_type,
        "steps": [s.model_dump() for s in req.steps],
        "is_preset": req.is_preset,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.workflows.insert_one(wf_doc)
    wf_doc.pop("_id", None)
    return wf_doc


class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = None
    steps: Optional[List[WorkflowStep]] = None


@router.patch("/settings/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, req: UpdateWorkflowRequest, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    update = {}
    if req.name:
        update["name"] = req.name
    if req.steps is not None:
        update["steps"] = [s.model_dump() for s in req.steps]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.workflows.update_one({"workflow_id": workflow_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"message": "Workflow updated"}


@router.delete("/settings/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await require_partner(authorization, session_token)
    result = await db.workflows.update_one({"workflow_id": workflow_id}, {"$set": {"is_deleted": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"message": "Workflow deleted"}
