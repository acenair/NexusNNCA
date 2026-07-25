# Nair & Nelliyatt Chartered Accountants — Practice Management System

## Tech Stack
- Frontend: React + CRACO, Tailwind CSS, Shadcn UI
- Backend: FastAPI + core.py (shared logic) + server.py (routes)
- Database: MongoDB (Motor)
- AI: Gemini 3 Flash (emergentintegrations)
- Auth: JWT + Google OAuth + localStorage token
- Storage: Emergent Object Storage + Google Drive (configurable)

## Architecture (Post-Refactor)
```
/app/backend/
  core.py          # Shared: db, auth helpers, storage, logging (single source of truth)
  server.py        # All API routes (imports from core.py)
  routes/          # Future: route modules
/app/frontend/src/
  App.js           # Global axios interceptor, routing
  components/      # MainLayout, ClientLayout, ProtectedRoute
  pages/           # All page components
  lib/api.js       # Shared axios instance (optional)
```

## Completed Features (38 total)
1-37. [All previous features]
38. **Invoice Management Page** — Full CRUD for partners. Summary cards (Total/Paid/Unpaid). Search + client/status filters. Toggle payment status. Create/edit modal. Sidebar item under Overview.

## Auth Flow
- Token stored in both localStorage AND cookie
- Global axios interceptor sends Bearer token on ALL requests
- Backend prioritizes Authorization header over cookie
- Works on custom domains (app.nairnelliyatt.com)

## Backlog
- Per-user RBAC section hiding
- Further backend route splitting into /routes/ directory
