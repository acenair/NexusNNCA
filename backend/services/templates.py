"""Services / templates — engagement checklists + service-specific terms.

Enriched from the firm's master workbooks:
  - Audit_CRM_Onboarding_Template.xlsx (per-service onboarding, status pipeline)
  - Audit_Firm_MultiService_CRM_Template.xlsx (per-service trackers:
    VAT / Accounting / Internal Audit / AML-goAML)
Checklist groups drive engagement phases (phase = first unfinished group).
"""

CHECKLIST_TEMPLATES = {
    "statutory_audit": [
        {"group": "Planning", "items": ["Engagement letter signed", "Risk assessment", "Audit plan", "Materiality memo", "Team briefing", "PBC list sent to client"]},
        {"group": "Fieldwork", "items": ["Revenue testing", "Expense sampling", "Bank confirmations", "Inventory count", "Related party review", "Trial balance review"]},
        {"group": "Review & Reporting", "items": ["Draft report", "Management letter", "Partner review", "Client sign-off", "Filing"]},
        {"group": "Completion", "items": ["Deliver documents to client", "Archive engagement file", "Invoice final payment"]},
    ],
    "internal_audit": [
        {"group": "Scoping", "items": ["Scope definition", "Audit scope / module confirmed", "Risk universe update", "Audit program", "Allocated days planned"]},
        {"group": "Fieldwork", "items": ["Field visit conducted", "Control testing", "Walkthrough", "Sample testing", "Exception analysis"]},
        {"group": "Review & Reporting", "items": ["Closing meeting held", "Draft findings", "Management response", "Report draft due", "Final report"]},
        {"group": "Completion", "items": ["Report delivered", "Follow-up items logged", "Invoice final payment"]},
    ],
    "stock_audit": [
        {"group": "Planning", "items": ["Count instructions issued", "Team briefing", "Location / warehouse list confirmed"]},
        {"group": "Count & Verification", "items": ["Physical count attended", "Tag preparation verified", "Valuation method check (FIFO/Weighted)", "Reconciliation to books"]},
        {"group": "Reporting", "items": ["Count report", "Observations & recommendations", "Client sign-off"]},
    ],
    "fraud_audit": [
        {"group": "Scoping", "items": ["Red-flag assessment", "Scope of review agreed", "Confidentiality protocol"]},
        {"group": "Investigation", "items": ["Transaction analysis", "Document examination", "Interviews", "Evidence preservation"]},
        {"group": "Reporting", "items": ["Findings report", "Quantification of impact", "Recommendations", "Partner review"]},
    ],
    "accounting": [
        {"group": "Collection", "items": ["Documents received", "Bank statements downloaded", "Purchase invoices collected", "Sales invoices collected"]},
        {"group": "Processing", "items": ["Books updated", "Bank reconciliation", "Accruals & prepayments", "Payroll entries"]},
        {"group": "Review & Delivery", "items": ["Manager review", "Management accounts prepared", "Delivered to client"]},
    ],
    "vat_registration": [
        {"group": "Documentation", "items": ["Trade licence copy", "Passport / Emirates ID", "Bank letter", "Turnover evidence"]},
        {"group": "Submission", "items": ["FTA portal application", "Supporting docs upload", "Application review"]},
        {"group": "Completion", "items": ["TRN issued", "Certificate archived", "Client notified"]},
    ],
    "vat_filing": [
        {"group": "Preparation", "items": ["Data collection", "Purchase invoices review", "Sales invoices review", "Input/output VAT reconciliation"]},
        {"group": "Filing", "items": ["Return preparation", "Box amounts calculation", "Review & approval", "FTA portal submission"]},
        {"group": "Completion", "items": ["Payment confirmation", "Filing receipt archived", "Client notification"]},
    ],
    "vat_amendments": [
        {"group": "Assessment", "items": ["Original return review", "Error identification", "Voluntary disclosure assessment"]},
        {"group": "Submission", "items": ["Amendment prepared", "FTA submission", "Supporting documents"]},
        {"group": "Completion", "items": ["Payment / refund confirmation", "Client notified"]},
    ],
    "corporate_registration": [
        {"group": "Documentation", "items": ["Trade licence", "MOA / shareholder docs", "Financials for registration"]},
        {"group": "Submission", "items": ["FTA portal application", "Documents upload", "Review"]},
        {"group": "Completion", "items": ["CT registration certificate received", "Archived", "Client notified"]},
    ],
    "corporate_tax": [
        {"group": "Preparation", "items": ["Financial data collection", "Revenue classification", "Exempt income review", "Deduction analysis"]},
        {"group": "Computation", "items": ["Taxable income calculation", "Tax liability computation", "Small business relief check", "Transfer pricing reference"]},
        {"group": "Filing", "items": ["CT return preparation", "Review & approval", "Portal submission", "Payment processing"]},
        {"group": "Completion", "items": ["Filing receipt archived", "Client notified"]},
    ],
    "aml_review": [
        {"group": "Client Due Diligence", "items": ["KYC documentation current", "Beneficial ownership check", "PEP screening", "Sanctions screening", "KYC renewal date tracked"]},
        {"group": "Transaction Monitoring", "items": ["goAML registration verified", "Unusual transaction review", "Threshold analysis", "SAR / STR assessment"]},
        {"group": "Reporting", "items": ["goAML monthly report prepared", "MLRO review", "Filing submission", "Filing receipt archived"]},
    ],
    "aml_filing": [
        {"group": "Preparation", "items": ["Monthly data collection", "goAML report preparation", "SAR / STR screening"]},
        {"group": "Filing", "items": ["MLRO review", "goAML submission", "Receipt archived"]},
        {"group": "Completion", "items": ["Client notified", "Register updated"]},
    ],
    "aml_reports": [
        {"group": "Compilation", "items": ["Monthly returns summary", "Filings status check", "Exceptions log"]},
        {"group": "Delivery", "items": ["Partner review", "Report delivered to client"]},
    ],
    "due_diligence": [
        {"group": "Scoping", "items": ["Scope agreed", "Document request list sent", "Data room access"]},
        {"group": "Analysis", "items": ["Financial analysis", "Legal / compliance review", "Tax exposure review", "Key risk register"]},
        {"group": "Reporting", "items": ["Findings report", "Red-flag summary", "Partner review", "Delivered"]},
    ],
    "business_valuation": [
        {"group": "Preparation", "items": ["Financial data collected", "Industry benchmarks", "Valuation basis agreed"]},
        {"group": "Modelling", "items": ["DCF / multiples model", "Sensitivity analysis", "Assumptions review"]},
        {"group": "Reporting", "items": ["Valuation report", "Partner review", "Delivered"]},
    ],
    "company_formation": [
        {"group": "Setup", "items": ["Jurisdiction / freezone selected", "Name reservation", "Shareholder documents", "MOA drafted"]},
        {"group": "Licensing", "items": ["Licence application submitted", "Approvals obtained", "Licence issued"]},
        {"group": "Completion", "items": ["Establishment card", "Bank account intro", "Documents handed over"]},
    ],
    "company_liquidation": [
        {"group": "Preparation", "items": ["Shareholder resolution", "Liquidator appointment", "Debt settlement plan"]},
        {"group": "Process", "items": ["FTA de-registration", "Employee final dues", "Licence cancellation application"]},
        {"group": "Completion", "items": ["Cancellation certificate", "Documents archived", "Client notified"]},
    ],
}

# Service-specific engagement terms (from the MultiService tracker workbooks).
# Used by the create dialog and engagement detail view.
SERVICE_TERMS = {
    "vat_filing": [
        {"key": "return_frequency", "label": "Return stagger / frequency", "type": "select", "options": ["Monthly", "Quarterly (Jan-Mar / Apr-Jun)", "Quarterly (Feb-Apr / May-Jul)", "Quarterly (Mar-May / Jun-Aug)", "Quarterly (Apr-Jun / Jul-Sep)", "Quarterly (Jul-Sep / Oct-Dec)", "Quarterly (Oct-Dec / Jan-Mar)"]},
        {"key": "tax_period", "label": "Current tax period", "type": "text"},
        {"key": "fta_due_date", "label": "FTA due date", "type": "date"},
        {"key": "internal_target_date", "label": "Internal target date", "type": "date"},
        {"key": "reminder_buffer_days", "label": "Reminder buffer (days before FTA due)", "type": "number"},
    ],
    "accounting": [
        {"key": "accounting_frequency", "label": "Accounting frequency", "type": "select", "options": ["Monthly", "Quarterly", "Annually"]},
        {"key": "work_location", "label": "Work location", "type": "select", "options": ["In-House (Office)", "Field Visit (On-Site)", "Hybrid (On-Site & Office)"]},
        {"key": "target_completion_days", "label": "Target completion (days post-period)", "type": "number"},
    ],
    "internal_audit": [
        {"key": "audit_scope", "label": "Audit scope / module", "type": "text"},
        {"key": "allocated_days", "label": "Allocated days", "type": "number"},
        {"key": "field_visit_start", "label": "Field visit start", "type": "date"},
        {"key": "field_visit_end", "label": "Field visit end", "type": "date"},
        {"key": "closing_meeting_date", "label": "Closing meeting", "type": "date"},
        {"key": "report_due_date", "label": "Report draft due", "type": "date"},
    ],
    "aml_review": [
        {"key": "risk_classification", "label": "Risk classification", "type": "select", "options": ["Low Risk", "Medium Risk", "High Risk"]},
        {"key": "goaml_status", "label": "goAML registration", "type": "select", "options": ["Active & Verified", "Pending Registration", "Not Registered"]},
        {"key": "reporting_frequency", "label": "Reporting frequency", "type": "select", "options": ["Monthly", "Quarterly", "Event-based"]},
        {"key": "returns_due_date", "label": "Monthly return due date", "type": "date"},
        {"key": "sar_status", "label": "SAR / STR screening", "type": "select", "options": ["Screened - Cleared", "Screened - Pending Review", "Pending Screening"]},
    ],
    "statutory_audit": [
        {"key": "audit_purpose", "label": "Audit purpose", "type": "select", "options": ["Bank Requirement", "License Renewal", "Management Purpose", "FTA Compliance", "Freezone Requirement"]},
        {"key": "audit_period", "label": "Audit period / years", "type": "text"},
    ],
}

# General engagement commercial terms (from the onboarding master)
GENERAL_TERMS = [
    {"key": "payment_terms", "label": "Payment terms", "type": "text", "placeholder": "e.g. 50% Advance, 50% Draft Report"},
    {"key": "quoted_fee", "label": "Quoted fee (AED)", "type": "number"},
    {"key": "engagement_date", "label": "Engagement / proposal date", "type": "date"},
]

# Milestone schedule from payment_terms (billing workspace "Client Billing")
def milestones_from_terms(payment_terms: str, fee: float):
    """Parse '50% Advance, 50% Draft Report' style terms into billing milestones."""
    if not payment_terms or not fee:
        return []
    out = []
    for part in payment_terms.split(","):
        part = part.strip()
        if "%" not in part:
            continue
        pct_str, _, label = part.partition(" ")
        try:
            pct = float(pct_str.replace("%", "")) / 100
        except ValueError:
            continue
        out.append({"label": label.strip() or part, "percent": pct * 100, "amount": round(fee * pct, 2)})
    return out
