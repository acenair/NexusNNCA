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
2. Deadline Tracker page
3. Calendar page — fully responsive (desktop: full events, mobile: colored dots with tap-to-reveal)
4. Service module UI pages (Statutory Audit, Internal Audit, Stock Audit, Fraud Audit, VAT Registration/Filing/Amendments, Corporate Registration/Tax/Formation/Liquidation, Advisory Valuation/Due Diligence, AML Review/Filing/Reports)
5. CRUD: + New Task modal, + Meeting modal, Follow-up modal, Appreciation modal — all connected to backend
6. Collapsible sidebar with nested submenus
7. Mobile responsive layout with hamburger menu
8. PWA: manifest.json + service worker
9. AI Compliance Assistant — Gemini 3 Flash, context-aware (firm clients, tasks, events, staff), session management, quick prompts
10. Staff Appreciation (partner-only)
11. User seeding (11 team members)
12. Client seeding (10 demo clients)
13. **Client Master** — Managing Partner-only section with full client table, search/filter/sort, edit modal with all fields + 16 service toggles. RBAC enforced on both frontend (sidebar + page) and backend (PATCH 403).
14. **Document Checklist** — Upload files linked to clients with document type categorization. View/download/delete. Grouped by client, search & filter. Drag-and-drop upload zone.
15. **Service Engagements** — Unified backend for audit, VAT, AML, corporate_tax engagements with interactive checklists. Auto-phase and progress tracking. Seeded with 11 sample engagements.
16. **Settings: Access Control (RBAC)** — Section-level toggle per role (staff/partner). 6 sections: Overview, Audit, VAT, Corporate, Advisory, AML.
17. **Settings: Storage Integration** — Config UI for AWS S3, Google Drive, OneDrive. Saves credentials. Actual sync as future follow-up.
18. **Settings: Workflows** — Visual step builder with drag-to-reorder. 5 preset workflows for Audit, VAT, AML, Corporate Tax, Internal Audit. Custom workflow creation and editing. Assigned per service type.

## Testing Status
- Iteration 1: 100% pass (backend + frontend)
- Iteration 2: 100% pass (backend + frontend)
- Iteration 3: 100% pass (18/18 backend, 12/12 frontend) — AI Assistant + Calendar mobile
- Iteration 4: 100% pass (11/11 backend, 8/8 frontend) — Client Master
- Iteration 5: 100% pass (18/18 backend, 12/12 frontend) — Settings (RBAC, Storage, Workflows) + Documents + Regressions

## Backlog
- P1: Wire RBAC settings to actually control sidebar visibility dynamically (currently config-only, sidebar is role-hardcoded)
- P2: Push notifications for deadline reminders
- P2: Wire storage integration to actual S3/Drive/OneDrive for file sync
- P2: Link workflows to service engagements (enforce workflow steps during engagement creation)
- P3: Client activity timeline (360° view)

## Key API Endpoints
- POST /api/auth/login
- GET /api/dashboard/stats
- POST /api/tasks, GET /api/tasks
- POST /api/events, GET /api/events
- POST /api/ai/chat, GET /api/ai/sessions, GET /api/ai/chat/{session_id}, DELETE /api/ai/chat/{session_id}
- POST /api/appreciations
- GET /api/clients, PATCH /api/clients/{client_id} (Managing Partner only)
- POST /api/files/upload, GET /api/files/{file_id}, GET /api/documents, DELETE /api/documents/{file_id}
- POST /api/service/engagements, GET /api/service/engagements, PATCH /api/service/engagements/{id}/checklist
- GET/PATCH /api/settings/rbac (Partner only)
- GET/PATCH /api/settings/storage (Partner only)
- GET/POST/PATCH/DELETE /api/settings/workflows (Partner only)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions
