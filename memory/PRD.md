# PRD — Nair & Nelliyatt Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" featuring a Dark Navy (#0a1128) and Gold (#D4AF37) theme.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn/UI
- **Backend:** FastAPI (Python) + MongoDB (Motor)
- **Auth:** Email/password login, JWT sessions, forced password change on first login
- **Integrations:** Web Push (VAPID), Google Drive (Storage Sync), Gemini 3 Flash (AI Assistant)
- **Backend structure:** `server.py` is a 77-line composition root registering 25 domain routers in `backend/routes/`; shared helpers live in `backend/services/`, startup/seeding/indexes in `backend/lifecycle.py`, general models in `backend/models.py`. `core.py` remains the single shared MongoDB/auth/storage context. See `backend/ARCHITECTURE.md`.

## What's Been Implemented
- Full dashboard with KPI cards, activity feed, calendar
- Client Master with timeline, engagement management, audit summary card
- Digital Audit Workbook (25-sheet DB-driven interface, progress tracking, uploads, PDF/Excel export)
- Invoice management, Document management, Workflow engine
- Client Portal (documents, workflow, invoices)
- Deadline Tracker, Calendar, Staff Appreciation, Reminders
- Audit modules (Statutory, Internal, Stock, Fraud)
- VAT (Registration, Filing, Amendments), Corporate (Registration, Tax, Formation, Liquidation)
- Advisory (Valuation, Due Diligence), AML (Review, Filing, Reports)
- AI Assistant (Gemini 3 Flash)
- Web Push Notifications, Storage Sync (Google Drive)
- Client Onboarding flow
- Settings (Firm & Users management, partner password resets)

## Security (Completed)
- Google OAuth removed; email/password only login
- Forced password change on first login (`must_change_password` flag)
- Staff directory gated behind authentication
- 403 PASSWORD_CHANGE_REQUIRED interceptor on both api.js and global axios
- ProtectedRoute re-validates user on every route change
- Self-service forgot-password with partner-issued 6-digit codes
- Partner-initiated password resets with temp passwords

## User Management (Completed 2026-10-07)
- Partners can add new users via Settings > Firm & Users > "Add User"
- Auto-generated temporary password shown once, user forced to change on first login
- Full HR profile editing with sectioned modal:
  - **Personal**: Name (editable), Email, Date of Birth, Gender, Address
  - **Role & Organization**: Role, Department, Title, Date of Joining
  - **Identity & Visa**: Emirates ID, Passport Number & Expiry, Visa Status & Expiry
  - **Contact & Emergency**: Notification Email, Phone/WhatsApp, Emergency Contact (name + phone)
  - **Security**: Password change
- Team Members table shows Contact column
- Admin account: srinivas.anup@gmail.com (Managing Partner)

## Dynamic Client Onboarding (Completed 2026-10-07)
- Rebuilt Client Onboarding into five responsive sections: Company, Tax & Compliance, Dynamic Service Setup, Commercials & Pipeline, and Contacts.
- A client can now hold multiple independent service onboarding records; each record has one selected service type, its own six-stage pipeline, document requirements, and CRM sheet mapping.
- Supported services and mappings: Audit → Master Sheet; Corporate Tax Return Filing; Internal Audit; AML Consultancy; Accounting; VAT Consultancy.
- Service-specific fields follow the requested visibility rules, including purpose, period, previous auditor, corporate tax TRN, and financial year end.
- Added a Client Details pipeline tracker with stage-specific action prompts and upload slots: KYC documents, proposal, signed engagement/payment proof, and Stage 5 PBC list/trial balance.
- Stage 5 is protected by advance payment confirmation and creates a linked service engagement. Stage 6 requires a lost reason and supports an optional re-engagement date.
- Client Master now opens the latest deterministic pipeline and retains a legacy-route fallback for older client records.
- Login submit button now exposes `data-testid="login-submit-button"` for reliable end-to-end testing.

## Prioritized Backlog

### P0 — Engineering Foundation (Completed 2026-10-07)
- Split the 4,150-line `server.py` into 25 domain `APIRouter` modules; entry point now 77 lines.
- Extracted reusable auth helpers, checklist templates, Drive and push helpers into `services/`, and initialization into `lifecycle.py`.
- Preserved all 135 API operations / 109 paths, all 192 original function/class signatures and bodies, business constants, database logic, middleware and startup ordering.
- No frontend, dependency, environment, credential or authentication-policy changes. No new mocked flows or integrations.
- Added permanent schema/AST/route-resolution/shared-DB regression tests and backend architecture documentation.
- No remaining P0 blockers.

### P1 — User Verification
- Review the new multi-service onboarding and tracker experience with live firm workflows.

### P2
- Audit Flag Digest (Partner Dashboard widget for open red-flags)
- Accounting Sync (Tally/Xero/QuickBooks → Audit Workbook)

### P3 — Future
- Security Phase 2 (lockout after failed logins, audit trail for resets)
- Consider unique session-token identifiers: same-user logins within one second can currently produce identical JWTs (pre-existing behavior, intentionally unchanged in P0).
- Security Phase 3 (email/SMS codes, partner 2FA, re-evaluate Google sign-in)
- Notification delivery via email/SMS using notification_email and phone fields

## Key Data Models
- `users`: user_id, email, name, title, role, password, must_change_password, status, notification_email, phone, date_of_birth, gender, emirates_id, passport_number, passport_expiry, visa_status, visa_expiry, emergency_contact_name, emergency_contact_phone, address, department, date_of_joining
- `client_audits`: audit_id, engagement_id, client_id, template_id, status, progress, flagged_count, answers
- `user_sessions`: user_id, session_token, expires_at

## Key API Endpoints
- POST /api/auth/login, GET /api/auth/me, POST /api/auth/change-password
- POST /api/auth/forgot-password, POST /api/auth/admin-reset-password
- GET /api/settings/users, POST /api/settings/users, PATCH /api/settings/users/{user_id}
- POST /api/audit/start, PATCH /api/audit/{id}/answer
- POST /api/onboarding, GET/PATCH /api/onboarding/{onboarding_id}
- GET /api/onboarding/client/{client_id}, POST /api/onboarding/{onboarding_id}/documents

## Latest Verification (2026-10-07)
- P0 regression pack: **26/26 passed** across structural compatibility, authentication/permissions, all 25 route families, task/workflow/finance CRUD, billable-hours export, and the 7 onboarding pipeline/document-upload tests.
- Tightened checks after testing: runtime duplicate detection, actual Starlette route precedence for all 135 operations, and exact expected HTTP statuses across all route families. **13/13 targeted rechecks passed** (a subset of the 26, not additional unique tests).
- Complete OpenAPI schema matches the frozen pre-refactor schema exactly; all original function/class bodies and constants are AST-equivalent.
- Browser login/dashboard and major-screen navigation passed. Direct targeted verification confirmed `login-submit-button`, Client Master → Stage 5 tracker, nonempty stage action, and both PBC/Trial Balance slots, including the legacy client-only URL.
- The testing agent's two UI findings in `iteration_20.json` did not reproduce in targeted checks; existing frontend fixes were already present. No frontend modifications were needed. Final disposition: `test_reports/p0_final_verification.json`.
- Test artifacts: `test_reports/pytest/pytest_results_iter21.xml` (26 passed), `test_reports/pytest/p0_final_checks.xml` (13 passed), and `test_reports/p0_baseline/` (frozen API/source fixtures).
- Live AI generation, Google Drive OAuth/sync, and actual device push delivery were not revalidated end-to-end; integration implementations were only relocated unchanged. Document storage upload was exercised by the onboarding suite.
- Next action: P1 user review of multi-service onboarding against firm workflows. P2 remains audit-flag digest and accounting sync; P3 remains security enhancements.
