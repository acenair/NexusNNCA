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
- Public login-directory shows names only (no emails)
- Self-service forgot-password with partner-issued 6-digit codes
- Partner-initiated password resets with temp passwords
- 403 PASSWORD_CHANGE_REQUIRED interceptor on both api.js and global axios (Bug fix 2026-10-07)
- ProtectedRoute re-validates user on every route change (Bug fix 2026-10-07)

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
- Backend Refactoring (split server.py ~3800 lines into /routes/ modules)

## Key Data Models
- `users`: user_id, email, name, title, role, password, must_change_password, status
- `client_audits`: audit_id, engagement_id, client_id, template_id, status, progress, flagged_count, answers
- `user_sessions`: user_id, session_token, expires_at

## Key API Endpoints
- POST /api/auth/login — email/password login
- GET /api/auth/me — current user (ungated, returns must_change_password)
- POST /api/auth/change-password — forced + voluntary password change
- POST /api/auth/forgot-password — request reset
- POST /api/auth/admin-reset-password — partner-initiated reset
- POST /api/audit/start, PATCH /api/audit/{id}/answer — audit workbook
