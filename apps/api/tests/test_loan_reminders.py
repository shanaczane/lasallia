# The reminder schedule, the fine wording and the duplicate guard. "Today" is
# fixed by passing it in, or by freezing core.calendar's clock.

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.calendar as calendar_module
import core.loan_reminders as reminders
import routers.internal as internal_router
import routers.settings as settings_router
from core import config
from core.calendar import count_library_hours, count_school_days, overdue_status
from core.dates import MANILA
from core.settings import _DEFAULTS
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.librarian_auth import allow_librarian

CFG = {**_DEFAULTS}
# Monday 9 Nov 2026. The week: Tue 10, Wed 11, Thu 12, Fri 13, Sat 14, Sun 15.
MONDAY = date(2026, 11, 9)


def manila(y, mo, d, h=0, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=MANILA)


def loan(due: datetime, collection: str = "General", loan_id: str = "l1", **extra) -> dict:
    return {
        "id": loan_id, "student_id": "s1", "status": "active", "returned_at": None,
        "due_date": due.astimezone(timezone.utc).isoformat(),
        "book_copies": {"accession_number": "T1", "books": {"title": "Clean Code", "collection_type": collection}},
        **extra,
    }


def freeze(monkeypatch, moment: datetime):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return moment.astimezone(tz)

    monkeypatch.setattr(calendar_module, "datetime", Clock)
    monkeypatch.setattr(reminders, "datetime", Clock)
    monkeypatch.setattr(reminders, "manila_now", lambda: moment.astimezone(MANILA))


@pytest.fixture
def sent(monkeypatch):
    log = {"notifications": [], "emails": []}

    def fake_notify(user_id, type_, title, message, link=None, email=None):
        log["notifications"].append({"type": type_, "title": title, "message": message, "link": link})
        return True

    monkeypatch.setattr(reminders, "notify", fake_notify)
    monkeypatch.setattr(reminders, "email_user", lambda _id, content: log["emails"].append(content))
    return log


def db_with(*loans, calendar=()) -> FakeSupabase:
    return FakeSupabase(
        loans=list(loans), loan_reminder_log=[], library_calendar=list(calendar),
        library_settings=[{"id": 1, **CFG}],
    )


# ── which reminder, when ──

NOW = manila(2026, 11, 10, 8)
DUE = manila(2026, 11, 11, 18)


def _pick(today, now, days=0, fine=0.0, cfg=CFG, due=DUE):
    return reminders.general_reminder(loan(due), today, now, days, fine, cfg)


def test_due_tomorrow_goes_out_the_day_before():
    r = _pick(date(2026, 11, 10), NOW)
    assert (r.kind, r.title) == ("due_tomorrow", "Due tomorrow")
    assert "November 11, 2026" in r.message and "6:00 PM" in r.message


def test_due_today_goes_out_on_the_day():
    r = _pick(date(2026, 11, 11), manila(2026, 11, 11, 8))
    assert (r.kind, r.title) == ("due_today", "Due today, 6:00 PM")


def test_nothing_two_days_before():
    assert _pick(date(2026, 11, 9), manila(2026, 11, 9, 8)) is None


def test_nothing_once_overdue_with_no_school_day_passed():
    assert _pick(date(2026, 11, 11), manila(2026, 11, 11, 19)) is None


@pytest.mark.parametrize("days, kind, occurrence", [
    (1, "overdue_first", 1), (2, "overdue_first", 1), (3, "overdue_first", 1),
    (4, "overdue_repeat", 1), (6, "overdue_repeat", 1),
    (7, "overdue_repeat", 2), (10, "overdue_repeat", 3),
])
def test_overdue_reminders_every_three_school_days(days, kind, occurrence):
    r = _pick(date(2026, 12, 1), manila(2026, 12, 1, 8), days=days, fine=days * 5.0)
    assert (r.kind, r.occurrence) == (kind, occurrence)


def test_the_first_notice_states_the_fine_so_far():
    r = _pick(date(2026, 11, 12), manila(2026, 11, 12, 8), days=1, fine=5.0)
    assert r.title == "Overdue by 1 school day"
    assert "Fine so far: ₱5.00" in r.message
    assert "₱5.00 per school day, up to ₱100.00 per book" in r.message
    assert ("Fine so far", "₱5.00") in r.email.details


def test_plural_school_days():
    r = _pick(date(2026, 11, 20), manila(2026, 11, 20, 8), days=4, fine=20.0)
    assert r.title == "Overdue by 4 school days"


def test_repeats_stop_at_the_maximum_fine():
    assert _pick(date(2026, 12, 20), manila(2026, 12, 20, 8), days=22, fine=100.0) is None


def test_the_first_notice_still_goes_out_at_the_maximum():
    cfg = {**CFG, "max_fine_per_book": 5.0}
    assert _pick(date(2026, 11, 12), manila(2026, 11, 12, 8), days=1, fine=5.0, cfg=cfg).kind == "overdue_first"


# ── reserve materials ──

RESERVE_DUE = manila(2026, 11, 11, 18)


@pytest.mark.parametrize("now, kind", [
    (manila(2026, 11, 11, 17, 15), None),
    (manila(2026, 11, 11, 17, 30), "reserve_due_soon"),
    (manila(2026, 11, 11, 17, 45), "reserve_due_soon"),
    (manila(2026, 11, 11, 18, 0), "reserve_overdue"),
    (manila(2026, 11, 11, 18, 15), "reserve_overdue"),
])
def test_reserve_reminders(now, kind):
    r = reminders.reserve_reminder(loan(RESERVE_DUE, "Reserve"), now, CFG)
    assert (r.kind if r else None) == kind


def test_reserve_wording_states_the_hourly_rule():
    r = reminders.reserve_reminder(loan(RESERVE_DUE, "Bible"), manila(2026, 11, 11, 18), CFG)
    assert "₱2.00 per library hour, up to ₱100.00 per book" in r.message


@pytest.mark.parametrize("collection", ["Reserve", "Story book", "Bible"])
def test_the_daily_run_skips_hourly_collections(monkeypatch, sent, collection):
    db = db_with(loan(manila(2026, 11, 11, 18), collection))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    reminders.send_daily_reminders(db)
    assert sent["notifications"] == []


def test_the_reserve_run_skips_general_loans(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 10, 8, 10)))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    reminders.send_reserve_reminders(db)
    assert sent["notifications"] == []


# ── running the job ──

def test_a_run_writes_both_channels_to_the_log(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 11, 18)))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["loan_reminders"] == 1
    assert {(r["kind"], r["channel"]) for r in db.tables["loan_reminder_log"]} == {
        ("due_tomorrow", "in_app"), ("due_tomorrow", "email"),
    }
    assert len(sent["emails"]) == 1


def test_running_twice_sends_once(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 11, 18)))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    reminders.send_daily_reminders(db)
    assert reminders.send_daily_reminders(db)["loan_reminders"] == 0
    assert len(sent["notifications"]) == 1 and len(sent["emails"]) == 1


def test_returned_loans_get_nothing(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 11, 18), status="returned", returned_at="2026-11-09T00:00:00+00:00"))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    reminders.send_daily_reminders(db)
    assert sent["notifications"] == []


def test_a_failed_notification_is_retried_next_run(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 11, 18)))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    monkeypatch.setattr(reminders, "notify", lambda *a, **k: False)
    assert reminders.send_daily_reminders(db)["loan_reminders"] == 0
    assert db.tables["loan_reminder_log"] == []


def test_a_marker_copied_from_the_old_columns_stops_a_repeat(monkeypatch, sent):
    db = db_with(loan(manila(2026, 11, 11, 18)))
    db.tables["loan_reminder_log"].append({"loan_id": "l1", "kind": "due_tomorrow", "occurrence": 1, "channel": "in_app"})
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    reminders.send_daily_reminders(db)
    assert sent["notifications"] == []


def test_a_missed_run_catches_up_with_one_reminder(monkeypatch, sent):
    # Due Monday; nothing ran until the next Tuesday:
    # Tue-Sat, Mon and Tue are 7 open days.
    db = db_with(loan(manila(2026, 11, 9, 18)))
    freeze(monkeypatch, manila(2026, 11, 17, 8))
    reminders.send_daily_reminders(db)
    assert len(sent["notifications"]) == 1
    assert sent["notifications"][0]["title"] == "Overdue by 7 school days"


def test_sundays_and_closed_dates_dont_count(monkeypatch, sent):
    # Due Fri 13. Sat 14 is day 1, Sun 15 is closed, Mon 16 is a holiday.
    db = db_with(
        loan(manila(2026, 11, 13, 18)),
        calendar=[{"date": "2026-11-16", "is_school_day": False, "open_time": "08:00", "close_time": "17:00"}],
    )
    freeze(monkeypatch, manila(2026, 11, 17, 8))
    reminders.send_daily_reminders(db)
    assert sent["notifications"][0]["title"] == "Overdue by 2 school days"


def test_one_bad_loan_doesnt_stop_the_rest(monkeypatch, sent):
    bad = {**loan(manila(2026, 11, 11, 18), loan_id="a-bad"), "due_date": "not a date"}
    db = db_with(bad, loan(manila(2026, 11, 11, 18), loan_id="good"))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["loan_reminders"] == 1


# ── unpaid fine reminders keep working ──

def _fined(**extra) -> dict:
    return {
        **loan(manila(2026, 10, 1, 18), loan_id="f1"), "status": "returned", "returned_at": "2026-10-05T00:00:00+00:00",
        "fine_status": "unsettled", "fine_amount": 15.0, **extra,
    }


def test_an_unpaid_fine_gets_a_reminder(monkeypatch, sent):
    db = db_with(_fined())
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["fine_reminders"] == 1
    assert sent["notifications"][0]["type"] == "fine_reminder"
    assert "₱15.00" in sent["notifications"][0]["message"]
    assert db.tables["loans"][0]["fine_reminder_last_sent_at"]


def test_fine_reminders_wait_seven_days(monkeypatch, sent):
    db = db_with(_fined(fine_reminder_last_sent_at=manila(2026, 11, 5, 8).isoformat()))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["fine_reminders"] == 0


def test_fine_reminders_resume_after_seven_days(monkeypatch, sent):
    db = db_with(_fined(fine_reminder_last_sent_at=manila(2026, 11, 2, 8).isoformat()))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["fine_reminders"] == 1


def test_a_paid_fine_gets_no_reminder(monkeypatch, sent):
    db = db_with(_fined(fine_status="paid"))
    freeze(monkeypatch, manila(2026, 11, 10, 8))
    assert reminders.send_daily_reminders(db)["fine_reminders"] == 0


# ── school days are Manila days ──

def test_school_days_use_the_manila_date():
    db = db_with()
    # 23:30 UTC on Sunday is 7:30 AM Monday in Manila: the due date is Monday,
    # so Tuesday 7:00 AM Manila (Monday 23:00 UTC) is 1 school day later.
    due = manila(2026, 11, 9, 7, 30)
    assert count_school_days(db, due, manila(2026, 11, 10, 7), CFG) == 1
    assert count_school_days(db, due, manila(2026, 11, 9, 23), CFG) == 0


# ── minute-exact hourly fines: 7:30-18:00 weekdays, 8:00-12:00 Saturdays ──

def test_hours_count_only_inside_opening_hours():
    db = db_with()
    assert count_library_hours(db, manila(2026, 11, 9, 18), manila(2026, 11, 10, 8, 30), CFG) == 1.0


def test_hours_are_minute_exact():
    db = db_with()
    assert count_library_hours(db, manila(2026, 11, 10, 9), manila(2026, 11, 10, 9, 45), CFG) == 0.75


def test_an_overnight_gap_isnt_counted():
    db = db_with()
    assert count_library_hours(db, manila(2026, 11, 9, 17), manila(2026, 11, 10, 8), CFG) == 1.5


def test_saturday_hours_and_a_closed_sunday():
    db = db_with()
    # Fri 18:00 to Mon 8:30: Saturday's 4 hours, nothing Sunday, 1 hour Monday.
    assert count_library_hours(db, manila(2026, 11, 13, 18), manila(2026, 11, 16, 8, 30), CFG) == 5.0


def test_a_closed_date_adds_no_hours():
    db = db_with(calendar=[{"date": "2026-11-10", "is_school_day": False, "open_time": "08:00", "close_time": "17:00"}])
    assert count_library_hours(db, manila(2026, 11, 9, 18), manila(2026, 11, 11, 7, 30), CFG) == 0.0


def test_the_hourly_fine_is_two_pesos_an_hour(monkeypatch):
    db = db_with()
    freeze(monkeypatch, manila(2026, 11, 10, 10, 30))
    status = overdue_status(db, manila(2026, 11, 9, 18).isoformat(), "Reserve")
    assert (status.library_hours, status.fine) == (3.0, 6.0)


def test_the_hourly_fine_starts_the_same_day(monkeypatch):
    # A loan due at 2:00 PM, before closing: no school day has passed yet.
    db = db_with()
    freeze(monkeypatch, manila(2026, 11, 9, 15))
    status = overdue_status(db, manila(2026, 11, 9, 14).isoformat(), "Bible")
    assert (status.school_days, status.fine) == (0, 2.0)


def test_the_hourly_fine_stops_at_the_maximum(monkeypatch):
    db = db_with()
    freeze(monkeypatch, manila(2026, 12, 20, 10))
    assert overdue_status(db, manila(2026, 11, 9, 18).isoformat(), "Story book").fine == 100.0


def test_the_daily_fine_is_unchanged(monkeypatch):
    db = db_with()
    freeze(monkeypatch, manila(2026, 11, 12, 10))
    status = overdue_status(db, manila(2026, 11, 9, 18).isoformat(), "General")
    assert (status.school_days, status.fine) == (3, 15.0)


# ── /internal ──

@pytest.fixture
def internal(monkeypatch):
    app = FastAPI()
    app.include_router(internal_router.router)
    monkeypatch.setattr(config, "INTERNAL_CRON_SECRET", "s3cret")
    monkeypatch.setattr(internal_router, "get_admin_client", lambda: "admin")
    calls = []
    monkeypatch.setattr(internal_router, "send_daily_reminders", lambda admin: calls.append("daily"))
    monkeypatch.setattr(internal_router, "send_reserve_reminders", lambda admin: calls.append("reserve"))
    return TestClient(app), calls


@pytest.mark.parametrize("path, job", [("/internal/send-loan-reminders", "daily"), ("/internal/send-reserve-reminders", "reserve")])
def test_the_job_runs_with_the_secret(internal, path, job):
    client, calls = internal
    assert client.post(path, headers={"X-Internal-Secret": "s3cret"}).status_code == 202
    assert calls == [job]


@pytest.mark.parametrize("path", ["/internal/send-loan-reminders", "/internal/send-reserve-reminders"])
def test_the_wrong_secret_is_refused(internal, path):
    client, calls = internal
    assert client.post(path, headers={"X-Internal-Secret": "nope"}).status_code == 401
    assert client.post(path).status_code == 401
    assert calls == []


def test_no_secret_on_the_server_means_not_set_up(internal, monkeypatch):
    client, _ = internal
    monkeypatch.setattr(config, "INTERNAL_CRON_SECRET", "")
    assert client.post("/internal/send-loan-reminders", headers={"X-Internal-Secret": "x"}).status_code == 503


# ── Library Calendar in Settings ──

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Shared Login")


@pytest.fixture
def calendar_client(monkeypatch):
    app = FastAPI()
    app.include_router(settings_router.router)
    allow_librarian(app, LIBRARIAN)
    db = FakeSupabase(library_calendar=[], audit_log=[])
    db.tables["library_calendar"].append({"id": "x", "date": "2026-11-01", "is_school_day": True, "note": None})
    monkeypatch.setattr(settings_router, "get_admin_client", lambda: db)
    return TestClient(app), db


def test_marking_a_date_closed_is_saved_and_audited(calendar_client):
    client, db = calendar_client
    res = client.put("/settings/calendar/2026-12-25", json={"note": " Christmas Day "})
    assert res.json() == {"date": "2026-12-25", "note": "Christmas Day"}
    row = next(r for r in db.tables["library_calendar"] if r["date"] == "2026-12-25")
    assert row["is_school_day"] is False
    assert db.tables["audit_log"][-1]["action"] == "calendar.close_date"
    assert db.tables["audit_log"][-1]["entity_id"] == "2026-12-25"


def test_the_list_only_shows_closed_dates(calendar_client):
    client, _ = calendar_client
    client.put("/settings/calendar/2026-12-25", json={})
    assert [d["date"] for d in client.get("/settings/calendar").json()] == ["2026-12-25"]


def test_marking_the_same_date_twice_keeps_one_row(calendar_client):
    client, db = calendar_client
    client.put("/settings/calendar/2026-12-25", json={"note": "A"})
    client.put("/settings/calendar/2026-12-25", json={"note": "B"})
    rows = [r for r in db.tables["library_calendar"] if r["date"] == "2026-12-25"]
    assert [r["note"] for r in rows] == ["B"]


def test_removing_a_date_goes_back_to_weekly_hours(calendar_client):
    client, db = calendar_client
    client.put("/settings/calendar/2026-12-25", json={})
    assert client.delete("/settings/calendar/2026-12-25").status_code == 204
    assert client.get("/settings/calendar").json() == []
    assert db.tables["audit_log"][-1]["action"] == "calendar.reopen_date"


def test_removing_a_date_that_isnt_closed(calendar_client):
    client, _ = calendar_client
    assert client.delete("/settings/calendar/2026-12-26").status_code == 404


def test_a_bad_date_is_refused(calendar_client):
    client, _ = calendar_client
    assert client.put("/settings/calendar/not-a-date", json={}).status_code == 422
