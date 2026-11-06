# The Catalogue report counts titles (books) and copies (book_copies rows)
# separately, so a category with extra copies doesn't inflate its titles.

from core.reports import ReportFilters, catalogue_report
from tests.fake_supabase import FakeSupabase


def _db():
    return FakeSupabase(
        books=[
            {"id": "b1", "category": "BS Computer Science", "subject": "CITE", "archived_at": None},
            {"id": "b2", "category": "BS Computer Science", "subject": "CITE", "archived_at": None},
            {"id": "b3", "category": "BS Accountancy", "subject": "CBEAM", "archived_at": None},
            {"id": "b4", "category": None, "subject": None, "archived_at": None},
            {"id": "b5", "category": "BS Accountancy", "subject": "CBEAM", "archived_at": "2026-01-01T00:00:00+00:00"},
        ],
        book_copies=[
            {"id": "c1", "book_id": "b1"},
            {"id": "c2", "book_id": "b1"},
            {"id": "c3", "book_id": "b1"},
            {"id": "c4", "book_id": "b2"},
            {"id": "c5", "book_id": "b3"},
            {"id": "c6", "book_id": "b5"},  # archived book: not counted
        ],
    )


def test_titles_and_copies_are_counted_separately():
    slices = {s.label: s for s in catalogue_report(_db(), ReportFilters())}

    assert (slices["BS Computer Science"].titles, slices["BS Computer Science"].copies) == (2, 4)
    assert (slices["BS Accountancy"].titles, slices["BS Accountancy"].copies) == (1, 1)
    assert all(s.value == s.copies for s in slices.values())


def test_a_category_whose_books_have_no_copies_still_counts_its_titles():
    slices = {s.label: s for s in catalogue_report(_db(), ReportFilters())}

    assert (slices["Uncategorized"].titles, slices["Uncategorized"].copies) == (1, 0)
    assert sum(s.titles for s in slices.values()) == 4  # matches Total Titles


def test_college_filter_applies_to_titles_and_copies():
    slices = catalogue_report(_db(), ReportFilters(college="CITE"))

    assert [(s.label, s.titles, s.copies) for s in slices] == [("BS Computer Science", 2, 4)]
