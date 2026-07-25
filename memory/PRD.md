# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" with Dark Navy + Gold theme, Partner/Staff/Client RBAC, service modules, landing page, and client portal.

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans
- Backend: FastAPI, Motor (MongoDB), bcrypt, PyJWT, pywebpush, openpyxl
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations
- PWA: Service Worker + Web Push (VAPID)
- Auth: JWT sessions + Emergent-managed Google OAuth

## URL Structure
- `/` — Public landing page
- `/login` — User picker + password + Google sign-in
- `/app/*` — Protected partner/staff routes
- `/client/*` — Protected client portal routes

## Roles
- **Partner**: Full access to all features, settings, approvals
- **Staff**: Task/engagement access based on RBAC
- **Client**: Simplified portal with Documents, Workflow Status, Invoices only

## Completed Features (as of 2026-07-25)
1-30. [All previous features]
31. **Client Portal** — Dedicated dashboard for client-role users with 3 sections:
  - Documents pending: Predefined checklists per service type (AML, Company Formation, VAT Registration, Audit) with file upload per item
  - Workflow Status: Shows engagement stages (name + status only, no internal details)
  - Invoice History: Service name, date, amount, paid/unpaid
32. **Invoice Management (Admin)** — Partners can create/update/delete invoices linked to clients. Status validation (Paid/Unpaid only).
33. **Client Role Assignment** — Settings > Firm & Users supports "Client" role with linked client record dropdown.
34. **Security Hardening** — Client users can only see their own data. Role checks on all client-portal endpoints. client_id cleared when role changes away from client. File download supports both object storage and direct MongoDB storage.

## Testing Status
- Iterations 1-12: 100% pass
- Iteration 13: Security fixes applied (password exposure + approval bypass)
- Iteration 14: Client portal — 10/16 backend pass, all frontend routes work. Critical fixes applied: data isolation, file download, role checks, invoice validation.

## Backlog
- P1: Mobile responsive landing page nav + client portal
- P2: Backend refactoring (server.py 3100+ lines)
- P3: Wire actual Storage Sync (S3/Drive/OneDrive)

## Key API Endpoints (New)
- **GET /api/client-portal/documents** — Client's document checklist
- **POST /api/client-portal/documents/{item_id}/upload** — Client uploads file
- **GET /api/client-portal/workflow** — Client's engagement stages
- **GET /api/client-portal/invoices** — Client's invoices
- **POST/GET/PATCH/DELETE /api/invoices** — Partner invoice CRUD
- **GET/PATCH /api/admin/client-checklists/{client_id}** — Admin edit checklists

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours, push_subscriptions, client_doc_checklists, invoices
