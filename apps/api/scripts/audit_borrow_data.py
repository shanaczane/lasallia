# apps/api/scripts/audit_borrow_data.py
# Recommendations plan, Phase 1 — one-off data audit. Reports whether
# borrowing history can support a hybrid (content + collaborative)
# recommender, or whether the data is thin enough that only the
# content-based system (Phases 2-3) is defensible for now. This phase
# writes no model code, only docs/data-audit.md and a decision.
#
# Usage: venv/Scripts/python.exe scripts/audit_borrow_data.py
#
# "Completed borrow record" = a row in `loans`. A row only exists once a
# librarian has physically handed the book over at the kiosk (see
# routers/loans.py's confirm flow) — a reservation or an expired hold
# never becomes a loans row, so every row here is a real, completed
# borrow regardless of its current status (active/returned/overdue).

import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.supabase import get_admin_client

MEDIAN_HYBRID_VIABLE = 3
DESCRIPTION_COVERAGE_LOW = 0.50
SUBJECT_COVERAGE_LOW = 0.50
NEVER_BORROWED_HIGH = 0.80


def _non_empty(value: str | None) -> bool:
    return value is not None and value.strip() != ""


def _pct(numerator: int, denominator: int) -> float:
    return (numerator / denominator * 100) if denominator else 0.0


def run_audit() -> dict:
    admin = get_admin_client()

    loans = admin.table("loans").select("id, book_copy_id, student_id, status").execute().data
    copies = admin.table("book_copies").select("id, book_id").execute().data
    books = admin.table("books").select("id, abstract, subject").execute().data

    copy_to_book = {c["id"]: c["book_id"] for c in copies}

    total_books = len(books)
    total_completed_borrows = len(loans)
    distinct_students = len({l["student_id"] for l in loans})

    borrowed_book_ids: set[str] = set()
    borrows_per_student: dict[str, int] = {}
    borrows_per_book: dict[str, int] = {}

    skipped_orphaned_copies = 0
    for l in loans:
        book_id = copy_to_book.get(l["book_copy_id"])
        if book_id is None:
            # A copy that's since been deleted (on delete restrict on
            # loans->book_copies makes this rare, but book_copies itself
            # has no such guarantee against manual cleanup) — logged, not
            # silently folded into the counts below.
            skipped_orphaned_copies += 1
            continue
        borrowed_book_ids.add(book_id)
        borrows_per_book[book_id] = borrows_per_book.get(book_id, 0) + 1
        borrows_per_student[l["student_id"]] = borrows_per_student.get(l["student_id"], 0) + 1

    distinct_books_borrowed = len(borrowed_book_ids)

    student_counts = list(borrows_per_student.values())
    book_counts = list(borrows_per_book.values())

    median_per_student = statistics.median(student_counts) if student_counts else 0
    mean_per_student = statistics.mean(student_counts) if student_counts else 0.0
    median_per_book = statistics.median(book_counts) if book_counts else 0

    pct_never_borrowed = _pct(total_books - distinct_books_borrowed, total_books)
    pct_with_description = _pct(sum(1 for b in books if _non_empty(b.get("abstract"))), total_books)
    pct_with_subject = _pct(sum(1 for b in books if _non_empty(b.get("subject"))), total_books)

    return {
        "total_books": total_books,
        "total_completed_borrows": total_completed_borrows,
        "skipped_orphaned_copies": skipped_orphaned_copies,
        "distinct_students": distinct_students,
        "distinct_books_borrowed": distinct_books_borrowed,
        "median_per_student": median_per_student,
        "mean_per_student": mean_per_student,
        "median_per_book": median_per_book,
        "pct_never_borrowed": pct_never_borrowed,
        "pct_with_description": pct_with_description,
        "pct_with_subject": pct_with_subject,
    }


def _decision(stats: dict) -> str:
    median = stats["median_per_student"]
    if stats["distinct_students"] == 0:
        return (
            "**No borrow history exists yet.** The decision gate can't be evaluated — "
            "there is nothing to compute a median over. Re-run this audit once real "
            "borrowing activity accumulates; until then, treat this as content-only "
            "by necessity, not by choice (Phase 4 stays unbuilt)."
        )
    if median >= MEDIAN_HYBRID_VIABLE:
        return (
            f"**Median borrows/student is {median} (≥ {MEDIAN_HYBRID_VIABLE}).** "
            "Hybrid is viable — proceed through Phase 4 as planned."
        )
    return (
        f"**Median borrows/student is {median} (1–2 range, or otherwise below "
        f"{MEDIAN_HYBRID_VIABLE}).** Collaborative boost would be noise on this little "
        "signal. Build Phases 2-3 only (content-based); keep Phase 4 as documented "
        "future work rather than building it against data too sparse to trust."
    )


def write_report(stats: dict, path: Path) -> None:
    lines = [
        "# Data Audit — Book Recommendations, Phase 1",
        "",
        "Generated by `apps/api/scripts/audit_borrow_data.py`. See "
        "`docs/lasallia-recommendations-build-plan.md` Phase 1 for the methodology "
        "and decision-gate thresholds this report is evaluated against.",
        "",
        "## Metrics",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Total completed borrow records | {stats['total_completed_borrows']} |",
        f"| Distinct students who have ever borrowed | {stats['distinct_students']} |",
        f"| Distinct books ever borrowed | {stats['distinct_books_borrowed']} |",
        f"| Median borrows per student | {stats['median_per_student']} |",
        f"| Mean borrows per student | {stats['mean_per_student']:.2f} |",
        f"| Median borrows per book | {stats['median_per_book']} |",
        f"| % of catalog never borrowed | {stats['pct_never_borrowed']:.1f}% |",
        f"| % of books with non-empty description | {stats['pct_with_description']:.1f}% |",
        f"| % of books with non-empty subject/classification | {stats['pct_with_subject']:.1f}% |",
    ]
    if stats["skipped_orphaned_copies"]:
        lines.append(
            f"| Loans skipped (book_copy_id with no matching book_copies row) | "
            f"{stats['skipped_orphaned_copies']} |"
        )
    lines += [
        "",
        "## Decision",
        "",
        _decision(stats),
        "",
    ]

    if stats["pct_with_description"] < DESCRIPTION_COVERAGE_LOW * 100:
        lines.append(
            f"Description coverage is {stats['pct_with_description']:.1f}% "
            f"(< {DESCRIPTION_COVERAGE_LOW*100:.0f}%) — TF-IDF in Phase 2 must lean on "
            "title + author + subject rather than description. State this explicitly "
            "in the thesis rather than implying rich descriptions exist."
        )
        lines.append("")

    if stats["pct_with_subject"] < SUBJECT_COVERAGE_LOW * 100:
        lines.append(
            f"Subject/classification coverage is {stats['pct_with_subject']:.1f}% "
            f"(< {SUBJECT_COVERAGE_LOW*100:.0f}%) — Phase 2's feature blob gives "
            "subject a ×2 weight, but that weight contributes nothing for a book "
            "with no subject on record. If this stays near 0%, the feature blob is "
            "effectively title + author + description; say so in the thesis rather "
            "than claiming subject-weighted matching that isn't really happening."
        )
        lines.append("")

    if stats["pct_never_borrowed"] > NEVER_BORROWED_HIGH * 100:
        lines.append(
            f"{stats['pct_never_borrowed']:.1f}% of the catalog has never been "
            f"borrowed (> {NEVER_BORROWED_HIGH*100:.0f}%) — expected for a school "
            "library, and it's the actual justification for content-based being the "
            "primary recommender rather than a nice-to-have."
        )
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    stats = run_audit()
    out_path = Path(__file__).resolve().parent.parent.parent.parent / "docs" / "data-audit.md"
    write_report(stats, out_path)

    for key, value in stats.items():
        print(f"{key}: {value}")
    print(f"\nWrote {out_path}")
