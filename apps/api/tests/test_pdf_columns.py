# PDF table columns: no number, date, year, accession number, status or
# single word is ever split across lines, in any report. Each column must be
# at least as wide as its longest value (columns that don't wrap) or its
# longest word (columns that wrap, and every header), and the table must
# fit the page. Checked on the computed widths and in the PDF's own text.

import io
import re

import pytest
from pypdf import PdfReader
from reportlab.pdfbase import pdfmetrics

from core.report_export import pdf
from core.report_export.definitions import REPORTS, ExportFilters
from tests.report_export_fixtures import predictable_fines  # noqa: F401  (autouse fixture)
from tests.round2_world import _at, round2_world
from tests.test_report_definitions import NOVEMBER, _options

ALL_REPORTS = sorted(REPORTS)
SNAPSHOTS = {"catalog", "shelf_list", "weeding_candidates", "accession_register"}
PAGE_WIDTH = pdf.page_size()[0] - 2 * pdf.MARGIN


def long_world():
    """The round 2 library plus the widest values the register and shelf
    list really have: long statuses, every way a copy was added, zero-padded
    numbers, long words and editions."""
    db = round2_world()
    t = db.tables
    t["books"][0].update(title="Internationalization and Localization in Practice",
                         author="Wolfeschlegelsteinhausen-Bergerdorff, Hubert", edition="3rd revised ed.",
                         call_number="FIL 658.4038011 P298d 2015", published_year=2012,
                         funding_source="purchased", date_acquired="2024-06-01")
    statuses = ["for_reshelving", "misplaced", "reserved", "on_loan", "damaged", "overdue", "missing", "lost"]
    origins = ["assigned", "registered", "imported", None]
    for i, status in enumerate(statuses):
        t["book_copies"].append({"id": f"extra-{i}", "book_id": "book-1", "accession_number": f"T04664{i}",
                                 "status": status, "origin": origins[i % 4], "created_at": _at("2024-06-01"),
                                 "shelf_location": "Floor 2 · Aisle 3"})
    return db


def _build(report, db=None):
    filters = ExportFilters() if report in SNAPSHOTS else NOVEMBER
    return REPORTS[report].build(db or long_world(), filters)


def _measure(text: str, bold: bool, size: float) -> float:
    return pdfmetrics.stringWidth(text, pdf.FONT_BOLD if bold else pdf.FONT, size)


@pytest.mark.parametrize("report", ALL_REPORTS)
def test_no_column_is_narrower_than_its_longest_word_or_value(report):
    data = _build(report)
    if not data.rows:
        pytest.skip(f"{report} has no rows in this library")
    widths, size = pdf.column_widths(data, PAGE_WIDTH)
    assert size >= 6.5
    assert sum(widths) <= PAGE_WIDTH + 0.01, report
    padding = 2 * pdf.CELL_PADDING
    for column, width in zip(data.columns, widths):
        header = max(_measure(w, True, size) for w in column.label.split())
        assert width >= header + padding, (report, column.label, "header")
        for row in data.rows:
            # As printed: dates, times and codes are held together with
            # non-breaking spaces, so only ordinary spaces can break a line.
            text = pdf.cell_text(row.get(column.key), column.kind)
            for piece in _pieces(text, column.wraps):
                assert width >= _measure(piece, False, size) + padding, (report, column.label, piece)


def _pieces(text: str, wraps: bool) -> list[str]:
    """What can't be split: the whole value, or each part between ordinary
    spaces when the column wraps."""
    return [w for w in re.split(r"[ \n]+", text) if w] if wraps else [text]


@pytest.mark.parametrize("report", ALL_REPORTS)
def test_numbers_dates_and_years_never_wrap(report):
    for column in REPORTS[report].build(long_world(), NOVEMBER).columns:
        if column.kind != "text":
            assert not column.wraps, (report, column.label)


# Text columns whose values must stay on one line, wherever they appear.
ONE_LINE = {"accession", "status", "time", "year", "type", "activity", "source", "kind", "receipt", "isbn",
            "result", "day", "peak_hour", "hour", "format", "action"}


@pytest.mark.parametrize("report", ALL_REPORTS)
def test_short_values_stay_on_one_line(report):
    for column in REPORTS[report].build(long_world(), NOVEMBER).columns:
        if column.key in ONE_LINE:
            assert not column.wraps, (report, column.label)


@pytest.mark.parametrize("report", ALL_REPORTS)
def test_the_pdf_text_has_every_value_and_word_whole(report):
    data = _build(report)
    if not data.rows:
        pytest.skip(f"{report} has no rows in this library")
    text = _pdf_text(data)
    for column in data.columns:
        for word in column.label.split():
            assert word in text, (report, column.label, word)
        for row in data.rows[:60]:
            printed = pdf.cell_text(row.get(column.key), column.kind)
            for piece in _pieces(printed, column.wraps):
                assert piece.replace(pdf.NBSP, " ") in text, (report, column.label, piece)


def _pdf_text(data) -> str:
    """The PDF's text, with non-breaking spaces read as spaces. A value
    split across lines shows up with a line break inside it."""
    text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.build_pdf(data, _options(data)))).pages)
    return text.replace(pdf.NBSP, " ")


def test_accession_register_fits_a4_landscape_with_room_for_long_text():
    data = _build("accession_register")
    assert len(data.columns) == 11
    assert data.table_font_size == 7.5
    widths, size = pdf.column_widths(data, PAGE_WIDTH)
    # 7.5 pt normally; this library's very long author word and whole dates
    # in Remarks need one step smaller.
    assert size in (7.5, 7)
    by_key = {c.key: w for c, w in zip(data.columns, widths)}
    # Title, author and remarks share what's left. The author here is one
    # very long word, so it keeps that word's width; the title still gets
    # more room than the remarks.
    assert by_key["title"] > 100 and by_key["title"] > by_key["remarks"]
    assert by_key["author"] >= pdfmetrics.stringWidth("Wolfeschlegelsteinhausen-Bergerdorff,", pdf.FONT, size)
    one_line = {c.key for c in data.columns if not c.wraps}
    assert one_line == {"accession", "added", "year", "acquired", "source", "status"}


def test_accession_register_puts_the_edition_after_the_title():
    rows = {r["accession"]: r for r in _build("accession_register").rows}
    assert rows["T45000"]["title"] == "Internationalization and Localization in Practice (3rd revised ed.)"
    assert rows["T45002"]["title"] == "Old accounting (2nd ed.)"
    assert "edition" not in rows["T45000"]


def test_accession_register_summary_keeps_capitals():
    summary = _build("accession_register").computed_summary
    assert re.search(r"\d+ numbered by Lasallia", summary)
    assert "lasallia" not in summary
    assert re.search(r"\d+ registered with their existing number", summary)
    assert re.search(r"\d+ with no record of how they were added", summary)


def test_edition_isnt_repeated_when_the_title_already_has_it():
    from core.report_export.collection_reports import _with_edition

    assert _with_edition("Cost Accounting, 2nd ed.", "2nd ed.") == "Cost Accounting, 2nd ed."
    assert _with_edition("Cost Accounting", "2nd ed.") == "Cost Accounting (2nd ed.)"
    assert _with_edition("Cost Accounting", "  ") == "Cost Accounting"


def test_a_report_too_wide_for_the_normal_font_steps_down():
    data = _build("accession_register")
    data.table_font_size = None
    widths, size = pdf.column_widths(data, 520)  # a much narrower page
    assert size < 8 and sum(widths) <= 520 + 0.01


@pytest.mark.parametrize("text,kept", [
    ("Ready, pick up by November 3, 2026", "November 3, 2026"),
    ("Expired (pickup deadline October 10, 2026)", "October 10, 2026"),
    ("Number corrected from GS0010 on October 2, 2026", "October 2, 2026"),
    ("Opened 7:05 PM", "7:05 PM"),
    ("COURSE 100", "COURSE 100"),
    ("IT 301", "IT 301"),
])
def test_dates_times_and_codes_are_kept_together(text, kept):
    printed = pdf.cell_text(text, "text")
    assert kept.replace(" ", pdf.NBSP) in printed
    assert printed.replace(pdf.NBSP, " ") == text


def test_a_date_inside_wrapping_text_stays_on_one_line_in_the_pdf():
    db = long_world()
    for r in db.tables["reservations"]:
        r["status"], r["pickup_by"] = "ready", "2026-11-03T02:00:00+00:00"
    data = REPORTS["reservations"].build(db, NOVEMBER)
    assert _pdf_text(data).count("November 3, 2026") == len(data.rows)
