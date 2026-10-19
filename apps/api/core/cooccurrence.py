# "Students who borrowed A also borrowed B" scores, used to boost
# recommendations. compute_lift_pairs has no database access so the
# evaluation script can reuse it.

from collections import defaultdict
from dataclasses import dataclass

from supabase import Client

# Privacy rule: pairs borrowed by fewer than 3 students are never stored,
# or they could reveal what one person borrowed.
MIN_COOCCURRENCE_STUDENTS = 3

# Cap so a rare pair can't outweigh everything else.
LIFT_CEILING = 5.0


@dataclass
class RebuildResult:
    pairs: int
    total_students: int


def compute_lift_pairs(student_books: dict[str, set[str]]) -> list[dict]:
    """Lift for each book pair, from {student_id: {book_ids borrowed}}.
    lift = P(B|A) / P(B): how much more likely someone who borrowed A is
    to also borrow B than students in general."""
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
    """Recomputes all pairs from every loan. Run before
    jobs/rebuild_recommendations.py so it uses fresh data."""
    student_books = _load_student_books(admin)
    rows = compute_lift_pairs(student_books)
    admin.rpc("replace_book_cooccurrence", {"rows": rows}).execute()
    return RebuildResult(pairs=len(rows), total_students=len(student_books))
