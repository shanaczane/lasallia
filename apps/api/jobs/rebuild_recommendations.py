# Computes and stores every student's recommendations, plus the program
# and popular lists (logic in core/recommendation_rebuild.py). Scheduled
# nightly with the other two steps; run by hand after them:
#   1. jobs/rebuild_similarities.py
#   2. jobs/rebuild_cooccurrence.py
#   3. jobs/rebuild_recommendations.py   <- this one
# jobs/rebuild_all.py runs all three.
#
# Usage: venv/Scripts/python.exe jobs/rebuild_recommendations.py
#
# Errors aren't caught on purpose, so a failure is loud.

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.recommendation_rebuild import rebuild_recommendations
from core.recommendations import MIN_PROGRAM_STUDENTS
from core.supabase import get_admin_client

if __name__ == "__main__":
    start = time.monotonic()
    result = rebuild_recommendations(get_admin_client())
    elapsed = time.monotonic() - start
    print(
        f"Rebuilt recommendations for {result['students_with_recommendations']}/{result['students']} student(s) "
        f"({result['student_rows']} row(s) total), "
        f"{result['programs_with_recommendations']}/{result['programs']} program(s) "
        f"(min {MIN_PROGRAM_STUDENTS} contributing students) with a fallback list "
        f"({result['program_rows']} row(s) total), and {result['popular_rows']} popular row(s) "
        f"in {elapsed:.1f}s."
    )
