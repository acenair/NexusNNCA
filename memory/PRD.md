# PRD — Nair & Nelliyatt Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" featuring a Dark Navy (#0a1128) and Gold (#D4AF37) theme.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn/UI
- **Backend:** FastAPI (Python) + MongoDB (Motor)
- **Auth:** Email/password login, JWT sessions, forced password change on first login
- **Integrations:** Web Push (VAPID), Google Drive (Storage Sync), Gemini 3 Flash (AI Assistant)

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

## Prioritized Backlog

### P1 — Next Up
- Ageing Report Dashboard (unpaid/overdue invoices + staff alerts)
- Proposal Manager (partner-created proposals from templates)
- Per-User Access / RBAC (hide sidebar sections per staff member)

### P2
- Audit Flag Digest (Partner Dashboard widget for open red-flags)
- Accounting Sync (Tally/Xero/QuickBooks → Audit Workbook)

### P3 — Future
- Security Phase 2 (lockout after failed logins, audit trail for resets)
- Security Phase 3 (email/SMS codes, partner 2FA, re-evaluate Google sign-in)
- Backend Refactoring (split server.py ~3800+ lines into /routes/ modules)
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
