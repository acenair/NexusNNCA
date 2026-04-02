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

## Completed Features (as of 2026-04-02)
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

## Testing Status
- Iteration 1: 100% pass (backend + frontend)
- Iteration 2: 100% pass (backend + frontend)
- Iteration 3: 100% pass (18/18 backend, 12/12 frontend) — AI Assistant + Calendar mobile verified

## Backlog
- P1: File upload for document checklists
- P2: Push notifications for deadline reminders
- P2: Business logic for service sub-modules (Audit, VAT, AML, etc.)

## Key API Endpoints
- POST /api/auth/login
- GET /api/dashboard/stats
- POST /api/tasks, GET /api/tasks
- POST /api/events, GET /api/events
- POST /api/ai/chat, GET /api/ai/sessions, GET /api/ai/chat/{session_id}, DELETE /api/ai/chat/{session_id}
- POST /api/appreciations
- GET /api/clients, PATCH /api/clients/{client_id} (Managing Partner only)

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions
