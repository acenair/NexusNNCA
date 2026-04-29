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
16. **Settings: Access Control (RBAC)** — Section-level toggle per role (staff/partner). 6 sections. **LIVE**: dynamically filters sidebar visibility based on saved config.
17. **Settings: Storage Integration** — Config UI for AWS S3, Google Drive, OneDrive. Saves credentials. Actual sync as future follow-up.
18. **Settings: Workflows** — Visual step builder with drag-to-reorder. 5 preset workflows. Custom workflow creation. Assigned per service type.
19. **Workflow-Linked Engagements** — When creating an engagement, users can select a workflow template. Workflow steps become the engagement checklist phases.
20. **Push Notifications & Deadline Reminders** — Notification bell in topbar with unread badge. Shows overdue tasks, tasks due within 3 days, and upcoming events. Dismiss functionality. Browser push notification permission prompt.
21. **Settings: Firm & Users** — Firm name editing (change parent firm name). Team members table showing all users. Edit modal to change role (staff/partner), title/designation, date of joining, and reset password. Partner-only access.
22. **Tasks Page** — Staff see only their own assigned tasks (title: "My Tasks"). Partners see all tasks grouped by staff member (title: "All Tasks") with staff filter. Toggleable completion checkboxes, overdue indicators, priority dots, status badges. Positioned below Dashboard in sidebar Overview section.
23. **Client Activity Timeline (360° View)** — Chronological view of all client activity: tasks, events, documents, and engagements. Accessible from Client Master via "Timeline" button. Filter chips per activity type. Stats cards.
24. **Export/Reporting** — PDF generation for audit reports and VAT returns from any engagement. Uses fpdf2 with firm branding (gold accent line, firm name header). Includes checklist progress, status, phase info.
25. **Engagement Detail Page** — Dedicated page for viewing/editing a specific engagement. Shows full interactive checklist with group progress bars, edit panel (status/assignee), and Export PDF button. Navigable from Deadline Tracker "Open →" buttons.
26. **Data-Driven Deadline Tracker** — Fetches real engagements from DB. Summary stats, workload distribution by staff, tabbed by service type, staff/search filters. Each row has clickable "Open →" that navigates to engagement detail.
27. **Client Onboarding Workflow** — Multi-step wizard (5 steps: Client Details → Services → Risk & Compliance → Team & Notes → Review & Submit). Auto-creates client record (status: "Onboarding"), generates 3-6 onboarding tasks based on services, auto-creates service engagements with workflow checklists, produces document collection checklist. Partner-only access enforced. Duplicate client detection. Success screen shows counts + full document checklist.

## Testing Status
- Iteration 1-2: 100% pass (initial build)
- Iteration 3: 100% pass — AI Assistant + Calendar mobile
- Iteration 4: 100% pass — Client Master
- Iteration 5: 100% pass — Settings (RBAC, Storage, Workflows) + Documents
- Iteration 6: 100% pass — Dynamic RBAC, Notifications, Workflow-Linked Engagements
- Iteration 7: 100% pass — Firm & Users Settings
- Iteration 8: 100% pass — Client Timeline, PDF Export, Engagement Detail, Deadline Tracker
- Iteration 9: 100% pass — Client Onboarding Workflow (7 backend + 14 frontend checkpoints)

## Backlog
- P1: Wire storage integration to actual S3/Drive/OneDrive for file sync
- P2: Browser push notifications (actual Web Push API integration for background notifications)
- P3: Backend refactoring — split server.py (2100+ lines) into modular route files

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
- GET /api/notifications, PATCH /api/notifications/{id}/dismiss
- GET /api/clients/{client_id}/timeline
- GET /api/export/audit-report/{engagement_id}, GET /api/export/vat-return/{engagement_id}
- **POST /api/onboarding** (Partner only — creates client + tasks + engagements)
- **GET /api/onboarding/document-checklist** (Preview checklist by services & risk)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications
