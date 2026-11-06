# Report dates are whole Manila days: a date picked on the Reports page
# covers that day from 00:00 to 23:59:59 in Manila (UTC+8).

from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.reports as reports_router
from core.dates import manila_date_text, report_bound
from core.deps import require_librarian
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")


def test_first_and_last_day_are_whole_manila_days():
    # 1 Nov 00:00 Manila is 31 Oct 16:00 UTC; 30 Nov 23:59:59.999999 Manila
    # is 30 Nov 15:59:59.999999 UTC.
    assert report_bound("2026-11-01", end=False) == "2026-10-31T16:00:00.000000Z"
    assert report_bound("2026-11-30", end=True) == "2026-11-30T15:59:59.999999Z"


def test_full_timestamps_and_blanks_pass_through():
    assert report_bound("2026-11-01T08:00:00.000Z", end=False) == "2026-11-01T08:00:00.000Z"
    assert report_bound(None, end=True) is None
    assert report_bound("", end=False) == ""


def test_manila_date_of_a_timestamp():
    assert manila_date_text("2026-11-30T16:30:00+00:00") == "2026-12-01"
    assert manila_date_text("2026-11-30T15:59:59+00:00") == "2026-11-30"
    assert manila_date_text("2026-11-30") == "2026-11-30"


def _client(monkeypatch, loans):
    fake = FakeSupabase(loans=loans)
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: fake)
    app = FastAPI()
    app.include_router(reports_router.router)
    app.dependency_overrides[require_librarian] = lambda: LIBRARIAN
    return TestClient(app)


def test_reports_include_the_whole_first_and_last_manila_day(monkeypatch):
    loans = [
        loan(1, borrowed_at="2026-10-31T15:59:59+00:00"),  # 31 Oct 23:59:59 Manila: out
        loan(2, borrowed_at="2026-10-31T16:00:00+00:00"),  # 1 Nov 00:00:00 Manila: in
        loan(3, borrowed_at="2026-11-30T15:59:59+00:00"),  # 30 Nov 23:59:59 Manila: in
        loan(4, borrowed_at="2026-11-30T16:00:00+00:00"),  # 1 Dec 00:00:00 Manila: out
    ]
    res = _client(monkeypatch, loans).get("/reports/overdue", params={"date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.status_code == 200, res.text
    assert sorted(r["id"] for r in res.json()) == ["loan-2", "loan-3"]


def test_a_single_day_range_covers_that_whole_day(monkeypatch):
    loans = [loan(1, borrowed_at="2026-11-14T16:00:00+00:00"),   # 15 Nov 00:00 Manila
             loan(2, borrowed_at="2026-11-15T15:59:59+00:00"),   # 15 Nov 23:59:59 Manila
             loan(3, borrowed_at="2026-11-15T16:00:00+00:00")]   # 16 Nov
    res = _client(monkeypatch, loans).get("/reports/overdue", params={"date_from": "2026-11-15", "date_to": "2026-11-15"})
    assert sorted(r["id"] for r in res.json()) == ["loan-1", "loan-2"]


def test_export_uses_the_same_manila_days(monkeypatch):
    loans = [loan(1, borrowed_at="2026-10-31T15:59:59+00:00"), loan(2, borrowed_at="2026-10-31T16:00:00+00:00"),
             loan(3, borrowed_at="2026-11-30T15:59:59+00:00"), loan(4, borrowed_at="2026-11-30T16:00:00+00:00")]
    res = _client(monkeypatch, loans).post("/reports/export/preview", json={
        "report": "overdue", "date_from": str(date(2026, 11, 1)), "date_to": str(date(2026, 11, 30)),
    })
    assert res.status_code == 200, res.text
    assert res.json()["row_count"] == 2
    assert res.json()["period"].startswith("Loans borrowed 1 November 2026 to 30 November 2026 (Manila time)")
