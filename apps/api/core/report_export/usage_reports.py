# Library usage (borrowing station sessions) and Library assistant usage,
# defined the same way as the reports in definitions.py (which registers
# them in REPORTS). Both are totals only: no names, IDs or message text in
# the rows, the key figures or the AI data.

from collections import Counter
from datetime import date, timedelta

from postgrest.exceptions import APIError

from core.dates import bucket_index, manila_now
from core.rows import fetch_all_rows
from core.report_export.definitions import (
    REPORTS,
    Chart,
    Column,
    DetailTable,
    ExportFilters,
    ReportData,
    ReportDefinition,
    ReportUnavailable,
    _count_text,
    _filename_stem,
    _int_figure,
    _join_and,
    _long_date,
    _manila,
    _period_line,
    _report_buckets,
    _text_figure,
)


def _days(filters: ExportFilters, seen: list[date]) -> list[date]:
    """Every day of the period, including days with nothing. With no dates
    picked: from the first to the last day with something (or none)."""
    first = filters.date_from or (min(seen) if seen else None)
    last = filters.date_to or (max(seen) if seen else None)
    if first is None or last is None or first > last:
        return []
    return [first + timedelta(days=n) for n in range((last - first).days + 1)]


def _hour_text(hour: int) -> str:
    """'9 AM', '12 PM'."""
    return f"{(hour % 12) or 12} {'AM' if hour < 12 else 'PM'}"


def _hour_range(hour: int) -> str:
    """'9–10 AM', '11 AM–12 PM', '12–1 PM'."""
    start, end = _hour_text(hour), _hour_text((hour + 1) % 24)
    if start.split()[1] == end.split()[1]:
        return f"{start.split()[0]}–{end}"
    return f"{start}–{end}"


def _busiest(by_day: Counter) -> tuple[date, int] | None:
    """The day with the most; the latest one on a tie (as in Circulation)."""
    return max(by_day.items(), key=lambda kv: (kv[1], kv[0]), default=None)


def _peak(by_hour: Counter) -> tuple[int, int] | None:
    """The hour with the most; the earliest one on a tie."""
    return min(by_hour.items(), key=lambda kv: (-kv[1], kv[0]), default=None)


def _without_category(filters: ExportFilters, what: str) -> list[str]:
    """Filter lines, saying so when a filter that can't apply was picked."""
    lines = [l for l in filters.filter_lines() if not l.startswith("Category:")]
    if filters.category:
        lines.append(f"Category doesn't apply to {what}, so it was ignored.")
    return lines


# ─── Library usage: borrowing station sessions (period) ─────────────────
# Until the library confirms what counts as a visit: sessions opened at the
# borrowing station (kiosk) by an ID tap. Desk sessions and phone (web
# portal) sessions aren't counted.

KIOSK_STATION_ID = "kiosk-1"
USAGE_COLUMNS = [
    Column("date", "Date", "date", 12),
    Column("day", "Day", "text", 11, wrap=False),
    Column("sessions", "Sessions", "int", 10),
    Column("students", "Students", "int", 10),
    Column("peak_hour", "Peak hour", "text", 14, wrap=False),
    Column("peak_sessions", "Sessions in peak hour", "int", 12),
]
HOUR_COLUMNS = [
    Column("hour", "Hour", "text", 16, wrap=False),
    Column("sessions", "Sessions", "int", 10),
]


def _library_usage_period(filters: ExportFilters) -> str:
    return (_period_line(filters, "Borrowing station sessions started")
            + ". Guests browsing without tapping an ID aren't counted, and all kiosks share one station ID, "
              "so kiosks can't be told apart.")


def build_library_usage(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()

    def query():
        # Only what's counted: when, and which student (for the count of
        # students). Names and ID numbers aren't read.
        q = (admin.table("station_sessions").select("id, student_id, started_at, profiles(program, college, year_level)")
             .eq("station_id", KIOSK_STATION_ID))
        if rf.date_from:
            q = q.gte("started_at", rf.date_from)
        if rf.date_to:
            q = q.lte("started_at", rf.date_to)
        return q.order("id")

    sessions = []
    for s in fetch_all_rows(query):
        profile = s.get("profiles") or {}
        if filters.college and profile.get("college") != filters.college:
            continue
        if filters.program and profile.get("program") != filters.program:
            continue
        if filters.year_level is not None and profile.get("year_level") != filters.year_level:
            continue
        sessions.append((_manila(s["started_at"]), s["student_id"]))

    by_day = Counter(when.date() for when, _ in sessions)
    students_by_day: dict[date, set] = {}
    hours_by_day: dict[date, Counter] = {}
    for when, student in sessions:
        students_by_day.setdefault(when.date(), set()).add(student)
        hours_by_day.setdefault(when.date(), Counter())[when.hour] += 1
    by_hour = Counter(when.hour for when, _ in sessions)

    rows = []
    for day in _days(filters, list(by_day)):
        peak = _peak(hours_by_day.get(day, Counter()))
        rows.append({
            "date": day.isoformat(), "day": day.strftime("%A"), "sessions": by_day.get(day, 0),
            "students": len(students_by_day.get(day, ())),
            "peak_hour": _hour_range(peak[0]) if peak else "—", "peak_sessions": peak[1] if peak else 0,
        })

    hours = list(range(min(by_hour), max(by_hour) + 1)) if by_hour else []
    hour_rows = [{"hour": _hour_range(h), "sessions": by_hour.get(h, 0)} for h in hours]
    busiest, peak = _busiest(by_day), _peak(by_hour)
    busiest_text = f"{_long_date(busiest[0])} ({_count_text(busiest[1], 'session', 'sessions')})" if busiest else "—"
    peak_text = f"{_hour_range(peak[0])} ({_count_text(peak[1], 'session', 'sessions')})" if peak else "—"
    students = len({student for _, student in sessions})
    period = _library_usage_period(filters)
    buckets = _report_buckets(filters, [when for when, _ in sessions])
    per_bucket = [0] * len(buckets)
    for when, _ in sessions:
        i = bucket_index(buckets, when)
        if i is not None:
            per_bucket[i] += 1

    summary = (
        f"{_count_text(len(sessions), 'borrowing station session', 'borrowing station sessions')} by "
        f"{_count_text(students, 'student', 'students')} on {_count_text(len(by_day), 'day', 'days')}. "
        f"The busiest day was {busiest_text}, and the peak hour was {peak_text}."
    ) if sessions else "No borrowing station sessions were started in this period."

    return ReportData(
        report_id="library_usage", title="Library Usage: Borrowing Station Sessions",
        period=period, filters=_without_category(filters, "borrowing station sessions"), generated_at=now,
        key_figures=[
            _int_figure("Borrowing station sessions", len(sessions)),
            _int_figure("Students", students),
            _int_figure("Days with sessions", len(by_day)),
            _text_figure("Busiest day", busiest_text),
            _text_figure("Peak hour", peak_text),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Library usage (borrowing station sessions)", "period": period,
            "borrowing_station_sessions": len(sessions), "students": students, "days_with_sessions": len(by_day),
            "busiest_day": {"date": busiest[0].isoformat(), "sessions_that_day": busiest[1]} if busiest else None,
            "peak_hour": {"hour": _hour_range(peak[0]), "sessions_in_that_hour": peak[1]} if peak else None,
            "sessions_by_hour_of_day": {r["hour"]: r["sessions"] for r in hour_rows},
            "sessions_by_period": dict(zip([b.label for b in buckets], per_bucket)),
        },
        chart=Chart("Sessions by hour of day", [_hour_text(h) for h in hours], [by_hour.get(h, 0) for h in hours],
                    "Sessions") if sessions else None,
        columns=USAGE_COLUMNS, rows=rows if sessions else [],
        empty_message="No borrowing station sessions were started in this period.",
        filename_stem=_filename_stem("library-usage", filters),
        details=DetailTable("Sessions by hour of day", HOUR_COLUMNS, hour_rows) if hour_rows else None,
    )


# ─── Library assistant usage (period) ───────────────────────────────────
# From assistant_usage (migrations/0070): one row per answered question,
# with no text and no user id.

SURFACES = {"kiosk": "Kiosk", "web": "Web"}
USER_GROUPS = {"guest": "Guests", "student": "Signed-in students and faculty",
               "faculty": "Signed-in students and faculty", "staff": "Librarians and staff"}
ANSWER_TYPES = {"rule": "Rule-based answers", "ai": "AI answers", None: "Answer type not recorded"}
# How each answer type reads in the summary sentence.
ANSWER_WORDS = {"Rule-based answers": "rule-based", "AI answers": "from the AI",
                "Answer type not recorded": "with no answer type recorded"}
ASSISTANT_COLUMNS = [
    Column("date", "Date", "date", 11),
    Column("sessions", "Chat sessions", "int", 9),
    Column("questions", "Questions", "int", 9),
    Column("kiosk", "Kiosk", "int", 7),
    Column("web", "Web", "int", 7),
    Column("guests", "Guests", "int", 8),
    Column("signed_in", "Students and faculty", "int", 10),
    Column("staff", "Librarians and staff", "int", 10),
    Column("rule", "Rule-based", "int", 9),
    Column("ai", "AI", "int", 7),
    Column("not_recorded", "Not recorded", "int", 9),
]
SESSION_NOTE = "A chat that runs over more than one day counts as a session on each of those days."


def _ignored_filters(filters: ExportFilters) -> list[str]:
    """No filter applies to questions: only when, where and what kind of
    user is recorded. Says so when one was picked."""
    picked = [name for name, value in (("Category", filters.category), ("College", filters.college),
                                       ("Program", filters.program), ("Year level", filters.year_level))
              if value not in (None, "")]
    if not picked:
        return []
    return [f"{_join_and(picked)} {'doesn' if len(picked) == 1 else 'don'}'t apply to the library assistant "
            "(questions record only when, where and what kind of user), so "
            f"{'it was' if len(picked) == 1 else 'they were'} ignored."]


def _assistant_rows(admin, rf) -> list[dict]:
    def query():
        q = admin.table("assistant_usage").select("id, occurred_at, surface, user_type, answered_by, session_key")
        if rf.date_from:
            q = q.gte("occurred_at", rf.date_from)
        if rf.date_to:
            q = q.lte("occurred_at", rf.date_to)
        return q.order("id")

    return fetch_all_rows(query)


def _first_recorded(admin) -> date | None:
    """The Manila day of the first question recorded live (with its answer
    type). Counts are complete from then on."""
    rows = (admin.table("assistant_usage").select("occurred_at").not_.is_("answered_by", "null")
            .order("occurred_at").limit(1).execute().data)
    return _manila(rows[0]["occurred_at"]).date() if rows else None


def _assistant_period(filters: ExportFilters, first: date | None) -> str:
    base = _period_line(filters, "Questions answered by the library assistant")
    if first is None:
        return (base + ". Counting of new questions hasn't started yet: these are only the chats that still existed "
                       "when counting began, with no record of rule-based or AI answers.")
    return (base + f". Counts are complete from {_long_date(first)}; before that, only chats that still existed "
                   "when counting began are included, with no record of rule-based or AI answers.")


def build_assistant_usage(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    try:
        usage = _assistant_rows(admin, rf)
        first = _first_recorded(admin)
    except APIError as e:
        # PGRST205 / 42P01: the table isn't there yet.
        if e.code in ("PGRST205", "42P01"):
            raise ReportUnavailable(
                "Library assistant usage isn't available yet: migration 0070_assistant_usage.sql "
                "hasn't been applied.") from e
        raise

    events = [(_manila(u["occurred_at"]), u) for u in usage]
    total = len(events)
    sessions = {u["session_key"] for _, u in events}
    surfaces = Counter(SURFACES.get(u["surface"], u["surface"]) for _, u in events)
    groups = Counter(USER_GROUPS.get(u["user_type"], "Guests") for _, u in events)
    answers = Counter(ANSWER_TYPES.get(u.get("answered_by"), "Answer type not recorded") for _, u in events)

    per_day: dict[date, dict] = {}
    for when, u in events:
        d = per_day.setdefault(when.date(), {"sessions": set(), "questions": 0, "kiosk": 0, "web": 0, "guests": 0,
                                             "signed_in": 0, "staff": 0, "rule": 0, "ai": 0, "not_recorded": 0})
        d["sessions"].add(u["session_key"])
        d["questions"] += 1
        d["kiosk" if u["surface"] == "kiosk" else "web"] += 1
        d[{"guest": "guests", "staff": "staff"}.get(u["user_type"], "signed_in")] += 1
        d[u.get("answered_by") or "not_recorded"] += 1
    empty_day = {"sessions": set(), "questions": 0, "kiosk": 0, "web": 0, "guests": 0, "signed_in": 0, "staff": 0,
                 "rule": 0, "ai": 0, "not_recorded": 0}
    rows = [{"date": day.isoformat(), **{k: (len(v) if k == "sessions" else v)
                                          for k, v in per_day.get(day, empty_day).items()}}
            for day in _days(filters, list(per_day))] if events else []

    busiest = _busiest(Counter({day: d["questions"] for day, d in per_day.items()}))
    busiest_text = f"{_long_date(busiest[0])} ({_count_text(busiest[1], 'question', 'questions')})" if busiest else "—"
    buckets = _report_buckets(filters, [when for when, _ in events])
    series = {key: [0] * len(buckets) for key in ("rule", "ai", None)}
    for when, u in events:
        i = bucket_index(buckets, when)
        if i is not None:
            series[u.get("answered_by")][i] += 1
    period = _assistant_period(filters, first)
    answer_labels = [a for a in ANSWER_TYPES.values() if answers.get(a)]

    summary = (
        f"{_count_text(total, 'question was', 'questions were')} answered in "
        f"{_count_text(len(sessions), 'chat session', 'chat sessions')}: "
        f"{surfaces.get('Kiosk', 0):,} at the kiosk and {surfaces.get('Web', 0):,} on the web; "
        f"{groups.get('Guests', 0):,} from guests, {groups.get('Signed-in students and faculty', 0):,} from signed-in "
        f"students and faculty, and {groups.get('Librarians and staff', 0):,} from librarians and staff. "
        + "Answers: " + _join_and([f"{answers[a]:,} {ANSWER_WORDS[a]}" for a in answer_labels]) + "."
        + f" The busiest day was {busiest_text}."
    ) if events else "No questions were answered by the library assistant in this period."

    key_figures = [
        _int_figure("Questions answered", total),
        _int_figure("Chat sessions", len(sessions)),
        # Each group of three below adds up to Questions answered.
        _int_figure("Kiosk", surfaces.get("Kiosk", 0)),
        _int_figure("Web", surfaces.get("Web", 0)),
        _int_figure("Guests", groups.get("Guests", 0)),
        _int_figure("Signed-in students and faculty", groups.get("Signed-in students and faculty", 0)),
        _int_figure("Librarians and staff", groups.get("Librarians and staff", 0)),
        _int_figure("Rule-based answers", answers.get("Rule-based answers", 0)),
        _int_figure("AI answers", answers.get("AI answers", 0)),
    ]
    if answers.get("Answer type not recorded"):
        key_figures.append(_int_figure("Answer type not recorded", answers["Answer type not recorded"]))
    key_figures.append(_text_figure("Busiest day", busiest_text))

    chart_series = [("Rule-based answers", series["rule"]), ("AI answers", series["ai"])]
    if any(series[None]):
        chart_series.append(("Answer type not recorded", series[None]))

    return ReportData(
        report_id="assistant_usage", title="Library Assistant Usage",
        period=period,
        filters=_ignored_filters(filters) + [SESSION_NOTE],
        generated_at=now,
        key_figures=key_figures,
        computed_summary=summary,
        ai_payload={
            "report": "Library assistant usage", "period": period,
            "questions_answered": total, "chat_sessions": len(sessions),
            "questions_by_place": dict(surfaces), "questions_by_user_type": dict(groups),
            "questions_by_answer_type": {a: answers[a] for a in answer_labels},
            "busiest_day": {"date": busiest[0].isoformat(), "questions_that_day": busiest[1]} if busiest else None,
            "questions_by_period": dict(zip([b.label for b in buckets],
                                            [sum(v) for v in zip(*(s for _, s in chart_series))])),
        },
        chart=Chart("Questions answered", [b.label for b in buckets], chart_series[0][1], chart_series[0][0],
                    extra_series=chart_series[1:]) if events else None,
        columns=ASSISTANT_COLUMNS, rows=rows,
        empty_message="No questions were answered by the library assistant in this period.",
        filename_stem=_filename_stem("assistant-usage", filters),
    )


REPORTS.update({
    "library_usage": ReportDefinition(id="library_usage", title="Library Usage: Borrowing Station Sessions",
                                      build=build_library_usage),
    "assistant_usage": ReportDefinition(id="assistant_usage", title="Library Assistant Usage",
                                        build=build_assistant_usage),
})
