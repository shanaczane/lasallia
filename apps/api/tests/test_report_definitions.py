# The round 1 report exports (core/report_export/definitions.py): every
# report built from one made-up library, in all three formats, with the
# privacy rules checked on each. The database is faked; nothing is written.

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta, timezone

import openpyxl
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

import routers.reports as reports_router
from core.deps import get_current_user, require_librarian
from core.report_export import layout
from core.report_export.csv_file import build_csv
from core.report_export.definitions import REPORTS, TOP_PATRONS_LIMIT, ExportFilters, ai_input
from core.report_export.excel import build_excel
from core.report_export.pdf import build_pdf
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)
from tests.librarian_auth import allow_librarian

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")
NOVEMBER = ExportFilters(date_from=date(2026, 11, 1), date_to=date(2026, 11, 30))
ROUND_1 = ["circulation", "borrowing_stats", "top_patrons", "fines", "catalog", "shelf_list",
           "weeding_candidates", "weeding_log", "inventory", "book_requests"]
SNAPSHOTS = {"catalog", "shelf_list", "weeding_candidates"}

# Personal details in the made-up data. None may appear in any export; names
# may appear in tables (borrowers, requesters, staff) but never in AI data.
EMAILS = ["juan.delacruz@dlsl.edu.ph", "maria.santos@dlsl.edu.ph", "faculty.one@dlsl.edu.ph"]
ID_NUMBERS = ["2021-00001", "2022-00002"]
INTERNAL_IDS = ["student-uuid-1", "student-uuid-2", "staff-uuid-1", "request-uuid-1", "loan-1", "copy-uuid-1"]
NAMES = ["Juan Dela Cruz", "Maria Santos", "Prof Ana Reyes", "Staff Mark Lim"]
ACCESSIONS = ["T45000", "T45001", "T45002"]


def _at(day: str, hour: int = 2) -> str:
    return f"{day}T{hour:02d}:00:00+00:00"


def world() -> FakeSupabase:
    books = [
        {"id": "book-1", "title": "Clean code", "author": "Robert C. Martin", "category": "BSIT", "subject": "CITE",
         "call_number": "005.1 M379 2008", "published_year": 2008, "shelf_location": "Floor 2 · Aisle 3",
         "floor": "Floor 2", "aisle": "Aisle 3", "archived_at": None, "weeding_dismissed_at": None,
         "created_at": _at("2010-01-01"), "collection_type": "General"},
        {"id": "book-2", "title": "Old accounting", "author": "A. Author", "category": "BSA", "subject": "CBEAM",
         "call_number": "657 A1 1990", "published_year": 1990, "shelf_location": "Floor 2 · Aisle 1",
         "floor": "Floor 2", "aisle": "Aisle 1", "archived_at": None, "weeding_dismissed_at": None,
         "created_at": _at("2001-01-01"), "collection_type": "General"},
    ]
    copies = [
        {"id": "copy-uuid-1", "book_id": "book-1", "accession_number": "T45000", "status": "on_loan", "shelf_location": None},
        {"id": "copy-uuid-2", "book_id": "book-1", "accession_number": "T45001", "status": "available", "shelf_location": None},
        {"id": "copy-uuid-3", "book_id": "book-2", "accession_number": "T45002", "status": "missing", "shelf_location": None},
    ]
    juan = dict(name="Juan Dela Cruz", email=EMAILS[0], id_number=ID_NUMBERS[0], student="student-uuid-1", program="BSIT")
    maria = dict(name="Maria Santos", email=EMAILS[1], id_number=ID_NUMBERS[1], student="student-uuid-2",
                 program="BSA", year_level=3)
    loans = [
        loan(1, borrowed_at=_at("2026-11-03"), days_late=5, accession="T45000", **juan),
        loan(2, borrowed_at=_at("2026-11-04"), days_late=-2, accession="T45001", **juan),
        {**loan(3, borrowed_at=_at("2024-10-20"), accession="T45002", **maria),          # borrowed long ago
         "status": "returned", "returned_at": _at("2026-11-05"), "fine_amount": 25.0, "fine_status": "paid",
         "receipt_number": "OR-1001"},
        loan(4, borrowed_at=_at("2026-01-05"), days_late=60, title="Old accounting", **maria),  # overdue since January
    ]
    for l, copy_id in zip(loans, ["copy-uuid-1", "copy-uuid-2", "copy-uuid-3", "copy-uuid-3"]):
        l["book_copies"]["books"]["id"] = l["book_copies"]["book_id"]
        l["book_copy_id"] = copy_id
    staff = {"id": "staff-uuid-1", "full_name": "Staff Mark Lim", "email": "staff@dlsl.edu.ph"}
    return FakeSupabase(
        books=books, book_copies=copies, loans=loans,
        reservations=[{"id": "res-1", "status": "pending", "requested_at": _at("2026-11-06"),
                       "books": {"category": "BSIT"}, "profiles": {"program": "BSIT", "college": "CITE", "year_level": 2}}],
        profiles=[staff],
        weeding_events=[
            {"id": "ev-1", "book_id": "book-2", "event_type": "dismissed", "reason": "Still used in BSA classes",
             "performed_by": "staff-uuid-1", "occurred_at": _at("2026-11-07"),
             "books": {"title": "Old accounting"}, "profiles": {"full_name": "Staff Mark Lim"}},
            {"id": "ev-2", "book_id": "book-2", "event_type": "archived", "reason": None,
             "performed_by": "staff-uuid-1", "occurred_at": _at("2026-10-07"),
             "books": {"title": "Old accounting"}, "profiles": {"full_name": "Staff Mark Lim"}},
        ],
        inventory_sessions=[{"id": "check-1", "floor": "Floor 2", "aisle": "Aisle 3", "status": "completed",
                             "started_by": "staff-uuid-1", "started_at": _at("2026-11-02"), "completed_at": _at("2026-11-02", 5),
                             "skip_seen_since": None}],
        inventory_items=[
            {"id": "item-1", "session_id": "check-1", "book_copy_id": "copy-uuid-2", "expected": True, "result": "found",
             "expected_location": "Floor 2 · Aisle 3", "scanned_at": _at("2026-11-02", 3), "resolution": None,
             "resolved_at": None,
             "book_copies": {"accession_number": "T45001", "status": "available", "book_id": "book-1",
                             "books": {"title": "Clean code", "author": "Robert C. Martin", "call_number": "005.1 M379 2008"}}},
            {"id": "item-2", "session_id": "check-1", "book_copy_id": "copy-uuid-3", "expected": True,
             "result": "not_found", "expected_location": "Floor 2 · Aisle 1", "scanned_at": None,
             "resolution": "marked_missing", "resolved_at": _at("2026-11-02", 6),
             "book_copies": {"accession_number": "T45002", "status": "missing", "book_id": "book-2",
                             "books": {"title": "Old accounting", "author": "A. Author", "call_number": "657 A1 1990"}}},
        ],
        book_requests=[{"id": "request-uuid-1", "requester_id": "faculty-uuid-1", "title": "Refactoring",
                        "author": "Martin Fowler", "isbn": "9780134757599", "format": "print", "copies": 2,
                        "course": "IT 301", "note": "SECRET NOTE for my thesis students", "status": "approved",
                        "created_at": _at("2026-11-08"), "reviewed_at": _at("2026-11-09"),
                        "profiles": {"full_name": "Prof Ana Reyes", "email": EMAILS[2], "college": "CITE"}}],
        library_settings=[],
    )


def _build(report: str, filters: ExportFilters = NOVEMBER, db=None):
    return REPORTS[report].build(db or world(), filters)


def _options(data):
    settings = {"library_name": "De La Salle Lipa - Learning Resource Center", "address": "Lipa City"}
    return layout.ExportOptions(
        header=layout.report_header(settings), summary_text=data.computed_summary,
        summary_label=layout.summary_label("computed", data.computed_summary, data.computed_summary),
        signatories=layout.signatories(settings, {"prepared_by": "Ana"}),
    )


def _everything(data) -> str:
    detail_rows = data.details.rows if data.details else []
    return json.dumps([data.rows, detail_rows, data.key_figures.__repr__(), data.computed_summary, data.period,
                       data.filters], default=str)


# ─── Every report: columns, privacy, formats ────────────────────────────

@pytest.mark.parametrize("report", ROUND_1)
def test_rows_match_their_columns(report):
    data = _build(report)
    assert data.rows, report
    keys = {c.key for c in data.columns}
    assert all(set(row) == keys for row in data.rows)


@pytest.mark.parametrize("report", ROUND_1)
def test_no_emails_id_numbers_or_internal_ids_anywhere(report):
    text = _everything(_build(report))
    for value in EMAILS + ID_NUMBERS + INTERNAL_IDS + ["SECRET NOTE"]:
        assert value not in text, f"{value!r} in the {report} export"


@pytest.mark.parametrize("report", ROUND_1)
def test_ai_data_is_aggregates_only(report):
    # Exactly what the export dialog's AI draft is made from.
    sent = json.dumps(ai_input(_build(report)), default=str, ensure_ascii=False)
    for value in EMAILS + ID_NUMBERS + INTERNAL_IDS + NAMES + ACCESSIONS + ["SECRET NOTE"]:
        assert value not in sent, f"{value!r} in the {report} AI data"


@pytest.mark.parametrize("report", ROUND_1)
def test_period_or_as_of(report):
    data = _build(report)
    if report in SNAPSHOTS:
        assert not data.uses_dates and data.period.startswith("As of ") and data.period.endswith("(Manila time)")
    else:
        assert data.uses_dates and "November 1, 2026 to November 30, 2026" in data.period


@pytest.mark.parametrize("report", ROUND_1)
def test_empty_library(report):
    empty = FakeSupabase(books=[], book_copies=[], loans=[], reservations=[], weeding_events=[], profiles=[],
                         inventory_sessions=[], inventory_items=[], book_requests=[], library_settings=[])
    data = _build(report, db=empty)
    assert data.rows == [] and data.chart is None and data.computed_summary == data.empty_message
    text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)
    assert data.empty_message in text and "Approved by:" in text


@pytest.mark.parametrize("report", ROUND_1)
def test_all_three_formats(report):
    data = _build(report)
    pdf = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)
    for expected in ("De La Salle Lipa", "Learning Resource Center", data.title, "Key figures", "Prepared by:"):
        assert expected in pdf, (report, expected)

    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    ws = wb.worksheets[0]
    figures = {ws.cell(r, 1).value: ws.cell(r, 3) for r in range(1, ws.max_row + 1)
               if ws.cell(r, 1).value in {f.label for f in data.key_figures}}
    for f in data.key_figures:
        cell = figures[f.label]
        assert (cell.data_type == "n") == (f.number is not None), (report, f.label)

    rows = list(csv.reader(io.StringIO(build_csv(data).decode("utf-8-sig"))))
    assert rows[0] == [c.label for c in data.columns] and len(rows) == len(data.rows) + 1


@pytest.mark.parametrize("report", ROUND_1)
def test_formula_like_text_is_protected(report):
    db = world()
    db.tables["books"][0]["title"] = "=HYPERLINK(1)"
    for l in db.tables["loans"]:
        l["book_copies"]["books"]["title"] = "=HYPERLINK(1)"
    for item in db.tables["inventory_items"]:
        item["book_copies"]["books"]["title"] = "=HYPERLINK(1)"
    db.tables["weeding_events"][0]["books"]["title"] = "=HYPERLINK(1)"
    db.tables["book_requests"][0]["title"] = "=HYPERLINK(1)"
    data = _build(report, db=db)
    if "=HYPERLINK(1)" not in _everything(data):
        pytest.skip(f"{report} has no title column")
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    cells = [c for ws in wb.worksheets for row in ws.iter_rows() for c in row if c.value == "=HYPERLINK(1)"]
    assert cells and all(c.data_type == "s" and c.quotePrefix for c in cells)
    csv_text = build_csv(data).decode("utf-8-sig") + build_csv(data, "details").decode("utf-8-sig")
    assert "'=HYPERLINK(1)" in csv_text


# ─── Report by report ───────────────────────────────────────────────────

def test_circulation_counts_borrows_and_returns_on_their_own_dates():
    data = _build("circulation")
    kinds = [(r["type"], r["book"]) for r in data.rows]
    # Loan 3 was borrowed in October but returned in November: a return only.
    assert kinds.count(("Borrow", "Clean code")) == 2 and ("Return", "Clean code") in kinds
    assert not any(r["type"] == "Borrow" and r["date"].startswith("2026-10") for r in data.rows)
    figures = {f.label: f.number for f in data.key_figures}
    assert figures["Borrows"] == 2 and figures["Returns"] == 1
    assert data.chart.series[0][0] == "Borrows" and data.chart.series[1][0] == "Returns"
    assert sum(data.chart.series[1][1]) == 1


def test_borrowing_statistics_breaks_down_by_program_and_year():
    data = _build("borrowing_stats")
    assert [(r["program"], r["year"], r["borrowers"], r["loans"]) for r in data.rows] == [("BSIT", "2nd Year", 1, 2)]
    figures = {f.label: f for f in data.key_figures}
    assert figures["Loans"].number == 2 and figures["Reservations"].number == 1
    assert figures["Copies on loan now"].number_format == "0.0%"


def test_top_patrons_rank_and_limit():
    db = world()
    db.tables["loans"] = [loan(i, borrowed_at=_at("2026-11-10"), student=f"s{i:03d}", name=f"Borrower {i:03d}")
                          for i in range(70)]
    data = _build("top_patrons", db=db)
    assert len(data.rows) == TOP_PATRONS_LIMIT == 50
    assert [r["rank"] for r in data.rows[:3]] == [1, 2, 3]
    assert data.rows[0]["borrower"] == "Borrower 000"  # ties by name
    assert {f.label: f.number for f in data.key_figures}["Borrowers"] == 70


def test_fines_use_the_return_date_and_include_fines_still_growing():
    data = _build("fines")
    by_kind = {r["kind"]: r for r in data.rows}
    assert by_kind["Paid"]["amount"] == 25.0 and by_kind["Paid"]["receipt"] == "OR-1001"
    assert by_kind["Still growing"]["book"] == "Old accounting"  # borrowed in January, still out
    assert "Fines on books returned November 1, 2026 to November 30, 2026" in data.period
    assert "plus fines still growing on books not yet returned, as of " in data.period


def test_catalog_counts_copies_and_availability():
    data = _build("catalog")
    clean = next(r for r in data.rows if r["title"] == "Clean code")
    assert (clean["copies"], clean["available"], clean["year"]) == (2, 1, 2008)
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    ws = wb.worksheets[0]
    [cell] = [c for row in ws.iter_rows() for c in row if c.value == 2008]
    assert cell.number_format == "0"  # a year, not "2,008"


def test_shelf_list_is_in_shelf_order_with_accession_numbers():
    data = _build("shelf_list")
    assert [r["call_number"] for r in data.rows] == ["005.1 M379 2008", "005.1 M379 2008", "657 A1 1990"]
    assert [r["accession"] for r in data.rows] == ["T45000", "T45001", "T45002"]
    assert {f.label: f.number for f in data.key_figures}["Missing"] == 1
    floor_only = _build("shelf_list", ExportFilters(aisle="Aisle 1"))
    assert [r["accession"] for r in floor_only.rows] == ["T45002"] and "Aisle: Aisle 1" in floor_only.filters


def test_weeding_candidates_and_log_are_separate_reports():
    candidates = _build("weeding_candidates")
    assert [r["title"] for r in candidates.rows] == ["Old accounting"]
    assert any(line.startswith("Rule: published 10+ years ago") for line in candidates.filters)
    log = _build("weeding_log")
    assert [(r["action"], r["by"]) for r in log.rows] == [("Kept (dismissed)", "Staff Mark Lim")]  # October left out


def test_inventory_has_checks_and_a_copy_details_table():
    data = _build("inventory")
    assert [(r["found"], r["not_found"], r["by"]) for r in data.rows] == [(1, 1, "Staff Mark Lim")]
    assert data.rows[0]["location"].startswith("Floor 2") and "Aisle 3" in data.rows[0]["location"]
    assert [r["accession"] for r in data.details.rows] == ["T45001", "T45002"]
    assert data.details.rows[1]["resolution"] == "Marked missing"
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    assert "Copies checked" in wb.sheetnames
    details_sheet = wb["Copies checked"]
    assert details_sheet.page_setup.fitToWidth == 1 and details_sheet.sheet_properties.pageSetUpPr.fitToPage
    assert details_sheet.print_title_rows == "$1:$1"
    details_csv = list(csv.reader(io.StringIO(build_csv(data, "details").decode("utf-8-sig"))))
    assert details_csv[0][3] == "Accession no." and len(details_csv) == 3


def test_book_requests_name_the_requester_without_email_or_note():
    data = _build("book_requests")
    [row] = data.rows
    assert (row["requester"], row["college"], row["status"], row["copies"]) == ("Prof Ana Reyes", "CITE", "Approved", 2)
    assert "note" not in row


# ─── Charts with more than one series ───────────────────────────────────

@pytest.mark.parametrize("report,series", [("borrowing_stats", ["Borrows", "Returns"]),
                                           ("circulation", ["Borrows", "Returns", "In-house checkouts"])])
def test_multi_series_charts_have_a_legend_in_pdf_and_excel(report, series):
    data = _build(report)
    assert [name for name, _ in data.chart.series] == series
    xlsx = build_excel(data, _options(data))
    with zipfile.ZipFile(io.BytesIO(xlsx)) as z:
        xml = z.read([n for n in z.namelist() if n.startswith("xl/charts/chart")][0]).decode()
    assert xml.count("<c:ser>") + xml.count("<ser>") == len(series)
    assert re.search(r"<(?:c:)?legend>", xml)
    pdf = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)
    assert all(name in pdf for name in series)


# ─── Endpoints ──────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
    db = world()
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    monkeypatch.setattr(reports_router, "summarize_aggregate", lambda name, payload: None)
    app = FastAPI()
    app.include_router(reports_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app), db


@pytest.mark.parametrize("report", ROUND_1)
@pytest.mark.parametrize("fmt", ["pdf", "xlsx", "csv"])
def test_every_report_downloads_in_every_format_and_only_writes_the_audit_entry(client, report, fmt):
    http, db = client
    res = http.post("/reports/export", json={"report": report, "format": fmt,
                                             "date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.status_code == 200, res.text
    assert [w[:2] for w in db.writes] == [("audit_log", "insert")]


def test_preview_says_which_reports_ignore_dates_and_which_have_details(client):
    http, _ = client
    catalog = http.post("/reports/export/preview", json={"report": "catalog"}).json()
    inventory = http.post("/reports/export/preview", json={"report": "inventory"}).json()
    assert catalog["uses_dates"] is False and catalog["period"].startswith("As of ")
    assert inventory["details_title"] == "Copies checked" and inventory["details_row_count"] == 2


def test_inventory_csv_can_be_the_copy_details(client):
    http, _ = client
    res = http.post("/reports/export", json={"report": "inventory", "format": "csv", "csv_table": "details"})
    assert res.status_code == 200
    assert "_details.csv" in res.headers["content-disposition"]
    assert "Accession no." in res.content.decode("utf-8-sig").splitlines()[0]


@pytest.mark.parametrize("report", ROUND_1)
def test_every_report_is_librarian_only(report):
    app = FastAPI()
    app.include_router(reports_router.router)
    app.dependency_overrides[get_current_user] = lambda: UserProfile(
        id="u1", email="u@dlsl.edu.ph", role="student", full_name="Student")
    res = TestClient(app).post("/reports/export", json={"report": report, "format": "pdf"})
    assert res.status_code == 403


# ─── Numbers say what they count ────────────────────────────────────────

def test_busiest_day_says_what_it_counts_in_figures_summary_pdf_and_excel():
    data = _build("circulation")
    busiest = {f.label: f.value for f in data.key_figures}["Busiest day"]
    assert re.fullmatch(r"\w+ \d{1,2}, 2026 \((1 transaction|\d+ transactions)\)", busiest), busiest
    assert f"The busiest day was {busiest}." in data.computed_summary
    pdf = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)
    assert busiest in " ".join(pdf.split())
    ws = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data)))).worksheets[0]
    assert busiest in [c.value for row in ws.iter_rows() for c in row]
    assert "transactions_that_day" in json.dumps(ai_input(data))


@pytest.mark.parametrize("report", ROUND_1 + ["overdue"])
def test_no_bare_number_in_brackets(report):
    # "October 21, 2026 (21)" or "BSIT (4)" doesn't say what the number counts.
    data = _build(report)
    texts = [f.value for f in data.key_figures] + [data.computed_summary]
    for text in texts:
        assert not re.search(r"\(\s*[\d,]+(\.\d+)?\s*(each)?\s*\)", text), (report, text)


def test_top_borrower_count_is_labelled():
    assert re.search(r"The top borrower borrowed \d+ books?,", _build("top_patrons").computed_summary)


# ─── What the AI is asked ───────────────────────────────────────────────

def test_summary_prompt_asks_for_each_figure_separately_and_exactly():
    from core.report_summaries import _SUMMARY_SYSTEM_PROMPT as prompt

    for rule in ("Use only the figures in the data",
                 "Name every figure you mention separately, with its own label",
                 "state its number exactly as given",
                 "Never merge two figures into one phrase, even when their numbers are equal",
                 '"46 borrows and 46 returns", not "46 borrows and returns"',
                 '"24 borrowers and 24 titles", not "24 different borrowers and titles"',
                 "Keep each figure's meaning",
                 "Keep units, amounts and dates as written",
                 "If the data is empty or all zero"):
        assert rule in prompt, rule


def test_export_ai_draft_gets_the_prompt_and_labelled_key_figures(monkeypatch):
    from types import SimpleNamespace

    import core.report_summaries as report_summaries

    sent = []

    def create(model, messages):
        sent.extend(messages)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="Draft."))])

    monkeypatch.setattr(report_summaries, "_get_client",
                        lambda: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    db = world()
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(reports_router.router)
    allow_librarian(app, LIBRARIAN)
    res = TestClient(app).post("/reports/export/ai-summary",
                               json={"report": "circulation", "date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.json() == {"summary": "Draft."}
    system, user = sent[0]["content"], sent[1]["content"]
    assert "Never merge two figures into one phrase" in system
    payload = json.loads(user.split("Data: ", 1)[1])
    labels = {f["label"]: f["value"] for f in payload["key_figures"]}
    assert labels["Borrows"] == "2" and labels["Returns"] == "1"
    assert re.search(r"\((1 transaction|\d+ transactions)\)", labels["Busiest day"])
    for value in EMAILS + ID_NUMBERS + INTERNAL_IDS + NAMES + ACCESSIONS:
        assert value not in user


# ─── Status figures always add up to the total ──────────────────────────

def _figures(data) -> dict:
    return {f.label: f.number for f in data.key_figures}


def test_shelf_list_has_a_figure_for_every_status_and_they_add_up():
    db = world()
    statuses = ["available", "available", "for_reshelving", "for_reshelving", "for_reshelving", "reserved",
                "on_loan", "overdue", "missing", "lost", "damaged", "misplaced", "some_future_status"]
    db.tables["book_copies"] = [
        {"id": f"cp{i}", "book_id": "book-1", "accession_number": f"T5{i:04d}", "status": st, "shelf_location": None}
        for i, st in enumerate(statuses)]
    data = _build("shelf_list", db=db)
    figures = _figures(data)
    status_labels = [f.label for f in data.key_figures if f.label not in ("Copies", "Titles")]
    assert sum(figures[label] for label in status_labels) == figures["Copies"] == len(statuses)
    assert figures["For reshelving"] == 3 and figures["Reserved"] == 1 and figures["Overdue"] == 1
    assert figures["some_future_status"] == 1  # an unknown status still counts
    assert "3 for reshelving" in data.computed_summary


def test_shelf_list_with_only_available_and_reshelving_copies():
    # The case seen on real data: 252 copies, 249 available, 3 for reshelving.
    db = world()
    db.tables["book_copies"] = [
        {"id": f"cp{i}", "book_id": "book-1", "accession_number": f"T6{i:04d}",
         "status": "for_reshelving" if i < 3 else "available", "shelf_location": None} for i in range(252)]
    figures = _figures(_build("shelf_list", db=db))
    assert figures == {"Copies": 252, "Titles": 1, "Available": 249, "For reshelving": 3}


def test_catalog_available_and_not_available_add_up_to_copies():
    figures = _figures(_build("catalog"))
    assert figures["Copies available"] + figures["Copies not available"] == figures["Copies"] == 3


def test_inventory_results_add_up_to_copies_checked_and_check_statuses_to_checks():
    db = world()
    db.tables["inventory_sessions"].append(
        {"id": "check-2", "floor": "Floor 2", "aisle": "Aisle 1", "status": "in_progress", "started_by": "staff-uuid-1",
         "started_at": _at("2026-11-04"), "completed_at": None, "skip_seen_since": None})
    base = db.tables["inventory_items"][0]
    db.tables["inventory_items"] += [
        {**base, "id": "item-3", "session_id": "check-2", "result": "pending"},
        # Scanned where it wasn't expected: counted, but not in "expected".
        {**base, "id": "item-4", "session_id": "check-2", "expected": False, "result": "misplaced"},
    ]
    data = _build("inventory", db=db)
    figures = _figures(data)
    assert (figures["Found"] + figures["Misplaced"] + figures["Not found"] + figures["Not yet scanned"]
            == figures["Copies checked"] == 4)
    assert figures["Copies expected"] == 3
    assert figures["Completed checks"] + figures["Checks in progress"] == figures["Checks"] == 2
    assert "Cancelled checks" not in figures  # only statuses that occur
    assert "covering 4 copies (3 expected)" in data.computed_summary
