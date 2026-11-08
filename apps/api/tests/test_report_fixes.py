# Paging past 1,000 rows, Manila chart buckets that follow the period, the
# fines rule, shelf order and tie order. Made-up data, faked database.

from datetime import date, datetime, timedelta, timezone

import pytest

import core.reports as reports
from core.dates import period_buckets, report_bound
from core.inventory import list_sessions
from core.reports import (
    ReportFilters, circulation_summary, fines_report, library_stats, shelf_list, top_patrons, transaction_trend,
)
from core.rows import call_number_key, fetch_all_rows, fetch_rows_by_ids
from core.weeding import find_weeding_candidates, get_weeding_events
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)


def _period(first: str, last: str) -> ReportFilters:
    return ReportFilters(date_from=report_bound(first, end=False), date_to=report_bound(last, end=True))


# ─── Paging helpers ─────────────────────────────────────────────────────

def test_fetch_all_rows_reads_past_a_thousand():
    db = FakeSupabase(things=[{"id": f"{i:05d}"} for i in range(2500)])
    assert len(fetch_all_rows(lambda: db.table("things").select("*").order("id"))) == 2500


def test_fetch_rows_by_ids_sends_ids_in_chunks():
    db = FakeSupabase(things=[{"id": f"{i:05d}"} for i in range(300)])
    calls = []

    def make(ids):
        calls.append(len(ids))
        return db.table("things").select("*").in_("id", ids).order("id")

    rows = fetch_rows_by_ids(make, [f"{i:05d}" for i in range(250)], chunk=100)
    assert len(rows) == 250 and max(calls) <= 100


# ─── Chart buckets in Manila time, following the period ─────────────────

def test_buckets_are_daily_weekly_or_monthly_by_period_length():
    assert len(period_buckets(date(2026, 11, 1), date(2026, 11, 30))) == 30           # days
    weekly = period_buckets(date(2026, 9, 1), date(2026, 11, 30))
    assert weekly[0].label == "Sep 1" and weekly[1].label == "Sep 6"                  # weeks from Sunday
    monthly = period_buckets(date(2025, 11, 1), date(2026, 11, 8))
    assert monthly[0].label == "Nov 2025" and monthly[-1].label == "Nov 2026"         # months, with years
    assert [b.label for b in period_buckets(date(2026, 1, 1), date(2026, 12, 31))][:2] == ["Jan", "Feb"]


def test_bucket_edges_are_manila_midnight():
    [first, *_] = period_buckets(date(2026, 11, 1), date(2026, 11, 30))
    assert first.start == datetime(2026, 10, 31, 16, tzinfo=timezone.utc)
    assert first.end == datetime(2026, 11, 1, 16, tzinfo=timezone.utc)


def test_without_dates_the_defaults_stay_six_months_or_eight_weeks():
    assert len(period_buckets(None, None)) == 6
    assert len(period_buckets(None, None, default="week", default_count=8)) == 8


def test_circulation_counts_a_loan_on_its_manila_day_and_month():
    loans = [
        loan(1, borrowed_at="2026-10-31T16:30:00+00:00"),  # 1 Nov, 00:30 in Manila
        loan(2, borrowed_at="2026-10-31T15:30:00+00:00"),  # 31 Oct, 23:30 in Manila
    ]
    db = FakeSupabase(loans=loans)
    daily = circulation_summary(db, _period("2026-10-31", "2026-11-02"))
    assert [(b.label, b.value) for b in daily] == [("Oct 31", 1), ("Nov 1", 1), ("Nov 2", 0)]
    monthly = circulation_summary(db, _period("2026-06-01", "2026-11-30"))
    by_month = {b.label: b.value for b in monthly}
    assert by_month["Oct"] == 1 and by_month["Nov"] == 1


def test_trend_counts_returns_by_return_date_even_if_borrowed_earlier():
    returned = {**loan(1, borrowed_at="2026-09-01T02:00:00+00:00"), "status": "returned",
                "returned_at": "2026-11-03T02:00:00+00:00"}
    db = FakeSupabase(loans=[returned, loan(2, borrowed_at="2026-11-03T02:00:00+00:00")])
    points = {p.label: (p.borrows, p.returns) for p in transaction_trend(db, _period("2026-11-01", "2026-11-07"))}
    assert points["Nov 3"] == (1, 1)
    assert sum(b for b, _ in points.values()) == 1


# ─── Fines: returned in the period, plus fines still growing now ────────

def _returned(i, returned_at, amount, status="unsettled", **kw):
    row = loan(i, borrowed_at="2026-08-01T02:00:00+00:00", **kw)
    row.update(status="returned", returned_at=returned_at, fine_amount=amount, fine_status=status)
    return row


def test_fines_follow_the_return_date_and_include_fines_still_growing():
    db = FakeSupabase(loans=[
        _returned(1, "2026-11-05T02:00:00+00:00", 30, student="s1"),            # in the period
        _returned(2, "2026-11-06T02:00:00+00:00", 20, "paid", student="s2"),    # paid, in the period
        _returned(3, "2026-10-20T02:00:00+00:00", 50, student="s3"),            # returned before: out
        _returned(4, "2026-11-07T02:00:00+00:00", 0, student="s4"),             # no fine: out
        loan(5, days_late=40, borrowed_at="2026-01-05T02:00:00+00:00", student="s5"),  # still out, overdue
        loan(6, days_late=-3, student="s6"),                                    # still out, not due: out
    ])
    rows = {r.patron_id: r for r in fines_report(db, _period("2026-11-01", "2026-11-30"))}
    assert set(rows) == {"s1", "s2", "s5"}
    assert rows["s1"].unsettled == 30 and rows["s2"].paid == 20 and rows["s5"].accruing == 100


# ─── Top patrons: ties in name order ────────────────────────────────────

def test_top_patron_ties_sort_by_name():
    db = FakeSupabase(loans=[loan(1, student="b", name="Zeta Cruz"), loan(2, student="a", name="Ana Reyes"),
                             loan(3, student="c", name="Mara Lim")])
    assert [p.name for p in top_patrons(db, ReportFilters(), limit=3)] == ["Ana Reyes", "Mara Lim", "Zeta Cruz"]


# ─── Library stats, shelf list and weeding past 1,000 rows ──────────────

def _catalog(n_books: int, copies_each: int):
    books = [{"id": f"b{i:04d}", "title": f"Book {i}", "author": "A", "call_number": f"005.{i} A1",
              "category": "BSIT", "subject": "CITE", "shelf_location": "Aisle 1", "floor": "Floor 2", "aisle": "Aisle 1",
              "archived_at": None, "weeding_dismissed_at": None, "published_year": 1990,
              "created_at": "2001-01-01T00:00:00+00:00"}
             for i in range(n_books)]
    copies = [{"id": f"c{i:04d}-{j}", "book_id": f"b{i:04d}", "accession_number": f"T{i * 10 + j}",
               "status": "available", "shelf_location": None}
              for i in range(n_books) for j in range(copies_each)]
    return books, copies


def test_library_stats_and_shelf_list_count_past_a_thousand_copies():
    books, copies = _catalog(600, 2)  # 1,200 copies
    db = FakeSupabase(books=books, book_copies=copies, loans=[], reservations=[])
    stats = library_stats(db, ReportFilters())
    assert (stats.total_titles, stats.total_copies) == (600, 1200)
    assert len(shelf_list(db, ReportFilters())) == 1200


def test_weeding_scan_reads_every_copy():
    books, copies = _catalog(600, 2)
    db = FakeSupabase(books=books, book_copies=copies, loans=[])
    assert len(find_weeding_candidates(db)) == 600


def test_shelf_list_is_in_call_number_order():
    books, copies = _catalog(3, 1)
    for b, cn in zip(books, ["005.2 A1", "005.13 B197", "FIL 658.4 P298"]):
        b["call_number"] = cn
    rows = shelf_list(FakeSupabase(books=books, book_copies=copies), ReportFilters())
    assert [r.call_number for r in rows] == ["005.13 B197", "005.2 A1", "FIL 658.4 P298"]


def test_call_number_key_orders_dewey_numbers_and_cutters():
    cns = ["005.2 A1", "005.13 B197j 2021", "005.1 M38", "005.1 M379 2008", "FIL 658.4 P298d"]
    assert sorted(cns, key=call_number_key) == [
        "005.1 M379 2008", "005.1 M38", "005.13 B197j 2021", "005.2 A1", "FIL 658.4 P298d"]


# ─── Weeding log: every action in the period, not just the latest 50 ────

def test_weeding_log_has_every_action_in_the_period():
    events = [{"id": f"e{i:03d}", "book_id": "b1", "event_type": "archived", "reason": None, "performed_by": None,
               "occurred_at": (datetime(2026, 11, 1, 1, tzinfo=timezone.utc) + timedelta(hours=i)).isoformat(),
               "books": {"title": "Old book"}, "profiles": {"full_name": "Staff One"}} for i in range(120)]
    events.append({**events[0], "id": "late", "occurred_at": "2026-12-15T02:00:00+00:00"})
    db = FakeSupabase(weeding_events=events)
    in_november = get_weeding_events(db, date_from=report_bound("2026-11-01", end=False),
                                     date_to=report_bound("2026-11-30", end=True))
    assert len(in_november) == 120
    assert len(get_weeding_events(db)) == 121
    assert len(get_weeding_events(db, limit=50)) == 50


# ─── Inventory counts past 1,000 items ──────────────────────────────────

def test_inventory_counts_read_every_item():
    sessions = [{"id": f"s{i}", "floor": "Floor 2", "aisle": None, "status": "completed", "started_by": None,
                 "started_at": f"2026-11-0{i + 1}T02:00:00+00:00", "completed_at": None, "skip_seen_since": None}
                for i in range(3)]
    items = [{"id": f"i{s}-{j:04d}", "session_id": f"s{s}", "expected": True, "result": "found", "resolution": None}
             for s in range(3) for j in range(500)]
    db = FakeSupabase(inventory_sessions=sessions, inventory_items=items, profiles=[])
    result = list_sessions(db)
    assert sorted(s.found for s in result) == [500, 500, 500]
