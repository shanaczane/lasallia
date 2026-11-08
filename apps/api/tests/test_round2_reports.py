# The five new report exports: Top titles, Reservations, Accession register,
# Library usage (borrowing station sessions) and Library assistant usage.
# Each in all three formats, with figures that add up, Manila dates,
# paging, formula protection and the privacy rules. The database is faked.

import csv
import io
import json
import re
from datetime import date

import openpyxl
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from pypdf import PdfReader

import routers.reports as reports_router
from core.deps import get_current_user, require_librarian
from core.report_export.collection_reports import TOP_TITLES_LIMIT, accession_key
from core.report_export.csv_file import build_csv
from core.report_export.definitions import REPORTS, ExportFilters, ai_input
from core.report_export.excel import build_excel
from core.report_export.pdf import build_pdf
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)
from tests.round2_world import FORMULA_TITLE, GUESTS, NAMES, PRIVATE, _at, _session, _usage, round2_world
from tests.test_report_definitions import LIBRARIAN, NOVEMBER, _options
from tests.librarian_auth import allow_librarian

NEW = ["top_titles", "reservations", "accession_register", "library_usage", "assistant_usage"]
ACCESSIONS = ["T45000", "T45001", "T45002", "GS10", "GS9", "GS0010"]


def _build(report, filters=NOVEMBER, db=None):
    return REPORTS[report].build(db or round2_world(), filters)


def _figures(data) -> dict:
    return {f.label: f.number for f in data.key_figures if f.number is not None}


def _texts(data) -> dict:
    return {f.label: f.value for f in data.key_figures}


def _pdf_text(data) -> str:
    return " ".join(" ".join(p.extract_text().split()) for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)


def _excel_cells(data) -> list:
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    return [c for ws in wb.worksheets for row in ws.iter_rows() for c in row if c.value is not None]


def _csv(data, table="main") -> str:
    return build_csv(data, table).decode("utf-8-sig")


# ─── Every new report ───────────────────────────────────────────────────

@pytest.mark.parametrize("report", NEW)
def test_rows_match_columns_and_every_format_builds(report):
    data = _build(report)
    assert data.rows and data.chart, report
    keys = [c.key for c in data.columns]
    assert all(list(r) == keys for r in data.rows)
    assert _pdf_text(data).count(data.title.split(":")[0]) >= 1
    assert _excel_cells(data)
    header = next(csv.reader(io.StringIO(_csv(data))))
    assert header == [c.label for c in data.columns]


@pytest.mark.parametrize("report", NEW)
def test_no_email_id_number_or_internal_id_in_any_format(report):
    data = _build(report)
    files = (_pdf_text(data) + json.dumps([c.value for c in _excel_cells(data)], default=str) + _csv(data)
             + (_csv(data, "details") if data.details else ""))
    for value in PRIVATE + ["private reservation note", "private reason", "private note"]:
        assert value not in files, (report, value)


@pytest.mark.parametrize("report", NEW)
def test_ai_gets_totals_only(report):
    payload = json.dumps(ai_input(_build(report)))
    for value in PRIVATE + NAMES + GUESTS + ACCESSIONS:
        assert value not in payload, (report, value)


@pytest.mark.parametrize("report", NEW)
def test_no_bare_number_in_brackets(report):
    data = _build(report)
    for text in [f.value for f in data.key_figures] + [data.computed_summary]:
        assert not re.search(r"\(\s*[\d,]+(\.\d+)?\s*(each)?\s*\)", text), (report, text)


@pytest.mark.parametrize("report", ["top_titles", "reservations", "accession_register"])
def test_formula_titles_are_text(report):
    db = round2_world()
    # A November loan of the book whose title looks like a formula.
    db.tables["loans"].append(loan(9, borrowed_at=_at("2026-11-15"), title=FORMULA_TITLE))
    db.tables["loans"][-1]["book_copies"]["books"]["id"] = "book-3"
    data = _build(report, db=db)
    cells = [c for c in _excel_cells(data) if c.value == FORMULA_TITLE]
    assert cells and all(c.data_type == "s" and c.quotePrefix for c in cells)
    assert f"'{FORMULA_TITLE}" in _csv(data)


@pytest.mark.parametrize("report", NEW)
def test_empty_period(report):
    if report == "accession_register":
        pytest.skip("as of now: no period")
    data = _build(report, ExportFilters(date_from=date(2020, 1, 1), date_to=date(2020, 1, 31)))
    assert not data.rows and data.chart is None
    assert data.computed_summary == data.empty_message
    _pdf_text(data), _excel_cells(data), _csv(data)


@pytest.mark.parametrize("report", NEW)
def test_librarian_only(report):
    app = FastAPI()
    app.include_router(reports_router.router)
    app.dependency_overrides[get_current_user] = lambda: UserProfile(
        id="u1", email="u@dlsl.edu.ph", role="student", full_name="Student")
    client = TestClient(app)
    for path in ("/reports/export", "/reports/export/preview", "/reports/export/rows"):
        assert client.post(path, json={"report": report, "format": "pdf"}).status_code == 403


# ─── Top titles ─────────────────────────────────────────────────────────

def test_top_titles_rank_student_plus_in_house_loans():
    data = _build("top_titles")
    assert [(r["rank"], r["title"], r["student_loans"], r["in_house_loans"], r["total"]) for r in data.rows] == [
        (1, "Clean code", 2, 1, 3), (2, "Old accounting", 0, 1, 1)]
    f = _figures(data)
    assert f["Student loans"] + f["In-house loans"] == f["Loans"] == 4
    assert f["Loans of the 2 titles listed"] + f["Loans of other titles"] == f["Loans"]
    assert _texts(data)["Most borrowed"] == "Clean code (3 loans)"
    assert [name for name, _ in data.chart.series] == ["Student loans", "In-house loans"]
    assert data.chart.labels == ["#1", "#2"]
    assert "A loan is a student loan or an in-house (guest) loan." in data.filters


def test_top_titles_limit_and_ties_by_title():
    db = round2_world()
    db.tables["in_house_loans"] = []
    db.tables["loans"] = [loan(i, borrowed_at=_at("2026-11-10"), title=f"Title {i:03d}") for i in range(60)]
    for l in db.tables["loans"]:
        l["book_copies"]["books"]["id"] = l["book_copies"]["book_id"]
    data = _build("top_titles", db=db)
    assert len(data.rows) == TOP_TITLES_LIMIT
    assert data.rows[0]["title"] == "Title 000"
    f = _figures(data)
    assert (f["Loans of the 50 titles listed"], f["Loans of other titles"], f["Loans"]) == (50, 10, 60)
    assert _texts(data)["Most borrowed"] == "60 titles tied (1 loan each)"


def test_top_titles_borrower_filter_leaves_guests_out():
    filters = ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to, college="CITE")
    data = _build("top_titles", filters)
    assert _figures(data)["In-house loans"] == 0
    assert any("In-house (guest) loans are left out" in line for line in data.filters)


# ─── Reservations ───────────────────────────────────────────────────────

def test_reservations_made_in_the_period_with_their_outcome():
    data = _build("reservations")
    assert [(r["requested"], r["status"], r["outcome"]) for r in data.rows] == [
        ("2026-11-02", "Waiting", "Waiting for a copy"),
        ("2026-11-03", "Ready for pickup", "Ready, pick up by November 20, 2026"),
        ("2026-11-04", "Picked up", "Picked up November 6, 2026"),
        ("2026-11-05", "Cancelled", "Cancelled November 5, 2026"),
        ("2026-11-06", "Expired", "Expired (pickup deadline November 9, 2026)"),
    ]
    f = _figures(data)
    statuses = ["Waiting", "Ready for pickup", "Picked up", "Cancelled", "Expired"]
    assert sum(f[s] for s in statuses) == f["Reservations made"] == 5
    assert (f["Patrons"], f["Titles reserved"]) == (2, 2)
    assert "with each reservation's status as of" in data.period


def test_reservation_status_figures_only_for_statuses_present_and_unknown_ones_count():
    db = round2_world()
    db.tables["reservations"] = [r for r in db.tables["reservations"] if r["status"] in ("pending", "ready")]
    db.tables["reservations"][1]["status"] = "confirmed"  # an old status
    data = _build("reservations", db=db)
    f = _figures(data)
    assert "Picked up" not in f
    assert f["Waiting"] + f["confirmed"] == f["Reservations made"]


def test_reservation_filters_apply_to_the_patron_and_book():
    by_college = _build("reservations", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                       college="CBEAM"))
    assert {r["patron"] for r in by_college.rows} == {"Maria Santos"}
    by_category = _build("reservations", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                        category="BSA"))
    assert not by_category.rows


# ─── Accession register ─────────────────────────────────────────────────

def test_register_in_accession_order_with_how_each_copy_was_added():
    data = _build("accession_register")
    assert [(r["accession"], r["origin"]) for r in data.rows] == [
        ("GS9", "Registered existing number"), ("GS10", "Registered existing number"),
        ("T45000", "Numbered by Lasallia"), ("T45001", "Imported"), ("T45002", "Not recorded")]
    gs10 = data.rows[1]
    assert gs10["remarks"] == "Number corrected from GS0010 on October 2, 2026; Title archived"
    assert (gs10["added"], gs10["source"], gs10["status"]) == ("2026-10-01", "Donated", "Available")
    clean = data.rows[2]
    assert (clean["acquired"], clean["source"]) == ("2010-02-14", "Purchased")
    assert data.uses_dates is False and data.period.startswith("As of ")
    assert data.filename_stem.startswith("accession-register_as_of_")


def test_register_figures_add_up_to_copies():
    data = _build("accession_register")
    f = _figures(data)
    origins = ["Numbered by Lasallia", "Registered existing number", "Imported", "Not recorded"]
    assert sum(f[o] for o in origins) == f["Copies"] == len(data.rows) == 5
    assert (f["Titles"], f["Copies with a corrected number"]) == (3, 1)


def test_register_reads_past_1000_copies_and_category_filter():
    db = round2_world()
    db.tables["book_copies"] = [{"id": f"c{i}", "book_id": "book-1", "accession_number": f"T{i}", "status": "available",
                                 "origin": "imported", "created_at": _at("2026-01-01")} for i in range(1005, 0, -1)]
    data = _build("accession_register", db=db)
    assert len(data.rows) == 1005
    assert [r["accession"] for r in data.rows[:3]] == ["T1", "T2", "T3"]
    assert not _build("accession_register", ExportFilters(category="BSA"), db=db).rows


def test_accession_key():
    values = ["T10", "t9", "GS10", "GS2", "T0045", "T45312-C2", "ODD", ""]
    assert sorted(values, key=accession_key) == ["GS2", "GS10", "t9", "T10", "T0045", "T45312-C2", "", "ODD"]


# ─── Library usage: borrowing station sessions ──────────────────────────

def test_library_usage_counts_kiosk_sessions_in_manila_days_and_hours():
    data = _build("library_usage")
    f, t = _figures(data), _texts(data)
    assert (f["Borrowing station sessions"], f["Students"], f["Days with sessions"]) == (4, 2, 2)
    assert t["Busiest day"] == "November 3, 2026 (3 sessions)"
    assert t["Peak hour"] == "9–10 AM (2 sessions)"
    by_day = {r["date"]: r for r in data.rows}
    assert len(data.rows) == 30 and sum(r["sessions"] for r in data.rows) == 4
    # 16:30 UTC on 1 November is 12:30 AM on 2 November in Manila.
    assert (by_day["2026-11-02"]["sessions"], by_day["2026-11-02"]["peak_hour"]) == (1, "12–1 AM")
    assert by_day["2026-11-03"] == {"date": "2026-11-03", "day": "Tuesday", "sessions": 3, "students": 2,
                                    "peak_hour": "9–10 AM", "peak_sessions": 2}
    assert by_day["2026-11-04"]["sessions"] == 0 and by_day["2026-11-04"]["peak_hour"] == "—"
    hours = {r["hour"]: r["sessions"] for r in data.details.rows}
    assert sum(hours.values()) == 4 and hours["9–10 AM"] == 2 and hours["12–1 PM"] == 0 and hours["1–2 PM"] == 1


def test_library_usage_period_line_says_what_isnt_counted():
    data = _build("library_usage")
    assert data.title == "Library Usage: Borrowing Station Sessions"
    assert data.period.startswith("Borrowing station sessions started November 1, 2026 to November 30, 2026 (Manila time)")
    assert "Guests browsing without tapping an ID aren't counted" in data.period
    assert "all kiosks share one station ID" in data.period
    assert data.key_figures[0].label == "Borrowing station sessions"


def test_library_usage_filters():
    by_college = _build("library_usage", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                        college="CBEAM"))
    assert _figures(by_college)["Borrowing station sessions"] == 1
    by_category = _build("library_usage", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                         category="BSA"))
    assert _figures(by_category)["Borrowing station sessions"] == 4
    assert "Category doesn't apply to borrowing station sessions, so it was ignored." in by_category.filters


def test_library_usage_reads_past_1000_sessions():
    db = round2_world()
    db.tables["station_sessions"] = [_session(i, "2026-11-10T02:00:00+00:00") for i in range(1005)]
    assert _figures(_build("library_usage", db=db))["Borrowing station sessions"] == 1005


# ─── Library assistant usage ────────────────────────────────────────────

def test_assistant_usage_groups_add_up():
    data = _build("assistant_usage")
    f = _figures(data)
    total = f["Questions answered"]
    assert total == 6 and f["Chat sessions"] == 4
    assert f["Kiosk"] + f["Web"] == total
    assert f["Guests"] + f["Signed-in students and faculty"] + f["Librarians and staff"] == total
    assert f["Rule-based answers"] + f["AI answers"] + f["Answer type not recorded"] == total
    assert (f["Librarians and staff"], f["Answer type not recorded"]) == (1, 1)
    assert _texts(data)["Busiest day"] == "November 4, 2026 (3 questions)"
    assert "Answers: 2 rule-based, 3 from the AI and 1 with no answer type recorded." in data.computed_summary
    assert [name for name, _ in data.chart.series] == ["Rule-based answers", "AI answers", "Answer type not recorded"]


def test_assistant_usage_daily_rows_add_up():
    data = _build("assistant_usage")
    assert len(data.rows) == 30
    by_day = {r["date"]: r for r in data.rows}
    day = by_day["2026-11-04"]
    assert (day["questions"], day["sessions"], day["kiosk"], day["web"], day["guests"], day["signed_in"],
            day["staff"], day["rule"], day["ai"], day["not_recorded"]) == (3, 2, 1, 2, 1, 2, 0, 2, 1, 0)
    for r in data.rows:
        assert r["kiosk"] + r["web"] == r["questions"]
        assert r["guests"] + r["signed_in"] + r["staff"] == r["questions"]
        assert r["rule"] + r["ai"] + r["not_recorded"] == r["questions"]
    assert sum(r["questions"] for r in data.rows) == 6


def test_assistant_usage_period_line_says_when_counts_are_complete():
    data = _build("assistant_usage")
    assert "Counts are complete from November 4, 2026" in data.period
    assert "with no record of rule-based or AI answers" in data.period
    db = round2_world()
    db.tables["assistant_usage"] = [r for r in db.tables["assistant_usage"] if r["answered_by"] is None]
    data = _build("assistant_usage", db=db)
    assert "Counting of new questions hasn't started yet" in data.period
    assert "Rule-based answers" in _figures(data) and _figures(data)["Answer type not recorded"] == 1


def test_assistant_usage_without_backfilled_rows_has_no_not_recorded_figure():
    db = round2_world()
    db.tables["assistant_usage"] = [r for r in db.tables["assistant_usage"] if r["answered_by"]]
    data = _build("assistant_usage", db=db)
    assert "Answer type not recorded" not in _figures(data)
    assert [name for name, _ in data.chart.series] == ["Rule-based answers", "AI answers"]


def test_assistant_usage_ignores_filters_it_cant_apply_and_says_so():
    data = _build("assistant_usage", ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to,
                                                   category="BSIT", college="CITE"))
    assert _figures(data)["Questions answered"] == 6
    assert any("Category and College don't apply to the library assistant" in line for line in data.filters)


def test_assistant_usage_reads_past_1000_rows():
    db = round2_world()
    db.tables["assistant_usage"] = [_usage(i, "2026-11-10T02:00:00+00:00", "web", "guest", "rule", f"k{i}")
                                    for i in range(1005)]
    f = _figures(_build("assistant_usage", db=db))
    assert (f["Questions answered"], f["Chat sessions"]) == (1005, 1005)


class MissingUsageTable(FakeSupabase):
    def table(self, name):
        query = super().table(name)
        if name == "assistant_usage":
            def missing():
                raise APIError({"code": "PGRST205", "message": "Could not find the table 'public.assistant_usage'"})
            query.execute = missing
        return query


def _client(monkeypatch, db):
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(reports_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app)


def test_assistant_usage_before_the_migration_says_so(monkeypatch):
    db = MissingUsageTable(**round2_world().tables)
    res = _client(monkeypatch, db).post("/reports/export/preview", json={"report": "assistant_usage"})
    assert res.status_code == 503
    assert "0070_assistant_usage.sql" in res.json()["detail"]


# ─── On-screen rows ─────────────────────────────────────────────────────

def test_rows_endpoint_returns_the_export_table(monkeypatch):
    res = _client(monkeypatch, round2_world()).post(
        "/reports/export/rows", json={"report": "library_usage", "date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert [c["label"] for c in body["columns"]][:3] == ["Date", "Day", "Sessions"]
    assert len(body["rows"]) == 30 and body["title"] == "Library Usage: Borrowing Station Sessions"


@pytest.mark.parametrize("report", NEW)
def test_preview_and_ai_summary_endpoints(monkeypatch, report):
    client = _client(monkeypatch, round2_world())
    body = {"report": report, "date_from": "2026-11-01", "date_to": "2026-11-30"}
    preview = client.post("/reports/export/preview", json=body)
    assert preview.status_code == 200, preview.text
    assert preview.json()["uses_dates"] is (report != "accession_register")
    for fmt in ("pdf", "xlsx", "csv"):
        res = client.post("/reports/export", json={**body, "format": fmt})
        assert res.status_code == 200 and res.content
