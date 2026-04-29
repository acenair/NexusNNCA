# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" based on an uploaded HTML file. Features: Dark Navy (#0a1128) and Gold (#D4AF37) theme, Partner vs. Staff RBAC, complex Dashboard KPIs, Deadline Tracker, Calendar, and specific service modules (Audit, VAT, Corporate, Advisory, AML).

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans fonts
- Backend: FastAPI, Motor (async MongoDB), bcrypt, PyJWT
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations (Emergent LLM Key)
- PWA: Service Worker + manifest.json

## Core Requirements
- Dark Navy + Gold branding throughout
- Partner vs Staff RBAC (partners see Appreciation, Meeting, Follow-up buttons)
- Collapsible sidebar with nested sections
- Mobile-responsive with hamburger menu overlay
- PWA-compliant for mobile optimization

## Completed Features (as of 2026-04-29)
1. Dashboard with KPI cards (Active Clients, Overdue Tasks, Filings, AML Alerts)
2. Deadline Tracker page (data-driven from real engagements)
3. Calendar page — fully responsive
4. Service module UI pages (Statutory Audit, Internal Audit, Stock Audit, Fraud Audit, VAT Registration/Filing/Amendments, Corporate Registration/Tax/Formation/Liquidation, Advisory Valuation/Due Diligence, AML Review/Filing/Reports)
5. CRUD: + New Task modal, + Meeting modal, Follow-up modal, Appreciation modal
6. Collapsible sidebar with nested submenus
7. Mobile responsive layout with hamburger menu
8. PWA: manifest.json + service worker
9. AI Compliance Assistant — Gemini 3 Flash, context-aware, session management
10. Staff Appreciation (partner-only)
11. User seeding (11 team members)
12. Client seeding (10 demo clients)
13. Client Master — Managing Partner-only section
14. Document Checklist — Upload files linked to clients
15. Service Engagements — Unified backend with interactive checklists
16. Settings: Access Control (RBAC) — Section-level toggles, live sidebar filtering
17. Settings: Storage Integration — Config UI for AWS S3, Google Drive, OneDrive
18. Settings: Workflows — Visual step builder with drag-to-reorder
19. Workflow-Linked Engagements — Auto-generates checklists from workflow templates
20. Push Notifications & Deadline Reminders — Bell UI, dismiss, browser push prompt
21. Settings: Firm & Users — Firm name, user management, role/password/DOJ/email editing
22. Tasks Page — Staff vs Partner views, priority dots, overdue indicators
23. Client Activity Timeline (360° View) — Chronological view of all client activity
24. Export/Reporting — PDF generation using fpdf2
25. Engagement Detail Page — Full interactive checklist, edit panel, Export PDF
26. Data-Driven Deadline Tracker — Real engagements, workload distribution, tabs
27. Client Onboarding Workflow — 5-step wizard, auto-creates client + tasks + engagements
28. **Editable User Email** — Partners can edit any user's email in Settings, with uniqueness validation
29. **Data-Driven Reminders with Deep Dive** — Real-time reminders from tasks, events, engagements. Clickable detail view showing type (task/event/engagement), status, due date, assignee, client, service module, description. Filter chips (All/Tasks/Events/Engagements). Summary sidebar with stats and breakdown.
30. **Staff Billable Hours** — Under Settings > Billable Hours tab. Manual time entry (Log Hours modal). Summary cards (total hours, entries, active staff). Three views: Time Entries table, By Staff breakdown, By Client breakdown. Filters (staff, client, date range). CSV export per individual staff or full team. RBAC: partners see all, staff see own entries only.

## Testing Status
- Iterations 1-8: 100% pass (all initial features)
- Iteration 9: 100% pass — Client Onboarding Workflow
- Iteration 10: 100% pass — Email editing, Reminders deep-dive, Billable Hours (14 backend + all UI)

## Backlog
- P1: Wire storage integration to actual S3/Drive/OneDrive for file sync
- P2: Browser push notifications (actual Web Push API)
- P3: Backend refactoring — split server.py (2400+ lines) into modular route files

## Key API Endpoints
- POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/dashboard/stats
- POST/GET /api/tasks, PATCH /api/tasks/{id}
- POST/GET /api/events
- POST /api/ai/chat, GET /api/ai/sessions
- POST /api/appreciations
- GET /api/clients, PATCH /api/clients/{client_id}
- POST /api/files/upload, GET /api/files/{file_id}, GET /api/documents
- POST/GET /api/service/engagements, PATCH /api/service/engagements/{id}/checklist
- GET/PATCH /api/settings/rbac, /storage, /workflows, /firm, /users
- GET /api/notifications, PATCH /api/notifications/{id}/dismiss
- GET /api/clients/{client_id}/timeline
- GET /api/export/audit-report/{id}, GET /api/export/vat-return/{id}
- POST /api/onboarding, GET /api/onboarding/document-checklist
- **GET /api/reminders** (data-driven from tasks, events, engagements)
- **POST/GET/DELETE /api/billable-hours**
- **GET /api/billable-hours/summary** (partner-only, grouped by staff & client)
- **GET /api/billable-hours/export** (CSV download)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours
