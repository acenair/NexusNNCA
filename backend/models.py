"""Models — extracted from server.py without behavior changes."""
from pydantic import BaseModel
from pydantic import ConfigDict
from typing import List
from typing import Optional

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    title: Optional[str] = None
    role: Optional[str] = None
    picture: Optional[str] = None
    created_at: str


class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: str
    created_at: str


class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: str
    name: str
    entity_type: str
    jurisdiction: Optional[str] = None
    trade_licence_no: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_no: Optional[str] = None
    vat_registration_date: Optional[str] = None
    tax_period: Optional[str] = None
    aml_risk_rating: Optional[str] = None
    pep_flag: bool = False
    relationship_manager_id: Optional[str] = None
    status: str = "Active"
    created_at: str
    active_services: List[str] = []
    # Auditflow data-foundation fields (from the firm's client master xlsx)
    trade_name: Optional[str] = None
    emirate: Optional[str] = None
    free_zone: Optional[str] = None
    licensing_authority: Optional[str] = None
    industry: Optional[str] = None
    license_type: Optional[str] = None
    license_expiry: Optional[str] = None
    vat_registered: Optional[bool] = None
    ct_registered: Optional[bool] = None
    financial_year_end: Optional[str] = None
    service_type: Optional[str] = None
    audit_purpose: Optional[str] = None
    audit_period: Optional[str] = None
    previous_auditor: Optional[str] = None
    fee_amount: Optional[float] = None
    workdone_by: Optional[str] = None
    # onboarding-master fields (Audit_CRM_Onboarding_Template)
    contact_name: Optional[str] = None
    contact_designation: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    secondary_contact: Optional[str] = None
    corporate_tax_trn: Optional[str] = None
    lead_source: Optional[str] = None
    referred_by: Optional[str] = None
    onboarding_stage: Optional[str] = None


class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task_id: str
    title: str
    description: Optional[str] = None
    service_module: str
    client_id: Optional[str] = None
    due_date: str
    priority: str
    assigned_to: str
    status: str = "Pending"
    created_by: str
    created_at: str
    completed_at: Optional[str] = None


class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    activity_id: str
    event_type: str
    description: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    user_id: str
    created_at: str


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str
    session_id: str
    user_id: str
    role: str
    content: str
    created_at: str
