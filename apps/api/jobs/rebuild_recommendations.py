# Computes and stores every student's recommendations, plus the program
# and popular lists. Run after the other two jobs:
#   1. jobs/rebuild_similarities.py
#   2. jobs/rebuild_cooccurrence.py
#   3. jobs/rebuild_recommendations.py   <- this one
#
# Usage: venv/Scripts/python.exe jobs/rebuild_recommendations.py
#
# Not scheduled yet, so it's run by hand. Errors aren't caught on purpose,
# so a failure is loud. Add alerting if it's ever scheduled.

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.recommendations import (
    MIN_PROGRAM_STUDENTS,
    get_popular_recommendations,
    get_program_recommendations,
    get_recommendations_for_student,
)
from core.supabase import get_admin_client

# Store more than the dashboard shows, so there are spares when books the
# student borrowed since are filtered out.
STORED_PER_STUDENT = 20

if __name__ == "__main__":
    start = time.monotonic()
    admin = get_admin_client()

    students = admin.table("profiles").select("id").eq("role", "student").execute().data

    rows: list[dict] = []
    students_with_recs = 0
    for student in students:
        recs = get_recommendations_for_student(admin, student["id"], limit=STORED_PER_STUDENT)
        if not recs:
            continue
        students_with_recs += 1
        for rank, rec in enumerate(recs, start=1):
            rows.append({
                "student_id": student["id"],
                "book_id": rec.book_id,
                "rank": rank,
                "score": rec.score,
                "reason": rec.reason,
                "reason_book_id": rec.reason_book_id,
            })

    admin.rpc("replace_student_recommendations", {"rows": rows}).execute()

    # One list per program. Programs with too few borrowers get books
    # tagged for the program instead.
    programs = {
        p["program"]
        for p in admin.table("profiles").select("program").eq("role", "student").execute().data
        if p.get("program")
    }
    program_rows: list[dict] = []
    programs_with_recs = 0
    for program in programs:
        recs = get_program_recommendations(admin, program, limit=STORED_PER_STUDENT)
        if not recs:
            continue
        programs_with_recs += 1
        for rank, rec in enumerate(recs, start=1):
            program_rows.append({"program": program, "rank": rank, "book_id": rec.book_id, "reason": rec.reason})
    admin.rpc("replace_program_recommendations", {"rows": program_rows}).execute()

    # One popular list for everyone, also shown to guests.
    popular_recs = get_popular_recommendations(admin, limit=STORED_PER_STUDENT)
    popular_rows = [
        {"rank": rank, "book_id": rec.book_id, "reason": rec.reason}
        for rank, rec in enumerate(popular_recs, start=1)
    ]
    admin.rpc("replace_popular_recommendations", {"rows": popular_rows}).execute()

    elapsed = time.monotonic() - start
    print(
        f"Rebuilt recommendations for {students_with_recs}/{len(students)} student(s) "
        f"({len(rows)} row(s) total), {programs_with_recs}/{len(programs)} program(s) "
        f"(min {MIN_PROGRAM_STUDENTS} contributing students) with a fallback list "
        f"({len(program_rows)} row(s) total), and {len(popular_rows)} popular row(s) "
        f"in {elapsed:.1f}s."
    )
