# apps/api/jobs/rebuild_cooccurrence.py
# Recommendations plan, Phase 4 — CLI entry point for the nightly
# co-occurrence rebuild. Thin wrapper; all the logic lives in
# core/cooccurrence.py. Must run BEFORE jobs/rebuild_recommendations.py
# (which reads book_cooccurrence while scoring) — no scheduler exists to
# chain these automatically yet (Phase 9's note on rebuild_recommendations.py
# applies here too), so run them by hand in this order:
#   1. jobs/rebuild_similarities.py
#   2. jobs/rebuild_cooccurrence.py   <- this one
#   3. jobs/rebuild_recommendations.py
#
# Usage: venv/Scripts/python.exe jobs/rebuild_cooccurrence.py

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.cooccurrence import rebuild_cooccurrence
from core.supabase import get_admin_client

if __name__ == "__main__":
    start = time.monotonic()
    result = rebuild_cooccurrence(get_admin_client())
    elapsed = time.monotonic() - start

    print(
        f"Rebuilt co-occurrence: {result.pairs} pair(s) with >=3 contributing students, "
        f"from {result.total_students} student(s) with borrow history, in {elapsed:.1f}s."
    )
