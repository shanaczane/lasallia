# apps/api/jobs/rebuild_recommendations.py
# Recommendations plan, Phase 5 — nightly job that computes and stores
# every student's recommendations. Must run AFTER
# jobs/rebuild_similarities.py in the schedule (this job only reads
# book_similarities, it doesn't rebuild it) — Phase 4's co-occurrence
# step is skipped per Phase 1's decision gate (docs/data-audit.md:
# median borrows/student = 1, hybrid isn't viable on this data yet), so
# the order here is just similarities -> per-student recommendations.
#
# Usage: venv/Scripts/python.exe jobs/rebuild_recommendations.py

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.recommendations import get_recommendations_for_student
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

    elapsed = time.monotonic() - start
    print(
        f"Rebuilt recommendations for {students_with_recs}/{len(students)} student(s) "
        f"({len(rows)} row(s) total) in {elapsed:.1f}s."
    )
