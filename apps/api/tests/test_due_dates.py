# When a new loan is due, the one way dates are written, and the reservation
# rules. Monday 9 Nov 2026 starts the week used throughout.

from datetime import date, datetime, timezone

import pytest

import core.loans as loans_module
import routers.reservations as reservations_router
from core.calendar import loan_due_date, next_school_day, overdue_fields
from core.dates import MANILA, date_text, overdue_text, time_text
from core.email_template import long_date, long_date_time
from core.report_export.definitions import ExportFilters
from core.settings import _DEFAULTS
from tests.fake_supabase import FakeSupabase

CFG = {**_DEFAULTS, "standard_loan_period_days": 7, "reserve_loan_period_days": 3}
CLOSED = {"is_school_day": False, "open_time": "08:00", "close_time": "17:00"}


def manila(y, mo, d, h=0, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=MANILA)


def calendar(*closed: str) -> FakeSupabase:
    return FakeSupabase(library_calendar=[{"date": d, **CLOSED} for d in closed])


# ── next school day ──

def test_a_weekday_stays_put():
    assert next_school_day(calendar(), date(2026, 11, 11), CFG) == date(2026, 11, 11)


def test_saturday_is_a_school_day_by_the_weekly_hours():
    assert next_school_day(calendar(), date(2026, 11, 14), CFG) == date(2026, 11, 14)


def test_sunday_moves_to_monday():
    assert next_school_day(calendar(), date(2026, 11, 15), CFG) == date(2026, 11, 16)


def test_a_closed_date_moves_on():
    assert next_school_day(calendar("2026-11-11"), date(2026, 11, 11), CFG) == date(2026, 11, 12)


def test_a_closed_week_and_a_sunday_are_all_skipped():
    closed = calendar("2026-12-24", "2026-12-25", "2026-12-26", "2026-12-28")
    assert next_school_day(closed, date(2026, 12, 24), CFG) == date(2026, 12, 29)


# ── due date of a new loan ──

def test_due_at_closing_time_on_a_weekday():
    assert loan_due_date(calendar(), manila(2026, 11, 4, 14, 13), CFG, "General") == manila(2026, 11, 11, 18)


def test_due_at_saturday_closing_time():
    assert loan_due_date(calendar(), manila(2026, 11, 7, 9), CFG, "General") == manila(2026, 11, 14, 12)


def test_closing_time_comes_from_settings():
    cfg = {**CFG, "weekday_close_time": "17:00", "saturday_close_time": "17:00"}
    assert loan_due_date(calendar(), manila(2026, 11, 4, 9), cfg, "General") == manila(2026, 11, 11, 17)
    assert loan_due_date(calendar(), manila(2026, 11, 7, 9), cfg, "General") == manila(2026, 11, 14, 17)


def test_a_due_date_on_sunday_moves_to_monday_closing():
    assert loan_due_date(calendar(), manila(2026, 11, 8, 9), CFG, "General") == manila(2026, 11, 16, 18)


def test_a_due_date_on_a_holiday_moves_to_the_next_school_day():
    assert loan_due_date(calendar("2026-11-11"), manila(2026, 11, 4, 9), CFG, "General") == manila(2026, 11, 12, 18)


def test_a_holiday_before_saturday_uses_saturdays_closing():
    assert loan_due_date(calendar("2026-11-13"), manila(2026, 11, 6, 9), CFG, "General") == manila(2026, 11, 14, 12)


def test_the_day_is_the_manila_day():
    # 23:30 UTC on Tuesday is 7:30 AM Wednesday in Manila.
    borrowed = datetime(2026, 11, 3, 23, 30, tzinfo=timezone.utc)
    assert loan_due_date(calendar(), borrowed, CFG, "General") == manila(2026, 11, 11, 18)


@pytest.mark.parametrize("collection", ["Reserve", "Story book", "Bible"])
def test_hourly_collections_use_their_own_loan_length(collection):
    assert loan_due_date(calendar(), manila(2026, 11, 4, 9), CFG, collection) == manila(2026, 11, 7, 12)


def test_other_collections_use_the_standard_length():
    assert loan_due_date(calendar(), manila(2026, 11, 4, 9), CFG, "Fiction") == manila(2026, 11, 11, 18)


def test_the_setting_defaults_to_seven_days():
    assert _DEFAULTS["reserve_loan_period_days"] == 7


def test_a_library_closed_for_months_still_gives_a_due_date():
    cfg = {**CFG, "weekday_open_time": None, "weekday_close_time": None, "saturday_open_time": None, "saturday_close_time": None}
    assert loan_due_date(calendar(), manila(2026, 11, 4, 9), cfg, "General").date() == date(2026, 11, 11)


def test_a_new_loan_is_saved_with_the_rule(monkeypatch):
    db = FakeSupabase(
        loans=[], book_copies=[{"id": "c1", "status": "reserved"}], reservations=[], library_calendar=[],
        books=[{"id": "b1", "title": "A Book", "collection_type": "General"}],
        library_settings=[{"id": 1, **CFG}],
        profiles=[{"id": "s1", "full_name": "Ana Reyes", "email": "a@dlsl.edu.ph"}],
    )
    db.column_defaults["loans"] = {"borrowed_at": "2026-11-04T01:00:00+00:00"}
    notes = []
    monkeypatch.setattr(loans_module, "notify", lambda *a, **k: notes.append(a))
    monkeypatch.setattr(loans_module, "notify_librarians", lambda *a, **k: None)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return manila(2026, 11, 8, 9).astimezone(tz)

    monkeypatch.setattr(loans_module, "datetime", Clock)
    loans_module.create_loan_and_notify(db, "s1", "c1", "b1", "sess", "good", None, None)
    saved = db.tables["loans"][0]["due_date"]
    assert datetime.fromisoformat(saved) == manila(2026, 11, 16, 18)
    assert 'Due date: November 16, 2026, 6:00 PM' in notes[0][3]


# ── one date format ──

@pytest.mark.parametrize("value", ["2026-11-14T09:00:00+00:00", "2026-11-14T09:00:00Z", manila(2026, 11, 14, 17)])
def test_dates_and_times(value):
    assert date_text(value) == "November 14, 2026"
    assert time_text(value) == "5:00 PM"


def test_no_leading_zero_on_the_day():
    assert date_text("2026-11-04T01:00:00+00:00") == "November 4, 2026"


def test_late_utc_is_the_next_manila_day():
    assert date_text("2026-11-13T20:00:00+00:00") == "November 14, 2026"


def test_noon_and_midnight():
    assert time_text(manila(2026, 11, 14, 12)) == "12:00 PM"
    assert time_text(manila(2026, 11, 14, 0, 5)) == "12:05 AM"


def test_emails_use_the_same_format():
    assert long_date("2026-11-14T09:00:00+00:00") == "November 14, 2026"
    assert long_date_time("2026-11-14T09:00:00+00:00") == "November 14, 2026, 5:00 PM"


def test_exports_use_the_same_format():
    filters = ExportFilters(date_from=date(2026, 11, 1), date_to=date(2026, 11, 30))
    assert filters.period_text() == "November 1, 2026 to November 30, 2026"


# ── overdue wording ──

@pytest.mark.parametrize("days, hours, hourly, text", [
    (1, 0, False, "Overdue by 1 school day"),
    (3, 0, False, "Overdue by 3 school days"),
    (0, 1, True, "Overdue by 1 library hour"),
    (2, 12.5, True, "Overdue by 12.5 library hours"),
    (0, 0, False, "Overdue today"),
    (0, 0, True, "Overdue today"),
])
def test_overdue_text(days, hours, hourly, text):
    assert overdue_text(days, hours, hourly) == text


def test_overdue_fields_for_a_general_loan():
    fields = overdue_fields(calendar(), "2020-01-06T10:00:00+00:00", "General")
    assert fields["overdue_label"].startswith("Overdue by") and "school day" in fields["overdue_label"]


def test_overdue_fields_for_a_reserve_item():
    assert "library hour" in overdue_fields(calendar(), "2020-01-06T10:00:00+00:00", "Reserve")["overdue_label"]


def test_no_label_before_the_due_date():
    assert overdue_fields(calendar(), "2099-01-06T10:00:00+00:00", "General")["overdue_label"] is None


# ── who can't reserve, and why ──

USER, BOOK = "s1", "b1"
FUTURE = "2099-01-01T10:00:00+00:00"
PAST = "2020-01-01T10:00:00+00:00"
RULES = {"max_books_per_borrower": 3, "max_active_reservations": 2}


def reserve_db(**tables) -> FakeSupabase:
    base = {
        "books": [{"id": BOOK, "collection_type": "General"}],
        "book_copies": [{"id": "c1", "book_id": BOOK}, {"id": "c2", "book_id": "b2"}],
        "loans": [], "reservations": [],
    }
    return FakeSupabase(**{**base, **tables})


def _loan(copy="c2", due=FUTURE, **extra) -> dict:
    return {"id": "l1", "student_id": USER, "status": "active", "due_date": due, "book_copy_id": copy, **extra}


def problem(db) -> str | None:
    return reservations_router._reservation_problem(db, USER, BOOK, RULES)


def test_nothing_in_the_way():
    assert problem(reserve_db()) is None


def test_already_borrowed():
    assert problem(reserve_db(loans=[_loan("c1")])) == "You currently have this book borrowed — return it before reserving another copy"


def test_already_reserved():
    db = reserve_db(reservations=[{"id": "r1", "user_id": USER, "book_id": BOOK, "status": "pending"}])
    assert problem(db) == "You already have a reservation for this title"


def test_a_finished_reservation_doesnt_count():
    db = reserve_db(reservations=[{"id": "r1", "user_id": USER, "book_id": BOOK, "status": "cancelled"}])
    assert problem(db) is None


def test_too_many_reservations():
    db = reserve_db(reservations=[
        {"id": "r1", "user_id": USER, "book_id": "b2", "status": "pending"},
        {"id": "r2", "user_id": USER, "book_id": "b3", "status": "ready"},
    ])
    assert "2" in problem(db) and "reservation" in problem(db)


def test_an_overdue_book():
    assert problem(reserve_db(loans=[_loan(due=PAST)])) == "You have an overdue book — please return it before reserving another"


def test_an_unpaid_fine():
    db = reserve_db(loans=[{"id": "l9", "student_id": USER, "status": "returned", "fine_status": "unsettled", "book_copy_id": "c2"}])
    assert problem(db) == "You have an unpaid fine — please settle it with the librarian"


def test_the_borrowing_limit():
    loans = [{**_loan(), "id": f"l{i}"} for i in range(3)]
    assert problem(reserve_db(loans=loans)) == "You've reached your borrowing limit of 3 books"


def test_library_use_only_items():
    db = reserve_db(books=[{"id": BOOK, "collection_type": "Thesis"}])
    assert problem(db) == "Thesis items are for library use only and can't be reserved"
