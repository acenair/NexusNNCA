# Backend structure

## Composition and ownership

- `server.py`: FastAPI application, explicit router registration, unchanged CORS,
  startup and shutdown registration. Keep business logic out of this file.
- `core.py`: the single MongoDB client/database, environment loading,
  authentication guards, password/JWT helpers, storage and activity logging.
- `lifecycle.py`: existing initialization, indexes, idempotent seeds and security
  migration. Startup ordering and shutdown database cleanup are unchanged.
- `models.py`: pre-existing general models. Domain request models live alongside
  their routes, preserving their schema names and validation.
- `audit_workbook.py`: existing workbook parsing, calculations and exports.
- `services/`: shared auth helpers, checklist templates, Google Drive helpers and
  push delivery. Services may import `core`, never routes or `server`.
- `routes/`: 25 domain `APIRouter` modules, each retaining `/api` and the original
  endpoint paths. Modules do not import one another or `server`.

## Route modules

| Area | Modules |
| --- | --- |
| Identity and administration | `auth`, `users`, `settings`, `admin` |
| Clients and delivery | `clients`, `onboarding`, `client_portal`, `engagements`, `workflows` |
| Compliance | `audit`, `vat`, `aml` |
| Finance | `invoices`, `proposals`, `billable_hours`, `exports` |
| Team operations | `dashboard`, `tasks`, `team`, `notifications`, `reminders` |
| Integrations and files | `ai`, `documents`, `push`, `drive` |

## Compatibility guardrails

P0 changes organization only: all 135 operations, 109 URL paths, 192 top-level
functions/classes, request/response schemas and business constants are preserved.
No database migration, frontend change, dependency update or new integration was
introduced. Existing environment variables and supervisor entrypoint are unchanged.

The frozen pre-refactor source/OpenAPI/route fixtures are in
`test_reports/p0_baseline/`. `tests/test_p0_structural_regression.py` validates
schema equality, handler bodies/constants, route resolution and shared DB imports.
These strict tests intentionally protect this refactor; when behavior changes in
a future feature, review and update its baseline explicitly rather than disabling
the checks to make a failure disappear.

The regression pack also includes `test_iteration21_auth_and_router_smoke.py`,
`test_iteration21_crud_finance_workflows.py`, and
`test_iteration20_onboarding_pipeline.py`. API tests require
`REACT_APP_BACKEND_URL` from `frontend/.env` and preview-only credentials documented
in `memory/test_credentials.md`. Do not run mutation tests on production data.