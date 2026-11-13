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
    compliance,
    google_auth,
    attendance,
    leads,
    doc_requests,
    insights,
    trial_balance,
    journal,
    queries,
    adjustments,
    einvoicing,
    ledger,
    receipts,
    vat_recon,
    statements,
    notes_disclosure,
    audit_intel,
    mailbox,
    audit_workpapers,
    transfer_pricing,
    qm,
)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    # ---- Mailbox nudge poller: check the firm's shared inboxes every 10 minutes ----
    import asyncio
    from routes.mailbox import poll_mailboxes

    cal_ok = True  # flips off after the first scope failure to avoid log spam

    async def _mailbox_loop():
        nonlocal cal_ok
        while True:
            try:
                if os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
                    await poll_mailboxes()
                    # keep the compliance calendar fresh without anyone clicking anything
                    if cal_ok:
                        try:
                            from routes.mailbox import sync_deadlines
                            await sync_deadlines(None, None)
                        except Exception as e:
                            cal_ok = False
                            print(f"CALENDAR_AUTOSYNC_OFF (will retry on restart): {str(e)[:160]}")
            except Exception as e:
                print(f"MAILBOX_POLL_ERROR {str(e)[:200]}")
            await asyncio.sleep(600)

    poller = asyncio.create_task(_mailbox_loop())
    await startup()
    yield
    await shutdown_db_client()
    poller.cancel()


app = FastAPI(lifespan=lifespan)

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
    compliance.router,
    google_auth.router,
    attendance.router,
    leads.router,
    doc_requests.router,
    insights.router,
    trial_balance.router,
    journal.router,
    queries.router,
    adjustments.router,
    einvoicing.router,
    ledger.router,
    statements.router,
    receipts.router,
    vat_recon.router,
    notes_disclosure.router,
    audit_intel.router,
    mailbox.router,
    audit_workpapers.router,
    transfer_pricing.router,
    qm.router,
):
    app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

