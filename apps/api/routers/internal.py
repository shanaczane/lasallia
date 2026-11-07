# Endpoints for scheduled jobs, not for people. pg_cron calls these with a
# shared secret (supabase/cron/recommendation_rebuild_schedule.sql).

import secrets

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status

from core import config
from core.loan_reminders import send_daily_reminders, send_reserve_reminders
from core.recommendation_rebuild import execute_run, start_run
from core.supabase import get_admin_client

router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)


def _check_secret(sent: str | None) -> None:
    expected = config.INTERNAL_CRON_SECRET
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Scheduled jobs aren't set up on this server")
    if not sent or not secrets.compare_digest(sent.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid secret")


# Answers at once and works in the background: pg_net gives up on a call
# after seconds, and a rebuild takes much longer.
@router.post("/rebuild-recommendations", status_code=status.HTTP_202_ACCEPTED)
def rebuild_recommendations(
    background: BackgroundTasks,
    x_internal_secret: str | None = Header(None),
):
    _check_secret(x_internal_secret)
    admin = get_admin_client()
    run_id = start_run(admin, "cron")
    if run_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A rebuild is already running")
    background.add_task(execute_run, admin, run_id)
    return {"run_id": run_id}


# Daily, 8:00 AM Manila. Safe to call twice: loan_reminder_log stops repeats.
@router.post("/send-loan-reminders", status_code=status.HTTP_202_ACCEPTED)
def send_loan_reminders(
    background: BackgroundTasks,
    x_internal_secret: str | None = Header(None),
):
    _check_secret(x_internal_secret)
    background.add_task(send_daily_reminders, get_admin_client())
    return {"started": True}


# Every 15 minutes, for the collections fined by the library hour.
@router.post("/send-reserve-reminders", status_code=status.HTTP_202_ACCEPTED)
def send_reserve_loan_reminders(
    background: BackgroundTasks,
    x_internal_secret: str | None = Header(None),
):
    _check_secret(x_internal_secret)
    background.add_task(send_reserve_reminders, get_admin_client())
    return {"started": True}
