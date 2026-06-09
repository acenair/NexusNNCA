# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" based on an uploaded HTML file. Features: Dark Navy (#0a1128) and Gold (#D4AF37) theme, Partner vs. Staff RBAC, complex Dashboard KPIs, Deadline Tracker, Calendar, and specific service modules (Audit, VAT, Corporate, Advisory, AML).

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans fonts
- Backend: FastAPI, Motor (async MongoDB), bcrypt, PyJWT, pywebpush, openpyxl
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations (Emergent LLM Key)
- PWA: Service Worker + manifest.json + Web Push API (VAPID)

## Completed Features (as of 2026-06-09)
1-26. [All previous features — Dashboard, Calendar, Audit/VAT/Corporate/Advisory/AML modules, Settings, RBAC, Workflows, Notifications, AI Assistant, Client Master, Documents, Engagements, Timeline, Exports, Onboarding, Editable Email, Reminders, Billable Hours, Web Push]
27. **Bulk Task Upload** — Partners can upload CSV or Excel files to mass-import tasks. Auto-maps ~40 header variations (Title/Task Name/Subject, Due Date/Deadline, Priority, Assigned To/Assignee, Client/Company, Service Module/Category, Description/Notes, Status). Preview step shows column mapping + data preview before importing. Auto-resolves staff names to emails and client names to IDs. Download CSV template. Partner-only access. Available on Tasks page.

## Testing Status
- Iterations 1-8: 100% pass
- Iteration 9: 100% pass — Client Onboarding
- Iteration 10: 100% pass — Email editing, Reminders, Billable Hours
- Iteration 11: 100% pass — Browser Push Notifications
- Iteration 12: 100% pass — Bulk Task Upload (7 backend + full frontend Playwright)

## Backlog
- P1: Wire actual Storage Sync (S3/Drive/OneDrive)
- P2: Backend refactoring — split server.py (2780+ lines) into modular route files
- P3: Add DELETE /api/tasks/{task_id} endpoint

## Key API Endpoints (New)
- **POST /api/tasks/bulk-preview** (parse file, return headers + column mapping + preview rows)
- **POST /api/tasks/bulk-upload** (parse file, create tasks, return created/error counts)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours, push_subscriptions
