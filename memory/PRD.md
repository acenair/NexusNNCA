# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Original Problem Statement
Build a comprehensive practice management system for "Nair & Nelliyatt Chartered Accountants" with Dark Navy + Gold theme, Partner/Staff/Client RBAC, service modules, landing page, and client portal.

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, DM Serif Display + DM Sans
- Backend: FastAPI, Motor (MongoDB), bcrypt, PyJWT, pywebpush, openpyxl, google-api-python-client
- Database: MongoDB
- AI: Gemini 3 Flash via emergentintegrations
- PWA: Service Worker + Web Push (VAPID)
- Auth: JWT sessions + Emergent-managed Google OAuth
- Storage: Google Drive API (OAuth2, configurable from Settings)

## Completed Features (as of 2026-07-25)
1-34. [All previous features]
35. **Mobile Responsive Landing Page** — Hamburger menu on mobile (<768px), full desktop nav on larger screens.
36. **Reset Data Admin Tool** — Settings > Reset Data tab. Shows all collections with record counts. Selective or full reset with "RESET" confirmation. Managing Partner only. User accounts preserved.
37. **Google Drive Integration** — Settings > Storage tab. Partners enter Google Cloud OAuth credentials (Client ID + Client Secret). "Connect Google Drive" button initiates OAuth flow. After auth, documents can be synced to Drive organized in client folders under "Nair & Nelliyatt Documents" root. Connect/disconnect, status check, per-document sync, folder listing APIs.

## Testing Status
- Iterations 1-14: All passed with fixes applied

## Backlog
- P2: Backend refactoring (server.py 3300+ lines)
- Add invoice management page for partners (currently API-only)

## Key New API Endpoints
- **POST /api/admin/reset-data** — Reset selected collections (Managing Partner only)
- **GET /api/admin/data-stats** — Collection record counts
- **GET /api/drive/connect** — Initiate Google Drive OAuth
- **GET /api/drive/callback** — OAuth callback, stores credentials
- **GET /api/drive/status** — Check Drive connection status
- **POST /api/drive/sync-document/{file_id}** — Upload document to Drive
- **GET /api/drive/files** — List Drive folders
- **POST /api/drive/disconnect** — Remove Drive connection

## DB Collections
users, clients, tasks, events, activities, appreciations, chat_messages, vat_registrations, vat_filings, audit_engagements, aml_alerts, documents, user_sessions, service_engagements, workflows, settings, dismissed_notifications, billable_hours, push_subscriptions, client_doc_checklists, invoices, drive_credentials
