# Charts that add up to their report's totals, the AI being told which
# figures cover the period and which are as of now, round axis steps on
# horizontal PDF charts, and the note when the top-10 cut-off falls in a tie.

import io
import json
from collections import Counter
from datetime import date

import openpyxl
import pytest
from pypdf import PdfReader
from reportlab.graphics.charts.barcharts import HorizontalBarChart

from core.report_export import layout, pdf
from core.report_export.definitions import (
    AS_OF_NOW,
    IN_PERIOD,
    REPORTS,
    Chart,
    ExportFilters,
    _top_groups_chart,
    ai_input,
)
from core.report_export.excel import build_excel
from tests.report_export_fixtures import predictable_fines  # noqa: F401  (autouse fixture)
from tests.round2_world import round2_world
from tests.test_chart_labels import many_programs_world
from tests.test_report_definitions import NOVEMBER, _options

ALL_TIME = ExportFilters()
ONLY_END = ExportFilters(date_to=date(2026, 11, 30))
PERIODS = [NOVEMBER, ALL_TIME, ONLY_END]
MIXED = ["overview", "borrowing_stats", "fines", "overdue", "reservations"]


def _build(report, filters=NOVEMBER, db=None):
    return REPORTS[report].build(db or round2_world(), filters)


def _numbers(data) -> dict:
    return {f.label: f.number for f in data.key_figures if f.number is not None}


def _series_total(data) -> int:
    return sum(sum(values) for _, values in data.chart.series)


def _by_series(data) -> dict:
    return {name: sum(values) for name, values in data.chart.series}


# ─── Chart totals ───────────────────────────────────────────────────────

@pytest.mark.parametrize("filters", PERIODS)
def test_circulation_chart_adds_up_to_transactions(filters):
    data = _build("circulation", filters)
    f = _numbers(data)
    assert _series_total(data) == f["Transactions"] == len(data.rows)
    assert _by_series(data) == {k: f[k] for k in ("Borrows", "Returns", "In-house checkouts", "In-house returns")}


@pytest.mark.parametrize("filters", PERIODS)
def test_overview_chart_adds_up_to_its_transactions_row(filters):
    data = _build("overview", filters)
    rows = {r["figure"]: r["value"] for r in data.rows}
    assert _series_total(data) == int(rows["Transactions"].replace(",", ""))
    f = _numbers(data)
    assert _by_series(data) == {k: f[k] for k in ("Borrows", "Returns", "In-house checkouts", "In-house returns")}


@pytest.mark.parametrize("filters", PERIODS)
def test_activity_log_chart_adds_up_to_events(filters):
    data = _build("activity_log", filters)
    f = _numbers(data)
    assert _series_total(data) == f["Events"] == len(data.rows)
    for name, total in _by_series(data).items():
        assert total == f[name], name


def test_overview_key_figures_and_summary_include_in_house_returns():
    data = _build("overview")
    assert _numbers(data)["In-house returns"] == 1
    assert "1 in-house returns and" in data.computed_summary


def test_four_series_each_get_their_own_colour_in_the_pdf_palette():
    assert len(set(layout.SERIES_COLORS[:4])) == 4


# ─── What the AI is told ────────────────────────────────────────────────

@pytest.mark.parametrize("report", MIXED)
def test_every_key_figure_in_a_mixed_report_says_what_it_covers(report):
    figures = ai_input(_build(report))["key_figures"]
    assert figures
    for figure in figures:
        assert figure.get("covers"), (report, figure)


def test_overview_marks_period_and_as_of_now_figures():
    covers = {f["label"]: f["covers"] for f in ai_input(_build("overview"))["key_figures"]}
    for label in ("Borrows", "In-house returns", "Reservations made", "Borrowing station sessions", "Questions answered"):
        assert covers[label] == IN_PERIOD, label
    for label in ("Titles", "Copies", "Weeding candidates"):
        assert covers[label] == AS_OF_NOW, label
    assert "overdue now" in covers["Overdue loans"] and "still growing" in covers["Outstanding fines"]


def test_borrowing_statistics_marks_copies_on_loan_as_of_now():
    covers = {f["label"]: f["covers"] for f in ai_input(_build("borrowing_stats"))["key_figures"]}
    assert covers["Loans"] == IN_PERIOD and covers["Copies on loan now"] == AS_OF_NOW


@pytest.mark.parametrize("report", ["circulation", "catalog", "library_usage"])
def test_reports_with_one_kind_of_figure_arent_marked(report):
    filters = ALL_TIME if report == "catalog" else NOVEMBER
    assert not any("covers" in f for f in ai_input(_build(report, filters))["key_figures"])


def test_prompt_tells_the_ai_to_keep_them_apart():
    from core.report_summaries import _SUMMARY_SYSTEM_PROMPT as prompt

    for rule in ('"covers" field', "never describe a figure that covers the period as being",
                 "never present an as-of-now figure as a count for the period",
                 "Put period figures and as-of-now figures in separate sentences"):
        assert rule in prompt, rule


def test_covers_stays_out_of_what_people_see():
    data = _build("overview")
    assert json.dumps(ai_input(data)).count('"covers"') == len(data.key_figures)
    text = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.build_pdf(data, _options(data)))).pages)
    assert "covers" not in text.lower()


# ─── Round steps on horizontal PDF charts ───────────────────────────────

def _is_round(step: float) -> bool:
    while step >= 10:
        step /= 10
    return step in (1, 2, 5)


@pytest.mark.parametrize("highest", [1, 3, 7, 13, 15, 26, 99, 100, 137, 480, 1234, 98765])
def test_horizontal_pdf_chart_uses_a_round_step_above_the_top_bar(highest):
    chart = Chart("t", [f"A long program name number {i}" for i in range(4)], [highest, 1, 1, 1], "Copies")
    assert chart.horizontal
    drawing = pdf._horizontal_chart(chart, 760, [pdf.colors.HexColor(c) for c in layout.SERIES_COLORS])
    bars = next(c for c in drawing.contents if isinstance(c, HorizontalBarChart))
    assert _is_round(bars.valueAxis.valueStep), bars.valueAxis.valueStep
    assert bars.valueAxis.valueMax >= highest + bars.valueAxis.valueStep
    assert (bars.valueAxis.valueStep, bars.valueAxis.valueMax) == layout.axis_scale(highest)


# ─── Ties at the top-10 cut-off ─────────────────────────────────────────

def _chart(counts):
    return _top_groups_chart("Copies by program", Counter(counts), "Copies", ("program", "programs"), ("copy", "copies"))


def test_tie_at_the_cutoff_gets_a_note():
    counts = {f"P{i:02d}": 20 - i for i in range(9)} | {"Tied A": 5, "Tied B": 5, "Tied C": 5, "Small": 1}
    chart = _chart(counts)
    assert len(chart.labels) == 10 and chart.values[-1] == 5
    assert chart.note == "2 other programs tied at 5 copies are in the table."


def test_a_single_tied_group_reads_correctly():
    counts = {f"P{i:02d}": 20 - i for i in range(9)} | {"Tied A": 1, "Tied B": 1}
    assert _chart(counts).note == "1 other program tied at 1 copy is in the table."


def test_no_tie_no_note():
    assert _chart({f"P{i:02d}": 30 - i for i in range(14)}).note is None
    assert _chart({f"P{i}": 5 for i in range(10)}).note is None  # nothing left out


def test_note_appears_under_the_chart_in_pdf_and_excel():
    db = many_programs_world()
    # One more copy for the 11th program ties it with the 10th (6 copies).
    db.tables["book_copies"] += [{"id": "x1", "book_id": "lp10", "accession_number": "X1", "status": "available",
                                  "shelf_location": None}]
    data = _build("catalog", ALL_TIME, db)
    assert data.chart.note == "1 other program tied at 6 copies is in the table."
    text = " ".join(" ".join(p.extract_text().split()) for p in PdfReader(io.BytesIO(pdf.build_pdf(data, _options(data)))).pages)
    assert data.chart.note in text
    ws = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data)))).worksheets[0]
    assert data.chart.note in [c.value for row in ws.iter_rows() for c in row]


@pytest.mark.parametrize("report,count", [("circulation", 4), ("activity_log", 5)])
def test_the_legend_keeps_every_series_in_one_column_inside_the_chart(report, count):
    from reportlab.graphics.charts.legends import Legend

    data = _build(report)
    drawing = pdf._chart(data, 760)
    legend = next(c for c in drawing.contents if isinstance(c, Legend))
    assert len(legend.colorNamePairs) == count and legend.columnMaximum == count
    assert legend.y - count * legend.deltay >= 0

