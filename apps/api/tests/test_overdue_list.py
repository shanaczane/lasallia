# The librarians' overdue list and "Send reminder now".

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.loan_reminders as reminders
import routers.overdue as overdue_router
import routers.reports as reports_router
from core.dates import manila_now
from core.deps import PROFILE_REQUIRED, get_current_user
from core.loan_reminders import manila_day_number
from core.overdue_list import overdue_list
from core.reports import ReportFilters, overdue_rows
from core.settings import _DEFAULTS
from main import app as real_app
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.librarian_auth import allow_librarian
from tests.report_export_fixtures import fake_status, loan, predictable_fines  # noqa: F401  (autouse fixture)

LOAN_ID = "11111111-1111-1111-1111-111111111111"
LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Shared Login")


def _overdue_loan(i=1, loan_id=LOAN_ID, **kwargs) -> dict:
    return {**loan(i, **kwargs), "id": loan_id, "returned_at": None}


@pytest.fixture
def db():
    return FakeSupabase(
        loans=[
            _overdue_loan(1, days_late=3, name="Ana", role="student"),
            _overdue_loan(2, "22222222-2222-2222-2222-222222222222", days_late=20, name="Ben", role="faculty"),
            _overdue_loan(3, "33333333-3333-3333-3333-333333333333", days_late=9, name="Cy", role="student"),
        ],
        loan_reminder_log=[], audit_log=[],
    )


@pytest.fixture
def sent(monkeypatch):
    log = []
    monkeypatch.setattr(reminders, "notify", lambda *a, **k: log.append(a) or True)
    monkeypatch.setattr(reminders, "email_user", lambda *a: None)
    return log


@pytest.fixture
def client(db, monkeypatch):
    app = FastAPI()
    app.include_router(overdue_router.router)
    app.include_router(reports_router.router)
    allow_librarian(app, LIBRARIAN)
    monkeypatch.setattr(overdue_router, "get_admin_client", lambda: db)
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    monkeypatch.setattr(overdue_router, "overdue_status", fake_status)
    monkeypatch.setattr(overdue_router, "get_library_settings", lambda _db: _DEFAULTS)
    return TestClient(app)


def test_most_overdue_comes_first(db):
    assert [r.patron for r in overdue_list(db)] == ["Ben", "Cy", "Ana"]


def test_a_row_has_what_the_list_shows(db):
    row = overdue_list(db)[0]
    assert row.role == "faculty"
    assert row.accession == "T45000"
    assert row.collectionType == "General"
    assert row.overdueLabel == "Overdue by 20 school days"
    assert row.reminderCount == 0 and row.lastReminderAt is None


def test_the_numbers_match_the_overdue_report(client):
    report = {r["id"]: r for r in client.get("/reports/overdue").json()}
    for row in client.get("/overdue").json():
        for field in ("patron", "book", "dueDate", "daysOverdue", "fine"):
            assert row[field] == report[row["id"]][field]
    assert len(report) == 3


def test_returned_loans_arent_listed(db):
    db.tables["loans"][0]["status"] = "returned"
    assert len(overdue_list(db)) == 2


def test_last_reminder_and_count(db):
    db.tables["loan_reminder_log"] += [
        {"id": "a", "loan_id": LOAN_ID, "kind": "overdue_first", "occurrence": 1, "channel": "in_app", "sent_at": "2026-11-01T00:00:00+00:00"},
        {"id": "b", "loan_id": LOAN_ID, "kind": "overdue_first", "occurrence": 1, "channel": "email", "sent_at": "2026-11-01T00:00:00+00:00"},
        {"id": "c", "loan_id": LOAN_ID, "kind": "overdue_repeat", "occurrence": 1, "channel": "in_app", "sent_at": "2026-11-04T00:00:00+00:00"},
    ]
    row = next(r for r in overdue_list(db) if r.id == LOAN_ID)
    # Email and in-app are one reminder.
    assert row.reminderCount == 2
    assert row.lastReminderKind == "overdue_repeat"
    assert row.lastReminderAt == "2026-11-04T00:00:00+00:00"


# ── Send reminder now ──

def test_sending_writes_the_log_and_the_audit_log(client, db, sent):
    res = client.post(f"/overdue/{LOAN_ID}/remind")
    assert res.status_code == 201
    assert len(sent) == 1
    today = manila_day_number(manila_now().date())
    assert {(r["kind"], r["occurrence"], r["channel"]) for r in db.tables["loan_reminder_log"]} == {
        ("manual", today, "in_app"), ("manual", today, "email"),
    }
    entry = db.tables["audit_log"][-1]
    assert (entry["action"], entry["entity_id"]) == ("loan.send_reminder", LOAN_ID)
    assert entry["librarian_name"] == "Test Profile"


def test_the_message_states_the_overdue_days_and_fine(client, sent):
    client.post(f"/overdue/{LOAN_ID}/remind")
    _student, kind, title, message = sent[0]
    assert kind == "overdue"
    assert title == "Overdue by 3 school days"
    assert "Fine so far: ₱15.00" in message


def test_only_once_per_loan_per_day(client, db, sent):
    client.post(f"/overdue/{LOAN_ID}/remind")
    res = client.post(f"/overdue/{LOAN_ID}/remind")
    assert res.status_code == 409
    assert res.json()["detail"] == "A reminder already went out for this loan today"
    assert len(sent) == 1
    assert len(db.tables["audit_log"]) == 1


def test_another_loan_can_still_be_reminded(client, sent):
    client.post(f"/overdue/{LOAN_ID}/remind")
    assert client.post("/overdue/22222222-2222-2222-2222-222222222222/remind").status_code == 201


def test_yesterdays_reminder_doesnt_block_today(client, db, sent):
    yesterday = manila_day_number(manila_now().date() - timedelta(days=1))
    db.tables["loan_reminder_log"].append({"loan_id": LOAN_ID, "kind": "manual", "occurrence": yesterday, "channel": "in_app"})
    assert client.post(f"/overdue/{LOAN_ID}/remind").status_code == 201


def test_the_list_shows_it_was_reminded_today(client, db, sent):
    client.post(f"/overdue/{LOAN_ID}/remind")
    db.tables["loan_reminder_log"][0]["sent_at"] = datetime.now(timezone.utc).isoformat()
    db.tables["loan_reminder_log"][1]["sent_at"] = datetime.now(timezone.utc).isoformat()
    row = next(r for r in client.get("/overdue").json() if r["id"] == LOAN_ID)
    assert row["remindedToday"] is True and row["lastReminderKind"] == "manual"


def test_a_returned_book_cant_be_reminded(client, db, sent):
    db.tables["loans"][0].update(status="returned", returned_at="2026-11-01T00:00:00+00:00")
    assert client.post(f"/overdue/{LOAN_ID}/remind").status_code == 400
    assert sent == []


def test_a_loan_that_isnt_overdue_cant_be_reminded(client, db, sent):
    db.tables["loans"][0]["due_date"] = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    assert client.post(f"/overdue/{LOAN_ID}/remind").status_code == 400


def test_an_unknown_loan(client, sent):
    assert client.post("/overdue/99999999-9999-9999-9999-999999999999/remind").status_code == 404


def test_a_failed_send_can_be_tried_again(client, db, monkeypatch):
    monkeypatch.setattr(reminders, "notify", lambda *a, **k: False)
    assert client.post(f"/overdue/{LOAN_ID}/remind").status_code == 502
    assert db.tables["loan_reminder_log"] == []
    assert db.tables["audit_log"] == []


def test_sending_needs_an_active_profile():
    real_app.dependency_overrides[get_current_user] = lambda: LIBRARIAN
    try:
        res = TestClient(real_app).post(f"/overdue/{LOAN_ID}/remind", headers={"Authorization": "Bearer x"})
    finally:
        real_app.dependency_overrides.clear()
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED


def test_students_cant_see_the_list():
    real_app.dependency_overrides[get_current_user] = lambda: UserProfile(id="s", email="s@dlsl.edu.ph", role="student")
    try:
        assert TestClient(real_app).get("/overdue", headers={"Authorization": "Bearer x"}).status_code == 403
    finally:
        real_app.dependency_overrides.clear()


def test_the_report_rows_still_work_without_a_filter(db):
    assert len(overdue_rows(db, ReportFilters())) == 3
