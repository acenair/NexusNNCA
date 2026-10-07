"""FastAPI composition root. Domain endpoints live in routes/."""
import os

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from lifecycle import shutdown_db_client, startup
from routes import (
    auth,
    dashboard,
    clients,
    tasks,
    team,
    ai,
    documents,
    vat,
    audit,
    aml,
    engagements,
    settings,
    users,
    workflows,
    notifications,
    onboarding,
    exports,
    billable_hours,
    reminders,
    client_portal,
    invoices,
    proposals,
    push,
    admin,
    drive,
)

app = FastAPI()

# Each router retains its original /api paths and decorator order.
for router in (
    auth.router,
    dashboard.router,
    clients.router,
    tasks.router,
    team.router,
    ai.router,
    documents.router,
    vat.router,
    audit.router,
    aml.router,
    engagements.router,
    settings.router,
    users.router,
    workflows.router,
    notifications.router,
    onboarding.router,
    exports.router,
    billable_hours.router,
    reminders.router,
    client_portal.router,
    invoices.router,
    proposals.router,
    push.router,
    admin.router,
    drive.router,
):
    app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_event_handler("startup", startup)
app.add_event_handler("shutdown", shutdown_db_client)
