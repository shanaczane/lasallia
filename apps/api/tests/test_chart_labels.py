# Report charts: long category names must stay readable in the PDF and
# Excel, on every report; a long tail isn't drawn as one huge "Other" bar;
# and snapshot reports say "As of ...", not "Period covered: As of ...".

import io
import zipfile
from collections import Counter
from datetime import date

import openpyxl
import pytest
from pypdf import PdfReader
from reportlab.pdfbase import pdfmetrics

from core.report_export import pdf
from core.report_export.definitions import REPORTS, Chart, ExportFilters, ai_input, _top_groups_chart
from core.report_export.excel import build_excel
from tests.report_export_fixtures import predictable_fines  # noqa: F401  (autouse fixture)
from tests.round2_world import _at, round2_world
from tests.test_report_definitions import NOVEMBER, _options

SNAPSHOTS = ["catalog", "shelf_list", "weeding_candidates", "accession_register"]
LONG_PROGRAMS = [f"Bachelor of Science in Hospitality Management Major {i:02d}" for i in range(14)]
# The plot width of a vertical PDF chart, as in pdf._chart.
VERTICAL_PLOT = 150 * 72 / 25.4


def many_programs_world():
    """14 long program names with 2 to 15 copies each, for Catalog and
    Weeding candidates."""
    db = round2_world()
    books, copies = [], []
    for i, program in enumerate(LONG_PROGRAMS):
        books.append({"id": f"lp{i}", "title": f"Book {i}", "author": "A", "category": program, "subject": "CITE",
                      "call_number": f"{i}", "published_year": 1990, "archived_at": None, "weeding_dismissed_at": None,
                      "created_at": _at("2001-01-01"), "collection_type": "General"})
        copies += [{"id": f"c{i}-{n}", "book_id": f"lp{i}", "accession_number": f"T{i}{n:03d}", "status": "available",
                    "shelf_location": None} for n in range(15 - i)]
    db.tables["books"], db.tables["book_copies"] = books, copies
    db.tables["loans"], db.tables["in_house_loans"] = [], []
    return db


def _chart_xml(data) -> str:
    with zipfile.ZipFile(io.BytesIO(build_excel(data, _options(data)))) as z:
        return z.read([n for n in z.namelist() if n.startswith("xl/charts/chart")][0]).decode()


def _pdf_text(data) -> str:
    return " ".join(" ".join(p.extract_text().split())
                    for p in PdfReader(io.BytesIO(pdf.build_pdf(data, _options(data)))).pages)


# ─── Which way the bars go ──────────────────────────────────────────────

def test_long_category_names_go_sideways():
    assert Chart("t", LONG_PROGRAMS[:3], [1, 2, 3], "Copies").horizontal


@pytest.mark.parametrize("labels", [
    ["Pending", "Approved", "Rejected", "Fulfilled"],       # Book requests
    ["Oct 1", "Oct 4", "Oct 11", "Oct 18", "Oct 25"],       # weekly periods
    [f"#{i}" for i in range(1, 11)],                        # ranks
    [f"Nov {i}" for i in range(1, 31)],                     # daily: slanted, not sideways
])
def test_short_labels_stay_vertical(labels):
    assert not Chart("t", labels, [1] * len(labels), "n").horizontal


def test_many_short_labels_are_slanted():
    assert Chart("t", [f"Nov {i}" for i in range(1, 31)], [1] * 30, "n").crowded
    # Twelve months of "Nov 2026" don't fit level either.
    assert Chart("t", [f"Mon {y}" for y in range(2015, 2027)], [1] * 12, "n").crowded
    assert not Chart("t", ["Oct 1", "Oct 4"], [1, 2], "n").crowded


@pytest.mark.parametrize("report", sorted(REPORTS))
def test_every_report_chart_has_readable_labels(report):
    filters = ExportFilters() if report in SNAPSHOTS else NOVEMBER
    data = REPORTS[report].build(many_programs_world() if report == "catalog" else round2_world(), filters)
    if data.chart is None:
        pytest.skip("no chart with this data")
    chart = data.chart
    if chart.horizontal:
        # Every line of every name fits the column beside the bars.
        for label in chart.labels:
            for line in pdf.wrap_chart_label(label).split("\n"):
                assert pdfmetrics.stringWidth(line, pdf.FONT, pdf.CHART_FONT_SIZE) <= pdf.LABEL_COLUMN
    elif not chart.crowded:
        # Level labels fit their share of the axis.
        slot = VERTICAL_PLOT / len(chart.labels)
        pdf._register_fonts()
        for label in chart.labels:
            assert pdfmetrics.stringWidth(label, pdf.FONT, pdf.CHART_FONT_SIZE) <= slot, (report, label)
    pdf.build_pdf(data, _options(data))


# ─── Wrapping a name ────────────────────────────────────────────────────

def test_short_name_stays_on_one_line():
    assert pdf.wrap_chart_label("BS Nursing") == "BS Nursing"


def test_long_name_wraps_between_words_with_nothing_lost():
    name = "Bachelor of Science in Hospitality Management Major in Cruise Line Operations and Culinary Arts"
    wrapped = pdf.wrap_chart_label(name, max_width=200)
    assert "\n" in wrapped and "…" not in wrapped
    assert wrapped.replace("\n", " ") == name


def test_a_name_too_long_for_two_lines_is_shortened():
    wrapped = pdf.wrap_chart_label("word " * 80)
    lines = wrapped.split("\n")
    assert len(lines) == 2 and lines[-1].endswith("…")
    assert all(pdfmetrics.stringWidth(line, pdf.FONT, pdf.CHART_FONT_SIZE) <= pdf.LABEL_COLUMN for line in lines)


def test_one_very_long_word_is_shortened_not_overflowing():
    wrapped = pdf.wrap_chart_label("x" * 300)
    assert wrapped.endswith("…") and pdfmetrics.stringWidth(wrapped, pdf.FONT, pdf.CHART_FONT_SIZE) <= pdf.LABEL_COLUMN


# ─── Catalog: sideways bars, no "Other" bar, totals intact ──────────────

def _catalog():
    return REPORTS["catalog"].build(many_programs_world(), ExportFilters())


def test_catalog_chart_is_sideways_in_pdf_and_excel():
    data = _catalog()
    assert data.chart.horizontal
    xml = _chart_xml(data)
    assert 'barDir val="bar"' in xml
    assert 'orientation val="maxMin"' in xml
    assert 'legend' not in xml.split("</plotArea>")[1]  # one series, no legend
    assert LONG_PROGRAMS[0][:30] in _pdf_text(data)


def test_excel_keeps_full_names_and_room_for_a_tall_chart():
    data = _catalog()
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    assert LONG_PROGRAMS[0] in [c.value for row in wb["Chart data"].iter_rows() for c in row]


def test_a_tall_excel_chart_doesnt_cover_the_table():
    data = _catalog()
    ws = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data)))).worksheets[0]
    anchor = ws._charts[0].anchor._from.row
    details = next(c.row for row in ws.iter_rows() for c in row if str(c.value).startswith("Details ("))
    assert details - 1 - anchor >= 16


def test_other_is_left_out_of_the_chart_and_the_title_says_how_much():
    data = _catalog()
    assert "Other" not in data.chart.labels and len(data.chart.labels) == 10
    assert data.chart.values == [15, 14, 13, 12, 11, 10, 9, 8, 7, 6]
    # The four smallest programs have 5, 4, 3 and 2 copies.
    assert data.chart.title == "Copies by program: top 10 of 14 programs (14 copies in 4 other programs not shown)"


def test_totals_still_count_every_program():
    data = _catalog()
    figures = {f.label: f.number for f in data.key_figures}
    total = sum(15 - i for i in range(14))
    assert figures["Copies"] == total == sum(r["copies"] for r in data.rows)
    assert figures["Programs"] == 14
    # The AI data still adds up too.
    assert sum(ai_input(data)["copies_by_program"].values()) == total


def test_title_wording_for_a_single_group_left_out():
    counts = Counter({f"P{i:02d}": 20 - i for i in range(11)})
    chart = _top_groups_chart("Titles by program", counts, "Titles", ("program", "programs"), ("title", "titles"))
    assert chart.title == "Titles by program: top 10 of 11 programs (10 titles in 1 other program not shown)"
    one = _top_groups_chart("T", Counter({f"P{i:02d}": 5 for i in range(10)} | {"Z": 1}), "n",
                            ("program", "programs"), ("title", "titles"))
    assert "(1 title in 1 other program not shown)" in one.title


def test_ten_groups_or_fewer_keep_the_plain_title():
    counts = Counter({f"P{i}": i + 1 for i in range(10)})
    chart = _top_groups_chart("Copies by program", counts, "Copies", ("program", "programs"), ("copy", "copies"))
    assert chart.title == "Copies by program" and len(chart.labels) == 10


# ─── The period line ────────────────────────────────────────────────────

@pytest.mark.parametrize("report", SNAPSHOTS)
def test_snapshot_reports_say_as_of_only(report):
    data = REPORTS[report].build(round2_world(), ExportFilters())
    assert data.period_heading.startswith("As of ") and data.period_heading.endswith("(Manila time)")
    assert "Period covered" not in _pdf_text(data)
    ws = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data)))).worksheets[0]
    cells = [str(c.value) for row in ws.iter_rows() for c in row if c.value is not None]
    assert data.period in cells and not any("Period covered" in c for c in cells)


def test_period_reports_keep_their_label():
    data = REPORTS["circulation"].build(round2_world(), ExportFilters(date_from=date(2026, 11, 1), date_to=date(2026, 11, 30)))
    assert data.period_heading.startswith("Period covered: ")
    assert "Period covered: " in _pdf_text(data)
