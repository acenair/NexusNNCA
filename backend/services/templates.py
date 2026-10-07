"""Services / templates — extracted from server.py without behavior changes."""


CHECKLIST_TEMPLATES = {
    "statutory_audit": [
        {"group": "Planning", "items": ["Engagement letter", "Risk assessment", "Audit plan", "Materiality memo", "Team briefing"]},
        {"group": "Fieldwork", "items": ["Revenue testing", "Expense sampling", "Bank confirmations", "Inventory count", "Related party review"]},
        {"group": "Review & Reporting", "items": ["Draft report", "Management letter", "Partner review", "Client sign-off", "Filing"]},
    ],
    "internal_audit": [
        {"group": "Scoping", "items": ["Scope definition", "Risk universe update", "Audit program"]},
        {"group": "Testing", "items": ["Control testing", "Walkthrough", "Sample testing", "Exception analysis"]},
        {"group": "Reporting", "items": ["Draft findings", "Management response", "Final report"]},
    ],
    "vat_filing": [
        {"group": "Preparation", "items": ["Data collection", "Purchase invoices review", "Sales invoices review", "Reconciliation"]},
        {"group": "Filing", "items": ["Return preparation", "Box amounts calculation", "Review & approval", "FTA portal submission"]},
        {"group": "Completion", "items": ["Payment confirmation", "Filing receipt archive", "Client notification"]},
    ],
    "vat_registration": [
        {"group": "Documentation", "items": ["Trade licence copy", "Passport / Emirates ID", "Bank letter", "Turnover evidence"]},
        {"group": "Submission", "items": ["FTA portal application", "Supporting docs upload", "Application review"]},
        {"group": "Completion", "items": ["TRN issued", "Certificate archived", "Client notified"]},
    ],
    "corporate_tax": [
        {"group": "Preparation", "items": ["Financial data collection", "Revenue classification", "Exempt income review", "Deduction analysis"]},
        {"group": "Computation", "items": ["Taxable income calculation", "Tax liability computation", "Small business relief check"]},
        {"group": "Filing", "items": ["CT return preparation", "Review & approval", "Portal submission", "Payment processing"]},
    ],
    "aml_review": [
        {"group": "Client Due Diligence", "items": ["KYC documentation", "Beneficial ownership check", "PEP screening", "Sanctions screening"]},
        {"group": "Transaction Monitoring", "items": ["Unusual transaction review", "Threshold analysis", "STR assessment"]},
        {"group": "Reporting", "items": ["goAML report preparation", "MLRO review", "Filing submission"]},
    ],
}
