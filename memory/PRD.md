# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" based on an uploaded HTML file. Features: Dark Navy (#0a1128) and Gold (#D4AF37) theme, Partner vs. Staff RBAC, complex Dashboard KPIs, Deadline Tracker, Calendar, and specific service modules (Audit, VAT, Corporate, Advisory, AML).

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans fonts
- Backend: FastAPI, Motor (async MongoDB), bcrypt, PyJWT, pywebpush
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations (Emergent LLM Key)
- PWA: Service Worker + manifest.json + Web Push API (VAPID)

## Completed Features (as of 2026-06-09)
1. Dashboard with KPI cards
2. Deadline Tracker (data-driven from real engagements)
3. Calendar (fully responsive)
4. Service module pages (Audit, VAT, Corporate, Advisory, AML)
5. CRUD modals: Task, Meeting, Follow-up, Appreciation
6. Collapsible sidebar with nested submenus + RBAC
7. Mobile responsive layout
8. PWA: manifest.json + service worker
9. AI Compliance Assistant (Gemini 3 Flash)
10. Staff Appreciation (partner-only)
11. User seeding (11 team members) + Client seeding (10 demo clients)
12. Client Master (Managing Partner-only)
13. Document Checklist (upload, view, download, delete)
14. Service Engagements (unified backend with interactive checklists)
15. Settings: Access Control (RBAC), Storage Config, Workflows, Firm & Users
16. Workflow-Linked Engagements
17. Push Notifications Bell UI + dismiss
18. Tasks Page (Staff vs Partner views)
19. Client Activity Timeline (360° View)
20. Export/Reporting (PDF via fpdf2)
21. Engagement Detail Page
22. Client Onboarding Workflow (5-step wizard)
23. Editable User Email (with uniqueness validation)
24. Data-Driven Reminders with Deep Dive detail view
25. Staff Billable Hours (manual entry, summary, CSV export)
26. **Browser Web Push Notifications** — Full VAPID-based Web Push implementation. Service worker handles push events with click-to-navigate. Users subscribe via notification panel. Partners can trigger deadline push alerts to all assigned staff. Test push button. Auto-cleanup of expired subscriptions.

## Testing Status
- Iterations 1-8: 100% pass (all initial features)
- Iteration 9: 100% pass — Client Onboarding Workflow
- Iteration 10: 100% pass — Email editing, Reminders, Billable Hours
- Iteration 11: 100% pass — Browser Push Notifications (10 backend + all frontend)

## Backlog
- P1: Wire actual Storage Sync (S3/Drive/OneDrive)
- P2: Backend refactoring — split server.py (2500+ lines) into modular route files

## Key API Endpoints
- POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/dashboard/stats
- POST/GET /api/tasks
- POST/GET /api/events
- POST /api/ai/chat, GET /api/ai/sessions
- GET /api/clients, PATCH /api/clients/{client_id}
- POST /api/files/upload, GET /api/files/{file_id}, GET /api/documents
- POST/GET /api/service/engagements, PATCH /api/service/engagements/{id}/checklist
- GET/PATCH /api/settings/rbac, /storage, /workflows, /firm, /users
- GET /api/notifications, PATCH /api/notifications/{id}/dismiss
- GET /api/clients/{client_id}/timeline
- GET /api/export/audit-report/{id}, GET /api/export/vat-return/{id}
- POST /api/onboarding, GET /api/onboarding/document-checklist
- GET /api/reminders
- POST/GET/DELETE /api/billable-hours, GET /api/billable-hours/summary, GET /api/billable-hours/export
- **GET /api/push/vapid-key** (public VAPID key for subscription)
- **POST /api/push/subscribe** (store push subscription)
- **POST /api/push/unsubscribe** (remove subscription)
- **POST /api/push/test** (send test push to current user)
- **POST /api/push/send-deadline-alerts** (partner-only: push overdue/due-soon tasks to assigned staff)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours, push_subscriptions
