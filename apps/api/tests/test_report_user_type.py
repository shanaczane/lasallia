# The user_type filter on every borrower-based report, and in the export
# header. Faculty and students each have one loan, so a wrong filter shows
# up as a wrong count.

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.reports as reports
import routers.patrons as patrons_router
import routers.reports as reports_router
from core.deps import get_user_supabase
from core.report_export.definitions import REPORTS, ExportFilters
from core.reports import (
    ReportFilters,
    borrowing_trends,
    circulation_summary,
    fines_report,
    library_stats,
    overdue_rows,
    top_patrons,
    transaction_stats,
    transaction_trend,
)
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.librarian_auth import allow_librarian
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")


def _reservation(role: str) -> dict:
    return {
        "status": "pending", "requested_at": "2026-11-01T00:00:00+00:00", "books": {"category": "General"},
        "profiles": {"program": "BSIT", "college": "CITE", "year_level": 2, "role": role},
    }


@pytest.fixture
def db():
    return FakeSupabase(
        loans=[
            loan(1, student="s1", name="Ana Student", role="student"),
            loan(2, student="f1", name="Ben Faculty", role="faculty"),
            loan(3, student="f2", name="Cy Faculty", role="faculty"),
        ],
        reservations=[_reservation("student"), _reservation("faculty"), _reservation("faculty")],
        books=[],
        book_copies=[],
    )


def _filters(user_type):
    return ReportFilters(user_type=user_type)


@pytest.mark.parametrize("user_type, names", [
    (None, {"Ana Student", "Ben Faculty", "Cy Faculty"}),
    ("student", {"Ana Student"}),
    ("faculty", {"Ben Faculty", "Cy Faculty"}),
])
def test_top_patrons(db, user_type, names):
    assert {p.name for p in top_patrons(db, _filters(user_type), limit=10)} == names


@pytest.mark.parametrize("user_type, count", [(None, 3), ("student", 1), ("faculty", 2)])
def test_overdue(db, user_type, count):
    assert len(overdue_rows(db, _filters(user_type))) == count


@pytest.mark.parametrize("user_type, count", [(None, 3), ("student", 1), ("faculty", 2)])
def test_fines(db, user_type, count):
    assert len(fines_report(db, _filters(user_type))) == count


@pytest.mark.parametrize("user_type, count", [(None, 3), ("student", 1), ("faculty", 2)])
def test_library_usage(db, user_type, count):
    stats = library_stats(db, _filters(user_type))
    assert stats.active_borrowers == count
    assert stats.overdue_count == count


@pytest.mark.parametrize("user_type, loans, reservations", [(None, 3, 3), ("student", 1, 1), ("faculty", 2, 2)])
def test_reservations_and_transactions(db, user_type, loans, reservations):
    stats = transaction_stats(db, _filters(user_type))
    assert (stats.loan_count, stats.reservation_count) == (loans, reservations)


@pytest.mark.parametrize("user_type, count", [(None, 3), ("student", 1), ("faculty", 2)])
def test_circulation(db, user_type, count):
    assert sum(b.value for b in circulation_summary(db, _filters(user_type), months=2)) == count


@pytest.mark.parametrize("user_type, count", [(None, 3), ("student", 1), ("faculty", 2)])
def test_borrowing_statistics(db, user_type, count):
    assert sum(b.value for b in borrowing_trends(db, _filters(user_type), weeks=4)) == count
    assert sum(p.borrows for p in transaction_trend(db, _filters(user_type), weeks=4)) == count


def test_a_loan_with_no_borrower_only_shows_for_everyone(db):
    db.tables["loans"].append({**loan(4, student="gone"), "profiles": None})
    assert len(overdue_rows(db, _filters(None))) == 4
    assert len(overdue_rows(db, _filters("student"))) == 1


# ── through the API ──

@pytest.fixture
def client(db, monkeypatch):
    app = FastAPI()
    app.include_router(reports_router.router)
    app.include_router(patrons_router.router)
    allow_librarian(app, LIBRARIAN)
    app.dependency_overrides[get_user_supabase] = lambda: db
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    return TestClient(app)


@pytest.mark.parametrize("value, count", [("student", 1), ("faculty", 2), ("all", 3)])
def test_the_api_takes_user_type(client, value, count):
    assert len(client.get("/reports/overdue", params={"user_type": value}).json()) == count


def test_leaving_it_out_means_everyone(client):
    assert len(client.get("/reports/overdue").json()) == 3


def test_an_unknown_user_type_is_refused(client):
    assert client.get("/reports/overdue", params={"user_type": "librarian"}).status_code == 422


# ── the export header ──

@pytest.mark.parametrize("user_type, line", [
    ("student", "User type: Student"),
    ("faculty", "User type: Faculty/Lasallian Partner"),
])
def test_the_user_type_is_printed_with_the_period(db, user_type, line):
    data = REPORTS["overdue"].build(db, ExportFilters(date_from=date(2020, 1, 1), user_type=user_type))
    assert line in data.filters


def test_no_user_type_line_without_a_filter(db):
    data = REPORTS["overdue"].build(db, ExportFilters())
    assert not any(l.startswith("User type") for l in data.filters)


def test_the_export_only_counts_that_user_type(client):
    res = client.post("/reports/export/preview", json={"report": "overdue", "user_type": "faculty"})
    assert res.json()["row_count"] == 2
    assert "User type: Faculty/Lasallian Partner" in res.json()["filters"]


def test_all_on_an_export_means_no_filter(client):
    res = client.post("/reports/export/preview", json={"report": "overdue", "user_type": "all"})
    assert res.json()["row_count"] == 3
    assert res.json()["filters"] == []


# ── Patrons list ──

def test_the_patrons_list_reads_past_the_row_limit(client, db):
    db.tables["profiles"] = [
        {"id": f"p{i:04}", "email": f"p{i}@dlsl.edu.ph", "role": "student", "full_name": f"Name {i:04}",
         "created_at": "2026-01-01T00:00:00+00:00"}
        for i in range(2300)
    ]
    db.max_rows = 1000
    assert len(client.get("/users").json()) == 2300
