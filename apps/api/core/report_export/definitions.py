# Each exportable report, defined once: title, filters, how to load its
# rows (reusing core/reports.py), the computed key figures and summary, the
# chart and the columns. The PDF, Excel and CSV exporters only render a
# ReportData, so no report logic lives in them.
#
# Only Overdue Loans and the Audit Log are defined so far; the other reports
# keep the page's own CSV and Print until they're added here.

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Literal

from core.audit import ACTIONS, audit_query
from core.dates import MANILA, manila_date_text, manila_now, report_bound
from core.reports import ReportFilters, _fetch_all_rows, overdue_loans

ColumnKind = Literal["text", "int", "money", "date"]


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: ColumnKind = "text"
    width: int = 14  # relative width; Excel uses it as characters


@dataclass
class KeyFigure:
    label: str
    value: str                       # as shown in the PDF and the dialog
    number: float | int | None = None  # the same figure as a number, for Excel
    number_format: str | None = None   # Excel number format for `number`


@dataclass
class Chart:
    title: str
    labels: list[str]
    values: list[float]
    value_label: str  # what a bar counts, e.g. "Overdue loans"


@dataclass
class ExportFilters:
    """What the librarian picked. Dates are whole Manila days, both included."""
    date_from: date | None = None
    date_to: date | None = None
    category: str | None = None
    program: str | None = None
    college: str | None = None
    year_level: int | None = None
    librarian_profile_id: str | None = None
    action: str | None = None

    def to_report_filters(self) -> ReportFilters:
        return ReportFilters(
            date_from=report_bound(self.date_from.isoformat(), end=False) if self.date_from else None,
            date_to=report_bound(self.date_to.isoformat(), end=True) if self.date_to else None,
            category=self.category,
            program=self.program,
            college=self.college,
            year_level=self.year_level,
        )

    def period_text(self) -> str:
        if self.date_from and self.date_to:
            if self.date_from == self.date_to:
                return _long_date(self.date_from)
            return f"{_long_date(self.date_from)} to {_long_date(self.date_to)}"
        if self.date_from:
            return f"From {_long_date(self.date_from)}"
        if self.date_to:
            return f"Up to {_long_date(self.date_to)}"
        return "All dates"

    def filter_lines(self) -> list[str]:
        lines = []
        if self.category:
            lines.append(f"Category: {self.category}")
        if self.college:
            lines.append(f"College: {self.college}")
        if self.program:
            lines.append(f"Program: {self.program}")
        if self.year_level is not None:
            lines.append(f"Year level: {self.year_level}")
        return lines


@dataclass
class ReportData:
    report_id: str
    title: str
    period: str              # e.g. "Loans borrowed 1 November 2026 to 30 November 2026 (Manila time)"
    filters: list[str]       # filters applied, one per line
    generated_at: datetime   # Manila time
    key_figures: list[KeyFigure]
    computed_summary: str
    # What the AI may see: totals and breakdowns only. Never names, emails,
    # ID numbers or accession numbers (tests/test_report_export_ai.py).
    ai_payload: dict[str, Any]
    chart: Chart | None
    columns: list[Column]
    rows: list[dict[str, Any]]
    empty_message: str
    filename_stem: str = field(default="report")


@dataclass(frozen=True)
class ReportDefinition:
    id: str
    title: str
    build: Callable[[Any, ExportFilters], ReportData]


def _long_date(day: date) -> str:
    return f"{day.day} {day.strftime('%B %Y')}"


def manila_time_text(moment: datetime) -> str:
    """'7 November 2026, 3:05 PM'."""
    return f"{_long_date(moment.date())}, {moment.strftime('%I:%M %p').lstrip('0')}"


def _peso(amount: float) -> str:
    return f"₱{amount:,.2f}"


def _filename_stem(slug: str, filters: ExportFilters) -> str:
    if filters.date_from and filters.date_to:
        return f"{slug}_{filters.date_from.isoformat()}_to_{filters.date_to.isoformat()}"
    if filters.date_from:
        return f"{slug}_from_{filters.date_from.isoformat()}"
    if filters.date_to:
        return f"{slug}_to_{filters.date_to.isoformat()}"
    return f"{slug}_all_dates"


# ─── Overdue Loans ──────────────────────────────────────────────────────

# Days-overdue groups for the chart: always the same five bars.
OVERDUE_BUCKETS: list[tuple[str, int, int | None]] = [
    ("1–3 days", 1, 3),
    ("4–7 days", 4, 7),
    ("8–14 days", 8, 14),
    ("15–30 days", 15, 30),
    ("Over 30 days", 31, None),
]

# Borrower details kept to what the report needs to follow up a loan: name,
# program and year. No email, ID number or accession number.
OVERDUE_COLUMNS = [
    Column("borrower", "Borrower", "text", 22),
    Column("program", "Program", "text", 16),
    Column("year", "Year", "text", 9),
    Column("book", "Book title", "text", 34),
    Column("author", "Author", "text", 20),
    Column("due_date", "Due date", "date", 11),
    Column("days_overdue", "Days overdue", "int", 9),
    Column("fine", "Fine (PHP)", "money", 10),
]


def _bucket(days: int) -> str:
    for label, low, high in OVERDUE_BUCKETS:
        if days >= low and (high is None or days <= high):
            return label
    return OVERDUE_BUCKETS[0][0]  # 0 days: due today but already flagged


def _count_text(n: int, one: str, many: str) -> str:
    return f"{n:,} {one if n == 1 else many}"


def _top_programs_text(programs: list[str], count: int) -> str:
    """'BSIT (4)', 'BSIT and BSA (4 each)', or '5 programs (12 each)' for a
    wide tie."""
    if not programs:
        return "—"
    if len(programs) == 1:
        return f"{programs[0]} ({count:,})"
    if len(programs) <= 3:
        return f"{', '.join(programs[:-1])} and {programs[-1]} ({count:,} each)"
    return f"{len(programs)} programs tied ({count:,} each)"


def build_overdue(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    loans = overdue_loans(admin, filters.to_report_filters())
    rows_sorted = sorted(loans, key=lambda item: (-item[1].daysOverdue, item[1].patron.lower(), item[1].book.lower()))

    table = [
        {
            "borrower": r.patron,
            "program": r.program,
            "year": r.year,
            "book": r.book,
            "author": r.author,
            "due_date": manila_date_text(r.dueDate),
            "days_overdue": r.daysOverdue,
            "fine": round(float(r.fine), 2),
        }
        for _, r in rows_sorted
    ]

    count = len(loans)
    borrowers = len({student_id for student_id, _ in loans})
    total_fine = round(sum(float(r.fine) for _, r in loans), 2)
    days = [r.daysOverdue for _, r in loans]
    average_days = round(sum(days) / count, 1) if count else 0.0
    longest = max(days, default=0)

    by_bucket = Counter(_bucket(d) for d in days)
    by_program = Counter(r.program for _, r in loans)
    by_year = Counter(r.year for _, r in loans)
    top_count = max(by_program.values(), default=0)
    top_programs = sorted(p for p, n in by_program.items() if n == top_count) if count else []

    key_figures = [
        KeyFigure("Overdue loans", f"{count:,}", count, "#,##0"),
        KeyFigure("Borrowers with overdue loans", f"{borrowers:,}", borrowers, "#,##0"),
        KeyFigure("Fines so far", _peso(total_fine), total_fine, '"₱"#,##0.00'),
        KeyFigure("Average days overdue", f"{average_days:.1f}", average_days, "0.0"),
        KeyFigure("Longest overdue", _count_text(longest, "day", "days"), longest,
                  '0 "day"' if longest == 1 else '#,##0 "days"'),
        KeyFigure("Program with the most overdue loans", _top_programs_text(top_programs, top_count)),
    ]

    if count:
        summary = (
            f"{_count_text(count, 'loan', 'loans')} by {_count_text(borrowers, 'borrower', 'borrowers')} "
            f"{'is' if count == 1 else 'are'} overdue, with {_peso(total_fine)} in fines so far. "
            f"On average they are {average_days:.1f} days overdue; the longest is "
            f"{_count_text(longest, 'day', 'days')}. "
            f"Most overdue loans: {_top_programs_text(top_programs, top_count)}."
        )
    else:
        summary = "No loans borrowed in this period are overdue."

    borrowed = "on any date" if filters.period_text() == "All dates" else filters.period_text()
    period = f"Loans borrowed {borrowed} (Manila time), overdue as of {manila_time_text(now)}"

    return ReportData(
        report_id="overdue",
        title="Overdue Loans",
        period=period,
        filters=filters.filter_lines(),
        generated_at=now,
        key_figures=key_figures,
        computed_summary=summary,
        ai_payload={
            "report": "Overdue loans",
            "period": period,
            "overdue_loans": count,
            "borrowers_with_overdue_loans": borrowers,
            "total_fines_php": total_fine,
            "average_days_overdue": average_days,
            "longest_days_overdue": longest,
            "loans_by_days_overdue": {label: by_bucket.get(label, 0) for label, _, _ in OVERDUE_BUCKETS},
            "loans_by_program": dict(sorted(by_program.items())),
            "loans_by_year_level": dict(sorted(by_year.items())),
        },
        # No chart when there's nothing to show.
        chart=Chart(
            title="Overdue loans by days overdue",
            labels=[label for label, _, _ in OVERDUE_BUCKETS],
            values=[by_bucket.get(label, 0) for label, _, _ in OVERDUE_BUCKETS],
            value_label="Overdue loans",
        ) if count else None,
        columns=OVERDUE_COLUMNS,
        rows=table,
        empty_message="No loans borrowed in this period are overdue.",
        filename_stem=_filename_stem("overdue-loans", filters),
    )


AUDIT_COLUMNS = [
    Column("created_at", "Date and time", "date", 20),
    Column("librarian", "Librarian", "text", 20),
    Column("action", "Action", "text", 22),
    Column("entity", "Record", "text", 24),
    Column("details", "Details", "text", 50),
]
_AUDIT_CHART_BARS = 8


def _audit_detail_text(details: dict) -> str:
    parts = []
    for key, value in details.items():
        if key == "changed" and isinstance(value, dict):
            parts.extend(f"{field}: {change.get('from')} → {change.get('to')}" for field, change in value.items())
        else:
            parts.append(f"{key}: {value}")
    return "; ".join(parts)


def build_audit_log(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    bounds = filters.to_report_filters()
    entries = _fetch_all_rows(lambda: audit_query(
        admin, bounds.date_from, bounds.date_to, filters.librarian_profile_id, filters.action,
    ))

    labels = [ACTIONS.get(e["action"], e["action"]) for e in entries]
    table = [
        {
            "created_at": manila_time_text(datetime.fromisoformat(e["created_at"]).astimezone(MANILA)),
            "librarian": e["librarian_name"],
            "action": label,
            "entity": " ".join(filter(None, [e["entity_type"], e.get("entity_id")])),
            "details": _audit_detail_text(e.get("details") or {}),
        }
        for e, label in zip(entries, labels)
    ]

    count = len(entries)
    librarians = len({e["librarian_profile_id"] for e in entries})
    by_action = Counter(labels)
    top_actions = by_action.most_common(_AUDIT_CHART_BARS)

    key_figures = [
        KeyFigure("Actions recorded", f"{count:,}", count, "#,##0"),
        KeyFigure("Librarians", f"{librarians:,}", librarians, "#,##0"),
        KeyFigure("Most common action", top_actions[0][0] if top_actions else "None"),
    ]
    summary = (
        f"{_count_text(count, 'action was', 'actions were')} recorded by "
        f"{_count_text(librarians, 'librarian', 'librarians')}. Most common: {top_actions[0][0]} ({top_actions[0][1]:,})."
        if count else "No librarian actions were recorded in this period."
    )

    lines = filters.filter_lines()
    if filters.librarian_profile_id:
        named = next((e["librarian_name"] for e in entries), None)
        lines.append(f"Librarian: {named or 'No actions in this period'}")
    if filters.action:
        lines.append(f"Action: {ACTIONS.get(filters.action, filters.action)}")

    period = f"Actions recorded {'on any date' if filters.period_text() == 'All dates' else filters.period_text()} (Manila time)"

    return ReportData(
        report_id="audit_log",
        title="Audit Log",
        period=period,
        filters=lines,
        generated_at=now,
        key_figures=key_figures,
        computed_summary=summary,
        ai_payload={
            "report": "Librarian audit log",
            "period": period,
            "actions_recorded": count,
            "librarians": librarians,
            "actions_by_type": dict(sorted(by_action.items())),
        },
        chart=Chart(
            title="Most common actions",
            labels=[label for label, _ in top_actions],
            values=[n for _, n in top_actions],
            value_label="Actions",
        ) if count else None,
        columns=AUDIT_COLUMNS,
        rows=table,
        empty_message="No librarian actions were recorded in this period.",
        filename_stem=_filename_stem("audit-log", filters),
    )


REPORTS: dict[str, ReportDefinition] = {
    "overdue": ReportDefinition(id="overdue", title="Overdue Loans", build=build_overdue),
    "audit_log": ReportDefinition(id="audit_log", title="Audit Log", build=build_audit_log),
}
