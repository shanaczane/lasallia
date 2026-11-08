# PDF exporter (ReportLab). Renders any ReportData in the shared layout:
# header, title and period, key figures, summary, chart, table (its header
# row repeats on every page) and signature lines.

import io
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.report_export import layout
from core.report_export.definitions import ReportData, manila_time_text

FONT_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"
FONT = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"
MARGIN = 14 * mm


def _register_fonts() -> None:
    # Bundled (assets/fonts), so the server needs no system fonts. DejaVu
    # has ₱, which the PDF base fonts don't.
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_DIR / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_DIR / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_BOLD, italic=FONT, boldItalic=FONT_BOLD)


def page_size() -> tuple[float, float]:
    paper = {"A4": A4, "Letter": LETTER}[layout.PAPER_SIZE]
    return landscape(paper) if layout.ORIENTATION == "landscape" else portrait(paper)


def _text(value) -> str:
    """Plain text for a Paragraph. ReportLab reads tags like <b> in
    Paragraph text, so anything from the data or the librarian is escaped."""
    return escape("" if value is None else str(value)).replace("\n", "<br/>")


def _styles() -> dict[str, ParagraphStyle]:
    ink, muted, green = colors.HexColor(layout.INK_900), colors.HexColor(layout.INK_500), colors.HexColor(layout.GREEN_700)
    base = ParagraphStyle("base", fontName=FONT, fontSize=9, leading=12, textColor=ink)
    return {
        "school": ParagraphStyle("school", parent=base, fontName=FONT_BOLD, fontSize=14, leading=17, alignment=TA_CENTER, textColor=green),
        "lrc": ParagraphStyle("lrc", parent=base, fontName=FONT_BOLD, fontSize=11, leading=14, alignment=TA_CENTER),
        "address": ParagraphStyle("address", parent=base, fontSize=8, leading=10, alignment=TA_CENTER, textColor=muted),
        "title": ParagraphStyle("title", parent=base, fontName=FONT_BOLD, fontSize=15, leading=19, spaceBefore=4),
        "meta": ParagraphStyle("meta", parent=base, fontSize=8.5, leading=11, textColor=muted),
        "heading": ParagraphStyle("heading", parent=base, fontName=FONT_BOLD, fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3, textColor=green),
        "body": base,
        "cell": ParagraphStyle("cell", parent=base, fontSize=8, leading=10),
        "cell_right": ParagraphStyle("cell_right", parent=base, fontSize=8, leading=10, alignment=TA_RIGHT),
        "head": ParagraphStyle("head", parent=base, fontName=FONT_BOLD, fontSize=8, leading=10, textColor=colors.white),
        "head_right": ParagraphStyle("head_right", parent=base, fontName=FONT_BOLD, fontSize=8, leading=10, textColor=colors.white, alignment=TA_RIGHT),
        "sign_name": ParagraphStyle("sign_name", parent=base, fontName=FONT_BOLD, alignment=TA_CENTER),
        "sign_title": ParagraphStyle("sign_title", parent=base, fontSize=8.5, alignment=TA_CENTER, textColor=muted),
        "sign_label": ParagraphStyle("sign_label", parent=base, fontSize=8.5, textColor=muted),
    }


def _format(value, kind: str) -> str:
    if value is None or value == "":
        return "—" if kind != "text" else ""
    if kind == "money":
        return f"₱{float(value):,.2f}"
    if kind == "int":
        return f"{int(value):,}"
    return str(value)


def _key_figures(data: ReportData, styles, width: float) -> Table:
    # Three label/value pairs per row.
    per_row = 3
    cells = [[Paragraph(_text(f.label), styles["meta"]), Paragraph(f"<b>{_text(f.value)}</b>", styles["body"])]
             for f in data.key_figures]
    rows = []
    for i in range(0, len(cells), per_row):
        row = []
        for j in range(per_row):
            row += cells[i + j] if i + j < len(cells) else ["", ""]
        rows.append(row)
    table = Table(rows, colWidths=[width * 0.18, width * (1 / per_row - 0.18)] * per_row)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(layout.GREEN_50)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(layout.INK_200)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _chart(data: ReportData, width: float) -> Drawing | None:
    chart = data.chart
    if chart is None:
        return None
    series = chart.series
    crowded = len(chart.labels) > 12  # daily or weekly periods: slanted labels
    height = (46 if crowded else 38) * mm
    drawing = Drawing(width, height)
    bars = VerticalBarChart()
    bars.x, bars.y = 40, 40 if crowded else 28
    bars.width = min(width - 60, (230 if crowded else 150) * mm)
    bars.height = height - bars.y - 20
    bars.data = [list(values) for _, values in series]
    bars.categoryAxis.categoryNames = list(chart.labels)
    bars.categoryAxis.labels.fontName = FONT
    bars.categoryAxis.labels.fontSize = 7 if crowded else 7.5
    if crowded:
        bars.categoryAxis.labels.angle = 45
        bars.categoryAxis.labels.boxAnchor = "ne"
        bars.categoryAxis.labels.dy = -2
    bars.valueAxis.labels.fontName = FONT
    bars.valueAxis.labels.fontSize = 7.5
    bars.valueAxis.valueMin = 0
    top = max((max(values, default=0) for _, values in series), default=0)
    bars.valueAxis.valueMax = max(top, 1) * 1.15 if top else 1
    bars.valueAxis.valueStep = max(1, round(max(top, 1) / 4))
    palette = [colors.HexColor(c) for c in layout.SERIES_COLORS]
    for i in range(len(series)):
        bars.bars[i].fillColor = palette[i % len(palette)]
        bars.bars[i].strokeColor = None
    # Counts on the bars only while they fit.
    if len(chart.labels) * len(series) <= 24:
        bars.barLabels.fontName = FONT
        bars.barLabels.fontSize = 7.5
        bars.barLabelFormat = "%d"
        bars.barLabels.nudge = 6
    drawing.add(bars)
    if len(series) > 1:
        legend = Legend()
        legend.x, legend.y = bars.x + bars.width + 12, bars.y + bars.height
        legend.fontName, legend.fontSize = FONT, 7.5
        legend.boxAnchor = "nw"
        legend.colorNamePairs = [(palette[i % len(palette)], name) for i, (name, _) in enumerate(series)]
        drawing.add(legend)
    drawing.add(String(0, height - 10, chart.title, fontName=FONT_BOLD, fontSize=9.5,
                       fillColor=colors.HexColor(layout.INK_900)))
    return drawing


def _table(data: ReportData, styles, width: float) -> tuple[LongTable | Paragraph, int]:
    if not data.rows:
        return Paragraph(_text(data.empty_message), styles["body"]), 0
    rows = data.rows[: layout.PDF_MAX_ROWS]
    numeric = {c.key for c in data.columns if c.kind in ("int", "plain", "money")}
    header = [Paragraph(_text(c.label), styles["head_right" if c.key in numeric else "head"]) for c in data.columns]
    body = [
        [Paragraph(_text(_format(row.get(c.key), c.kind)), styles["cell_right" if c.key in numeric else "cell"])
         for c in data.columns]
        for row in rows
    ]
    total = sum(c.width for c in data.columns)
    table = LongTable([header] + body, colWidths=[width * c.width / total for c in data.columns], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(layout.GREEN_700)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(layout.GREEN_50)]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(layout.INK_200)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(layout.INK_200)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table, len(data.rows) - len(rows)


def _signatures(options: layout.ExportOptions, styles, width: float) -> KeepTogether:
    # Signature columns with narrow gaps between them, so each signing line
    # stands on its own.
    count = len(options.signatories)
    gap = 12 * mm
    col = (width - gap * (count - 1)) / count
    widths, labels, lines, names, titles = [], [], [], [], []
    for i, s in enumerate(options.signatories):
        if i:
            widths.append(gap)
            for row in (labels, lines, names, titles):
                row.append("")
        widths.append(col)
        labels.append(Paragraph(_text(f"{s.label}:"), styles["sign_label"]))
        lines.append("")
        names.append(Paragraph(_text(s.name) or "&nbsp;", styles["sign_name"]))
        titles.append(Paragraph(_text(s.title), styles["sign_title"]))
    table = Table([labels, lines, names, titles], colWidths=widths, rowHeights=[None, 10 * mm, None, None])
    table.setStyle(TableStyle([
        *[("LINEBELOW", (i * 2, 1), (i * 2, 1), 0.6, colors.HexColor(layout.INK_900)) for i in range(count)],
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
    ]))
    return KeepTogether([Spacer(1, 3 * mm), table])


def _numbered_canvas(footer_left: str):
    class NumberedCanvas(canvas.Canvas):
        """Adds "Page x of y" once the page count is known."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            super().save()

        def _footer(self, total: int) -> None:
            width, _ = self._pagesize
            self.setFont(FONT, 7.5)
            self.setFillColor(colors.HexColor(layout.INK_500))
            self.drawString(MARGIN, 8 * mm, footer_left)
            self.drawRightString(width - MARGIN, 8 * mm, f"Page {self._pageNumber} of {total}")

    return NumberedCanvas


def build_pdf(data: ReportData, options: layout.ExportOptions) -> bytes:
    _register_fonts()
    styles = _styles()
    size = page_size()
    width = size[0] - 2 * MARGIN

    story = []
    header = options.header
    story.append(Paragraph(_text(header.school), styles["school"]))
    if header.unit:
        story.append(Paragraph(_text(header.unit), styles["lrc"]))
    if header.address:
        story.append(Paragraph(_text(header.address), styles["address"]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(_text(data.title), styles["title"]))
    story.append(Paragraph(_text(f"Period covered: {data.period}"), styles["meta"]))
    for line in data.filters:
        story.append(Paragraph(_text(line), styles["meta"]))
    story.append(Paragraph(_text(f"Generated {manila_time_text(data.generated_at)} (Manila time)"), styles["meta"]))

    story.append(Paragraph("Key figures", styles["heading"]))
    story.append(_key_figures(data, styles, width))

    story.append(Paragraph(_text(options.summary_label), styles["heading"]))
    story.append(Paragraph(_text(options.summary_text), styles["body"]))

    drawing = _chart(data, width)
    if drawing is not None:
        story.append(Spacer(1, 4 * mm))
        story.append(drawing)

    story.append(Paragraph(_text(f"Details ({len(data.rows):,} {'row' if len(data.rows) == 1 else 'rows'})"), styles["heading"]))
    table, left_out = _table(data, styles, width)
    story.append(table)
    if left_out:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            _text(f"This PDF shows the first {layout.PDF_MAX_ROWS:,} rows. {left_out:,} more are in the Excel and CSV files."),
            styles["meta"],
        ))

    story.append(_signatures(options, styles, width))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=size, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=11 * mm, bottomMargin=15 * mm,
        title=data.title, author=options.header.school or "Lasallia",
    )
    footer = f"{data.title} · {data.period}"
    doc.build(story, canvasmaker=_numbered_canvas(footer[:150]))
    return buf.getvalue()
