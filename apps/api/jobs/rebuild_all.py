# The whole nightly rebuild by hand: similarities, co-borrowing, then
# recommendations, recorded in recommendation_rebuild_runs like a scheduled
# run. Needs migration 0064. The three steps can also be run alone.
#
# Usage: venv/Scripts/python.exe jobs/rebuild_all.py

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.recommendation_rebuild import execute_run, start_run
from core.supabase import get_admin_client

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    admin = get_admin_client()
    run_id = start_run(admin, "manual")
    if run_id is None:
        sys.exit("A rebuild is already running.")
    execute_run(admin, run_id)
    run = admin.table("recommendation_rebuild_runs").select("*").eq("id", run_id).execute().data[0]
    print(f"Run {run_id}: {run['status']} (step reached: {run['step_reached']})")
    print(run["summary"])
    if run["status"] != "succeeded":
        sys.exit(run["error"] or "The rebuild didn't finish.")
