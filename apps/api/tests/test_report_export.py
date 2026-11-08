# Report exports (core/report_export): the Overdue Loans definition and the
# PDF, Excel and CSV exporters, plus the endpoints. Made-up data only.

import csv
import io
import re
import zipfile
from datetime import date

import openpyxl
from openpyxl.utils import get_column_letter
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

import routers.reports as reports_router
from core.deps import get_current_user, require_librarian
from core.report_export import layout
from core.report_export.csv_file import build_csv
from core.report_export.definitions import OVERDUE_COLUMNS, ExportFilters, build_overdue
from core.report_export.excel import build_excel
from core.report_export.pdf import build_pdf, page_size
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")
SETTINGS = {"library_name": "De La Salle Lipa — Learning Resource Center", "address": "Lipa City, Batangas"}
FORBIDDEN = ("juan.delacruz@dlsl.edu.ph", "2021-00001", "T45000", "student-")


def _options(data, summary=None, names=None, settings=SETTINGS):
    text = summary or data.computed_summary
    return layout.ExportOptions(
        header=layout.report_header(settings),
        summary_text=text,
        summary_label=layout.summary_label("computed", text, data.computed_summary),
        signatories=layout.signatories(settings, names or {"prepared_by": "Ana Reyes"}),
    )


def _pdf_text(content: bytes) -> list[str]:
    return [page.extract_text() for page in PdfReader(io.BytesIO(content)).pages]


def _data(loans, filters=None):
    return build_overdue(FakeSupabase(loans=loans), filters or ExportFilters())


# ─── The Overdue Loans definition ───────────────────────────────────────

def test_rows_summary_and_chart_for_known_loans():
    data = _data([
        loan(1, days_late=2, student="s1", program="BSIT"),
        loan(2, days_late=10, student="s1", program="BSIT"),
        loan(3, days_late=40, student="s2", program="BSA", name="Maria Clara"),
        loan(4, days_late=3, status="returned"),  # not overdue
    ])
    assert len(data.rows) == 3
    figures = {f.label: f.value for f in data.key_figures}
    assert figures["Overdue loans"] == "3"
    assert figures["Borrowers with overdue loans"] == "2"
    assert figures["Fines so far"] == "₱160.00"  # 10 + 50 + 100 (capped)
    assert figures["Longest overdue"] == "40 days"
    assert figures["Program with the most overdue loans"] == "BSIT (2 overdue loans)"
    assert data.chart.values == [1, 0, 1, 0, 1]
    assert data.rows[0]["days_overdue"] == 40  # most overdue first
    assert "3 loans by 2 borrowers are overdue" in data.computed_summary


def test_borrower_details_are_only_name_program_and_year():
    data = _data([loan(1)])
    assert [c.key for c in OVERDUE_COLUMNS] == [
        "borrower", "program", "year", "book", "author", "due_date", "days_overdue", "fine"]
    assert set(data.rows[0]) == {c.key for c in OVERDUE_COLUMNS}
    flat = repr(data.rows)
    for value in FORBIDDEN:
        assert value not in flat


def test_empty_result():
    data = _data([])
    assert data.rows == [] and data.chart is None
    assert data.computed_summary == "No loans borrowed in this period are overdue."
    assert {f.label: f.value for f in data.key_figures}["Overdue loans"] == "0"


def test_more_than_a_thousand_loans_are_all_read():
    data = _data([loan(i) for i in range(1, 1206)])
    assert len(data.rows) == 1205


def test_period_and_file_name():
    filters = ExportFilters(date_from=date(2026, 11, 1), date_to=date(2026, 11, 30), program="BSIT")
    data = _data([], filters)
    assert data.period.startswith("Loans borrowed 1 November 2026 to 30 November 2026 (Manila time), overdue as of ")
    assert data.filters == ["Program: BSIT"]
    assert data.filename_stem == "overdue-loans_2026-11-01_to_2026-11-30"
    assert _data([]).period.startswith("Loans borrowed on any date (Manila time)")


# ─── PDF ────────────────────────────────────────────────────────────────

def test_pdf_has_the_whole_layout():
    data = _data([loan(1, days_late=12, name="José Niño Santos")])
    pages = _pdf_text(build_pdf(data, _options(data)))
    text = "\n".join(pages)
    for expected in ("De La Salle Lipa", "Learning Resource Center", "Overdue Loans", "Period covered:",
                     "Key figures", "Summary (computed from the report data)", "Overdue loans by days overdue",
                     "Borrower", "José Niño Santos", "₱60.00", "Prepared by:", "Noted by:", "Approved by:",
                     "Ana Reyes", "Head Librarian", "Page 1 of 1"):
        assert expected in text, expected


def test_pdf_paper_is_a4_landscape_from_one_setting():
    assert (layout.PAPER_SIZE, layout.ORIENTATION) == ("A4", "landscape")
    width, height = page_size()
    assert round(width) == 842 and round(height) == 595  # A4 landscape, in points
    data = _data([loan(1)])
    box = PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages[0].mediabox
    assert (round(float(box.width)), round(float(box.height))) == (842, 595)


def test_pdf_table_header_repeats_on_every_page():
    data = _data([loan(i, title=f"Sample book {i}") for i in range(1, 301)])
    pages = _pdf_text(build_pdf(data, _options(data)))
    assert len(pages) > 3
    for page in pages:
        if "Sample book" in page:  # every page with table rows has the header row
            assert "Borrower" in page and "Days" in page and "Fine" in page
    assert all("Sample book" in page for page in pages[:-1])
    assert f"Page {len(pages)} of {len(pages)}" in pages[-1]


def test_pdf_empty_report_still_has_header_and_signatures():
    data = _data([])
    text = "\n".join(_pdf_text(build_pdf(data, _options(data))))
    assert "No loans borrowed in this period are overdue." in text
    assert "Approved by:" in text


def test_pdf_shows_typed_text_as_typed():
    data = _data([loan(1, title="<b>Bold</b> & <i>tags</i>")])
    options = _options(data, summary="Note <font size=40>big</font> & more", names={"prepared_by": "<b>Ana</b>"})
    text = "\n".join(_pdf_text(build_pdf(data, options)))
    assert "<b>Bold</b> & <i>tags</i>" in text
    assert "Note <font size=40>big</font> & more" in text
    assert "<b>Ana</b>" in text


def test_pdf_stops_at_the_row_limit_and_says_so(monkeypatch):
    monkeypatch.setattr(layout, "PDF_MAX_ROWS", 5)
    data = _data([loan(i) for i in range(1, 9)])
    text = "\n".join(_pdf_text(build_pdf(data, _options(data))))
    assert "This PDF shows the first 5 rows. 3 more are in the Excel and CSV files." in text


# ─── Excel ──────────────────────────────────────────────────────────────

def _sheet(content: bytes):
    return openpyxl.load_workbook(io.BytesIO(content))


def test_excel_has_the_whole_layout():
    data = _data([loan(1, days_late=12)])
    wb = _sheet(build_excel(data, _options(data)))
    ws = wb["Overdue Loans"]
    values = [c.value for row in ws.iter_rows() for c in row if c.value is not None]
    for expected in ("De La Salle Lipa", "Learning Resource Center", "Overdue Loans", "Key figures",
                     "Summary (computed from the report data)", "Borrower", "Prepared by:", "Ana Reyes",
                     "Director, Learning Resource Center"):
        assert expected in values, expected
    assert len(ws._charts) == 1 and "Chart data" in wb.sheetnames
    header_row = next(r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Borrower")
    assert ws.print_title_rows == f"${header_row}:${header_row}"
    assert ws.page_setup.paperSize == 9 and ws.page_setup.orientation == "landscape"
    row = [ws.cell(header_row + 1, c).value for c in range(1, 9)]
    assert row[6] == 12 and row[7] == 60  # numbers stay numbers
    assert ws.cell(header_row + 1, 8).number_format == '"₱"#,##0.00'


def _chart_xml(content: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        [name] = [n for n in z.namelist() if n.startswith("xl/charts/chart")]
        return z.read(name).decode("utf-8")


def _axis(xml: str, tag: str) -> str:
    match = re.search(rf"<(?:c:)?{tag}>.*?</(?:c:)?{tag}>", xml, re.S)
    assert match, f"no {tag}"
    return match.group(0)


def test_excel_chart_shows_category_labels_counts_and_value_axis_numbers():
    data = _data([loan(1, days_late=2), loan(2, days_late=10), loan(3, days_late=40)])
    xml = _chart_xml(build_excel(data, _options(data)))
    category, value = _axis(xml, "catAx"), _axis(xml, "valAx")
    for axis in (category, value):
        # Without delete="0" and a label position, Excel and LibreOffice hide the axis.
        assert re.search(r'<(?:c:)?delete val="0"\s*/>', axis), axis
        assert re.search(r'<(?:c:)?tickLblPos val="nextTo"\s*/>', axis), axis
        assert re.search(r'<(?:c:)?majorTickMark val="out"\s*/>', axis), axis
    assert re.search(r'<(?:c:)?axPos val="b"\s*/>', category)
    assert re.search(r'<(?:c:)?numFmt formatCode="0"', value)
    assert re.search(r'<(?:c:)?min val="0"\s*/>', value)
    # Counts on the bars.
    assert re.search(r'<(?:c:)?showVal val="1"\s*/>', xml)
    # The category labels and counts come from the "Chart data" sheet.
    sheet = _sheet(build_excel(data, _options(data)))["Chart data"]
    assert [sheet.cell(r, 1).value for r in range(3, 8)] == ["1–3 days", "4–7 days", "8–14 days", "15–30 days", "Over 30 days"]
    assert [sheet.cell(r, 2).value for r in range(3, 8)] == [1, 0, 1, 0, 1]


def test_excel_table_headers_fit_with_room_for_the_filter_buttons():
    data = _data([loan(1)])
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    header_row = next(r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Borrower")
    assert ws.auto_filter.ref.startswith(f"A{header_row}:")
    for col, column in enumerate(OVERDUE_COLUMNS, start=1):
        cell = ws.cell(header_row, col)
        assert cell.value == column.label
        assert cell.alignment.wrap_text and cell.alignment.horizontal == "left"
        width = ws.column_dimensions[get_column_letter(col)].width
        assert width >= len(column.label) + 5, (column.label, width)
    assert ws.row_dimensions[header_row].height >= 30


def test_excel_key_figures_are_numbers_with_formats():
    data = _data([loan(1, days_late=2, student="s1"), loan(2, days_late=21, student="s2", program="BSA")])
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    figures = {ws.cell(r, 1).value: ws.cell(r, 3) for r in range(1, ws.max_row + 1) if ws.cell(r, 3).value is not None}
    expected = {
        "Overdue loans": (2, "#,##0"),
        "Borrowers with overdue loans": (2, "#,##0"),
        "Fines so far": (110, '"₱"#,##0.00'),
        "Average days overdue": (11.5, "0.0"),
        "Longest overdue": (21, '#,##0 "days"'),
    }
    for label, (number, fmt) in expected.items():
        cell = figures[label]
        assert cell.data_type == "n" and cell.value == number and cell.number_format == fmt, (label, cell.value)
    # A text figure stays text.
    program = figures["Program with the most overdue loans"]
    assert program.data_type == "s" and program.value == "BSA and BSIT (1 overdue loan each)"


def test_excel_text_figures_starting_like_a_formula_stay_protected():
    data = _data([loan(1, program="=CMD()")])
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    [cell] = [c for row in ws.iter_rows() for c in row if c.value == "=CMD() (1 overdue loan)"]
    assert cell.data_type == "s" and cell.quotePrefix


def test_excel_formula_like_text_is_stored_as_text():
    data = _data([loan(1, title="=HYPERLINK(\"http://x\",\"y\")", name="+cmd", program="@SUM(1)")])
    options = _options(data, summary="-2+3", names={"prepared_by": "=1+1"})
    ws = _sheet(build_excel(data, options))["Overdue Loans"]
    for value in ('=HYPERLINK("http://x","y")', "+cmd", "@SUM(1)", "-2+3", "=1+1"):
        cells = [c for row in ws.iter_rows() for c in row if c.value == value]
        assert cells, value
        assert all(c.data_type == "s" and c.quotePrefix for c in cells), value


def test_excel_empty_report():
    data = _data([])
    wb = _sheet(build_excel(data, _options(data)))
    values = [c.value for row in wb["Overdue Loans"].iter_rows() for c in row if c.value is not None]
    assert "No loans borrowed in this period are overdue." in values
    assert "Approved by:" in values
    assert "Chart data" not in wb.sheetnames


# ─── CSV ────────────────────────────────────────────────────────────────

def _csv_rows(content: bytes) -> list[list[str]]:
    assert content.startswith(b"\xef\xbb\xbf")  # UTF-8 byte-order mark, for Excel
    return list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))


def test_csv_is_a_clean_table():
    data = _data([loan(1, days_late=12, title='Code, "complete"\nsecond line', name="José Niño")])
    rows = _csv_rows(build_csv(data))
    assert rows[0] == [c.label for c in OVERDUE_COLUMNS]  # row 1 is the header; no title or period rows
    assert len(rows) == 2
    assert rows[1][0] == "José Niño"
    assert rows[1][3] == 'Code, "complete"\nsecond line'
    assert rows[1][6:] == ["12", "60.00"]


def test_csv_formula_like_text_gets_an_apostrophe_and_numbers_dont():
    data = _data([loan(1, title="=cmd|' /C calc'!A0", name="+Ana", program="-BSIT", days_late=3)])
    row = _csv_rows(build_csv(data))[1]
    assert row[0] == "'+Ana" and row[1] == "'-BSIT" and row[3] == "'=cmd|' /C calc'!A0"
    assert row[6] == "3" and row[7] == "15.00"


def test_csv_empty_report_is_the_header_only():
    assert _csv_rows(build_csv(_data([]))) == [[c.label for c in OVERDUE_COLUMNS]]


# ─── Endpoints ──────────────────────────────────────────────────────────

@pytest.fixture
def fake(monkeypatch):
    db = FakeSupabase(loans=[loan(1, days_late=12, borrowed_at="2026-11-10T02:00:00+00:00")])
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    monkeypatch.setattr(reports_router, "summarize_aggregate", lambda name, payload: None)
    return db


def _app(user=None, librarian=True):
    app = FastAPI()
    app.include_router(reports_router.router)
    if librarian:
        app.dependency_overrides[require_librarian] = lambda: LIBRARIAN
    elif user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


BODY = {"report": "overdue", "date_from": "2026-11-01", "date_to": "2026-11-30"}


@pytest.mark.parametrize("fmt, content_type, extension", [
    ("pdf", "application/pdf", "pdf"),
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    ("csv", "text/csv", "csv"),
])
def test_export_returns_each_format_and_writes_nothing(fake, fmt, content_type, extension):
    res = _app().post("/reports/export", json={**BODY, "format": fmt, "prepared_by_name": "Ana Reyes"})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith(content_type)
    assert f'filename="overdue-loans_2026-11-01_to_2026-11-30.{extension}"' in res.headers["content-disposition"]
    assert fake.writes == []


def test_export_prints_the_reviewed_summary_with_its_label(fake):
    res = _app().post("/reports/export", json={
        **BODY, "format": "pdf", "summary_text": "One loan is overdue; follow up this week.", "summary_source": "ai",
    })
    text = "\n".join(_pdf_text(res.content))
    assert "Summary (AI-assisted draft, reviewed by the librarian)" in text
    assert "One loan is overdue; follow up this week." in text
    assert "Key figures" in text and "Overdue loans" in text  # computed figures are always printed


def test_export_without_a_summary_uses_the_computed_one(fake):
    res = _app().post("/reports/export", json={**BODY, "format": "pdf", "summary_source": "ai"})
    text = "\n".join(_pdf_text(res.content))
    assert "Summary (computed from the report data)" in text
    assert "1 loan by 1 borrower is overdue" in text


def test_preview_lists_figures_and_flags_placeholder_titles(fake):
    res = _app().post("/reports/export/preview", json=BODY)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["row_count"] == 1 and body["key_figures"][0] == {"label": "Overdue loans", "value": "1"}
    assert [(t["label"], t["title"], t["placeholder"]) for t in body["signature_titles"]] == [
        ("Prepared by", "Librarian", True), ("Noted by", "Head Librarian", True),
        ("Approved by", "Director, Learning Resource Center", True)]


def test_confirmed_titles_are_not_flagged(fake, monkeypatch):
    fake.tables["library_settings"] = [{"id": 1, "report_prepared_by_title": "Librarian II",
                                        "report_noted_by_title": "Head Librarian"}]
    body = _app().post("/reports/export/preview", json=BODY).json()
    assert [(t["title"], t["placeholder"]) for t in body["signature_titles"]] == [
        ("Librarian II", False), ("Head Librarian", True), ("Director, Learning Resource Center", True)]


def test_ai_summary_is_null_without_ai(fake):
    res = _app().post("/reports/export/ai-summary", json=BODY)
    assert res.status_code == 200 and res.json() == {"summary": None}


@pytest.mark.parametrize("body, code", [
    ({**BODY, "format": "docx"}, 422),
    ({**BODY, "report": "accession_register", "format": "pdf"}, 422),  # round 2, not built
    ({**BODY, "format": "pdf", "summary_text": "x" * 2001}, 422),
    ({**BODY, "format": "pdf", "prepared_by_name": "x" * 121}, 422),
    ({**BODY, "date_from": "2026-11-30", "date_to": "2026-11-01", "format": "pdf"}, 400),
])
def test_export_rejects_bad_requests(fake, body, code):
    assert _app().post("/reports/export", json=body).status_code == code


@pytest.mark.parametrize("path", ["/reports/export", "/reports/export/preview", "/reports/export/ai-summary"])
@pytest.mark.parametrize("role", ["student", "faculty", "guest"])
def test_exports_are_librarian_only(fake, path, role):
    user = UserProfile(id="u1", email="u@dlsl.edu.ph", role=role, full_name="Someone")
    res = _app(user=user, librarian=False).post(path, json={**BODY, "format": "pdf"})
    assert res.status_code == 403


def test_exports_need_a_login(fake):
    res = _app(librarian=False).post("/reports/export", json={**BODY, "format": "pdf"})
    assert res.status_code in (401, 403) and "Not authenticated" in res.text


def test_excel_signature_lines_are_separate_and_figures_have_room():
    data = _data([loan(1, days_late=30)])
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    line_row = next(r for r in range(1, ws.max_row + 1)
                    if any(ws.cell(r, c).border.bottom.style == "thin" for c in range(1, 9))
                    and r > 10 and ws.cell(r - 2, 1).value == "Prepared by:")
    underlined = [c for c in range(1, 9) if ws.cell(line_row, c).border.bottom.style == "thin"]
    gaps = [c for c in range(underlined[0], underlined[-1] + 1) if c not in underlined]
    assert len(gaps) == 2  # one empty column between each of the three lines
    fines_row = next(r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Fines so far")
    assert any(str(m) == f"C{fines_row}:E{fines_row}" for m in ws.merged_cells.ranges)


def test_excel_chart_has_no_value_axis_title():
    # The chart title says what is counted; a rotated axis title overlapped
    # the tick labels.
    data = _data([loan(1, days_late=12)])
    xml = _chart_xml(build_excel(data, _options(data)))
    assert "<title>" not in _axis(xml, "valAx") and "<c:title>" not in _axis(xml, "valAx")
    assert "Overdue loans by days overdue" in xml  # the chart title stays


def test_excel_rows_are_tall_enough_for_wrapped_text_in_every_column():
    from core.report_export.excel import column_width, wrapped_lines

    data = _data([
        loan(1, title="Placeholder Introduction to Psychology", program="BSIT"),
        loan(2, title="Short", program="BS Tourism Management"),
        loan(3, title="Short", program="BSIT", name="Maria Clara de los Santos y Mercado-Villanueva"),
        loan(4, title="Short", program="BSIT"),
    ])
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    header_row = next(r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Borrower")
    widths = [column_width(c.label, c.width) for c in OVERDUE_COLUMNS]
    for r in range(header_row + 1, header_row + 1 + len(data.rows)):
        needed = max(wrapped_lines(str(ws.cell(r, c).value), widths[c - 1])
                     for c, column in enumerate(OVERDUE_COLUMNS, start=1)
                     if column.kind == "text" and ws.cell(r, c).value)
        assert ws.row_dimensions[r].height >= 15 * needed, (r, needed, ws.row_dimensions[r].height)
    by_title = {ws.cell(r, 4).value: r for r in range(header_row + 1, header_row + 5)}
    by_program = {ws.cell(r, 2).value: r for r in range(header_row + 1, header_row + 5)}
    by_name = {ws.cell(r, 1).value: r for r in range(header_row + 1, header_row + 5)}
    # Each long value wraps in its column, so its row is at least two lines tall.
    assert ws.row_dimensions[by_title["Placeholder Introduction to Psychology"]].height >= 30
    assert ws.row_dimensions[by_program["BS Tourism Management"]].height >= 30
    assert ws.row_dimensions[by_name["Maria Clara de los Santos y Mercado-Villanueva"]].height >= 45
    # A row with nothing to wrap stays one line.
    short = next(r for r in range(header_row + 1, header_row + 5)
                 if ws.cell(r, 4).value == "Short" and ws.cell(r, 2).value == "BSIT" and ws.cell(r, 1).value == "Juan Dela Cruz")
    assert ws.row_dimensions[short].height == 17


def test_wrapped_lines_counts_words_and_line_breaks():
    from core.report_export.excel import wrapped_lines

    assert wrapped_lines("Short", 20) == 1
    assert wrapped_lines("Placeholder Introduction to Psychology", 38) == 2
    assert wrapped_lines("one\ntwo", 40) == 2
    assert wrapped_lines("x" * 100, 12) >= 9  # one long word still wraps


# ─── Header: school and LRC on two lines, address in its own style ──────

ADDRESS = "Sen. Jose Diokno Building, Lipa City, Batangas 4217"


@pytest.mark.parametrize("name", [
    "De La Salle Lipa - Learning Resource Center",       # hyphen, as stored on the live site
    "De La Salle Lipa – Learning Resource Center",       # en dash
    "De La Salle Lipa — Learning Resource Center",       # em dash
    "  De La Salle Lipa   -   Learning Resource Center ",
])
def test_header_splits_on_any_spaced_dash(name):
    header = layout.report_header({"library_name": name, "address": ADDRESS})
    assert (header.school, header.unit, header.address) == ("De La Salle Lipa", "Learning Resource Center", ADDRESS)


@pytest.mark.parametrize("name", ["Learning Resource Center", "Lipa-City Library", "De La Salle Lipa-LRC"])
def test_header_without_a_spaced_dash_stays_on_one_line(name):
    header = layout.report_header({"library_name": name, "address": ADDRESS})
    assert (header.school, header.unit, header.address) == (name, None, ADDRESS)


def test_header_without_an_address():
    header = layout.report_header({"library_name": "De La Salle Lipa - Learning Resource Center", "address": "  "})
    assert header.address is None


def _pdf_fonts(content: bytes) -> dict[str, str]:
    """Text on the first page -> the font it's drawn in."""
    fonts: dict[str, str] = {}

    def visit(text, cm, tm, font_dict, font_size):
        if text.strip() and font_dict:
            fonts.setdefault(text.strip(), f"{font_dict.get('/BaseFont')}@{round(float(font_size))}")

    PdfReader(io.BytesIO(content)).pages[0].extract_text(visitor_text=visit)
    return fonts


@pytest.mark.parametrize("name, unit", [
    ("De La Salle Lipa - Learning Resource Center", "Learning Resource Center"),
    ("De La Salle Lipa — Learning Resource Center", "Learning Resource Center"),
])
def test_pdf_header_styles_with_a_separator(name, unit):
    data = _data([])
    fonts = _pdf_fonts(build_pdf(data, _options(data, settings={"library_name": name, "address": ADDRESS})))
    school, lrc, address = fonts["De La Salle Lipa"], fonts[unit], fonts[ADDRESS]
    assert "Bold" in school and school.endswith("@14")
    assert "Bold" in lrc and lrc.endswith("@11")
    assert "Bold" not in address and address.endswith("@8")


def test_pdf_header_without_a_separator_keeps_the_address_style():
    data = _data([])
    fonts = _pdf_fonts(build_pdf(data, _options(data, settings={"library_name": "Learning Resource Center", "address": ADDRESS})))
    assert "Bold" in fonts["Learning Resource Center"] and fonts["Learning Resource Center"].endswith("@14")
    assert "Bold" not in fonts[ADDRESS] and fonts[ADDRESS].endswith("@8")


def _excel_header(settings) -> list[tuple]:
    data = _data([])
    ws = _sheet(build_excel(data, _options(data, settings=settings)))["Overdue Loans"]
    rows = []
    for r in range(1, 5):
        cell = ws.cell(r, 1)
        if cell.value is None:
            break
        rows.append((cell.value, bool(cell.font.b), cell.font.sz))
    return rows


@pytest.mark.parametrize("name", ["De La Salle Lipa - Learning Resource Center", "De La Salle Lipa – Learning Resource Center"])
def test_excel_header_styles_with_a_separator(name):
    assert _excel_header({"library_name": name, "address": ADDRESS}) == [
        ("De La Salle Lipa", True, 14), ("Learning Resource Center", True, 11), (ADDRESS, False, 9)]


def test_excel_header_without_a_separator_keeps_the_address_style():
    assert _excel_header({"library_name": "Learning Resource Center", "address": ADDRESS}) == [
        ("Learning Resource Center", True, 14), (ADDRESS, False, 9)]


# ─── Average days overdue always shows one decimal ──────────────────────

def test_average_days_overdue_shows_one_decimal_in_pdf_and_excel():
    data = _data([loan(1, days_late=12)])  # a whole-number average
    figures = {f.label: f for f in data.key_figures}
    assert figures["Average days overdue"].value == "12.0"
    assert "On average they are 12.0 days overdue" in data.computed_summary
    assert "12.0" in "\n".join(_pdf_text(build_pdf(data, _options(data))))
    ws = _sheet(build_excel(data, _options(data)))["Overdue Loans"]
    [cell] = [ws.cell(r, 3) for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Average days overdue"]
    assert cell.value == 12 and cell.number_format == "0.0"  # Excel shows 12.0
    assert {f.label: f.value for f in _data([]).key_figures}["Average days overdue"] == "0.0"


# ─── Excel chart: legend clear of the labels, room above the tallest bar ─

def _axis_numbers(xml: str) -> tuple[float, float]:
    value_axis = _axis(xml, "valAx")
    maximum = float(re.search(r'<(?:c:)?max val="([0-9.]+)"\s*/>', value_axis).group(1))
    step = float(re.search(r'<(?:c:)?majorUnit val="([0-9.]+)"\s*/>', value_axis).group(1))
    return maximum, step


@pytest.mark.parametrize("highest", [0, 1, 3, 7, 16, 22, 99, 412.5, 3080])
def test_axis_scale_leaves_a_full_step_above_the_tallest_bar(highest):
    from core.report_export.excel import axis_scale

    step, maximum = axis_scale(highest)
    assert maximum >= max(highest, 1) + step
    assert maximum % step == 0
    assert str(int(step)).strip("0") in ("1", "2", "5")  # a round step
    assert maximum / step <= 8  # not too many gridlines


def test_single_series_chart_has_headroom_and_no_legend():
    data = _data([loan(i, days_late=10) for i in range(1, 17)])  # 16 loans in one bar
    xml = _chart_xml(build_excel(data, _options(data)))
    maximum, step = _axis_numbers(xml)
    assert max(data.chart.values) == 16
    assert maximum >= 16 + step
    assert not re.search(r"<(?:c:)?legend>", xml)


def test_two_series_chart_puts_the_legend_on_the_right_with_headroom():
    from core.report_export.definitions import REPORTS, ExportFilters

    loans = [loan(i, borrowed_at="2026-11-03T02:00:00+00:00") for i in range(1, 17)]
    loans += [{**loan(100 + i, borrowed_at="2026-10-01T02:00:00+00:00"), "status": "returned",
               "returned_at": "2026-11-04T02:00:00+00:00"} for i in range(5)]
    data = REPORTS["circulation"].build(FakeSupabase(loans=loans), ExportFilters(date_from=date(2026, 11, 1),
                                                                                 date_to=date(2026, 11, 7)))
    xml = _chart_xml(build_excel(data, _options(data)))
    legend = re.search(r"<(?:c:)?legend>.*?</(?:c:)?legend>", xml, re.S).group(0)
    assert re.search(r'<(?:c:)?legendPos val="r"\s*/>', legend)
    maximum, step = _axis_numbers(xml)
    assert maximum >= 16 + step
