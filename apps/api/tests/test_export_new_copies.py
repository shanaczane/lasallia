# "Export new books" (GET /sync/export-new-copies and core/exports.py).
# The database is faked; nothing here writes to it.

import io
from datetime import date

import openpyxl
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import core.exports as exports
import routers.sync as sync_router
from core.deps import get_current_user
from tests.librarian_auth import allow_librarian
from core.exports import UNCATEGORISED, build_new_copies_workbook, fetch_new_copies, manila_day_bounds, sheet_name_for
from core.importers.spreadsheet import parse_spreadsheet
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")
NOV = (date(2026, 11, 1), date(2026, 11, 30))


def _book(id, title, category="BSIT", created_at="2026-11-10T02:00:00+00:00", **extra):
    return {
        "id": id, "title": title, "subtitle": None, "author": "Robert C. Martin", "published_year": 2008,
        "place_of_publication": "Upper Saddle River, NJ", "publisher": "Prentice Hall",
        "call_number": "005.1 M379 2008", "abstract": "A handbook.", "isbn": "9780132350884", "cover_url": None,
        "subject": "CITE", "category": category, "archived_at": None, "created_at": created_at, **extra,
    }


def _copy(id, book_id, acc, created_at="2026-11-10T02:00:00+00:00", origin="assigned"):
    return {"id": id, "book_id": book_id, "accession_number": acc, "created_at": created_at, "origin": origin,
            "status": "available"}


def _db(books, copies):
    return FakeSupabase(books=books, book_copies=copies)


def _sheets(data: bytes) -> dict[str, list[dict]]:
    wb = openpyxl.load_workbook(io.BytesIO(data))
    out = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        out[ws.title] = [dict(zip(rows[0], r)) for r in rows[1:]]
    return out


# ─── Which copies ───────────────────────────────────────────────────────

def test_empty_range_returns_nothing():
    db = _db([_book("b1", "Clean code")], [_copy("c1", "b1", "T46646", created_at="2026-10-05T00:00:00+00:00")])
    assert fetch_new_copies(db, *NOV) == []
    assert db.writes == []


def test_date_boundaries_are_whole_days_in_manila_time():
    start, end = manila_day_bounds(*NOV)
    assert start.isoformat() == "2026-10-31T16:00:00+00:00"
    assert end.isoformat() == "2026-11-30T16:00:00+00:00"

    db = _db([_book("b1", "Clean code")], [
        _copy("c1", "b1", "T46646", created_at="2026-10-31T15:59:59+00:00"),  # Oct 31, 23:59:59 Manila: out
        _copy("c2", "b1", "T46647", created_at="2026-10-31T16:00:00+00:00"),  # Nov 1, 00:00:00 Manila: in
        _copy("c3", "b1", "T46648", created_at="2026-11-30T15:59:59+00:00"),  # Nov 30, 23:59:59 Manila: in
        _copy("c4", "b1", "T46649", created_at="2026-11-30T16:30:00+00:00"),  # Dec 1 in Manila: out
    ])
    rows = fetch_new_copies(db, *NOV)
    assert sorted(r.accession_number for r in rows) == ["T46647", "T46648"]
    assert {r.created_at.date().isoformat() for r in rows} == {"2026-11-01", "2026-11-30"}


def test_one_row_per_copy_with_new_titles_and_added_copies_told_apart():
    db = _db(
        [_book("new", "Refactoring"), _book("old", "Clean code", created_at="2026-07-27T07:00:00+00:00")],
        [_copy("c1", "new", "T46646"), _copy("c2", "new", "T46647"), _copy("c3", "new", "T46648"),
         _copy("c4", "old", "T46649"), _copy("c5", "old", "T46650")],
    )
    rows = fetch_new_copies(db, *NOV)
    assert len(rows) == 5
    sheet = _sheets(build_new_copies_workbook(rows))["BSIT"]
    added_as = {r["Book ID (Accession No.)"]: r["Added As"] for r in sheet}
    assert added_as == {"T46646": "New title", "T46647": "New title", "T46648": "New title",
                        "T46649": "Additional copy", "T46650": "Additional copy"}


def test_archived_books_are_left_out():
    db = _db([_book("b1", "Clean code", archived_at="2026-11-12T00:00:00+00:00"), _book("b2", "Refactoring")],
             [_copy("c1", "b1", "T46646"), _copy("c2", "b2", "T46647")])
    assert [r.accession_number for r in fetch_new_copies(db, *NOV)] == ["T46647"]


def test_only_copies_lasallia_added_unless_registered_are_asked_for():
    db = _db([_book("b1", "Clean code")], [
        _copy("c1", "b1", "T46646", origin="assigned"),
        _copy("c2", "b1", "T44000", origin="registered"),
        _copy("c3", "b1", "T44001", origin="imported"),
        _copy("c4", "b1", "T44002", origin=None),  # no known origin: never exported
    ])
    assert [r.accession_number for r in fetch_new_copies(db, *NOV)] == ["T46646"]
    assert sorted(r.accession_number for r in fetch_new_copies(db, *NOV, include_registered=True)) == ["T44000", "T46646"]


# ─── The file ───────────────────────────────────────────────────────────

def test_columns_and_an_example_row():
    db = _db([_book("b1", "Clean code", subtitle="a handbook of agile software craftsmanship")],
             [_copy("c1", "b1", "T46646")])
    [row] = _sheets(build_new_copies_workbook(fetch_new_copies(db, *NOV)))["BSIT"]
    assert row == {
        "Author(s)": None, "Author(s) Full Name": "Robert C. Martin", "Year": 2008,
        "Title": "Clean code : a handbook of agile software craftsmanship",
        "Place of Publication": "Upper Saddle River, NJ : Prentice Hall", "Call No.": "005.1 M379 2008",
        "Book ID (Accession No.)": "T46646", "Description": "A handbook.", "ISBN": "9780132350884", "Images": None,
        "College": "CITE", "Program": "BSIT", "Date Added": "2026-11-10", "Added As": "New title",
    }


@pytest.mark.parametrize("program, sheet", [
    ("BSIT", "BSIT"),
    ("", UNCATEGORISED),
    ("   ", UNCATEGORISED),
    (None, UNCATEGORISED),
    ("Program name", UNCATEGORISED),
    ("  PROGRAM NAME ", UNCATEGORISED),
    ("How to fill this in", UNCATEGORISED),
    ("History", UNCATEGORISED),
    ("A/B: [C]*?", "A-B- -C---"),
    ("Entertainment and Multimedia Computing", "Entertainment and Multimedia Co"),
])
def test_sheet_names_are_ones_excel_and_the_importer_accept(program, sheet):
    assert sheet_name_for(program) == sheet


def test_blank_and_program_name_categories_still_import_back():
    db = _db([_book("b1", "Clean code", category=""), _book("b2", "Refactoring", category="Program name"),
              _book("b3", "Code complete", category="bsit"), _book("b4", "Domain-driven design", category="BSIT")],
             [_copy("c1", "b1", "T46646"), _copy("c2", "b2", "T46647"),
              _copy("c3", "b3", "T46648"), _copy("c4", "b4", "T46649")])
    data = build_new_copies_workbook(fetch_new_copies(db, *NOV))
    sheets = _sheets(data)
    # "bsit" and "BSIT" share a sheet (Excel ignores case in sheet names),
    # named after whichever spelling comes first.
    assert sorted(name.lower() for name in sheets) == ["bsit", UNCATEGORISED.lower()]
    assert sorted(r["Program"] for r in sheets[UNCATEGORISED]) == ["Program name", UNCATEGORISED]

    records, errors, _ = parse_spreadsheet(data, "CITE")  # raises if a sheet is still "Program name"
    assert errors == []
    assert {r.program.lower() for r in records} == {"bsit", UNCATEGORISED.lower()}


def test_formula_like_text_is_stored_as_text():
    db = _db([_book("b1", '=HYPERLINK("http://example.com","click")', author="+cmd|' /C calc'!A0",
                    abstract="@SUM(1+1)")], [_copy("c1", "b1", "T46646")])
    data = build_new_copies_workbook(fetch_new_copies(db, *NOV))
    ws = openpyxl.load_workbook(io.BytesIO(data)).worksheets[0]
    header = [c.value for c in ws[1]]
    for column, expected in (("Title", '=HYPERLINK("http://example.com","click")'),
                             ("Author(s) Full Name", "+cmd|' /C calc'!A0"),
                             ("Description", "@SUM(1+1)")):
        cell = ws.cell(row=2, column=header.index(column) + 1)
        assert cell.value == expected
        assert cell.data_type == "s"  # text, not a formula
        assert cell.quotePrefix


def test_the_export_imports_back_as_the_same_books_and_copies():
    db = _db([_book("b1", "Clean code"), _book("b2", "Accounting basics", category="BS Accountancy")],
             [_copy("c1", "b1", "T46646"), _copy("c2", "b1", "T46647"), _copy("c3", "b2", "GS676")])
    records, errors, warnings = parse_spreadsheet(build_new_copies_workbook(fetch_new_copies(db, *NOV)), "CITE")
    assert errors == [] and warnings == []
    got = {(r.title, r.program, tuple(r.barcodes), r.publisher, r.published_year, r.isbn) for r in records}
    assert got == {
        ("Clean code", "BSIT", ("T46646", "T46647"), "Prentice Hall", 2008, "9780132350884"),
        ("Accounting basics", "BS Accountancy", ("GS676",), "Prentice Hall", 2008, "9780132350884"),
    }


# ─── The endpoint ───────────────────────────────────────────────────────

@pytest.fixture
def fake(monkeypatch):
    db = _db([_book("b1", "Clean code")], [_copy("c1", "b1", "T46646")])
    monkeypatch.setattr(sync_router, "get_admin_client", lambda: db)
    return db


def _app(user=None, librarian=True):
    app = FastAPI()
    app.include_router(sync_router.router)
    if librarian:
        allow_librarian(app, LIBRARIAN)
    elif user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def test_endpoint_downloads_the_file_and_only_writes_the_audit_entry(fake):
    res = _app().get("/sync/export-new-copies", params={"date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml")
    assert 'filename="lasallia-new-copies-2026-11-01-to-2026-11-30.xlsx"' in res.headers["content-disposition"]
    assert list(_sheets(res.content)) == ["BSIT"]
    assert [w[:2] for w in fake.writes] == [("audit_log", "insert")]


def test_endpoint_empty_range_is_a_clear_404(fake):
    res = _app().get("/sync/export-new-copies", params={"date_from": "2026-01-01", "date_to": "2026-01-31"})
    assert res.status_code == 404
    assert res.json()["detail"] == "No copies were added in this date range."
    assert fake.writes == []


def test_endpoint_rejects_reversed_or_missing_dates(fake):
    client = _app()
    assert client.get("/sync/export-new-copies", params={"date_from": "2026-11-30", "date_to": "2026-11-01"}).status_code == 400
    assert client.get("/sync/export-new-copies", params={"date_from": "2026-11-01"}).status_code == 422
    assert client.get("/sync/export-new-copies", params={"date_from": "Nov 1", "date_to": "2026-11-30"}).status_code == 422


@pytest.mark.parametrize("role", ["student", "faculty", "guest"])
def test_endpoint_is_librarian_only(fake, role):
    user = UserProfile(id="u1", email="u@dlsl.edu.ph", role=role, full_name="Someone")
    res = _app(user=user, librarian=False).get(
        "/sync/export-new-copies", params={"date_from": "2026-11-01", "date_to": "2026-11-30"}
    )
    assert res.status_code == 403


def test_endpoint_needs_a_login(fake):
    res = _app(librarian=False).get("/sync/export-new-copies", params={"date_from": "2026-11-01", "date_to": "2026-11-30"})
    assert res.status_code in (401, 403)
    assert "Not authenticated" in res.text
