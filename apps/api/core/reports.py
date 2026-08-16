# apps/api/core/reports.py
# Reports plan, Phase 1 — each function here is a direct server-side
# port of a `derive*` function that used to run client-side in
# apps/web/app/librarian/reports/page.tsx against three full-table
# fetches. Same shape, same output, now computed from filtered data
# instead of everything. Aggregation happens in Python over admin-client
# reads, not SQL GROUP BY through PostgREST — same approach as every
# other aggregation in this codebase (core/recommendations.py,
# core/similarities.py).

import calendar as cal
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.calendar import compute_fine
from schemas.reports import (
    Bucket,
    CatalogueSlice,
    LibraryStats,
    OverdueRow,
    ShelfListRow,
    TopPatron,
    TransactionStats,
)

CATALOGUE_COLORS = ["#006F3C", "#00874A", "#B8923D", "#4A6FA5", "#8B5CF6", "#DDDFD7"]


@dataclass
class ReportFilters:
    """Shared filter set (plan's own wording). date_from/date_to apply to
    loans.borrowed_at (or reservations.requested_at for transaction
    stats) — loan-centric reports only. category applies to books.category
    everywhere, including book-centric reports (catalogue, shelf list),
    since it's a book field. program/year_level apply via
    loans.student_id -> profiles — loan-centric reports only; book-centric
    reports have no program/year_level dimension of their own, and the
    frontend is expected to say so rather than silently ignore the filter."""

    date_from: str | None = None
    date_to: str | None = None
    category: str | None = None
    program: str | None = None
    year_level: int | None = None


def _year_suffix(n: int) -> str:
    if n == 1:
        return "st"
    if n == 2:
        return "nd"
    if n == 3:
        return "rd"
    return "th"


def _fetch_filtered_loans(admin: Client, filters: ReportFilters) -> list[dict]:
    """Loans with book and borrower embedded, date-ranged at the DB
    level (plain columns) and category/program/year_level filtered in
    Python afterward (those live on embedded relations — simpler than a
    PostgREST dot-path filter, and this codebase's established
    aggregate-in-Python approach). Status is recomputed the same way
    routers/loans.py does: nothing writes 'overdue' back to the row on
    its own."""
    query = admin.table("loans").select(
        "*, book_copies(book_id, books(*)), profiles(full_name, email, program, year_level)"
    )
    if filters.date_from:
        query = query.gte("borrowed_at", filters.date_from)
    if filters.date_to:
        query = query.lte("borrowed_at", filters.date_to)
    loans = query.execute().data

    now = datetime.now(timezone.utc)
    result = []
    for loan in loans:
        copy = loan.pop("book_copies", None)
        book = copy["books"] if copy else None
        profile = loan.pop("profiles", None)

        if filters.category and (not book or book.get("category") != filters.category):
            continue
        if filters.program and (not profile or profile.get("program") != filters.program):
            continue
        if filters.year_level is not None and (not profile or profile.get("year_level") != filters.year_level):
            continue

        loan["books"] = book
        loan["profiles"] = profile
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"
        result.append(loan)
    return result


def catalogue_report(admin: Client, filters: ReportFilters) -> list[CatalogueSlice]:
    """Ports deriveCatalogue. Book-centric — only the category filter
    applies (a date/program/year_level filter has no meaning against the
    static catalog)."""
    query = admin.table("books").select("category, total_copies")
    if filters.category:
        query = query.eq("category", filters.category)
    books = query.execute().data

    by_category: dict[str, int] = {}
    for b in books:
        key = b.get("category") or "Uncategorized"
        by_category[key] = by_category.get(key, 0) + (b.get("total_copies") or 1)

    ranked = sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
    return [
        CatalogueSlice(label=label, value=value, color=CATALOGUE_COLORS[i % len(CATALOGUE_COLORS)])
        for i, (label, value) in enumerate(ranked)
    ]


def circulation_summary(admin: Client, filters: ReportFilters, months: int = 6) -> list[Bucket]:
    """Ports deriveMonthlyCirculation — one bucket per calendar month,
    oldest to newest, ending at the current month."""
    loans = _fetch_filtered_loans(admin, filters)

    bucket_months: list[tuple[int, int]] = []
    y, m = datetime.now(timezone.utc).year, datetime.now(timezone.utc).month
    for _ in range(months):
        bucket_months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    bucket_months.reverse()

    index_by_ym = {ym: i for i, ym in enumerate(bucket_months)}
    buckets = [Bucket(label=cal.month_abbr[m], value=0) for (_, m) in bucket_months]

    for loan in loans:
        d = datetime.fromisoformat(loan["borrowed_at"])
        idx = index_by_ym.get((d.year, d.month))
        if idx is not None:
            buckets[idx].value += 1
    return buckets


def borrowing_trends(admin: Client, filters: ReportFilters, weeks: int = 8) -> list[Bucket]:
    """Ports deriveWeeklyTrend — one bucket per week (Sunday-starting,
    matching the original getDate()-getDay() math), oldest to newest."""
    loans = _fetch_filtered_loans(admin, filters)

    now = datetime.now(timezone.utc)
    days_since_sunday = now.isoweekday() % 7  # Mon=1..Sat=6, Sun=0
    start_of_this_week = (now - timedelta(days=days_since_sunday)).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [start_of_this_week - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    buckets = [Bucket(label=f"{cal.month_abbr[s.month]} {s.day}", value=0) for s in starts]

    for loan in loans:
        d = datetime.fromisoformat(loan["borrowed_at"])
        for i in range(len(starts) - 1, -1, -1):
            if d >= starts[i]:
                buckets[i].value += 1
                break
    return buckets


def top_patrons(admin: Client, filters: ReportFilters, limit: int = 5) -> list[TopPatron]:
    """Ports deriveTopPatrons. Borrower info comes from the same embed
    _fetch_filtered_loans already did — no separate patrons fetch needed
    (the frontend version joined two arrays; here the join already
    happened at the query level)."""
    loans = _fetch_filtered_loans(admin, filters)

    counts: dict[str, int] = {}
    info: dict[str, dict] = {}
    for loan in loans:
        sid = loan["student_id"]
        counts[sid] = counts.get(sid, 0) + 1
        info.setdefault(sid, loan.get("profiles") or {})

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        TopPatron(
            id=sid,
            name=info[sid].get("full_name") or "Unknown patron",
            program=info[sid].get("program") or "—",
            count=count,
        )
        for sid, count in ranked
    ]


def overdue_rows(admin: Client, filters: ReportFilters) -> list[OverdueRow]:
    """Ports deriveOverdueRows. Same compute_fine every other overdue
    preview in this codebase uses (routers/loans.py) — one implementation
    of what's owed, not a second one that could quietly disagree."""
    loans = _fetch_filtered_loans(admin, filters)

    rows = []
    for loan in loans:
        if loan["status"] != "overdue":
            continue
        book = loan.get("books") or {}
        profile = loan.get("profiles") or {}
        collection_type = book.get("collection_type") or "General"
        days_overdue, fine = compute_fine(admin, loan["due_date"], collection_type)
        year_level = profile.get("year_level")

        rows.append(OverdueRow(
            id=loan["id"],
            patron=profile.get("full_name") or "Unknown patron",
            patronEmail=profile.get("email") or "—",
            program=profile.get("program") or "—",
            year=f"{year_level}{_year_suffix(year_level)} Year" if year_level else "—",
            book=book.get("title") or "Unknown title",
            author=book.get("author") or "—",
            dueDate=loan["due_date"],
            daysOverdue=days_overdue,
            fine=fine,
        ))
    return rows


def library_stats(admin: Client, filters: ReportFilters) -> LibraryStats:
    """New. total_titles/total_copies/utilization_rate/most_active_category
    are catalog snapshots — only the category filter applies.
    active_borrowers/overdue_count are loan-centric — the full filter set
    applies."""
    books_query = admin.table("books").select("id, category")
    if filters.category:
        books_query = books_query.eq("category", filters.category)
    books = books_query.execute().data
    total_titles = len(books)
    book_ids = [b["id"] for b in books]

    total_copies = 0
    utilization_rate = 0.0
    if book_ids:
        copies = admin.table("book_copies").select("status").in_("book_id", book_ids).execute().data
        total_copies = len(copies)
        on_loan = sum(1 for c in copies if c["status"] == "on_loan")
        utilization_rate = round(on_loan / total_copies, 4) if total_copies else 0.0

    loans = _fetch_filtered_loans(admin, filters)
    active_borrowers = len({l["student_id"] for l in loans if l["status"] in ("active", "overdue")})
    overdue_count = sum(1 for l in loans if l["status"] == "overdue")

    category_counts: dict[str, int] = {}
    for l in loans:
        cat = (l.get("books") or {}).get("category") or "Uncategorized"
        category_counts[cat] = category_counts.get(cat, 0) + 1
    most_active_category = max(category_counts, key=category_counts.get) if category_counts else None

    return LibraryStats(
        total_titles=total_titles,
        total_copies=total_copies,
        active_borrowers=active_borrowers,
        overdue_count=overdue_count,
        utilization_rate=utilization_rate,
        most_active_category=most_active_category,
    )


def transaction_stats(admin: Client, filters: ReportFilters) -> TransactionStats:
    """New. Distinct from circulation_summary (volume over time) — this
    is aggregate counts/rates for whatever period the filters describe."""
    loans = _fetch_filtered_loans(admin, filters)

    res_query = admin.table("reservations").select("status, requested_at, books(category), profiles(program, year_level)")
    if filters.date_from:
        res_query = res_query.gte("requested_at", filters.date_from)
    if filters.date_to:
        res_query = res_query.lte("requested_at", filters.date_to)
    reservations = [
        r for r in res_query.execute().data
        if (not filters.category or (r.get("books") or {}).get("category") == filters.category)
        and (not filters.program or (r.get("profiles") or {}).get("program") == filters.program)
        and (filters.year_level is None or (r.get("profiles") or {}).get("year_level") == filters.year_level)
    ]

    completed = [l for l in loans if l["status"] == "returned" and l.get("returned_at")]
    if completed:
        total_days = sum(
            (datetime.fromisoformat(l["returned_at"]) - datetime.fromisoformat(l["borrowed_at"])).total_seconds() / 86400
            for l in completed
        )
        avg_duration = round(total_days / len(completed), 1)
    else:
        avg_duration = None

    return TransactionStats(
        total_transactions=len(loans) + len(reservations),
        loan_count=len(loans),
        reservation_count=len(reservations),
        average_loan_duration_days=avg_duration,
    )


def shelf_list(admin: Client, filters: ReportFilters, floor: str | None = None, aisle: str | None = None) -> list[ShelfListRow]:
    """New. One row per physical copy, not per title — a shelf list has
    to match physical labels (accession numbers), and a title with 3
    copies has 3 separate labels on 3 separate shelves. Ordered by call
    number, then accession number, matching how a librarian would
    actually walk the stacks."""
    books_query = admin.table("books").select("id, title, author, call_number, category, shelf_location, floor, aisle")
    if filters.category:
        books_query = books_query.eq("category", filters.category)
    if floor:
        books_query = books_query.eq("floor", floor)
    if aisle:
        books_query = books_query.eq("aisle", aisle)
    books = books_query.execute().data
    books_by_id = {b["id"]: b for b in books}
    if not books_by_id:
        return []

    copies = (
        admin.table("book_copies")
        .select("accession_number, book_id, shelf_location, status")
        .in_("book_id", list(books_by_id.keys()))
        .execute()
    ).data

    rows = []
    for c in copies:
        book = books_by_id[c["book_id"]]
        rows.append(ShelfListRow(
            accession_number=c["accession_number"],
            book_id=book["id"],
            title=book["title"],
            author=book["author"],
            call_number=book["call_number"],
            category=book.get("category") or "Uncategorized",
            shelf_location=c.get("shelf_location") or book.get("shelf_location"),
            floor=book.get("floor"),
            aisle=book.get("aisle"),
            status=c["status"],
        ))
    rows.sort(key=lambda r: (r.call_number, r.accession_number))
    return rows
