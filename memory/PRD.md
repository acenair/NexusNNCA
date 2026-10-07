# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Tech Stack
- Frontend: React + CRACO, Tailwind CSS, Shadcn UI
- Backend: FastAPI + core.py (shared logic) + server.py (routes)
- Database: MongoDB (Motor)
- AI: Gemini 3 Flash (emergentintegrations)
- Auth: JWT + Google OAuth + localStorage token
- Storage: Emergent Object Storage + Google Drive (configurable)

## Architecture (Post-Refactor)
```
/app/backend/
  core.py          # Shared: db, auth helpers, storage, logging (single source of truth)
  server.py        # All API routes (imports from core.py)
  routes/          # Future: route modules
/app/frontend/src/
  App.js           # Global axios interceptor, routing
  components/      # MainLayout, ClientLayout, ProtectedRoute
  pages/           # All page components
  lib/api.js       # Shared axios instance (optional)
```

## Completed Features (41 total)
1-37. [All previous features]
38. **Invoice Management Page** — Full CRUD for partners. Summary cards (Total/Paid/Unpaid). Search + client/status filters. Toggle payment status. Create/edit modal. Sidebar item under Overview.
39. **Bypass Approval + Service Reminders (Run 1)** — Partner "Quick Approve" on engagements; AML reminders routed exclusively to a designated staff; Audit reminders routed per-client via Settings > Reminder Routing.
40. **Bug fixes (2026-09-03)** — AML/Audit reminder routing made exclusive ($nor exclusion so tasks don't double-appear); reminder payload now shows effective assignee (`assigned_to`/`assigned_to_email`). Settings mobile layout: tabs row now horizontally scrollable, audit-mapping rows wrap, `.main-content` gets `overflow-x:hidden` on mobile. Fixed pre-existing lint blockers (duplicate `require_partner`, undefined `client` at shutdown, bare `clients` global in sw.js).
41. **Digital Audit Workbook (2026-09-03)** — Digitized the firm's 25-sheet statutory audit Excel checklist (295 answerable questions across 25 sections: Cover Page, Legal Documents, Fixed Assets, Inventories, Receivables, Deposits, Prepaid Exp, Related Party, Cash & Bank, Capital, Reserves, EOS Benefits, Bank Borrowings NCL/CL, Payables, Accrued Liabilities, Revenue, COGS, G&A, Depreciation, Finance Charges, Other Income, Managerial Remuneration). Nested as an "Audit Workbook" tab inside Engagement Detail (only for statutory/internal/stock/fraud audit engagements). Features: dynamic Yes/No + text + file-upload questions, per-section + overall progress bars, critical-flag auto-notification (any "No" answer notifies all Partners + the client's designated Audit Manager from Settings > Reminder Routing), file attachments via Emergent Object Storage + best-effort Google Drive sync, roll-forward of Cover Page/Legal Docs answers into new-year audits, Excel export (openpyxl, 25-sheet replica) and PDF export (fpdf2) buttons, Mark Complete / Start New Period flow.

## Digital Audit Workbook — Architecture
- `backend/audit_workbook.py`: `parse_template()` (parses `seed_data/audit_index.xls` → sections/questions, dedupes codes, marks label vs answerable rows), `seed_audit_template()` (idempotent startup seed, `TEMPLATE_ID = std_statutory_audit_v2`), `compute_progress()`, `roll_forward_responses()`, `generate_xlsx_export()`, `generate_pdf_export()`.
- Mongo collections: `audit_templates` (1 doc, reference data), `client_audits` (per-engagement instances, `responses: {code: {value, remarks, flagged, attachment_path, attachment_name, drive_link, ...}}` embedded dict — question codes always use `_` not `.` to avoid Mongo dot-notation `$set` corruption).
- Routes (`server.py`, `/api/audit/*`): `GET /template`, `POST /engagements/{id}/start`, `GET /engagements/{id}`, `GET /client/{client_id}/history`, `GET /{audit_id}`, `PATCH /{audit_id}/responses/{code}`, `POST /{audit_id}/responses/{code}/upload`, `GET /{audit_id}/responses/{code}/download`, `POST /{audit_id}/complete`, `GET /{audit_id}/export.xlsx`, `GET /{audit_id}/export.pdf`.
- Frontend: `pages/AuditWorkbook.js` (container: start form, section sidebar, progress), `components/AuditQuestionRow.js` (per-question input renderer), wired into `pages/EngagementDetail.js` via a Checklist/Audit Workbook tab switcher.
- Audit Manager per client = reuses existing `settings.reminder_config.audit_client_mapping` (no new Client model field needed).

## Auth Flow
- Token stored in both localStorage AND cookie
- Global axios interceptor sends Bearer token on ALL requests
- Backend prioritizes Authorization header over cookie
- Works on custom domains (app.nairnelliyatt.com)

## Client Master — Audit Summary Card (2026-09-03)
- New `GET /api/audit/clients-summary` endpoint (server.py, placed before `/audit/{audit_id}` to avoid route-matching collision) returns each client's latest audit (period, status, overall_pct, flagged_count).
- `ClientMaster.js` gets a new "Audit Status" column: shows period/status/progress/flag-count badge, or "No audit yet". Clicking navigates to `/app/engagements/{engagement_id}` with `location.state.defaultTab='audit'`, which `EngagementDetail.js` reads to auto-open the Audit Workbook tab.
- Verified end-to-end via screenshot: card renders correctly empty and populated, click-through lands directly on the pre-filled workbook.

## Security Sync & Password Management (2026-10-07)
- Cherry-picked GitHub commit `f5ce02d` (public repo `acenair/NexusNNCA`, clean fast-forward): `/api/auth/users-list` now requires auth (401 anonymous), new public `/api/auth/login-directory` (names/titles only, no emails/roles), `/api/files/{file_id}` scoped — client role can't fetch another client's document (403), added DB indexes.
- Login rewritten to plain email+password form (card picker removed earlier, Google OAuth button now also removed). Backend `/auth/session` (Google OAuth) returns 410 Gone — feature disabled, code left in place behind the raise for an easy Phase-3 re-enable.
- Forced password change: `core.py` split into `get_current_user_raw()` (session+user lookup, no gate — used only by `/auth/me`, `/auth/logout`, `/auth/change-password`) and `get_current_user()` (raw + raises 403 `PASSWORD_CHANGE_REQUIRED` if `must_change_password=true`). One-time idempotent startup migration (`migrate_force_password_change()`, marker doc `settings.type="security_migration_v1"`) flagged all 14 existing users. Frontend `ProtectedRoute.js` redirects to `/change-password` for any role whenever the flag is set.
- New endpoints: `POST /auth/change-password` (current+new password, keeps current session, kills all others), `POST /auth/forgot-password` (always generic response, anti-enumeration), `POST /auth/reset-password` (email+6-digit code+new password, auto-login, kills all sessions), `POST /settings/users/{id}/reset-password` (partner, random 12-char temp password shown once, forces gate, kills sessions), `GET /settings/password-reset-requests` (partner, pending self-service requests), `POST /settings/users/{id}/generate-reset-code` (partner, 6-digit code/30min expiry, shown once).
- New frontend pages: `ChangePassword.js`, `ForgotPassword.js`, `ResetPassword.js`. `Settings.js` > Firm & Users tab gained a "Pending Password Reset Requests" card + "Reset Password" button per user + shared one-time secret-reveal modal.
- `MIN_PASSWORD_LENGTH = 10`, no other complexity rules. Logout (`/auth/logout`) deletes the exact `session_token` doc from the DB-backed `user_sessions` collection (sessions are server-side, not stateless-JWT-only).
- Tested: 14/14 backend pytest + full frontend E2E (testing_agent iteration_18, 100% pass, no bugs). Deployed to production — see CHANGELOG/next session notes for live-URL verification results.

## Backlog
- Per-user RBAC section hiding
- Run 2: Ageing report dashboard for unpaid/overdue invoices
- Run 3: Proposal Manager + Reports module
- Further backend route splitting into /routes/ directory (server.py ~3600 lines)
- Accounting integration (Tally/Xero/QuickBooks) for auto-pulling Trial Balance figures — out of scope, flagged as future by user's blueprint
