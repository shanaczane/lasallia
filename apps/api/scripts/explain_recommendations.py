# Prints a worked example of one student's recommendations for the
# manuscript. Read-only. The numbers come from the same code the nightly job
# runs (score_student in core/recommendations.py), and they're computed for
# today, so recency weights differ slightly from last night's stored list.
#
# Usage (from apps/api):
#   venv/Scripts/python.exe scripts/explain_recommendations.py <student id or email>
#   venv/Scripts/python.exe scripts/explain_recommendations.py <student id or email> --top 5
#
# Borrowing history is personal data: use a test or consenting account.

import argparse
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.cooccurrence import LIFT_CEILING, MIN_COOCCURRENCE_STUDENTS
from core.recommendation_rebuild import STORED_PER_STUDENT
from core.recommendations import (
    COOCCURRENCE_ALPHA,
    DIVERSITY_CAP_PER_CATEGORY,
    PROGRAM_ALPHA,
    RECENCY_HALF_LIFE_DAYS,
    RESERVATION_WEIGHT,
    ScoredPick,
    StudentScoring,
    score_student,
)
from core.similarities import MIN_SCORE, TOP_N_NEIGHBORS
from core.supabase import get_admin_client


def find_student(admin, id_or_email: str) -> dict:
    value = id_or_email.strip()
    column = "email" if "@" in value else "id"
    if column == "id":
        try:
            uuid.UUID(value)
        except ValueError:
            sys.exit(f"No account found for {value}: give a student's id or email")
    rows = admin.table("profiles").select("id, role, program").eq(column, value).execute().data
    if not rows:
        sys.exit(f"No account found for {id_or_email}")
    return rows[0]


def _title(scoring: StudentScoring, book_id: str) -> str:
    return scoring.titles.get(book_id) or book_id


def print_sources(scoring: StudentScoring) -> None:
    print("\nSOURCE BOOKS")
    print(f"weight = base weight x 0.5^(days since / {RECENCY_HALF_LIFE_DAYS})\n")
    ranked = sorted(scoring.sources.values(), key=lambda s: -s.weight)
    print(f"{'Type':<22}{'Days since':>11}{'Base':>7}{'Decay':>9}{'Weight':>9}  Title")
    for s in ranked:
        print(f"{s.kind:<22}{s.days_since:>11.1f}{s.base_weight:>7.2f}{s.decay:>9.4f}{s.weight:>9.4f}  {_title(scoring, s.book_id)}")


def print_pick(scoring: StudentScoring, pick: ScoredPick, rank: int) -> None:
    print(f"\n#{rank}  {_title(scoring, pick.book_id)}")
    print(f"    Category: {scoring.categories.get(pick.book_id) or '(none)'}")
    print("    Similarity to each source (contribution = sim x source weight):")
    for source in sorted(scoring.sources.values(), key=lambda s: -pick.contributions.get(s.book_id, 0)):
        sim = pick.similarities.get(source.book_id)
        if sim is None:
            print(f"      -       not a stored neighbor of: {_title(scoring, source.book_id)}")
        else:
            contribution = pick.contributions[source.book_id]
            print(f"      {sim:.4f} x {source.weight:.4f} = {contribution:.4f}  {_title(scoring, source.book_id)}")
    print(f"    Content score:   {pick.content_score:.4f}")
    if pick.lift is None:
        print(f"    Lift:            none stored (fewer than {MIN_COOCCURRENCE_STUDENTS} students borrowed both)")
    else:
        print(f"    Lift:            {pick.lift:.4f} (with the book named in the reason)")
    print(f"    Normalized boost: {pick.normalized_boost:.4f}  -> x{pick.lift_multiplier:.4f}")
    matched = "matches" if pick.program_multiplier > 1 else "doesn't match"
    print(f"    Program boost:   x{pick.program_multiplier:.2f} (category {matched} the student's program)")
    print(
        f"    Final score:     {pick.content_score:.4f} x {pick.lift_multiplier:.4f} "
        f"x {pick.program_multiplier:.2f} = {pick.score:.4f}"
    )
    print(f"    Rank:            {rank}")
    print(f"    Reason:          {pick.reason}")


def print_stored(admin, student_id: str, scoring: StudentScoring, top: int) -> None:
    stored = (
        admin.table("student_recommendations").select("book_id, rank, score, generated_at")
        .eq("student_id", student_id).order("rank").limit(top).execute()
    ).data
    print("\nLAST STORED LIST (from the nightly job)")
    if not stored:
        print("  None stored yet.")
        return
    print(f"  Generated: {stored[0]['generated_at']}")
    for row in stored:
        print(f"  #{row['rank']}  {row['score']:.4f}  {_title(scoring, row['book_id'])}")


def main() -> None:
    # Windows consoles default to a code page without "·" and "₱".
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Print a worked recommendation example for one student.")
    parser.add_argument("student", help="the student's id or email")
    parser.add_argument("--top", type=int, default=3, help="how many candidates to show (default 3)")
    args = parser.parse_args()

    admin = get_admin_client()
    student = find_student(admin, args.student)
    scoring = score_student(admin, student["id"], limit=STORED_PER_STUDENT)

    print("WORKED RECOMMENDATION EXAMPLE")
    print(f"Student: {student['id']} ({student['role']}), program: {student.get('program') or '(none)'}")
    print(f"Computed: {scoring.computed_at.isoformat(timespec='seconds')}")
    print(
        "Values: "
        f"half-life {RECENCY_HALF_LIFE_DAYS} days; reservation weight {RESERVATION_WEIGHT}; "
        f"lift boost {COOCCURRENCE_ALPHA} (cap {LIFT_CEILING}, min {MIN_COOCCURRENCE_STUDENTS} students); "
        f"program boost {1 + PROGRAM_ALPHA:.2f}; top {TOP_N_NEIGHBORS} neighbors > {MIN_SCORE}; "
        f"{DIVERSITY_CAP_PER_CATEGORY} per category; {STORED_PER_STUDENT} stored"
    )

    if not scoring.sources:
        print("\nThis student has no borrowing or reservation history, so they see the fallback lists.")
        return

    print_sources(scoring)
    print(f"\nTOP {min(args.top, len(scoring.picks))} CANDIDATES (of {scoring.candidate_count} scored)")
    if not scoring.picks:
        print("  No candidates: no stored neighbor of these books can be recommended.")
    for rank, pick in enumerate(scoring.picks[:args.top], start=1):
        print_pick(scoring, pick, rank)
    print_stored(admin, student["id"], scoring, args.top)


if __name__ == "__main__":
    main()
