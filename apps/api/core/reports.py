# Data for the librarian Reports page. Totals are computed in Python,
# since PostgREST has no GROUP BY.

import calendar as cal
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.calendar import compute_fine
from schemas.reports import (
    Bucket,
    CatalogueSlice,
    FineEntryRow,
    FineRow,
    LibraryStats,
    OverdueRow,
    ProgramUsage,
    ShelfListRow,
    TopPatron,
    TransactionStats,
    TransactionTrendPoint,
)

CATALOGUE_COLORS = ["#006F3C", "#00874A", "#B8923D", "#4A6FA5", "#8B5CF6", "#DDDFD7"]


@dataclass
class ReportFilters:
    """Report filters. Dates, program and year level only apply to
    loan-based reports. Category applies everywhere."""

    date_from: str | None = None
    date_to: str | None = None
    category: str | None = None
    program: str | None = None
    # The borrower's college (profiles.college) on loan-based reports; the
    # book's own college (books.subject) on the catalogue and shelf list.
    college: str | None = None
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
    """Loans with their book and borrower. Dates are filtered in the query;
    the other filters in Python. Overdue status is worked out here, since
    the database doesn't set it."""
    # loans has two links to profiles, so name the borrower one or the
    # query fails.
    query = admin.table("loans").select(
        "*, book_copies(book_id, books(*)), profiles!loans_student_id_fkey(full_name, email, program, college, year_level)"
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
        if filters.college and (not profile or profile.get("college") != filters.college):
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
    """Copies per category. Only the category and college filters apply."""
    query = admin.table("books").select("category, total_copies").is_("archived_at", "null")
    if filters.category:
        query = query.eq("category", filters.category)
    if filters.college:
        query = query.eq("subject", filters.college)
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
    """Loans per month, oldest first, ending this month."""
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
    """Loans per week (weeks start on Sunday), oldest first."""
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


def transaction_trend(admin: Client, filters: ReportFilters, weeks: int = 8) -> list[TransactionTrendPoint]:
    """Borrows and returns per week, as two series for the Overview chart."""
    loans = _fetch_filtered_loans(admin, filters)

    now = datetime.now(timezone.utc)
    days_since_sunday = now.isoweekday() % 7
    start_of_this_week = (now - timedelta(days=days_since_sunday)).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [start_of_this_week - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    points = [TransactionTrendPoint(label=f"{cal.month_abbr[s.month]} {s.day}", borrows=0, returns=0) for s in starts]

    def bucket_index(d: datetime) -> int | None:
        for i in range(len(starts) - 1, -1, -1):
            if d >= starts[i]:
                return i
        return None

    for loan in loans:
        idx = bucket_index(datetime.fromisoformat(loan["borrowed_at"]))
        if idx is not None:
            points[idx].borrows += 1
        if loan.get("returned_at"):
            idx = bucket_index(datetime.fromisoformat(loan["returned_at"]))
            if idx is not None:
                points[idx].returns += 1
    return points


def top_patrons(admin: Client, filters: ReportFilters, limit: int = 5) -> list[TopPatron]:
    """Patrons with the most loans."""
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
    """Overdue loans with the fine owed so far (same calculation as the
    return counter)."""
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


def fines_report(admin: Client, filters: ReportFilters) -> list[FineRow]:
    """One row per patron with any fine: unpaid, still growing (open
    overdue loans) and paid. `entries` lists each loan behind the totals,
    so a librarian can see which book each fine is for."""
    loans = _fetch_filtered_loans(admin, filters)

    totals: dict[str, dict] = {}
    for loan in loans:
        profile = loan.get("profiles") or {}
        book = loan.get("books") or {}
        sid = loan["student_id"]
        entry = totals.setdefault(sid, {
            "patron": profile.get("full_name") or "Unknown patron",
            "patron_email": profile.get("email") or "—",
            "program": profile.get("program") or "—",
            "year": profile.get("year_level"),
            "unsettled": 0.0,
            "accruing": 0.0,
            "paid": 0.0,
            "entries": [],
        })
        title = book.get("title") or "Unknown title"

        if loan["status"] == "returned" and (loan.get("fine_amount") or 0) > 0:
            amount = loan["fine_amount"]
            if loan.get("fine_status") == "paid":
                entry["paid"] += amount
                receipt = loan.get("receipt_number")
                entry["entries"].append({
                    "title": title,
                    "kind": "paid",
                    "amount": round(amount, 2),
                    "detail": f"Paid — receipt {receipt}" if receipt else "Paid at the circulation desk",
                    "loan_id": loan["id"],
                })
            else:
                entry["unsettled"] += amount
                entry["entries"].append({
                    "title": title,
                    "kind": "unsettled",
                    "amount": round(amount, 2),
                    "detail": "Returned late — not yet settled at the desk",
                    "loan_id": loan["id"],
                })
        elif loan["status"] == "overdue":
            collection_type = book.get("collection_type") or "General"
            days_overdue, fine = compute_fine(admin, loan["due_date"], collection_type)
            entry["accruing"] += fine
            entry["entries"].append({
                "title": title,
                "kind": "accruing",
                "amount": round(fine, 2),
                "detail": f"{days_overdue} day{'s' if days_overdue != 1 else ''} overdue — still out, not yet returned",
                "loan_id": loan["id"],
            })

    rows = []
    for sid, entry in totals.items():
        outstanding = round(entry["unsettled"] + entry["accruing"], 2)
        paid = round(entry["paid"], 2)
        if outstanding <= 0 and paid <= 0:
            continue
        year_level = entry["year"]
        rows.append(FineRow(
            patron_id=sid,
            patron=entry["patron"],
            patron_email=entry["patron_email"],
            program=entry["program"],
            year=f"{year_level}{_year_suffix(year_level)} Year" if year_level else "—",
            unsettled=round(entry["unsettled"], 2),
            accruing=round(entry["accruing"], 2),
            paid=paid,
            outstanding=outstanding,
            entries=[FineEntryRow(**e) for e in entry["entries"]],
        ))
    rows.sort(key=lambda r: (-r.outstanding, -r.paid))
    return rows


def library_stats(admin: Client, filters: ReportFilters) -> LibraryStats:
    """Headline numbers. Catalog numbers use only the category filter;
    borrower and overdue numbers use all filters."""
    books_query = admin.table("books").select("id, category").is_("archived_at", "null")
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

    program_users: dict[str, set[str]] = {}
    program_loans: dict[str, int] = {}
    for l in loans:
        prog = (l.get("profiles") or {}).get("program") or "Unspecified"
        program_users.setdefault(prog, set()).add(l["student_id"])
        program_loans[prog] = program_loans.get(prog, 0) + 1
    by_program = sorted(
        (ProgramUsage(program=p, users=len(program_users[p]), loans=program_loans[p]) for p in program_loans),
        key=lambda pu: pu.loans,
        reverse=True,
    )[:8]

    return LibraryStats(
        total_titles=total_titles,
        total_copies=total_copies,
        active_borrowers=active_borrowers,
        overdue_count=overdue_count,
        utilization_rate=utilization_rate,
        most_active_category=most_active_category,
        by_program=by_program,
    )


def transaction_stats(admin: Client, filters: ReportFilters) -> TransactionStats:
    """Totals and rates for the filtered period (not broken down by time)."""
    loans = _fetch_filtered_loans(admin, filters)

    res_query = admin.table("reservations").select("status, requested_at, books(category), profiles(program, college, year_level)")
    if filters.date_from:
        res_query = res_query.gte("requested_at", filters.date_from)
    if filters.date_to:
        res_query = res_query.lte("requested_at", filters.date_to)
    reservations = [
        r for r in res_query.execute().data
        if (not filters.category or (r.get("books") or {}).get("category") == filters.category)
        and (not filters.program or (r.get("profiles") or {}).get("program") == filters.program)
        and (not filters.college or (r.get("profiles") or {}).get("college") == filters.college)
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


def _real_shelf_location(value: str | None) -> str | None:
    """Treats the placeholder "Unassigned" as no location, so the caller can
    fall back to a real one."""
    if not value or value.strip().lower() == "unassigned":
        return None
    return value


def shelf_list(admin: Client, filters: ReportFilters, floor: str | None = None, aisle: str | None = None) -> list[ShelfListRow]:
    """One row per physical copy, in shelf order (call number, then
    accession number)."""
    books_query = admin.table("books").select("id, title, author, call_number, category, shelf_location, floor, aisle").is_("archived_at", "null")
    if filters.category:
        books_query = books_query.eq("category", filters.category)
    # Book-centric, so College means the book's own college here.
    if filters.college:
        books_query = books_query.eq("subject", filters.college)
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
            shelf_location=_real_shelf_location(c.get("shelf_location")) or _real_shelf_location(book.get("shelf_location")),
            floor=book.get("floor"),
            aisle=book.get("aisle"),
            status=c["status"],
        ))
    rows.sort(key=lambda r: (r.call_number, r.accession_number))
    return rows
