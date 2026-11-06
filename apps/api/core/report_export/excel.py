# Excel exporter (openpyxl). Same layout as the PDF on one sheet: header,
# title and period, key figures, summary, a native Excel bar chart, the
# table (filter buttons; its header repeats on printed pages) and signature
# lines. The chart's numbers are on a second sheet, "Chart data".

import io
import math
import textwrap

import openpyxl
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from core.report_export import layout
from core.report_export.cells import put_cell
from core.report_export.definitions import ReportData, manila_time_text

_PAPER_CODES = {"A4": 9, "Letter": 1}  # openpyxl / Excel paperSize values
_NUMBER_FORMATS = {"int": "#,##0", "money": '"₱"#,##0.00'}
_GREEN = layout.GREEN_700.lstrip("#")
_GREEN_LIGHT = layout.GREEN_50.lstrip("#")
_MUTED = layout.INK_500.lstrip("#")
_CHART_ROWS = 16  # rows left free for the chart
# Extra characters on each table column for the filter button, so it never
# covers the header text.
_FILTER_BUTTON_ROOM = 5


def column_width(label: str, width: int) -> int:
    """Excel width for a table column: wide enough for its header (which
    also wraps) plus the filter button."""
    return max(width, len(label) + _FILTER_BUTTON_ROOM)


_LINE_HEIGHT = 15  # points per line of 11pt text, Excel's default row height


def wrapped_lines(text: str, width: float) -> int:
    """How many lines `text` takes in a wrapped cell of this column width.
    Excel doesn't resize rows itself when a file is opened, so the table
    sets each row's height from this. A width unit is about one digit and most
    letters are narrower, so one character less than the width is safe."""
    usable = max(1, math.floor(width) - 1)
    return sum(max(1, len(textwrap.wrap(part, usable, break_long_words=True))) for part in str(text).splitlines() or [""])


def style_chart_axes(chart: BarChart) -> None:
    """Shows the category labels and the value axis numbers. openpyxl leaves
    the axes' "delete" and label settings out, and Excel and LibreOffice
    then hide both axes."""
    chart.x_axis.delete = False
    chart.y_axis.delete = False
    chart.x_axis.axPos = "b"
    chart.x_axis.tickLblPos = "nextTo"
    chart.y_axis.tickLblPos = "nextTo"
    chart.x_axis.majorTickMark = "out"
    chart.y_axis.majorTickMark = "out"
    chart.y_axis.numFmt = "0"           # whole counts
    chart.y_axis.majorUnit = None       # let the app pick the steps
    chart.y_axis.scaling.min = 0
    # The count on top of each bar, as in the PDF.
    chart.dataLabels = DataLabelList()
    chart.dataLabels.showVal = True
    for flag in ("showSerName", "showCatName", "showLegendKey", "showPercent"):
        setattr(chart.dataLabels, flag, False)


def _sheet_title(title: str) -> str:
    return "".join("-" if ch in "[]:*?/\\" else ch for ch in title)[:31] or "Report"


def build_excel(data: ReportData, options: layout.ExportOptions) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = _sheet_title(data.title)
    columns = data.columns
    last_col = len(columns)
    last_letter = get_column_letter(last_col)

    def line(row: int, text: str, font: Font | None = None, wrap: bool = False, height: float | None = None):
        cell = put_cell(ws, row, 1, text)
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=last_col)
        if font:
            cell.font = font
        cell.alignment = Alignment(wrap_text=wrap, vertical="top")
        if height:
            ws.row_dimensions[row].height = height
        return row + 1

    row = 1
    header = options.header
    row = line(row, header.school, Font(bold=True, size=14, color=_GREEN))
    if header.unit:
        row = line(row, header.unit, Font(bold=True, size=11))
    if header.address:
        row = line(row, header.address, Font(size=9, color=_MUTED))
    row += 1
    row = line(row, data.title, Font(bold=True, size=14))
    row = line(row, f"Period covered: {data.period}", Font(size=9, color=_MUTED))
    for text in data.filters:
        row = line(row, text, Font(size=9, color=_MUTED))
    row = line(row, f"Generated {manila_time_text(data.generated_at)} (Manila time)", Font(size=9, color=_MUTED))

    row += 1
    row = line(row, "Key figures", Font(bold=True, color=_GREEN))
    for figure in data.key_figures:
        put_cell(ws, row, 1, figure.label).font = Font(color=_MUTED)
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        # Numbers are stored as numbers (no "number stored as text"
        # warnings); text figures stay protected text.
        if figure.number is not None:
            value = put_cell(ws, row, 3, figure.number, figure.number_format)
        else:
            value = put_cell(ws, row, 3, figure.value)
        value.font = Font(bold=True)
        value.alignment = Alignment(horizontal="left")
        # The value spans a few columns so "₱3,080.00" or a program name
        # never shows as ###.
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=min(last_col, 5))
        row += 1

    row += 1
    row = line(row, options.summary_label, Font(bold=True, color=_GREEN))
    # Rough height so the wrapped summary shows in full.
    lines_needed = max(1, len(options.summary_text) // 140 + options.summary_text.count("\n") + 1)
    row = line(row, options.summary_text, wrap=True, height=15 * lines_needed)

    if data.chart is not None:
        data_ws = wb.create_sheet("Chart data")
        put_cell(data_ws, 1, 1, data.chart.title)
        put_cell(data_ws, 2, 1, "Group")
        put_cell(data_ws, 2, 2, data.chart.value_label)
        for i, (label, value) in enumerate(zip(data.chart.labels, data.chart.values), start=3):
            put_cell(data_ws, i, 1, label)
            put_cell(data_ws, i, 2, value)
        end = 2 + len(data.chart.labels)
        data_ws.column_dimensions["A"].width = max(14, *(len(label) + 2 for label in data.chart.labels))
        data_ws.column_dimensions["B"].width = max(14, len(data.chart.value_label) + 2)
        chart = BarChart()
        chart.type = "col"
        chart.title = data.chart.title
        chart.legend = None
        # No value-axis title: the chart title already says what is counted,
        # and the rotated title overlapped the tick labels.
        chart.y_axis.majorGridlines = None
        chart.add_data(Reference(data_ws, min_col=2, min_row=2, max_row=end), titles_from_data=True)
        chart.set_categories(Reference(data_ws, min_col=1, min_row=3, max_row=end))
        chart.series[0].graphicalProperties.solidFill = _GREEN
        style_chart_axes(chart)
        chart.height, chart.width = 7.5, 16
        row += 1
        ws.add_chart(chart, f"A{row}")
        row += _CHART_ROWS

    row += 1
    row = line(row, f"Details ({len(data.rows):,} {'row' if len(data.rows) == 1 else 'rows'})", Font(bold=True, color=_GREEN))
    header_row = row
    thin = Side(style="thin", color=layout.INK_200.lstrip("#"))
    for col, column in enumerate(columns, start=1):
        cell = put_cell(ws, row, col, column.label)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=_GREEN)
        # Left-aligned and wrapped, so the filter button at the right edge
        # never sits on the text.
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        cell.border = Border(bottom=thin)
    ws.row_dimensions[row].height = 30
    row += 1
    if not data.rows:
        row = line(row, data.empty_message, Font(color=_MUTED))
    widths = [column_width(c.label, c.width) for c in columns]
    for i, record in enumerate(data.rows):
        lines = 1
        for col, column in enumerate(columns, start=1):
            value = record.get(column.key)
            cell = put_cell(ws, row, col, value, _NUMBER_FORMATS.get(column.kind))
            cell.alignment = Alignment(vertical="top", wrap_text=column.kind == "text")
            if i % 2:
                cell.fill = PatternFill("solid", fgColor=_GREEN_LIGHT)
            if column.kind == "text" and value:
                lines = max(lines, wrapped_lines(value, widths[col - 1]))
        # Tall enough for the most-wrapped cell in the row, in every column.
        ws.row_dimensions[row].height = _LINE_HEIGHT * lines + 2
        row += 1
    if data.rows:
        ws.auto_filter.ref = f"A{header_row}:{last_letter}{row - 1}"

    # Signature lines, one block per signatory across the columns.
    row += 2
    # Blocks with an empty column between them, so the signing lines don't
    # run together.
    count = len(options.signatories)
    gap = 1 if last_col >= 2 * count - 1 else 0
    span = max(1, (last_col - gap * (count - 1)) // count)
    for i, s in enumerate(options.signatories):
        first = 1 + i * (span + gap)
        last = last_col if i == count - 1 else first + span - 1
        put_cell(ws, row, first, f"{s.label}:").font = Font(color=_MUTED)
        for col in range(first, last + 1):
            ws.cell(row=row + 2, column=col).border = Border(bottom=Side(style="thin", color="000000"))
        for offset, text, font in ((3, s.name, Font(bold=True)), (4, s.title, Font(color=_MUTED))):
            cell = put_cell(ws, row + offset, first, text)
            cell.font = font
            cell.alignment = Alignment(horizontal="center")
            ws.merge_cells(start_row=row + offset, start_column=first, end_row=row + offset, end_column=last)
    ws.row_dimensions[row + 2].height = 30

    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
    # No frozen panes: the heading, summary and chart above the table would
    # freeze too and fill the screen. Printed pages repeat the header row.
    ws.print_title_rows = f"{header_row}:{header_row}"
    ws.page_setup.orientation = layout.ORIENTATION
    ws.page_setup.paperSize = _PAPER_CODES[layout.PAPER_SIZE]
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.oddFooter.left.text = data.title
    ws.oddFooter.right.text = "Page &P of &N"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
