# Data for the librarian Reports page. Totals are computed in Python,
# since PostgREST has no GROUP BY.

from dataclasses import dataclass, replace
from datetime import datetime, timezone

from supabase import Client

from core.calendar import HOURLY_FINE_COLLECTION_TYPES, compute_fine, overdue_status
from core.dates import bucket_index, filter_days, overdue_text, parse_timestamp, period_buckets
from core.rows import call_number_key, fetch_all_rows
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

# The user types a borrower-based report can be narrowed to.
USER_TYPE_LABELS = {"student": "Student", "faculty": "Faculty/Lasallian Partner"}

CATALOGUE_COLORS = ["#006F3C", "#00874A", "#B8923D", "#4A6FA5", "#8B5CF6", "#DDDFD7"]


@dataclass
class ReportFilters:
    """Report filters. Dates, program, year level and user type only apply
    to borrower-based reports. Category applies everywhere."""

    date_from: str | None = None
    date_to: str | None = None
    category: str | None = None
    program: str | None = None
    # The borrower's college (profiles.college) on loan-based reports; the
    # book's own college (books.subject) on the catalogue and shelf list.
    college: str | None = None
    year_level: int | None = None
    # "student" or "faculty" (profiles.role). None means everyone.
    user_type: str | None = None


def _year_suffix(n: int) -> str:
    if n == 1:
        return "st"
    if n == 2:
        return "nd"
    if n == 3:
        return "rd"
    return "th"


def _fetch_filtered_loans(
    admin: Client, filters: ReportFilters, *, date_column: str | None = "borrowed_at", narrow=None,
) -> list[dict]:
    """Loans with their book and borrower. The period applies to
    `date_column` (borrowed_at by default, returned_at for returns and
    fines, None for no date limit); `narrow` can add query filters. The
    other filters apply in Python. Overdue status is worked out here, since
    the database doesn't set it."""
    # loans has two links to profiles, so name the borrower one or the
    # query fails.
    def query():
        q = admin.table("loans").select(
            "*, book_copies(book_id, accession_number, books(*)), "
            "profiles!loans_student_id_fkey(full_name, email, program, college, year_level, role)"
        )
        if date_column and filters.date_from:
            q = q.gte(date_column, filters.date_from)
        if date_column and filters.date_to:
            q = q.lte(date_column, filters.date_to)
        if narrow:
            q = narrow(q)
        return q.order("id")

    loans = _fetch_all_rows(query)

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
        if filters.user_type and (not profile or profile.get("role") != filters.user_type):
            continue

        loan["books"] = book
        loan["accession_number"] = copy.get("accession_number") if copy else None
        loan["profiles"] = profile
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"
        result.append(loan)
    return result


# Guest (in-house) loans for reports. Never the guest's ID number or the
# librarian's id: only what a report shows.
IN_HOUSE_COLUMNS = (
    "id, guest_name, visitor_type, purpose, checked_out_at, returned_at, status, "
    "book_copies(book_id, books(id, title, author, category, subject, call_number))"
)


def fetch_in_house_loans(
    admin: Client, filters: ReportFilters, *, date_column: str | None = "checked_out_at",
) -> list[dict]:
    """In-house loans with their book, the period applied to `date_column`
    (checked_out_at, returned_at, or None for no date limit). Guests have no
    college, program, year level or user type, so those filters leave none."""
    if filters.college or filters.program or filters.year_level is not None or filters.user_type:
        return []

    def query():
        q = admin.table("in_house_loans").select(IN_HOUSE_COLUMNS)
        if date_column and filters.date_from:
            q = q.gte(date_column, filters.date_from)
        if date_column and filters.date_to:
            q = q.lte(date_column, filters.date_to)
        return q.order("id")

    result = []
    for row in fetch_all_rows(query):
        copy = row.pop("book_copies", None)
        book = (copy or {}).get("books")
        if filters.category and (not book or book.get("category") != filters.category):
            continue
        row["books"] = book
        result.append(row)
    return result


# Kept under this name for the modules that already import it.
_fetch_all_rows = fetch_all_rows


def catalogue_report(admin: Client, filters: ReportFilters) -> list[CatalogueSlice]:
    """Titles and copies per category. Titles are non-archived books; copies
    are their rows in book_copies. A category whose books have no copies
    still appears, with 0 copies. Only the category and college filters
    apply."""
    def books_query():
        query = admin.table("books").select("id, category").is_("archived_at", "null").order("id")
        if filters.category:
            query = query.eq("category", filters.category)
        if filters.college:
            query = query.eq("subject", filters.college)
        return query

    category_by_book = {b["id"]: b.get("category") or "Uncategorized" for b in _fetch_all_rows(books_query)}

    titles: dict[str, int] = {}
    for key in category_by_book.values():
        titles[key] = titles.get(key, 0) + 1

    copies: dict[str, int] = dict.fromkeys(titles, 0)
    for c in _fetch_all_rows(lambda: admin.table("book_copies").select("book_id").order("id")):
        key = category_by_book.get(c["book_id"])
        if key is not None:
            copies[key] += 1

    ranked = sorted(titles, key=lambda k: (-copies[k], -titles[k], k))
    return [
        CatalogueSlice(
            label=label, titles=titles[label], copies=copies[label], value=copies[label],
            color=CATALOGUE_COLORS[i % len(CATALOGUE_COLORS)],
        )
        for i, label in enumerate(ranked)
    ]


def _chart_buckets(filters: ReportFilters, *, default: str, count: int):
    """Chart buckets that cover the report period in Manila time (days,
    weeks or months), or the last `count` months/weeks without dates."""
    first, last = filter_days(filters.date_from, filters.date_to)
    return period_buckets(first, last, default=default, default_count=count)


def _covering(filters: ReportFilters, buckets) -> ReportFilters:
    """The filters, starting at the first chart bucket when no start date
    was picked (the default months or weeks)."""
    if filters.date_from or not buckets:
        return filters
    return replace(filters, date_from=buckets[0].start.isoformat())


def _count_by_bucket(buckets, moments) -> list[int]:
    counts = [0] * len(buckets)
    for moment in moments:
        i = bucket_index(buckets, moment)
        if i is not None:
            counts[i] += 1
    return counts


def circulation_summary(admin: Client, filters: ReportFilters, months: int = 6) -> list[Bucket]:
    """Loans borrowed per day, week or month across the period (Manila
    time), oldest first. Without dates, the last `months` months."""
    buckets = _chart_buckets(filters, default="month", count=months)
    loans = _fetch_filtered_loans(admin, _covering(filters, buckets))
    counts = _count_by_bucket(buckets, (parse_timestamp(l["borrowed_at"]) for l in loans))
    return [Bucket(label=b.label, value=n) for b, n in zip(buckets, counts)]


def borrowing_trends(admin: Client, filters: ReportFilters, weeks: int = 8) -> list[Bucket]:
    """Like circulation_summary, but weekly when no dates are picked (the
    last `weeks` weeks, starting on Sunday in Manila)."""
    buckets = _chart_buckets(filters, default="week", count=weeks)
    loans = _fetch_filtered_loans(admin, _covering(filters, buckets))
    counts = _count_by_bucket(buckets, (parse_timestamp(l["borrowed_at"]) for l in loans))
    return [Bucket(label=b.label, value=n) for b, n in zip(buckets, counts)]


def transaction_trend(admin: Client, filters: ReportFilters, weeks: int = 8) -> list[TransactionTrendPoint]:
    """Borrows (by borrow date) and returns (by return date) across the
    period in Manila time, as two series for the Overview chart."""
    buckets = _chart_buckets(filters, default="week", count=weeks)
    period = _covering(filters, buckets)
    borrows = _count_by_bucket(
        buckets, (parse_timestamp(l["borrowed_at"]) for l in _fetch_filtered_loans(admin, period)))
    returns = _count_by_bucket(
        buckets, (parse_timestamp(l["returned_at"])
                  for l in _fetch_filtered_loans(admin, period, date_column="returned_at") if l.get("returned_at")))
    return [TransactionTrendPoint(label=b.label, borrows=nb, returns=nr) for b, nb, nr in zip(buckets, borrows, returns)]


def top_patrons(admin: Client, filters: ReportFilters, limit: int = 5) -> list[TopPatron]:
    """Patrons with the most loans."""
    loans = _fetch_filtered_loans(admin, filters)

    counts: dict[str, int] = {}
    info: dict[str, dict] = {}
    for loan in loans:
        sid = loan["student_id"]
        counts[sid] = counts.get(sid, 0) + 1
        info.setdefault(sid, loan.get("profiles") or {})

    # Ties in name order, so the list doesn't change between loads.
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], (info[kv[0]].get("full_name") or "").lower()))[:limit]
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
    return [row for _, row in overdue_loans(admin, filters)]


def overdue_loans(admin: Client, filters: ReportFilters) -> list[tuple[str, OverdueRow]]:
    """overdue_rows, each with its borrower's id, for counting borrowers
    (core/report_export). Loans borrowed in the period that are overdue now."""
    loans = _fetch_filtered_loans(admin, filters)

    rows = []
    for loan in loans:
        if loan["status"] != "overdue":
            continue
        book = loan.get("books") or {}
        profile = loan.get("profiles") or {}
        collection_type = book.get("collection_type") or "General"
        status = overdue_status(admin, loan["due_date"], collection_type)
        year_level = profile.get("year_level")

        rows.append((loan["student_id"], OverdueRow(
            id=loan["id"],
            patron=profile.get("full_name") or "Unknown patron",
            patronEmail=profile.get("email") or "—",
            program=profile.get("program") or "—",
            year=f"{year_level}{_year_suffix(year_level)} Year" if year_level else "—",
            book=book.get("title") or "Unknown title",
            author=book.get("author") or "—",
            dueDate=loan["due_date"],
            daysOverdue=status.school_days,
            fine=status.fine,
            role=profile.get("role"),
            accession=loan.get("accession_number"),
            collectionType=collection_type,
            libraryHours=round(status.library_hours, 2),
            overdueLabel=overdue_text(
                status.school_days, status.library_hours, collection_type in HOURLY_FINE_COLLECTION_TYPES,
            ),
        )))
    return rows


def fine_loans(admin: Client, filters: ReportFilters) -> list[dict]:
    """The loans behind the fines report: books returned in the period with
    a fine (paid or not), plus every loan still out and overdue now (its
    fine is still growing), whenever it was borrowed."""
    returned = _fetch_filtered_loans(
        admin, filters, date_column="returned_at",
        narrow=lambda q: q.eq("status", "returned").gt("fine_amount", 0),
    )
    still_out = _fetch_filtered_loans(
        admin, filters, date_column=None, narrow=lambda q: q.in_("status", ["active", "overdue"]),
    )
    return returned + [l for l in still_out if l["status"] == "overdue"]


def fines_report(admin: Client, filters: ReportFilters) -> list[FineRow]:
    """One row per patron with any fine: unpaid and paid fines on books
    returned in the period, and fines still growing on overdue books not yet
    returned (as of now). `entries` lists each loan behind the totals, so a
    librarian can see which book each fine is for."""
    loans = fine_loans(admin, filters)

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
                detail = f"Paid — receipt {receipt}" if receipt else "Paid at the circulation desk"
                # How the payer was identified (migration 0058; None before it).
                how = {"id_tap": "ID tapped", "manual": "entered by hand"}.get(loan.get("fine_paid_verified_by") or "")
                entry["entries"].append({
                    "title": title,
                    "kind": "paid",
                    "amount": round(amount, 2),
                    "detail": f"{detail} · {how}" if how else detail,
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
            status = overdue_status(admin, loan["due_date"], collection_type)
            fine = status.fine
            entry["accruing"] += fine
            entry["entries"].append({
                "title": title,
                "kind": "accruing",
                "amount": round(fine, 2),
                "detail": (
                    f"{overdue_text(status.school_days, status.library_hours, collection_type in HOURLY_FINE_COLLECTION_TYPES)}"
                    " — still out, not yet returned"
                ),
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
    def books_query():
        q = admin.table("books").select("id, category").is_("archived_at", "null").order("id")
        return q.eq("category", filters.category) if filters.category else q

    books = fetch_all_rows(books_query)
    total_titles = len(books)
    book_ids = {b["id"] for b in books}

    total_copies = 0
    utilization_rate = 0.0
    if book_ids:
        copies = [c for c in fetch_all_rows(lambda: admin.table("book_copies").select("book_id, status").order("id"))
                  if c["book_id"] in book_ids]
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

    def res_query():
        q = admin.table("reservations").select(
            "id, status, requested_at, books(category), profiles(program, college, year_level, role)")
        if filters.date_from:
            q = q.gte("requested_at", filters.date_from)
        if filters.date_to:
            q = q.lte("requested_at", filters.date_to)
        return q.order("id")

    reservations = [
        r for r in fetch_all_rows(res_query)
        if (not filters.category or (r.get("books") or {}).get("category") == filters.category)
        and (not filters.program or (r.get("profiles") or {}).get("program") == filters.program)
        and (not filters.college or (r.get("profiles") or {}).get("college") == filters.college)
        and (filters.year_level is None or (r.get("profiles") or {}).get("year_level") == filters.year_level)
        and (not filters.user_type or (r.get("profiles") or {}).get("role") == filters.user_type)
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
    def books_query():
        q = (admin.table("books").select("id, title, author, call_number, category, shelf_location, floor, aisle")
             .is_("archived_at", "null").order("id"))
        if filters.category:
            q = q.eq("category", filters.category)
        # Book-centric, so College means the book's own college here.
        if filters.college:
            q = q.eq("subject", filters.college)
        if floor:
            q = q.eq("floor", floor)
        if aisle:
            q = q.eq("aisle", aisle)
        return q

    books_by_id = {b["id"]: b for b in fetch_all_rows(books_query)}
    if not books_by_id:
        return []

    copies = [
        c for c in fetch_all_rows(
            lambda: admin.table("book_copies").select("id, accession_number, book_id, shelf_location, status").order("id"))
        if c["book_id"] in books_by_id
    ]

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
    # Shelf order: call number as a call number (005.13 before 005.2).
    rows.sort(key=lambda r: (call_number_key(r.call_number), r.accession_number))
    return rows
