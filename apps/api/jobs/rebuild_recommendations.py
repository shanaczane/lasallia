# apps/api/jobs/rebuild_recommendations.py
# Recommendations plan, Phase 5 — nightly job that computes and stores
# every student's recommendations. Must run AFTER
# jobs/rebuild_similarities.py in the schedule (this job only reads
# book_similarities, it doesn't rebuild it) — Phase 4's co-occurrence
# step is skipped per Phase 1's decision gate (docs/data-audit.md:
# median borrows/student = 1, hybrid isn't viable on this data yet), so
# the order here is just similarities -> per-student recommendations.
#
#
# Usage: venv/Scripts/python.exe jobs/rebuild_recommendations.py
#
# Phase 9 hardening note: nothing schedules this job yet (no cron/Edge
# Function wired up anywhere in this codebase), so it's run by hand.
# Deliberately no try/except around the body below — an unhandled
# exception already exits non-zero with a full traceback on stderr,
# which is exactly what "fail loudly" means for a job a person is
# watching run. Add real alerting (see core/notify.py) once this is
# actually on a schedule and has no one watching it fire.

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

# Store more than the dashboard shows (Phase 6 shows 6-10) — the surplus
# is what lets the endpoint drop a book the student borrowed this
# morning without falling short of `limit` this afternoon.
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

    # Phase 7 — rung 2: one row set per distinct program with enough
    # contributing students. get_program_recommendations itself enforces
    # MIN_PROGRAM_STUDENTS and returns [] below that, so a thin program
    # just contributes nothing here rather than needing a separate check.
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

    # Phase 7 — rungs 3/4: one shared global list, also served directly
    # by GET /recommendations/popular for guests.
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
