# apps/api/core/cooccurrence.py
# Recommendations plan, Phase 4 — collaborative re-ranking signal.
# compute_lift_pairs is pure (no DB access) so it can be fed either every
# loan (the live nightly job, via rebuild_cooccurrence below) or just a
# train split's loans (evals/run_recsys_eval.py's Hybrid arm) without
# duplicating the actual math in two places.

from collections import defaultdict
from dataclasses import dataclass

from supabase import Client

# Plan's hard privacy rule: a pair below this is dropped entirely, never
# stored with a flag — below 3 students, a "book_cooccurrence" row would
# be reconstructable back to specific individuals' borrowing history.
MIN_COOCCURRENCE_STUDENTS = 3

# Caps lift so a rare pair with exactly 3 students (the minimum allowed)
# can't dominate every other signal — plan's own example ceiling.
LIFT_CEILING = 5.0


@dataclass
class RebuildResult:
    pairs: int
    total_students: int


def compute_lift_pairs(student_books: dict[str, set[str]]) -> list[dict]:
    """book_id -> neighbor_book_id -> lift, from a plain {student_id:
    {book_ids ever borrowed}} mapping. lift = P(B|A) / P(B): how much
    more likely a student who borrowed A is to have also borrowed B,
    versus the base rate of B across everyone in `student_books`."""
    total_students = len(student_books)
    if total_students == 0:
        return []

    book_student_count: dict[str, int] = defaultdict(int)
    for books in student_books.values():
        for book_id in books:
            book_student_count[book_id] += 1

    pair_student_count: dict[tuple[str, str], int] = defaultdict(int)
    for books in student_books.values():
        book_list = list(books)
        for i, a in enumerate(book_list):
            for j, b in enumerate(book_list):
                if i == j:
                    continue
                pair_student_count[(a, b)] += 1

    rows: list[dict] = []
    for (book_id, neighbor_id), student_count in pair_student_count.items():
        if student_count < MIN_COOCCURRENCE_STUDENTS:
            continue
        p_b = book_student_count[neighbor_id] / total_students
        if p_b == 0:
            continue
        p_b_given_a = student_count / book_student_count[book_id]
        lift = min(p_b_given_a / p_b, LIFT_CEILING)
        rows.append({
            "book_id": book_id, "neighbor_book_id": neighbor_id,
            "student_count": student_count, "lift": lift,
        })
    return rows


def _load_student_books(admin: Client) -> dict[str, set[str]]:
    rows = admin.table("loans").select("student_id, book_copies(book_id)").execute().data
    student_books: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        book_id = (row.get("book_copies") or {}).get("book_id")
        if book_id:
            student_books[row["student_id"]].add(book_id)
    return student_books


def rebuild_cooccurrence(admin: Client) -> RebuildResult:
    """Full rebuild from every loan in the DB — mirrors
    core/similarities.py:rebuild_similarities's shape. Must run before
    jobs/rebuild_recommendations.py so get_recommendations_for_student
    sees this run's data, not stale/missing rows."""
    student_books = _load_student_books(admin)
    rows = compute_lift_pairs(student_books)
    admin.rpc("replace_book_cooccurrence", {"rows": rows}).execute()
    return RebuildResult(pairs=len(rows), total_students=len(student_books))
