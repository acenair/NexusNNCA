# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" with Dark Navy + Gold theme, Partner/Staff RBAC, service modules. Now includes public landing page, Google + email auth with admin approval.

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans
- Backend: FastAPI, Motor (MongoDB), bcrypt, PyJWT, pywebpush, openpyxl
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations
- PWA: Service Worker + Web Push (VAPID)
- Auth: JWT sessions + Emergent-managed Google OAuth

## URL Structure
- `/` — Public landing page (Hero, Features, Services, Workflow, CTA)
- `/login` — User picker + password login + Google sign-in
- `/app/*` — Protected app routes (dashboard, tasks, settings, etc.)
- Legacy routes (`/dashboard`, `/tasks`, etc.) redirect to `/app/*`

## Auth & Approval Flow
- Existing seeded users login with email/password
- New users sign up via Google or email registration
- New users get `status: "pending_approval"` — cannot access app until partner approves
- Partners approve/reject in Settings > Firm & Users (Status column + Approve/Reject buttons)
- `get_current_user` centrally blocks pending users from all API endpoints
- Password hashes excluded from all API responses

## Completed Features (as of 2026-07-25)
1-27. [All previous features — Dashboard, Calendar, Modules, Settings, RBAC, Workflows, Notifications, AI, Client Master, Documents, Engagements, Timeline, Exports, Onboarding, Email editing, Reminders, Billable Hours, Web Push, Bulk Task Upload]
28. **Public Landing Page** — Hero section, 8 feature cards, 4 service workflow cards with step lists, 4-step "How It Works", CTA section, footer. Clean SaaS design with N&N branding.
29. **Google Sign-In** — OAuth via Emergent auth. Pending approval for new users. Google button on login page.
30. **Admin User Approval** — Settings > Firm & Users shows Status column (Active/Pending Approval). Approve/Reject buttons for pending users. Reject deletes user + sessions.

## Testing Status
- Iterations 1-12: 100% pass
- Iteration 13: 100% frontend, 83% backend → 2 CRITICAL security issues found and FIXED (password exposure + approval bypass)

## Backlog
- P1: Wire actual Storage Sync (S3/Drive/OneDrive)
- P2: Backend refactoring (server.py 2800+ lines)
- P3: Mobile responsive landing page nav

## Key API Endpoints (New/Changed)
- **GET /** — Landing page (frontend)
- **POST /api/auth/register** — Creates user with pending_approval, no session issued
- **POST /api/auth/session** — Google OAuth callback, pending users get error response
- **PATCH /api/settings/users/{id}/approve** — Partner approves pending user
- **PATCH /api/settings/users/{id}/reject** — Partner rejects + deletes user + sessions
- **GET /api/auth/me** — Now excludes password field
- **GET /api/auth/users-list** — Excludes pending users from login picker

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours, push_subscriptions
