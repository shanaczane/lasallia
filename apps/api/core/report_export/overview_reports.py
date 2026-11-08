# The Library Overview (headline figures from the other reports, each saying
# how it was counted) and the Activity Log (every borrow, return,
# reservation and in-house loan in the period), defined the same way as the
# reports in definitions.py (which registers them in REPORTS).

from collections import Counter

from core.dates import bucket_index, manila_now
from core.reports import fetch_in_house_loans
from core.report_export.collection_reports import build_reservations, fetch_reservations
from core.report_export.definitions import (
    REPORTS,
    VISITOR_TYPES,
    Chart,
    Column,
    ExportFilters,
    KeyFigure,
    ReportData,
    ReportDefinition,
    ReportUnavailable,
    _book,
    _count_text,
    _filename_stem,
    _in_house_note,
    _int_figure,
    _join_and,
    _long_date,
    _manila,
    _period_line,
    _profile,
    _report_buckets,
    _text_figure,
    _time_text,
    build_catalog,
    build_circulation,
    build_fines,
    build_overdue,
    build_weeding_candidates,
    filtered_loans,
    manila_time_text,
)
from core.report_export.usage_reports import build_assistant_usage, build_library_usage


# ─── Library Overview ───────────────────────────────────────────────────

OVERVIEW_COLUMNS = [
    Column("area", "Area", "text", 18),
    Column("figure", "Figure", "text", 30),
    Column("value", "Value", "text", 20, wrap=False),
    Column("counted", "Counted", "text", 40),
]
IN_PERIOD = "In the period"
NOW = "As of now"
OVERDUE_RULE = "Borrowed in the period, overdue now"
FINES_RULE = "On books returned in the period, plus fines still growing now"
COLLECTION_NOTE = ("Collection figures (titles, copies, weeding candidates) are as of now and use only the "
                   "Category filter.")
NOT_AVAILABLE = "Not available yet"


def _figure(data: ReportData, label: str) -> KeyFigure:
    for f in data.key_figures:
        if f.label == label:
            return f
    return KeyFigure(label, "0", 0, "#,##0")


def build_overview(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    collection_filters = ExportFilters(category=filters.category)
    circulation = build_circulation(admin, filters)
    reservations = build_reservations(admin, filters)
    overdue = build_overdue(admin, filters)
    fines = build_fines(admin, filters)
    catalog = build_catalog(admin, collection_filters)
    weeding = build_weeding_candidates(admin, collection_filters)
    usage = build_library_usage(admin, filters)
    try:
        assistant = build_assistant_usage(admin, filters)
    except ReportUnavailable:
        assistant = None

    # (area, figure from its report, how it was counted)
    picked: list[tuple[str, KeyFigure, str]] = [
        ("Circulation", _figure(circulation, "Borrows"), IN_PERIOD),
        ("Circulation", _figure(circulation, "Returns"), IN_PERIOD),
        ("Circulation", _figure(circulation, "In-house checkouts"), IN_PERIOD),
        ("Circulation", _figure(circulation, "In-house returns"), IN_PERIOD),
        ("Circulation", _figure(circulation, "Transactions"), IN_PERIOD),
        ("Reservations", _figure(reservations, "Reservations made"), IN_PERIOD),
        ("Overdue", _figure(overdue, "Overdue loans"), OVERDUE_RULE),
        ("Fines", _relabel("Outstanding fines", _figure(fines, "Outstanding")), FINES_RULE),
        ("Fines", _relabel("Fines paid", _figure(fines, "Paid")), FINES_RULE),
        ("Collection", _figure(catalog, "Titles"), NOW),
        ("Collection", _figure(catalog, "Copies"), NOW),
        ("Collection", _figure(catalog, "Copies available"), NOW),
        ("Collection", _figure(catalog, "Copies not available"), NOW),
        ("Collection", _relabel("Weeding candidates", _figure(weeding, "Candidates")), NOW),
        ("Library usage", _figure(usage, "Borrowing station sessions"), IN_PERIOD),
        ("Library assistant",
         _figure(assistant, "Questions answered") if assistant else KeyFigure("Questions answered", NOT_AVAILABLE),
         IN_PERIOD if assistant else "Needs migration 0070_assistant_usage.sql"),
    ]
    rows = [{"area": area, "figure": f.label, "value": f.value, "counted": counted} for area, f, counted in picked]
    by_label = {f.label: f for _, f, _ in picked}

    def value(label: str) -> str:
        return by_label[label].value

    summary = (
        f"In the period: {value('Borrows')} borrows, {value('Returns')} returns, "
        f"{value('In-house checkouts')} in-house checkouts and {value('Reservations made')} reservations made. "
        f"Of the loans borrowed in the period, {value('Overdue loans')} are overdue now, and "
        f"{value('Outstanding fines')} in fines is outstanding. The collection has {value('Titles')} titles and "
        f"{value('Copies')} copies, with {value('Weeding candidates')} weeding candidates."
    )
    headline = ["Borrows", "Returns", "In-house checkouts", "Reservations made", "Overdue loans",
                "Outstanding fines", "Titles", "Copies", "Weeding candidates", "Borrowing station sessions",
                "Questions answered"]
    # Short, since it's repeated in every page's footer; the Counted column
    # says which kind each figure is.
    period = _period_line(filters, "Period figures") + f"; other figures as of {manila_time_text(now)}"

    return ReportData(
        report_id="overview", title="Library Overview",
        period=period,
        filters=filters.filter_lines() + _in_house_note(filters) + [COLLECTION_NOTE], generated_at=now,
        key_figures=[by_label[label] for label in headline],
        computed_summary=summary,
        ai_payload={
            "report": "Library overview", "period": period,
            "figures": [{"area": r["area"], "figure": r["figure"], "value": r["value"], "counted": r["counted"]}
                        for r in rows],
        },
        chart=circulation.chart,
        columns=OVERVIEW_COLUMNS, rows=rows,
        empty_message="No figures for this period.",
        filename_stem=_filename_stem("library-overview", filters),
    )


def _relabel(label: str, f: KeyFigure) -> KeyFigure:
    """The same figure under a name that makes sense next to the others."""
    return KeyFigure(label, f.value, f.number, f.number_format)


# ─── Activity Log (period) ──────────────────────────────────────────────
# Every event on its own date: borrows, returns, reservations made and
# in-house (guest) checkouts and returns, like the Activity Log tab.

ACTIVITIES = ["Borrow", "Return", "Reservation made", "In-house checkout", "In-house return"]
ACTIVITY_FIGURES = {"Borrow": "Borrows", "Return": "Returns", "Reservation made": "Reservations made",
                    "In-house checkout": "In-house checkouts", "In-house return": "In-house returns"}
ACTIVITY_COLUMNS = [
    Column("date", "Date", "date", 11),
    Column("time", "Time", "text", 9, wrap=False),
    Column("activity", "Activity", "text", 15, wrap=False),
    Column("patron", "Patron", "text", 24),
    Column("program", "Program", "text", 16),
    Column("book", "Book title", "text", 36),
]
EVENT_RULE = "An event is a borrow, a return, a reservation made, an in-house checkout or an in-house return."


def build_activity_log(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    events = [(_manila(l["borrowed_at"]), "Borrow", l) for l in filtered_loans(admin, rf)]
    events += [(_manila(l["returned_at"]), "Return", l)
               for l in filtered_loans(admin, rf, date_column="returned_at") if l.get("returned_at")]
    events += [(_manila(r["requested_at"]), "Reservation made", r) for r in fetch_reservations(admin, filters)]
    events += [(_manila(l["checked_out_at"]), "In-house checkout", l) for l in fetch_in_house_loans(admin, rf)]
    events += [(_manila(l["returned_at"]), "In-house return", l)
               for l in fetch_in_house_loans(admin, rf, date_column="returned_at") if l.get("returned_at")]
    events.sort(key=lambda e: (e[0], ACTIVITIES.index(e[1]), (_book(e[2]).get("title") or "").lower()))

    def row(when, activity, record):
        if activity.startswith("In-house"):
            # The guest's name only, never their ID number.
            patron = f"{record.get('guest_name') or 'Guest'} (guest)"
            program = VISITOR_TYPES.get(record.get("visitor_type"), "Guest")
        else:
            patron = _profile(record).get("full_name") or "Unknown patron"
            program = _profile(record).get("program") or "—"
        return {"date": when.date().isoformat(), "time": _time_text(when), "activity": activity,
                "patron": patron, "program": program, "book": _book(record).get("title") or "Unknown title"}

    rows = [row(*e) for e in events]
    counts = Counter(activity for _, activity, _ in events)
    present = [a for a in ACTIVITIES if counts.get(a)]
    buckets = _report_buckets(filters)
    series = {a: [0] * len(buckets) for a in ACTIVITIES}
    for when, activity, _ in events:
        i = bucket_index(buckets, when)
        if i is not None:
            series[activity][i] += 1
    by_day = Counter(when.date() for when, _, _ in events)
    busiest = max(by_day.items(), key=lambda kv: (kv[1], kv[0]), default=None)
    busiest_text = f"{_long_date(busiest[0])} ({_count_text(busiest[1], 'event', 'events')})" if busiest else "—"
    period = _period_line(filters, "Borrows, returns, reservations and in-house (guest) loans")
    labels = [b.label for b in buckets]

    summary = (
        f"{_count_text(len(rows), 'event', 'events')}: "
        + _join_and([f"{counts[a]:,} {ACTIVITY_FIGURES[a].lower() if counts[a] != 1 else a.lower()}"
                     for a in present])
        + f". The busiest day was {busiest_text}."
    ) if rows else "No activity in this period."

    return ReportData(
        report_id="activity_log", title="Activity Log",
        period=period,
        filters=filters.filter_lines() + _in_house_note(filters) + [EVENT_RULE], generated_at=now,
        key_figures=[
            _int_figure("Events", len(rows)),
            # One per activity; they add up to Events.
            *(_int_figure(ACTIVITY_FIGURES[a], counts.get(a, 0)) for a in ACTIVITIES),
            _text_figure("Busiest day", busiest_text),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Activity log", "period": period, "what_an_event_is": EVENT_RULE, "events": len(rows),
            "events_by_activity": {ACTIVITY_FIGURES[a]: counts.get(a, 0) for a in ACTIVITIES},
            "busiest_day": {"date": busiest[0].isoformat(), "events_that_day": busiest[1]} if busiest else None,
            "events_by_period": dict(zip(labels, [sum(v) for v in zip(*series.values())])),
        },
        chart=Chart("Events by activity", labels, series[present[0]], ACTIVITY_FIGURES[present[0]],
                    extra_series=[(ACTIVITY_FIGURES[a], series[a]) for a in present[1:]]) if rows else None,
        columns=ACTIVITY_COLUMNS, rows=rows,
        empty_message="No activity in this period.",
        filename_stem=_filename_stem("activity-log", filters),
    )


REPORTS.update({
    "overview": ReportDefinition(id="overview", title="Library Overview", build=build_overview),
    "activity_log": ReportDefinition(id="activity_log", title="Activity Log", build=build_activity_log),
})
