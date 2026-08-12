# apps/api/jobs/rebuild_similarities.py
# Recommendations plan, Phase 2 — CLI entry point for the nightly
# similarity rebuild. Thin wrapper; all the logic lives in
# core/similarities.py so a future scheduler can call rebuild_similarities()
# directly instead of shelling out to this script.
#
# Usage: venv/Scripts/python.exe jobs/rebuild_similarities.py

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.similarities import rebuild_similarities
from core.supabase import get_admin_client

if __name__ == "__main__":
    start = time.monotonic()
    result = rebuild_similarities(get_admin_client())
    elapsed = time.monotonic() - start

    print(f"Rebuilt similarities for {result.updated} book(s) in {elapsed:.1f}s.")
    if result.skipped_book_ids:
        print(f"Skipped {len(result.skipped_book_ids)} book(s) with no usable text:")
        for book_id in result.skipped_book_ids:
            print(f"  - {book_id}")
