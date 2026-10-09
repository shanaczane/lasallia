import io

import openpyxl
import pytest

from core.importers.marc import plan_import
from core.importers.spreadsheet import TEMPLATE_COLUMNS, build_template, parse_spreadsheet


def _xlsx(sheets: dict[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        ws.append(TEMPLATE_COLUMNS)
        for r in rows:
            ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row(title="Clean code", accession="T100", year="2008", isbn="9780132350884", call_no="005.1 M379 2008", author="Robert C. Martin"):
    # Author(s), Author(s) Full Name, Year, Title, Place of Publication,
    # Call No., Book ID (Accession No.), Description, ISBN, Images
    return ["Martin, R." if author else None, author, year, title, "Upper Saddle River : Prentice Hall.", call_no, accession, None, isbn, None]


def test_rows_map_to_book_fields_with_sheet_as_program():
    records, errors, warnings = parse_spreadsheet(_xlsx({"BSIT": [_row(year="2008")]}), "CITE")
    assert errors == [] and warnings == []
    r = records[0]
    assert (r.title, r.author, r.published_year, r.publisher) == ("Clean code", "Robert C. Martin", 2008, "Prentice Hall")
    assert (r.program, r.college, r.barcodes) == ("BSIT", "CITE", ["T100"])
    assert r.location == "Sheet BSIT, row 2"


def test_year_typed_as_text_or_number_both_work():
    records, _, _ = parse_spreadsheet(_xlsx({"BSIT": [_row(accession="T1", year="2021"), _row(title="Other", accession="T2", year=2021)]}), None)
    assert [r.published_year for r in records] == [2021, 2021]


def test_rows_for_the_same_title_become_one_book_with_several_copies():
    records, _, _ = parse_spreadsheet(_xlsx({"BSIT": [_row(accession="T100"), _row(accession="T101")]}), None)
    assert len(records) == 1
    assert records[0].barcodes == ["T100", "T101"]


def test_accession_only_rows_are_more_copies_of_the_title_above():
    copy_row = [None] * 6 + ["T101"] + [None] * 3
    records, errors, _ = parse_spreadsheet(_xlsx({"BSIT": [_row(accession="T100"), copy_row, _row(title="Other", accession="T102")]}), None)
    assert errors == []
    assert [r.barcodes for r in records] == [["T100", "T101"], ["T102"]]


def test_accession_only_row_at_the_top_of_a_sheet_is_an_error():
    copy_row = [None] * 6 + ["T101"] + [None] * 3
    records, errors, _ = parse_spreadsheet(_xlsx({"BSIT": [copy_row]}), None)
    assert records == [] and "has no title" in errors[0].message


def test_blocking_problems_are_errors_with_sheet_and_row():
    data = _xlsx({"BSIT": [
        _row(accession=None),
        _row(title=None, accession="T200", year="2020"),  # no title but not a bare copy row
        _row(title="First", accession="T201"),
        [None] * 10,  # blank spacer row — ignored, not an error
        _row(title="Second", accession="T0000201"),  # same accession, different padding
    ]})
    records, errors, _ = parse_spreadsheet(data, None)
    assert [r.title for r in records] == ["First"]
    assert [e.location for e in errors] == ["Sheet BSIT, row 2", "Sheet BSIT, row 3", "Sheet BSIT, row 6"]
    assert "already used at Sheet BSIT, row 4" in errors[2].message


def test_likely_typos_are_warnings_and_still_import():
    records, errors, warnings = parse_spreadsheet(_xlsx({"BSIT": [_row(year="20211", isbn="97801323", call_no=None, author=None)]}), None)
    assert len(records) == 1 and errors == []
    messages = " | ".join(w.message for w in warnings)
    for expected in ("isn't a year", "10 or 13 digits", "No call number", "No author"):
        assert expected in messages


def test_matches_existing_seeded_books_by_accession():
    records, errors, _ = parse_spreadsheet(_xlsx({"BSIT": [_row(title="Clean code (2nd ed.)")]}), None)
    book = {"id": "b1", "title": "Clean code", "author": "Robert C. Martin", "isbn": "9780132350884",
            "call_number": "005.1 M379 2008", "publisher": "Prentice Hall", "published_year": None,
            "abstract": None, "accession_no": "T100", "archived_at": None, "shelf_location": "Aisle 1"}
    plan = plan_import(records, [book], [{"book_id": "b1", "accession_number": "T100"}], errors)
    item = plan.items[0]
    assert item.action == "update" and item.matched_by == "accession"
    assert {c.field for c in item.changes} == {"title", "published_year"}
    assert item.location == "Sheet BSIT, row 2"


def test_template_round_trips_through_the_parser():
    records, errors, warnings = parse_spreadsheet(build_template(), "CITE")
    assert len(records) == 1 and errors == [] and warnings == []  # the example row; notes sheet ignored


def test_non_excel_file_is_a_clear_error():
    with pytest.raises(ValueError, match="readable .xlsx"):
        parse_spreadsheet(b"not a workbook", None)
