# Top titles, Reservations and the Accession register, defined the same way
# as the reports in definitions.py (which registers them in REPORTS).

import re
from collections import Counter

from core.dates import bucket_index, manila_date_text, manila_now
from core.reports import fetch_in_house_loans
from core.rows import fetch_all_rows
from core.report_export.definitions import (
    IN_PERIOD,
    REPORTS,
    Chart,
    Column,
    ExportFilters,
    ReportData,
    ReportDefinition,
    _as_of_line,
    _book,
    _count_text,
    _covers,
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
    _year_text,
    filtered_loans,
    manila_time_text,
)


def _tied_text(names: list[str], count: int, one: str, many: str) -> str:
    """'Clean code (5 loans)', 'A and B (5 loans each)' or '4 titles tied
    (5 loans each)': the number always says what it counts."""
    if not names:
        return "—"
    counted = _count_text(count, one, many)
    if len(names) == 1:
        return f"{names[0]} ({counted})"
    if len(names) <= 3:
        return f"{_join_and(names)} ({counted} each)"
    return f"{len(names)} titles tied ({counted} each)"


# ─── Top titles (period: loans made in it) ──────────────────────────────
# Student loans by borrow date plus in-house (guest) loans by checkout date,
# ranked by the two together.

TOP_TITLES_LIMIT = 50
LOAN_RULE = "A loan is a student loan or an in-house (guest) loan."
TOP_TITLE_COLUMNS = [
    Column("rank", "Rank", "int", 6),
    Column("title", "Title", "text", 32),
    Column("author", "Author", "text", 18),
    Column("call_number", "Call no.", "text", 15),
    Column("category", "Category", "text", 14),
    Column("student_loans", "Student loans", "int", 9),
    Column("in_house_loans", "In-house loans", "int", 9),
    Column("total", "Total loans", "int", 8),
    Column("borrowers", "Student borrowers", "int", 11),
]


def build_top_titles(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    rf = filters.to_report_filters()
    titles: dict[str, dict] = {}

    def entry(book: dict) -> dict:
        key = book.get("id") or book.get("title") or "?"
        return titles.setdefault(key, {
            "title": book.get("title") or "Unknown title", "author": book.get("author") or "—",
            "call_number": book.get("call_number") or "", "category": book.get("category") or "Uncategorised",
            "student_loans": 0, "in_house_loans": 0, "borrowers": set(),
        })

    for l in filtered_loans(admin, rf):
        e = entry(_book(l))
        e["student_loans"] += 1
        e["borrowers"].add(l["student_id"])
    for l in fetch_in_house_loans(admin, rf):
        entry(_book(l))["in_house_loans"] += 1

    ranked = sorted(titles.values(), key=lambda e: (-(e["student_loans"] + e["in_house_loans"]),
                                                     e["title"].lower(), e["author"].lower()))
    rows = [{
        "rank": i, "title": e["title"], "author": e["author"], "call_number": e["call_number"],
        "category": e["category"], "student_loans": e["student_loans"], "in_house_loans": e["in_house_loans"],
        "total": e["student_loans"] + e["in_house_loans"], "borrowers": len(e["borrowers"]),
    } for i, e in enumerate(ranked[:TOP_TITLES_LIMIT], start=1)]

    student = sum(e["student_loans"] for e in ranked)
    in_house = sum(e["in_house_loans"] for e in ranked)
    total = student + in_house
    shown = sum(r["total"] for r in rows)
    top_count = rows[0]["total"] if rows else 0
    # Ties past the cut-off would be hidden, so name them from the full list.
    top_titles = [e["title"] for e in ranked if e["student_loans"] + e["in_house_loans"] == top_count] if rows else []
    most = _tied_text(top_titles, top_count, "loan", "loans")
    period = _period_line(filters, "Loans made (student and in-house)")

    summary = (
        f"{_count_text(total, 'loan', 'loans')} ({_count_text(student, 'student loan', 'student loans')} and "
        f"{_count_text(in_house, 'in-house loan', 'in-house loans')}) across "
        f"{_count_text(len(ranked), 'title', 'titles')}. The most borrowed: {most}."
    ) if ranked else "No books were borrowed in this period."
    chart_rows = rows[:10]

    return ReportData(
        report_id="top_titles", title="Top Titles",
        period=period,
        filters=filters.filter_lines() + _in_house_note(filters)
        + [LOAN_RULE, f"Showing the top {TOP_TITLES_LIMIT} titles"],
        generated_at=now,
        key_figures=[
            # Student + in-house = Loans; listed + other titles = Loans.
            _int_figure("Loans", total),
            _int_figure("Student loans", student),
            _int_figure("In-house loans", in_house),
            _int_figure("Titles borrowed", len(ranked)),
            _int_figure(f"Loans of the {len(rows)} titles listed", shown),
            _int_figure("Loans of other titles", total - shown),
            _text_figure("Most borrowed", most),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Top titles", "period": period, "what_a_loan_is": LOAN_RULE,
            "loans": total, "student_loans": student, "in_house_loans": in_house,
            "titles_borrowed": len(ranked), "loans_of_titles_listed": shown, "loans_of_other_titles": total - shown,
            "top_titles": [{k: r[k] for k in ("rank", "title", "student_loans", "in_house_loans", "total")}
                           for r in chart_rows],
        },
        # Bars labelled by rank: titles are too long to fit under ten bars;
        # the table names each rank.
        chart=Chart("Loans of the top 10 titles (by rank)", [f"#{r['rank']}" for r in chart_rows],
                    [r["student_loans"] for r in chart_rows], "Student loans",
                    extra_series=[("In-house loans", [r["in_house_loans"] for r in chart_rows])]) if rows else None,
        columns=TOP_TITLE_COLUMNS, rows=rows,
        empty_message="No books were borrowed in this period.",
        filename_stem=_filename_stem("top-titles", filters),
    )


# ─── Reservations (period: made in it; status as of now) ────────────────

RESERVATION_STATUS = {"pending": "Waiting", "ready": "Ready for pickup", "fulfilled": "Picked up",
                      "cancelled": "Cancelled", "expired": "Expired"}
RESERVATION_COLUMNS = [
    Column("requested", "Requested", "date", 11),
    Column("book", "Book title", "text", 30),
    Column("author", "Author", "text", 17),
    Column("patron", "Patron", "text", 19),
    Column("program", "Program", "text", 14),
    Column("year", "Year", "text", 9, wrap=False),
    Column("status", "Status", "text", 13, wrap=False),
    Column("outcome", "Outcome", "text", 30),
]


def _day_text(moment: str | None) -> str:
    return _long_date(_manila(moment).date()) if moment else ""


def _outcome(r: dict) -> str:
    status = r.get("status")
    if status == "fulfilled":
        return f"Picked up {_day_text(r.get('fulfilled_at'))}".strip()
    if status == "cancelled":
        return f"Cancelled {_day_text(r.get('cancelled_at'))}".strip()
    if status == "expired":
        # The exact expiry time isn't recorded; it follows the deadline.
        return f"Expired (pickup deadline {_day_text(r.get('pickup_by'))})" if r.get("pickup_by") else "Expired"
    if status == "ready":
        return f"Ready, pick up by {_day_text(r.get('pickup_by'))}" if r.get("pickup_by") else "Ready for pickup"
    if status == "pending":
        return "Waiting for a copy"
    return status or "—"


def _reservations_period(filters: ExportFilters, now) -> str:
    return (_period_line(filters, "Reservations made")
            + f", with each reservation's status as of {manila_time_text(now)}")


def fetch_reservations(admin, filters: ExportFilters) -> list[dict]:
    """Reservations made in the period, with their book and patron, the
    book (category) and patron (college, program, year) filters applied."""
    rf = filters.to_report_filters()

    def query():
        q = admin.table("reservations").select(
            "id, user_id, status, requested_at, pickup_by, fulfilled_at, cancelled_at, "
            "books(id, title, author, category), profiles(full_name, program, college, year_level)")
        if rf.date_from:
            q = q.gte("requested_at", rf.date_from)
        if rf.date_to:
            q = q.lte("requested_at", rf.date_to)
        return q.order("id")

    reservations = []
    for r in fetch_all_rows(query):
        book, profile = _book(r), _profile(r)
        if filters.category and book.get("category") != filters.category:
            continue
        if filters.college and profile.get("college") != filters.college:
            continue
        if filters.program and profile.get("program") != filters.program:
            continue
        if filters.year_level is not None and profile.get("year_level") != filters.year_level:
            continue
        reservations.append(r)
    return reservations


def build_reservations(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    reservations = fetch_reservations(admin, filters)
    reservations.sort(key=lambda r: (r["requested_at"], (_book(r).get("title") or "").lower()))

    rows = [{
        "requested": manila_date_text(r["requested_at"]),
        "book": _book(r).get("title") or "Unknown title", "author": _book(r).get("author") or "—",
        "patron": _profile(r).get("full_name") or "Unknown patron",
        "program": _profile(r).get("program") or "—", "year": _year_text(_profile(r).get("year_level")),
        "status": RESERVATION_STATUS.get(r.get("status"), r.get("status") or "—"),
        "outcome": _outcome(r),
    } for r in reservations]

    by_status = Counter(r["status"] for r in rows)
    labels = [s for s in RESERVATION_STATUS.values() if by_status.get(s)]
    labels += sorted(s for s in by_status if s not in labels)
    patrons = len({r.get("user_id") for r in reservations})
    titles = len({_book(r).get("id") or _book(r).get("title") for r in reservations})
    buckets = _report_buckets(filters)
    made = [0] * len(buckets)
    for r in reservations:
        i = bucket_index(buckets, _manila(r["requested_at"]))
        if i is not None:
            made[i] += 1
    period = _reservations_period(filters, now)

    summary = (
        f"{_count_text(len(rows), 'reservation was', 'reservations were')} made by "
        f"{_count_text(patrons, 'patron', 'patrons')} for {_count_text(titles, 'title', 'titles')}. As of now: "
        + _join_and([f"{by_status[s]:,} {s.lower()}" for s in labels]) + "."
    ) if rows else "No reservations were made in this period."

    return ReportData(
        report_id="reservations", title="Reservations",
        period=period, filters=filters.filter_lines(), generated_at=now,
        key_figures=[
            _covers(IN_PERIOD, _int_figure("Reservations made", len(rows))),
            # One per status that occurs; they add up to Reservations made.
            *(_covers("Made in the period, status as of now", _int_figure(s, by_status[s])) for s in labels),
            _covers(IN_PERIOD, _int_figure("Patrons", patrons)),
            _covers(IN_PERIOD, _int_figure("Titles reserved", titles)),
        ],
        computed_summary=summary,
        ai_payload={
            "report": "Reservations", "period": period,
            "reservations_made": len(rows), "patrons": patrons, "titles_reserved": titles,
            "reservations_by_status_now": {s: by_status[s] for s in labels},
            "reservations_made_by_period": dict(zip([b.label for b in buckets], made)),
            "reservations_by_program": dict(sorted(Counter(r["program"] for r in rows).items())),
        },
        chart=Chart("Reservations made", [b.label for b in buckets], made, "Reservations") if rows else None,
        columns=RESERVATION_COLUMNS, rows=rows,
        empty_message="No reservations were made in this period.",
        filename_stem=_filename_stem("reservations", filters),
    )


# ─── Accession register (as of now) ─────────────────────────────────────
# One row per copy in accession order. "Date added" is when the copy was
# entered in Lasallia; "Date acquired", source and edition come from the
# title's record.

COPY_ORIGINS = {"assigned": "Numbered by Lasallia", "registered": "Registered existing number",
                "imported": "Imported", None: "Not recorded"}
FUNDING_SOURCES = {"purchased": "Purchased", "donated": "Donated", "grant": "Grant"}
REGISTER_STATUS = {
    "available": "Available", "on_loan": "On loan", "overdue": "Overdue", "reserved": "Reserved",
    "for_reshelving": "For reshelving", "misplaced": "Misplaced", "missing": "Missing", "lost": "Lost",
    "damaged": "Damaged",
}
ACCESSION_COLUMNS = [
    Column("accession", "Accession no.", "text", 11, wrap=False),
    Column("added", "Date added", "date", 10),
    Column("origin", "How added", "text", 14),
    # The edition follows the title ("Title (2nd ed.)"), to keep the
    # register to 11 columns on A4 landscape.
    Column("title", "Title (edition)", "text", 30),
    Column("author", "Author", "text", 16),
    Column("year", "Year", "plain", 6),
    Column("call_number", "Call no.", "text", 14),
    Column("acquired", "Date acquired", "date", 10),
    Column("source", "Source", "text", 9, wrap=False),
    Column("status", "Status", "text", 10, wrap=False),
    Column("remarks", "Remarks", "text", 20),
]
REGISTER_NOTE = ("Date added: when the copy was entered in Lasallia (copies from before Lasallia show the date "
                 "they were imported). Date acquired and source: from the title's record.")
_ACCESSION = re.compile(r"^\s*([A-Za-z]*)0*(\d+)(.*)$")


def _with_edition(title: str, edition: str | None) -> str:
    """'Clean code (2nd ed.)'; the title alone when it has no edition or
    already ends with it."""
    edition = (edition or "").strip()
    if not edition or title.lower().rstrip(" .)").endswith(edition.lower().rstrip(" .")):
        return title
    return f"{title} ({edition})"


# How each way a copy was added reads in the summary sentence ("6 numbered
# by Lasallia"), with Lasallia capitalised.
ORIGIN_WORDS = {"Numbered by Lasallia": "numbered by Lasallia",
                "Registered existing number": "registered with their existing number",
                "Imported": "imported", "Not recorded": "with no record of how they were added"}


def accession_key(value: str | None) -> tuple:
    """GS1 < GS20 < T9 < T10 (prefix, then the number as a number); values
    that aren't letters + digits come last, as text."""
    match = _ACCESSION.match(value or "")
    if not match:
        return (1, "", 0, (value or "").lower())
    prefix, number, rest = match.groups()
    return (0, prefix.upper(), int(number), rest.lower())


def build_accession_register(admin, filters: ExportFilters) -> ReportData:
    now = manila_now()
    books = {b["id"]: b for b in fetch_all_rows(lambda: admin.table("books").select(
        "id, title, author, edition, published_year, call_number, category, date_acquired, funding_source, archived_at"
    ).order("id"))}
    copies = [c for c in fetch_all_rows(lambda: admin.table("book_copies").select(
        "id, book_id, accession_number, status, origin, created_at").order("id"))
        if not filters.category or (books.get(c["book_id"]) or {}).get("category") == filters.category]
    corrections: dict[str, list[str]] = {}
    for fix in sorted(fetch_all_rows(lambda: admin.table("accession_corrections").select(
            "id, book_copy_id, old_value, corrected_at").order("id")), key=lambda f: f["corrected_at"]):
        if fix.get("book_copy_id"):
            corrections.setdefault(fix["book_copy_id"], []).append(
                f"Number corrected from {fix['old_value']} on {_day_text(fix['corrected_at'])}")

    copies.sort(key=lambda c: accession_key(c.get("accession_number")))
    rows = []
    for c in copies:
        book = books.get(c["book_id"]) or {}
        remarks = list(corrections.get(c["id"], []))
        if book.get("archived_at"):
            remarks.append("Title archived")
        rows.append({
            "accession": c.get("accession_number") or "", "added": manila_date_text(c.get("created_at")),
            "origin": COPY_ORIGINS.get(c.get("origin"), c.get("origin") or "Not recorded"),
            "title": _with_edition(book.get("title") or "Unknown title", book.get("edition")),
            "author": book.get("author") or "—", "year": book.get("published_year"),
            "call_number": book.get("call_number") or "", "acquired": manila_date_text(book.get("date_acquired")),
            "source": FUNDING_SOURCES.get(book.get("funding_source"), book.get("funding_source") or ""),
            "status": REGISTER_STATUS.get(c.get("status"), c.get("status") or ""),
            "remarks": "; ".join(remarks),
        })

    by_origin = Counter(r["origin"] for r in rows)
    origins = [o for o in COPY_ORIGINS.values() if by_origin.get(o)]
    origins += sorted(o for o in by_origin if o not in origins)
    by_status = Counter(r["status"] for r in rows)
    titles = len({c["book_id"] for c in copies})
    corrected = sum(1 for c in copies if c["id"] in corrections)

    summary = (
        f"{_count_text(len(rows), 'copy', 'copies')} of {_count_text(titles, 'title', 'titles')}: "
        + _join_and([f"{by_origin[o]:,} {ORIGIN_WORDS.get(o, o.lower())}" for o in origins]) + "."
        + (f" {_count_text(corrected, 'copy has', 'copies have')} a corrected number." if corrected else "")
    ) if rows else "No copies match these filters."

    return ReportData(
        report_id="accession_register", title="Accession Register",
        period=_as_of_line(now), filters=filters.filter_lines() + [REGISTER_NOTE], generated_at=now,
        key_figures=[
            _int_figure("Copies", len(rows)),
            # One per way a copy was added; they add up to Copies.
            *(_int_figure(o, by_origin[o]) for o in origins),
            _int_figure("Titles", titles),
            _int_figure("Copies with a corrected number", corrected),
        ],
        computed_summary=summary,
        # Totals only: no accession numbers.
        ai_payload={
            "report": "Accession register", "as_of": manila_time_text(now), "copies": len(rows), "titles": titles,
            "copies_by_how_added": {o: by_origin[o] for o in origins},
            "copies_by_status": dict(sorted(by_status.items())),
            "copies_with_a_corrected_number": corrected,
        },
        chart=Chart("Copies by how they were added", origins, [by_origin[o] for o in origins], "Copies") if rows else None,
        columns=ACCESSION_COLUMNS, rows=rows,
        empty_message="No copies match these filters.",
        filename_stem=f"accession-register_as_of_{now.date().isoformat()}", uses_dates=False,
        table_font_size=7.5,
    )


REPORTS.update({
    "top_titles": ReportDefinition(id="top_titles", title="Top Titles", build=build_top_titles),
    "reservations": ReportDefinition(id="reservations", title="Reservations", build=build_reservations),
    "accession_register": ReportDefinition(id="accession_register", title="Accession Register",
                                           build=build_accession_register),
})
