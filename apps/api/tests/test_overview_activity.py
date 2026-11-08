# The Library Overview and Activity Log exports: figures that match their
# own reports and add up, every format, privacy, and what happens before
# migration 0070. The database is faked.

import json
import re
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.reports as reports_router
from core.deps import require_librarian
from core.report_export.definitions import REPORTS, ExportFilters, ai_input
from tests.report_export_fixtures import predictable_fines  # noqa: F401  (autouse fixture)
from tests.round2_world import GUESTS, NAMES, PRIVATE, round2_world
from tests.test_report_definitions import LIBRARIAN, NOVEMBER
from tests.test_round2_reports import (
    ACCESSIONS,
    MissingUsageTable,
    _build,
    _csv,
    _excel_cells,
    _figures,
    _pdf_text,
    _texts,
)

BOTH = ["overview", "activity_log"]


@pytest.mark.parametrize("report", BOTH)
def test_every_format_builds_without_private_details(report):
    data = _build(report)
    assert data.rows and data.chart
    keys = [c.key for c in data.columns]
    assert all(list(r) == keys for r in data.rows)
    files = _pdf_text(data) + json.dumps([c.value for c in _excel_cells(data)], default=str) + _csv(data)
    for value in PRIVATE:
        assert value not in files, (report, value)
    payload = json.dumps(ai_input(data))
    for value in PRIVATE + NAMES + GUESTS + ACCESSIONS:
        assert value not in payload, (report, value)


@pytest.mark.parametrize("report", BOTH)
def test_no_bare_number_in_brackets(report):
    data = _build(report)
    for text in [f.value for f in data.key_figures] + [data.computed_summary]:
        assert not re.search(r"\(\s*[\d,]+(\.\d+)?\s*(each)?\s*\)", text), (report, text)


@pytest.mark.parametrize("report", BOTH)
def test_empty_period(report):
    data = _build(report, ExportFilters(date_from=date(2020, 1, 1), date_to=date(2020, 1, 31)))
    _pdf_text(data), _excel_cells(data), _csv(data)
    if report == "activity_log":
        assert not data.rows and data.computed_summary == data.empty_message


# ─── Overview ───────────────────────────────────────────────────────────

def test_overview_figures_match_their_own_reports():
    overview = {r["figure"]: r for r in _build("overview").rows}
    sources = {
        "circulation": ["Borrows", "Returns", "In-house checkouts", "In-house returns", "Transactions"],
        "reservations": ["Reservations made"],
        "overdue": ["Overdue loans"],
        "library_usage": ["Borrowing station sessions"],
        "assistant_usage": ["Questions answered"],
    }
    for report, labels in sources.items():
        own = _texts(_build(report))
        for label in labels:
            assert overview[label]["value"] == own[label], (report, label)
    fines = _texts(_build("fines"))
    assert overview["Outstanding fines"]["value"] == fines["Outstanding"]
    assert overview["Fines paid"]["value"] == fines["Paid"]
    catalog = _texts(_build("catalog", ExportFilters()))
    assert overview["Copies"]["value"] == catalog["Copies"]
    assert overview["Weeding candidates"]["value"] == _texts(_build("weeding_candidates", ExportFilters()))["Candidates"]


def test_overview_says_how_each_figure_is_counted_and_figures_add_up():
    data = _build("overview")
    rows = {r["figure"]: r for r in data.rows}
    assert rows["Borrows"]["counted"] == "In the period"
    assert rows["Copies"]["counted"] == "As of now"
    assert rows["Overdue loans"]["counted"] == "Borrowed in the period, overdue now"
    assert rows["Outstanding fines"]["counted"].startswith("On books returned in the period")
    f = _figures(data)
    assert f["Borrows"] + f["Returns"] > 0
    counts = {k: int(rows[k]["value"].replace(",", "")) for k in
              ("Borrows", "Returns", "In-house checkouts", "In-house returns", "Transactions",
               "Copies available", "Copies not available", "Copies")}
    assert counts["Borrows"] + counts["Returns"] + counts["In-house checkouts"] + counts["In-house returns"] \
        == counts["Transactions"]
    assert counts["Copies available"] + counts["Copies not available"] == counts["Copies"]
    assert "Period figures 1 November 2026 to 30 November 2026 (Manila time)" in data.period
    assert any("use only the Category filter" in line for line in data.filters)


def test_overview_collection_ignores_borrower_college():
    # College means the borrower's college in the period figures; the
    # collection figures use only Category.
    with_college = _build("overview", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                    college="CBEAM"))
    rows = {r["figure"]: r["value"] for r in with_college.rows}
    assert rows["Copies"] == _texts(_build("catalog", ExportFilters()))["Copies"]


def _client(monkeypatch, db):
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(reports_router.router)
    app.dependency_overrides[require_librarian] = lambda: LIBRARIAN
    return TestClient(app)


def test_overview_works_before_migration_0070(monkeypatch):
    db = MissingUsageTable(**round2_world().tables)
    res = _client(monkeypatch, db).post("/reports/export/preview", json={"report": "overview"})
    assert res.status_code == 200, res.text
    data = REPORTS["overview"].build(db, NOVEMBER)
    row = {r["figure"]: r for r in data.rows}["Questions answered"]
    assert row["value"] == "Not available yet" and "0070" in row["counted"]


# ─── Activity Log ───────────────────────────────────────────────────────

def test_activity_log_lists_every_event_on_its_own_date():
    data = _build("activity_log")
    f = _figures(data)
    parts = ["Borrows", "Returns", "Reservations made", "In-house checkouts", "In-house returns"]
    assert sum(f[p] for p in parts) == f["Events"] == len(data.rows)
    assert (f["Borrows"], f["Returns"], f["Reservations made"], f["In-house checkouts"], f["In-house returns"]) \
        == (2, 1, 5, 2, 1)
    guest = [r for r in data.rows if r["activity"].startswith("In-house")]
    assert {r["patron"] for r in guest} == {"Pedro Visitor (guest)", "Rico Guest (guest)"}
    assert [r["date"] for r in data.rows] == sorted(r["date"] for r in data.rows)
    assert _texts(data)["Busiest day"] == "3 November 2026 (4 events)"
    assert [name for name, _ in data.chart.series] == parts


def test_activity_log_borrower_filters_leave_guests_out():
    data = _build("activity_log", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                college="CBEAM"))
    assert not any(r["activity"].startswith("In-house") for r in data.rows)
    assert {r["patron"] for r in data.rows} == {"Maria Santos"}
    assert any("In-house (guest) loans are left out" in line for line in data.filters)


@pytest.mark.parametrize("report", BOTH)
def test_endpoints(monkeypatch, report):
    client = _client(monkeypatch, round2_world())
    body = {"report": report, "date_from": "2026-11-01", "date_to": "2026-11-30"}
    assert client.post("/reports/export/preview", json=body).status_code == 200
    for fmt in ("pdf", "xlsx", "csv"):
        res = client.post("/reports/export", json={**body, "format": fmt})
        assert res.status_code == 200 and res.content
