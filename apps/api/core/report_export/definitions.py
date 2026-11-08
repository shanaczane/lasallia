# Each exportable report, defined once: title, filters, how to load its
# rows (reusing core/reports.py), the computed key figures and summary, the
# chart and the columns. The PDF, Excel and CSV exporters only render a
# ReportData, so no report logic lives in them.
#
# Reports added later (round 2) keep the page's own CSV and Print until
# they're defined here.

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Literal

import core.reports as _reports
from core.dates import MANILA, bucket_index, manila_date_text, manila_now, parse_timestamp, period_buckets, report_bound
from core.inventory import list_sessions, report_items
from core.reports import (
    ReportFilters,
    _fetch_filtered_loans as filtered_loans,
    _year_suffix,
    fetch_in_house_loans,
    fine_loans,
    library_stats,
    overdue_loans,
    shelf_list,
    transaction_stats,
)
from core.rows import fetch_all_rows
from core.weeding import (
    WEEDING_LOOKBACK_MONTHS,
    WEEDING_MAX_BORROWS_IN_WINDOW,
    WEEDING_MIN_AGE_YEARS,
    find_weeding_candidates,
    get_weeding_events,
)

# "plain" is a whole number shown without separators, like a year (2008).
ColumnKind = Literal["text", "int", "plain", "money", "date"]


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
    # More bars per label, e.g. [("Returns", [...])] next to borrows.
    extra_series: list[tuple[str, list[float]]] = field(default_factory=list)

    @property
    def series(self) -> list[tuple[str, list[float]]]:
        return [(self.value_label, list(self.values))] + [(name, list(v)) for name, v in self.extra_series]


@dataclass
class DetailTable:
    """A second, more detailed table: its own sheet in Excel and an option
    for the CSV. Not printed in the PDF."""
    title: str
    columns: list["Column"]
    rows: list[dict[str, Any]]


@dataclass
class ExportFilters:
    """What the librarian picked. Dates are whole Manila days, both included."""
    date_from: date | None = None
    date_to: date | None = None
    category: str | None = None
    program: str | None = None
    college: str | None = None
    year_level: int | None = None
    floor: str | None = None   # Shelf list only
    aisle: str | None = None   # Shelf list only

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
        if self.floor:
            lines.append(f"Floor: {self.floor}")
        if self.aisle:
            lines.append(f"Aisle: {self.aisle}")
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
    # False for snapshot reports ("as of" now): the date filter doesn't apply.
    uses_dates: bool = True
    details: DetailTable | None = None


def ai_input(data: "ReportData") -> dict[str, Any]:
    """What the AI summary is drafted from: the report's labelled key figures
    (exact wording to copy, totals only) and its aggregated data."""
    return {
        "report": data.title,
        "key_figures": [{"label": f.label, "value": f.value} for f in data.key_figures],
        **{k: v for k, v in data.ai_payload.items() if k != "report"},
    }


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
    """'BSIT (4 overdue loans)', 'BSIT and BSA (4 overdue loans each)', or
    '5 programs tied (12 overdue loans each)' for a wide tie. The number
    always says what it counts."""
    if not programs:
        return "—"
    counted = _count_text(count, "overdue loan", "overdue loans")
    if len(programs) == 1:
        return f"{programs[0]} ({counted})"
    if len(programs) <= 3:
        return f"{', '.join(programs[:-1])} and {programs[-1]} ({counted} each)"
    return f"{len(programs)} programs tied ({counted} each)"


def _join_and(parts: list[str]) -> str:
    """'a', 'a and b', 'a, b and c'."""
    if len(parts) <= 1:
        return "".join(parts)
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def _transactions_text(n: int) -> str:
    """'7 transactions', '1 transaction': what a busiest-day count counts.
    The report says what a transaction is."""
    return _count_text(n, "transaction", "transactions")


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


# ─── Shared helpers for the reports below ───────────────────────────────

def _int_figure(label: str, n: int) -> KeyFigure:
    return KeyFigure(label, f"{n:,}", n, "#,##0")


def _money_figure(label: str, amount: float) -> KeyFigure:
    return KeyFigure(label, _peso(amount), round(amount, 2), '"₱"#,##0.00')


def _text_figure(label: str, text: str) -> KeyFigure:
    return KeyFigure(label, text)


def _percent_figure(label: str, share: float) -> KeyFigure:
    return KeyFigure(label, f"{share * 100:.1f}%", round(share, 4), "0.0%")


def _year_text(level) -> str:
    return f"{level}{_year_suffix(level)} Year" if level else "—"


def _manila(moment: str | None) -> datetime | None:
    return parse_timestamp(moment).astimezone(MANILA) if moment else None


def _time_text(moment: datetime) -> str:
    return moment.strftime("%I:%M %p").lstrip("0")


def _period_line(filters: ExportFilters, what: str) -> str:
    """'<what> 1 November 2026 to 30 November 2026 (Manila time)', or
    '<what> on any date (Manila time)'."""
    text = filters.period_text()
    return f"{what} {'on any date' if text == 'All dates' else text} (Manila time)"


def _as_of_line(now: datetime) -> str:
    return f"As of {manila_time_text(now)} (Manila time)"


def _top_with_other(counts: Counter, top: int = 10) -> tuple[list[str], list[int]]:
    """The `top` largest groups and one "Other" bar for the rest."""
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    labels = [k for k, _ in ranked[:top]]
    values = [v for _, v in ranked[:top]]
    rest = sum(v for _, v in ranked[top:])
    if rest:
        labels.append("Other")
        values.append(rest)
    return labels, values


def _report_buckets(filters: ExportFilters):
    return period_buckets(filters.date_from, filters.date_to, default="month", default_count=6)


def _profile(loan: dict) -> dict:
    return loan.get("profiles") or {}


def _book(loan: dict) -> dict:
    return loan.get("books") or {}


# ─── Circulation ────────────────────────────────────────────────────────
# Borrows by borrow date and returns by return date, like the Circulation
# tab, plus guest (in-house) checkouts and returns on their own dates.

CIRCULATION_COLUMNS = [
    Column("date", "Date", "date", 11),
    Column("time", "Time", "text", 9),
    Column("type", "Type", "text", 13),
    Column("book", "Book title", "text", 30),
    Column("author", "Author", "text", 17),
    Column("borrower", "Borrower", "text", 19),
    Column("program", "Program", "text", 15),
    Column("year", "Year", "text", 9),
    Column("due_date", "Due date", "date", 11),
]
# In this order on the same minute, and in the key figures.
CIRCULATION_TYPES = ["Borrow", "Return", "In-house checkout", "In-house return"]
VISITOR_TYPES = {"nocei": "Guest (NOCEI)", "non_nocei": "Guest (visitor)"}
TRANSACTION_RULE = "A transaction is a borrow, a return, an in-house checkout or an in-house return."
IN_HOUSE_LEFT_OUT = "In-house (guest) loans are left out: guests have no college, program or year level."


def _circulation_period(filters: ExportFilters) -> str:
    return _period_line(filters, "Borrows, returns and in-house (guest) loans")


def _in_house_note(filters: ExportFilters) -> list[str]:
    """The filter line saying in-house loans were left out, when a borrower
    filter (college, program, year level) is set."""
    return [IN_HOUSE_LEFT_OUT] if filters.college or filters.program or filters.year_level is not None else []


def build_circulation(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    borrowed = filtered_loans(admin, rf)
    returned = [l for l in filtered_loans(admin, rf, date_column="returned_at") if l.get("returned_at")]
    checked_out = fetch_in_house_loans(admin, rf)
    in_house_returned = [l for l in fetch_in_house_loans(admin, rf, date_column="returned_at") if l.get("returned_at")]

    events = [(_manila(l["borrowed_at"]), "Borrow", l) for l in borrowed]
    events += [(_manila(l["returned_at"]), "Return", l) for l in returned]
    events += [(_manila(l["checked_out_at"]), "In-house checkout", l) for l in checked_out]
    events += [(_manila(l["returned_at"]), "In-house return", l) for l in in_house_returned]
    events.sort(key=lambda e: (e[0], CIRCULATION_TYPES.index(e[1]), _book(e[2]).get("title") or ""))

    def row(when, kind, l):
        book = _book(l)
        base = {"date": when.date().isoformat(), "time": _time_text(when), "type": kind,
                "book": book.get("title") or "Unknown title", "author": book.get("author") or "—"}
        if kind.startswith("In-house"):
            # The guest's name only, never their ID number.
            return {**base, "borrower": l.get("guest_name") or "Guest",
                    "program": VISITOR_TYPES.get(l.get("visitor_type"), "Guest"), "year": "—", "due_date": ""}
        return {**base, "borrower": _profile(l).get("full_name") or "Unknown patron",
                "program": _profile(l).get("program") or "—", "year": _year_text(_profile(l).get("year_level")),
                "due_date": manila_date_text(l.get("due_date")) if kind == "Borrow" else ""}

    rows = [row(*e) for e in events]
    counts = Counter(kind for _, kind, _ in events)

    buckets = _report_buckets(filters)
    by_bucket = {kind: [0] * len(buckets) for kind in CIRCULATION_TYPES}
    for when, kind, _ in events:
        i = bucket_index(buckets, when)
        if i is not None:
            by_bucket[kind][i] += 1

    by_day = Counter(when.date() for when, _, _ in events)
    busiest = max(by_day.items(), key=lambda kv: (kv[1], kv[0]), default=None)
    busiest_text = f"{_long_date(busiest[0])} ({_transactions_text(busiest[1])})" if busiest else "—"
    borrowers = {l["student_id"] for _, kind, l in events if not kind.startswith("In-house")}
    titles = {_book(l).get("id") for _, _, l in events if _book(l).get("id")}
    total = len(events)
    empty = "No books were borrowed or returned, and no in-house loans were made or returned, in this period."

    summary = (
        f"{_count_text(total, 'transaction', 'transactions')}: "
        f"{_count_text(counts['Borrow'], 'borrow', 'borrows')}, {_count_text(counts['Return'], 'return', 'returns')}, "
        f"{_count_text(counts['In-house checkout'], 'in-house checkout', 'in-house checkouts')} and "
        f"{_count_text(counts['In-house return'], 'in-house return', 'in-house returns')}, by "
        f"{_count_text(len(borrowers), 'student borrower', 'student borrowers')} and across "
        f"{_count_text(len(titles), 'title', 'titles')}. The busiest day was {busiest_text}."
    ) if events else empty
    labels = [b.label for b in buckets]

    return ReportData(
        report_id="circulation", title="Circulation",
        period=_circulation_period(filters),
        filters=filters.filter_lines() + _in_house_note(filters) + [TRANSACTION_RULE], generated_at=now,
        key_figures=[
            _int_figure("Borrows", counts["Borrow"]),
            _int_figure("Returns", counts["Return"]),
            _int_figure("In-house checkouts", counts["In-house checkout"]),
            _int_figure("In-house returns", counts["In-house return"]),
            # The four above add up to this.
            _int_figure("Transactions", total),
            _int_figure("Student borrowers", len(borrowers)),
            _int_figure("Titles", len(titles)),
            _text_figure("Busiest day", busiest_text),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Circulation", "period": _circulation_period(filters),
            "what_a_transaction_is": TRANSACTION_RULE,
            "borrows": counts["Borrow"], "returns": counts["Return"],
            "in_house_checkouts": counts["In-house checkout"], "in_house_returns": counts["In-house return"],
            "transactions": total, "student_borrowers": len(borrowers), "titles": len(titles),
            "busiest_day": {"date": busiest[0].isoformat(), "transactions_that_day": busiest[1]} if busiest else None,
            "borrows_by_period": dict(zip(labels, by_bucket["Borrow"])),
            "returns_by_period": dict(zip(labels, by_bucket["Return"])),
            "in_house_checkouts_by_period": dict(zip(labels, by_bucket["In-house checkout"])),
            "borrows_by_program": dict(sorted(Counter(_profile(l).get("program") or "—" for l in borrowed).items())),
        },
        chart=Chart("Borrows, returns and in-house checkouts", labels, by_bucket["Borrow"], "Borrows",
                    extra_series=[("Returns", by_bucket["Return"]),
                                  ("In-house checkouts", by_bucket["In-house checkout"])]) if events else None,
        columns=CIRCULATION_COLUMNS, rows=rows,
        empty_message=empty,
        filename_stem=_filename_stem("circulation", filters),
    )


# ─── Borrowing statistics ───────────────────────────────────────────────

BORROWING_COLUMNS = [
    Column("program", "Program", "text", 28),
    Column("year", "Year level", "text", 12),
    Column("borrowers", "Borrowers", "int", 11),
    Column("loans", "Loans", "int", 10),
    Column("share", "Share of loans", "text", 12),
]


def build_borrowing_stats(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    stats = transaction_stats(admin, rf)
    library = library_stats(admin, rf)
    loans = filtered_loans(admin, rf)

    groups: dict[tuple[str, str], dict] = {}
    for l in loans:
        key = (_profile(l).get("program") or "Unspecified", _year_text(_profile(l).get("year_level")))
        g = groups.setdefault(key, {"borrowers": set(), "loans": 0})
        g["borrowers"].add(l["student_id"])
        g["loans"] += 1
    total = len(loans)
    rows = [{
        "program": program, "year": year, "borrowers": len(g["borrowers"]), "loans": g["loans"],
        "share": f"{g['loans'] / total * 100:.1f}%" if total else "—",
    } for (program, year), g in sorted(groups.items(), key=lambda kv: (-kv[1]["loans"], kv[0]))]

    buckets = _report_buckets(filters)
    borrows = [0] * len(buckets)
    for l in loans:
        i = bucket_index(buckets, parse_timestamp(l["borrowed_at"]))
        if i is not None:
            borrows[i] += 1
    returns = [0] * len(buckets)
    for l in filtered_loans(admin, rf, date_column="returned_at"):
        if l.get("returned_at"):
            i = bucket_index(buckets, parse_timestamp(l["returned_at"]))
            if i is not None:
                returns[i] += 1

    avg = stats.average_loan_duration_days
    key_figures = [
        _int_figure("Loans", stats.loan_count),
        _int_figure("Reservations", stats.reservation_count),
        _int_figure("Total transactions", stats.total_transactions),
        KeyFigure("Average loan length (days)", f"{avg:.1f}" if avg is not None else "—",
                  avg if avg is not None else None, "0.0" if avg is not None else None),
        _int_figure("Borrowers with books still out", library.active_borrowers),
        _text_figure("Most active category", library.most_active_category or "—"),
        _percent_figure("Copies on loan now", library.utilization_rate),
    ]
    summary = (
        f"{_count_text(stats.loan_count, 'loan', 'loans')} and "
        f"{_count_text(stats.reservation_count, 'reservation', 'reservations')} in this period."
        + (f" Books were kept {avg:.1f} days on average." if avg is not None else "")
        + (f" {library.most_active_category} was the most borrowed category." if library.most_active_category else "")
    ) if stats.total_transactions else "No loans or reservations in this period."

    return ReportData(
        report_id="borrowing_stats", title="Borrowing Statistics",
        period=_period_line(filters, "Loans and reservations"),
        filters=filters.filter_lines() + ["Copies on loan: as of when the report was generated"],
        generated_at=now, key_figures=key_figures, computed_summary=summary,
        ai_payload={
            "report": "Borrowing statistics", "period": _period_line(filters, "Loans and reservations"),
            "loans": stats.loan_count, "reservations": stats.reservation_count,
            "total_transactions": stats.total_transactions, "average_loan_days": avg,
            "borrowers_with_books_out": library.active_borrowers,
            "most_active_category": library.most_active_category,
            "share_of_copies_on_loan_now": library.utilization_rate,
            "loans_by_program_and_year": [{k: r[k] for k in ("program", "year", "borrowers", "loans")} for r in rows],
        },
        chart=Chart("Borrows and returns", [b.label for b in buckets], borrows, "Borrows",
                    extra_series=[("Returns", returns)]) if stats.total_transactions else None,
        columns=BORROWING_COLUMNS, rows=rows,
        empty_message="No loans or reservations in this period.",
        filename_stem=_filename_stem("borrowing-statistics", filters),
    )


# ─── Top patrons ────────────────────────────────────────────────────────

TOP_PATRONS_LIMIT = 50
TOP_PATRON_COLUMNS = [
    Column("rank", "Rank", "int", 7),
    Column("borrower", "Borrower", "text", 26),
    Column("program", "Program", "text", 20),
    Column("year", "Year level", "text", 11),
    Column("loans", "Loans", "int", 9),
    Column("last_borrowed", "Last borrowed", "date", 13),
]


def build_top_patrons(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    loans = filtered_loans(admin, filters.to_report_filters())
    by_student: dict[str, dict] = {}
    for l in loans:
        s = by_student.setdefault(l["student_id"], {"profile": _profile(l), "loans": 0, "last": l["borrowed_at"]})
        s["loans"] += 1
        s["last"] = max(s["last"], l["borrowed_at"])
    # Same order as the Top patrons card: most loans first, ties by name.
    ranked = sorted(by_student.values(), key=lambda s: (-s["loans"], (s["profile"].get("full_name") or "").lower()))
    top = ranked[:TOP_PATRONS_LIMIT]
    rows = [{
        "rank": i, "borrower": s["profile"].get("full_name") or "Unknown patron",
        "program": s["profile"].get("program") or "—", "year": _year_text(s["profile"].get("year_level")),
        "loans": s["loans"], "last_borrowed": manila_date_text(s["last"]),
    } for i, s in enumerate(top, start=1)]

    total = len(loans)
    top10 = sum(s["loans"] for s in ranked[:10])
    share = top10 / total if total else 0.0
    summary = (
        f"{_count_text(len(ranked), 'borrower', 'borrowers')} borrowed {_count_text(total, 'book', 'books')}. "
        f"The top borrower borrowed {_count_text(ranked[0]['loans'], 'book', 'books')}, and the top 10 account for {share * 100:.1f}% of loans."
    ) if ranked else "Nobody borrowed a book in this period."

    return ReportData(
        report_id="top_patrons", title="Top Patrons",
        period=_period_line(filters, "Loans borrowed"),
        filters=filters.filter_lines() + [f"Showing the top {TOP_PATRONS_LIMIT} borrowers"],
        generated_at=now,
        key_figures=[
            _int_figure("Borrowers", len(ranked)),
            _int_figure("Loans", total),
            _int_figure("Top borrower's loans", ranked[0]["loans"] if ranked else 0),
            _percent_figure("Top 10's share of loans", share),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Top patrons", "period": _period_line(filters, "Loans borrowed"),
            "borrowers": len(ranked), "loans": total, "top_10_share_of_loans": round(share, 4),
            "top_borrowers": [{"rank": r["rank"], "program": r["program"], "year": r["year"], "loans": r["loans"]}
                              for r in rows[:10]],
        },
        chart=Chart("Loans by the top 10 borrowers", [f"#{r['rank']}" for r in rows[:10]],
                    [r["loans"] for r in rows[:10]], "Loans") if rows else None,
        columns=TOP_PATRON_COLUMNS, rows=rows,
        empty_message="Nobody borrowed a book in this period.",
        filename_stem=_filename_stem("top-patrons", filters),
    )


# ─── Fines ──────────────────────────────────────────────────────────────
# Fines on books returned in the period (paid or not), plus fines still
# growing on overdue books not yet returned, as of now.

FINE_KINDS = {"unsettled": "Unsettled", "paid": "Paid", "accruing": "Still growing"}
FINE_COLUMNS = [
    Column("borrower", "Borrower", "text", 20),
    Column("program", "Program", "text", 15),
    Column("year", "Year", "text", 9),
    Column("book", "Book title", "text", 30),
    Column("kind", "Type", "text", 12),
    Column("returned", "Returned", "date", 11),
    Column("days_overdue", "Days overdue", "int", 9),
    Column("amount", "Amount (PHP)", "money", 11),
    Column("receipt", "Receipt no.", "text", 12),
]


def _fines_period(filters: ExportFilters, now: datetime) -> str:
    returned = "on any date" if filters.period_text() == "All dates" else filters.period_text()
    return (f"Fines on books returned {returned} (Manila time), plus fines still growing on books "
            f"not yet returned, as of {manila_time_text(now)}")


def build_fines(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rows = []
    totals = {"unsettled": 0.0, "paid": 0.0, "accruing": 0.0}
    borrowers: set[str] = set()
    for l in fine_loans(admin, filters.to_report_filters()):
        book = _book(l)
        if l["status"] == "returned":
            kind = "paid" if l.get("fine_status") == "paid" else "unsettled"
            amount, days = float(l.get("fine_amount") or 0), None
        else:
            kind = "accruing"
            days, amount = _reports.compute_fine(admin, l["due_date"], book.get("collection_type") or "General")
        amount = round(float(amount), 2)
        totals[kind] += amount
        borrowers.add(l["student_id"])
        rows.append({
            "borrower": _profile(l).get("full_name") or "Unknown patron",
            "program": _profile(l).get("program") or "—",
            "year": _year_text(_profile(l).get("year_level")),
            "book": book.get("title") or "Unknown title",
            "kind": FINE_KINDS[kind],
            "returned": manila_date_text(l.get("returned_at")) if kind != "accruing" else "",
            "days_overdue": days,
            "amount": amount,
            "receipt": (l.get("receipt_number") or "") if kind == "paid" else "",
        })
    rows.sort(key=lambda r: (r["kind"] != "Still growing", r["kind"] != "Unsettled", r["borrower"].lower(), r["book"].lower()))

    outstanding = round(totals["unsettled"] + totals["accruing"], 2)
    summary = (
        f"{_peso(outstanding)} is outstanding: {_peso(totals['unsettled'])} unsettled on returned books and "
        f"{_peso(totals['accruing'])} still growing on {_count_text(sum(r['kind'] == 'Still growing' for r in rows), 'book', 'books')} "
        f"not yet returned. {_peso(totals['paid'])} was paid."
    ) if rows else "No fines in this period."

    return ReportData(
        report_id="fines", title="Fines",
        period=_fines_period(filters, now),
        filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _money_figure("Outstanding", outstanding),
            _money_figure("Unsettled", totals["unsettled"]),
            _money_figure("Still growing", totals["accruing"]),
            _money_figure("Paid", totals["paid"]),
            _int_figure("Borrowers with fines", len(borrowers)),
            _int_figure("Fines", len(rows)),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Fines", "period": _fines_period(filters, now),
            "outstanding_php": outstanding, "unsettled_php": round(totals["unsettled"], 2),
            "still_growing_php": round(totals["accruing"], 2), "paid_php": round(totals["paid"], 2),
            "borrowers_with_fines": len(borrowers), "fines": len(rows),
            "fines_by_type": dict(Counter(r["kind"] for r in rows)),
            "fines_by_program": dict(sorted(Counter(r["program"] for r in rows).items())),
        },
        chart=Chart("Fines by type (PHP)", ["Unsettled", "Still growing", "Paid"],
                    [round(totals["unsettled"], 2), round(totals["accruing"], 2), round(totals["paid"], 2)],
                    "Amount (PHP)") if rows else None,
        columns=FINE_COLUMNS, rows=rows,
        empty_message="No fines in this period.",
        filename_stem=_filename_stem("fines", filters),
    )


# ─── Catalog (as of now) ────────────────────────────────────────────────

CATALOG_COLUMNS = [
    Column("title", "Title", "text", 34),
    Column("author", "Author", "text", 20),
    Column("program", "Program", "text", 16),
    Column("college", "College", "text", 10),
    Column("call_number", "Call no.", "text", 16),
    Column("year", "Year", "plain", 7),
    Column("copies", "Copies", "int", 8),
    Column("available", "Available", "int", 9),
]


def build_catalog(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()

    def books_query():
        q = (admin.table("books").select("id, title, author, category, subject, call_number, published_year")
             .is_("archived_at", "null").order("id"))
        if filters.category:
            q = q.eq("category", filters.category)
        if filters.college:
            q = q.eq("subject", filters.college)
        return q

    books = fetch_all_rows(books_query)
    ids = {b["id"] for b in books}
    copies = Counter()
    available = Counter()
    for c in fetch_all_rows(lambda: admin.table("book_copies").select("id, book_id, status").order("id")):
        if c["book_id"] in ids:
            copies[c["book_id"]] += 1
            available[c["book_id"]] += c["status"] == "available"

    rows = sorted(({
        "title": b.get("title") or "", "author": b.get("author") or "—",
        "program": (b.get("category") or "").strip() or "Uncategorised", "college": b.get("subject") or "—",
        "call_number": b.get("call_number") or "", "year": b.get("published_year"),
        "copies": copies[b["id"]], "available": available[b["id"]],
    } for b in books), key=lambda r: (r["title"].lower(), r["author"].lower()))

    by_program = Counter()
    for r in rows:
        by_program[r["program"]] += r["copies"]
    labels, values = _top_with_other(by_program)
    total_copies = sum(copies.values())
    no_copies = sum(1 for r in rows if r["copies"] == 0)
    summary = (
        f"{_count_text(len(rows), 'title', 'titles')} and {_count_text(total_copies, 'copy', 'copies')} across "
        f"{_count_text(len(by_program), 'program', 'programs')}; {sum(available.values()):,} copies are available."
        + (f" {_count_text(no_copies, 'title has', 'titles have')} no copies." if no_copies else "")
    ) if rows else "No titles match these filters."

    return ReportData(
        report_id="catalog", title="Catalog",
        period=_as_of_line(now), filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _int_figure("Titles", len(rows)),
            _int_figure("Copies", total_copies),
            _int_figure("Copies available", sum(available.values())),
            # With "Copies available", adds up to "Copies".
            _int_figure("Copies not available", total_copies - sum(available.values())),
            _int_figure("Programs", len(by_program)),
            _int_figure("Titles with no copies", no_copies),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Catalog", "as_of": manila_time_text(now), "titles": len(rows), "copies": total_copies,
            "copies_available": sum(available.values()), "titles_with_no_copies": no_copies,
            "copies_by_program": dict(zip(labels, values)),
        },
        chart=Chart("Copies by program", labels, values, "Copies") if rows else None,
        columns=CATALOG_COLUMNS, rows=rows,
        empty_message="No titles match these filters.",
        filename_stem=f"catalog_as_of_{now.date().isoformat()}", uses_dates=False,
    )


# ─── Shelf list (as of now) ─────────────────────────────────────────────

COPY_STATUS = {
    "available": "Available", "on_loan": "On loan", "overdue": "Overdue", "reserved": "Reserved",
    "for_reshelving": "For reshelving", "misplaced": "Misplaced", "missing": "Missing", "lost": "Lost",
    "damaged": "Damaged",
}
SHELF_COLUMNS = [
    Column("call_number", "Call no.", "text", 18),
    Column("accession", "Accession no.", "text", 12),
    Column("title", "Title", "text", 36),
    Column("author", "Author", "text", 20),
    Column("location", "Location", "text", 18),
    Column("status", "Status", "text", 13),
]


def build_shelf_list(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    copies = shelf_list(admin, filters.to_report_filters(), floor=filters.floor, aisle=filters.aisle)
    rows = [{
        "call_number": c.call_number, "accession": c.accession_number, "title": c.title, "author": c.author,
        "location": c.shelf_location or "—", "status": COPY_STATUS.get(c.status, c.status),
    } for c in copies]
    by_status = Counter(r["status"] for r in rows)
    # Every status that has copies, in the usual order, then any status this
    # list doesn't know yet, so the status figures always add up to Copies.
    labels = [s for s in COPY_STATUS.values() if by_status.get(s)]
    labels += sorted(s for s in by_status if s not in labels)
    titles = len({c.book_id for c in copies})
    summary = (
        f"{_count_text(len(rows), 'copy', 'copies')} of {_count_text(titles, 'title', 'titles')}: "
        + _join_and([f"{by_status[s]:,} {s.lower()}" for s in labels]) + "."
    ) if rows else "No copies match these filters."

    return ReportData(
        report_id="shelf_list", title="Shelf List",
        period=_as_of_line(now), filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _int_figure("Copies", len(rows)),
            _int_figure("Titles", titles),
            *(_int_figure(s, by_status[s]) for s in labels),
        ],
        computed_summary=summary,
        ai_payload={"report": "Shelf list", "as_of": manila_time_text(now), "copies": len(rows),
                    "titles": titles, "copies_by_status": {s: by_status[s] for s in labels}},
        chart=Chart("Copies by status", labels, [by_status[s] for s in labels], "Copies") if rows else None,
        columns=SHELF_COLUMNS, rows=rows,
        empty_message="No copies match these filters.",
        filename_stem=f"shelf-list_as_of_{now.date().isoformat()}", uses_dates=False,
    )


# ─── Weeding candidates (as of now) ─────────────────────────────────────

WEEDING_CANDIDATE_COLUMNS = [
    Column("title", "Title", "text", 32),
    Column("author", "Author", "text", 20),
    Column("program", "Program", "text", 16),
    Column("published", "Published", "plain", 10),
    Column("years", "Years in collection", "text", 11),
    Column("borrows", "Borrows (24 months)", "int", 11),
    Column("reason", "Reason", "text", 36),
]


def build_weeding_candidates(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    candidates = [c for c in find_weeding_candidates(admin)
                  if not filters.category or c.category == filters.category]
    rows = sorted(({
        "title": c.title, "author": c.author or "—", "program": c.category or "Uncategorised",
        "published": c.published_year, "years": f"{c.years_since_added:.1f}",
        "borrows": c.borrow_count_in_window, "reason": c.heuristic_reason,
    } for c in candidates), key=lambda r: (r["published"] or 9999, r["title"].lower()))
    by_program = Counter(r["program"] for r in rows)
    labels, values = _top_with_other(by_program)
    never = sum(1 for r in rows if r["borrows"] == 0)
    oldest = min((r["published"] for r in rows if r["published"]), default=None)
    rule = (f"Rule: published {WEEDING_MIN_AGE_YEARS:g}+ years ago and borrowed at most "
            f"{WEEDING_MAX_BORROWS_IN_WINDOW} time in the last {WEEDING_LOOKBACK_MONTHS} months")
    summary = (
        f"{_count_text(len(rows), 'title is a candidate', 'titles are candidates')} for weeding; "
        f"{never:,} weren't borrowed in the last {WEEDING_LOOKBACK_MONTHS} months."
        + (f" The oldest was published in {oldest}." if oldest else "")
    ) if rows else "No titles meet the weeding rule right now."

    return ReportData(
        report_id="weeding_candidates", title="Weeding Candidates",
        period=_as_of_line(now), filters=filters.filter_lines() + [rule], generated_at=now,
        key_figures=[
            _int_figure("Candidates", len(rows)),
            _int_figure("Not borrowed in 24 months", never),
            _int_figure("Programs", len(by_program)),
            KeyFigure("Oldest published", str(oldest) if oldest else "—", oldest, "0" if oldest else None),
        ],
        computed_summary=summary,
        ai_payload={"report": "Weeding candidates", "as_of": manila_time_text(now), "rule": rule,
                    "candidates": len(rows), "not_borrowed_in_24_months": never, "oldest_published": oldest,
                    "candidates_by_program": dict(zip(labels, values))},
        chart=Chart("Candidates by program", labels, values, "Titles") if rows else None,
        columns=WEEDING_CANDIDATE_COLUMNS, rows=rows,
        empty_message="No titles meet the weeding rule right now.",
        filename_stem=f"weeding-candidates_as_of_{now.date().isoformat()}", uses_dates=False,
    )


# ─── Weeding log (period) ───────────────────────────────────────────────

WEEDING_ACTIONS = {"archived": "Archived", "restored": "Restored", "dismissed": "Kept (dismissed)"}
WEEDING_LOG_COLUMNS = [
    Column("date", "Date", "date", 11),
    Column("time", "Time", "text", 9),
    Column("book", "Book title", "text", 36),
    Column("action", "Action", "text", 16),
    Column("reason", "Reason", "text", 30),
    Column("by", "Performed by", "text", 20),
]


def build_weeding_log(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    events = get_weeding_events(admin, date_from=rf.date_from, date_to=rf.date_to)
    rows = []
    for e in sorted(events, key=lambda e: e["occurred_at"]):
        when = _manila(e["occurred_at"])
        rows.append({
            "date": when.date().isoformat(), "time": _time_text(when),
            "book": e.get("book_title") or "Deleted book",
            "action": WEEDING_ACTIONS.get(e.get("event_type"), e.get("event_type") or "—"),
            "reason": e.get("reason") or "", "by": e.get("performed_by_name") or "—",
        })
    by_action = Counter(r["action"] for r in rows)
    labels = [a for a in WEEDING_ACTIONS.values() if by_action.get(a)]
    summary = (
        f"{_count_text(len(rows), 'weeding action', 'weeding actions')}: {by_action.get('Archived', 0):,} archived, "
        f"{by_action.get('Restored', 0):,} restored and {by_action.get('Kept (dismissed)', 0):,} kept."
    ) if rows else "No weeding actions in this period."

    return ReportData(
        report_id="weeding_log", title="Weeding Log",
        period=_period_line(filters, "Weeding actions"), filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _int_figure("Actions", len(rows)),
            _int_figure("Archived", by_action.get("Archived", 0)),
            _int_figure("Restored", by_action.get("Restored", 0)),
            _int_figure("Kept (dismissed)", by_action.get("Kept (dismissed)", 0)),
            _int_figure("Books", len({r["book"] for r in rows})),
        ],
        computed_summary=summary,
        ai_payload={"report": "Weeding log", "period": _period_line(filters, "Weeding actions"),
                    "actions": len(rows), "actions_by_type": {a: by_action[a] for a in labels}},
        chart=Chart("Weeding actions", labels, [by_action[a] for a in labels], "Actions") if rows else None,
        columns=WEEDING_LOG_COLUMNS, rows=rows,
        empty_message="No weeding actions in this period.",
        filename_stem=_filename_stem("weeding-log", filters),
    )


# ─── Inventory (period: checks started in it) ───────────────────────────

SESSION_STATUS = {"completed": "Completed", "in_progress": "In progress", "cancelled": "Cancelled"}
CHECK_FIGURE_LABELS = {"Completed": "Completed checks", "In progress": "Checks in progress",
                       "Cancelled": "Cancelled checks"}
ITEM_RESULTS = {"found": "Found", "misplaced": "Misplaced", "not_found": "Not found", "pending": "Pending"}
ITEM_RESOLUTIONS = {"marked_missing": "Marked missing", "marked_found": "Marked found"}
INVENTORY_COLUMNS = [
    Column("started", "Started", "date", 11),
    Column("location", "Location", "text", 20),
    Column("status", "Status", "text", 12),
    Column("by", "Started by", "text", 18),
    Column("expected", "Expected", "int", 9),
    Column("found", "Found", "int", 8),
    Column("misplaced", "Misplaced", "int", 9),
    Column("not_found", "Not found", "int", 9),
    Column("pending", "Pending", "int", 8),
    Column("resolved", "Resolved", "int", 9),
]
INVENTORY_DETAIL_COLUMNS = [
    Column("started", "Started", "date", 11),
    Column("location", "Location", "text", 20),
    Column("call_number", "Call no.", "text", 18),
    Column("accession", "Accession no.", "text", 12),
    Column("title", "Title", "text", 34),
    Column("result", "Result", "text", 11),
    Column("expected_location", "Belongs at", "text", 18),
    Column("resolution", "Resolution", "text", 14),
]


def build_inventory(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    sessions = sorted(list_sessions(admin, limit=10_000, date_from=rf.date_from, date_to=rf.date_to),
                      key=lambda s: s.started_at)
    rows = [{
        "started": manila_date_text(s.started_at), "location": s.label,
        "status": SESSION_STATUS.get(s.status, s.status), "by": s.started_by_name or "—",
        "expected": s.expected, "found": s.found, "misplaced": s.misplaced, "not_found": s.not_found,
        "pending": s.pending, "resolved": s.resolved,
    } for s in sessions]
    totals = {k: sum(r[k] for r in rows) for k in ("expected", "found", "misplaced", "not_found", "pending", "resolved")}
    by_status = Counter(r["status"] for r in rows)

    details = [{
        "started": manila_date_text(i.started_at), "location": i.location, "call_number": i.call_number or "",
        "accession": i.accession_number or "", "title": i.title or "",
        "result": ITEM_RESULTS.get(i.result, i.result), "expected_location": i.expected_location or "",
        "resolution": ITEM_RESOLUTIONS.get(i.resolution, "") if i.resolution else "",
    } for i in report_items(admin, date_from=rf.date_from, date_to=rf.date_to)]

    # Copies checked = every copy in the checks: the four results always add
    # up to it. It can be more than "expected", since a copy scanned where it
    # wasn't expected is counted too (found or misplaced).
    checked = totals["found"] + totals["misplaced"] + totals["not_found"] + totals["pending"]
    check_statuses = [s for s in SESSION_STATUS.values() if by_status.get(s)]
    check_statuses += sorted(s for s in by_status if s not in check_statuses)
    summary = (
        f"{_count_text(len(rows), 'check', 'checks')} ("
        + _join_and([f"{by_status[s]:,} {s.lower()}" for s in check_statuses])
        + f") covering {_count_text(checked, 'copy', 'copies')} ({totals['expected']:,} expected): "
        f"{totals['found']:,} found, {totals['misplaced']:,} misplaced, "
        f"{totals['not_found']:,} not found and {totals['pending']:,} not yet scanned."
    ) if rows else "No inventory checks were started in this period."

    return ReportData(
        report_id="inventory", title="Inventory",
        period=_period_line(filters, "Checks started"), filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _int_figure("Checks", len(rows)),
            *(_int_figure(CHECK_FIGURE_LABELS.get(s, f"{s} checks"), by_status[s]) for s in check_statuses),
            _int_figure("Copies checked", checked),
            _int_figure("Copies expected", totals["expected"]),
            _int_figure("Found", totals["found"]),
            _int_figure("Misplaced", totals["misplaced"]),
            _int_figure("Not found", totals["not_found"]),
            _int_figure("Not yet scanned", totals["pending"]),
        ],
        computed_summary=summary,
        ai_payload={"report": "Inventory", "period": _period_line(filters, "Checks started"),
                    "checks": len(rows), "checks_by_status": dict(by_status), **{f"copies_{k}": v for k, v in totals.items()}},
        chart=Chart("Copies by result", list(ITEM_RESULTS.values()),
                    [totals["found"], totals["misplaced"], totals["not_found"], totals["pending"]], "Copies") if rows else None,
        columns=INVENTORY_COLUMNS, rows=rows,
        empty_message="No inventory checks were started in this period.",
        filename_stem=_filename_stem("inventory", filters),
        details=DetailTable("Copies checked", INVENTORY_DETAIL_COLUMNS, details) if details else None,
    )


# ─── Book requests (period: requested in it) ────────────────────────────

REQUEST_STATUS = {"pending": "Pending", "approved": "Approved", "rejected": "Rejected",
                  "fulfilled": "Fulfilled", "cancelled": "Cancelled"}
REQUEST_FORMAT = {"print": "Print", "ebook": "E-book", "either": "Either"}
REQUEST_COLUMNS = [
    Column("requested", "Requested", "date", 11),
    Column("title", "Title", "text", 30),
    Column("author", "Author", "text", 18),
    Column("isbn", "ISBN", "text", 15),
    Column("format", "Format", "text", 8),
    Column("copies", "Copies", "int", 7),
    Column("course", "Course", "text", 14),
    Column("requester", "Requester", "text", 18),
    Column("college", "Requester's college", "text", 11),
    Column("status", "Status", "text", 10),
    Column("reviewed", "Reviewed", "date", 11),
]


def build_book_requests(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()

    def query():
        # No email and no free-text note: name and college identify the
        # requester, and a note can contain anything.
        q = (admin.table("book_requests")
             .select("id, title, author, isbn, format, copies, course, status, created_at, reviewed_at, "
                     "profiles!book_requests_requester_id_fkey(full_name, college)")
             .order("created_at").order("id"))
        if rf.date_from:
            q = q.gte("created_at", rf.date_from)
        if rf.date_to:
            q = q.lte("created_at", rf.date_to)
        return q

    requests = [r for r in fetch_all_rows(query)
                if not filters.college or ((r.get("profiles") or {}).get("college") == filters.college)]
    rows = [{
        "requested": manila_date_text(r["created_at"]), "title": r.get("title") or "", "author": r.get("author") or "—",
        "isbn": r.get("isbn") or "", "format": REQUEST_FORMAT.get(r.get("format"), r.get("format") or ""),
        "copies": r.get("copies") or 0, "course": r.get("course") or "",
        "requester": (r.get("profiles") or {}).get("full_name") or "Unknown requester",
        "college": (r.get("profiles") or {}).get("college") or "—",
        "status": REQUEST_STATUS.get(r.get("status"), r.get("status") or ""),
        "reviewed": manila_date_text(r.get("reviewed_at")),
    } for r in requests]
    by_status = Counter(r["status"] for r in rows)
    labels = [s for s in REQUEST_STATUS.values() if by_status.get(s)]
    requesters = len({(r.get("profiles") or {}).get("full_name") for r in requests})
    summary = (
        f"{_count_text(len(rows), 'request', 'requests')} from {_count_text(requesters, 'requester', 'requesters')} "
        f"for {sum(r['copies'] for r in rows):,} copies: "
        + ", ".join(f"{by_status[s]:,} {s.lower()}" for s in labels) + "."
    ) if rows else "No book requests were made in this period."

    return ReportData(
        report_id="book_requests", title="Book Requests",
        period=_period_line(filters, "Requests made"), filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _int_figure("Requests", len(rows)),
            _int_figure("Pending", by_status.get("Pending", 0)),
            _int_figure("Approved", by_status.get("Approved", 0)),
            _int_figure("Fulfilled", by_status.get("Fulfilled", 0)),
            _int_figure("Copies requested", sum(r["copies"] for r in rows)),
            _int_figure("Requesters", requesters),
        ],
        computed_summary=summary,
        ai_payload={"report": "Book requests", "period": _period_line(filters, "Requests made"),
                    "requests": len(rows), "requesters": requesters,
                    "copies_requested": sum(r["copies"] for r in rows),
                    "requests_by_status": {s: by_status[s] for s in labels},
                    "requests_by_college": dict(sorted(Counter(r["college"] for r in rows).items()))},
        chart=Chart("Requests by status", labels, [by_status[s] for s in labels], "Requests") if rows else None,
        columns=REQUEST_COLUMNS, rows=rows,
        empty_message="No book requests were made in this period.",
        filename_stem=_filename_stem("book-requests", filters),
    )


REPORTS: dict[str, ReportDefinition] = {
    "overdue": ReportDefinition(id="overdue", title="Overdue Loans", build=build_overdue),
    "circulation": ReportDefinition(id="circulation", title="Circulation", build=build_circulation),
    "borrowing_stats": ReportDefinition(id="borrowing_stats", title="Borrowing Statistics", build=build_borrowing_stats),
    "top_patrons": ReportDefinition(id="top_patrons", title="Top Patrons", build=build_top_patrons),
    "fines": ReportDefinition(id="fines", title="Fines", build=build_fines),
    "catalog": ReportDefinition(id="catalog", title="Catalog", build=build_catalog),
    "shelf_list": ReportDefinition(id="shelf_list", title="Shelf List", build=build_shelf_list),
    "weeding_candidates": ReportDefinition(id="weeding_candidates", title="Weeding Candidates", build=build_weeding_candidates),
    "weeding_log": ReportDefinition(id="weeding_log", title="Weeding Log", build=build_weeding_log),
    "inventory": ReportDefinition(id="inventory", title="Inventory", build=build_inventory),
    "book_requests": ReportDefinition(id="book_requests", title="Book Requests", build=build_book_requests),
}
