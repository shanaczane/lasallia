# The nightly rebuild: similarities, then co-borrowing, then recommendations,
# in that order because each step reads what the one before wrote. Called by
# POST /internal/rebuild-recommendations and jobs/rebuild_all.py.
#
# Each run is recorded in recommendation_rebuild_runs. A failure stops the
# run, so the later steps keep last night's data; it's recorded there, sent
# to the server log and shown to librarians as a notification.

import logging
from datetime import datetime, timedelta, timezone

from postgrest.exceptions import APIError
from supabase import Client

from core.cooccurrence import rebuild_cooccurrence
from core.notify import notify_librarians
from core.paging import fetch_all_rows
from core.recommendations import (
    get_popular_recommendations,
    get_program_recommendations,
    get_recommendations_for_student,
)
from core.similarities import rebuild_similarities

logger = logging.getLogger("lasallia.rebuild")

# Store more than the dashboard shows, so there are spares when books the
# student borrowed since are filtered out.
STORED_PER_STUDENT = 20

# A run this old can't still be going; it was stopped by a restart.
STALE_RUN_HOURS = 6


def rebuild_recommendations(admin: Client) -> dict:
    """Computes and stores every student's recommendations, plus the program
    and popular lists."""
    students = fetch_all_rows(
        lambda: admin.table("profiles").select("id, program").eq("role", "student").order("id")
    )

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
    programs = {s["program"] for s in students if s.get("program")}
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

    return {
        "students": len(students),
        "students_with_recommendations": students_with_recs,
        "student_rows": len(rows),
        "programs": len(programs),
        "programs_with_recommendations": programs_with_recs,
        "program_rows": len(program_rows),
        "popular_rows": len(popular_rows),
    }


def start_run(admin: Client, triggered_by: str) -> str | None:
    """Records a new run and returns its id, or None if one is in progress."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=STALE_RUN_HOURS)).isoformat()
    (
        admin.table("recommendation_rebuild_runs")
        .update({
            "status": "interrupted",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error": "Stopped before finishing, probably by a restart",
        })
        .eq("status", "running")
        .lt("started_at", cutoff)
        .execute()
    )
    try:
        return admin.table("recommendation_rebuild_runs").insert({"triggered_by": triggered_by}).execute().data[0]["id"]
    except APIError as e:
        # The one-running index: a run is already going.
        if e.code == "23505":
            return None
        raise


def _update_run(admin: Client, run_id: str, fields: dict) -> None:
    admin.table("recommendation_rebuild_runs").update(fields).eq("id", run_id).execute()


def execute_run(admin: Client, run_id: str) -> None:
    """Runs the three steps in order. Never raises: failures are recorded."""
    logger.info("Recommendation rebuild %s started", run_id)
    step = None
    summary: dict = {}
    try:
        step = "similarities"
        _update_run(admin, run_id, {"step_reached": step})
        result = rebuild_similarities(admin)
        summary[step] = {"books": result.updated, "skipped": len(result.skipped_book_ids)}

        step = "cooccurrence"
        _update_run(admin, run_id, {"step_reached": step, "summary": summary})
        result = rebuild_cooccurrence(admin)
        summary[step] = {"pairs": result.pairs, "students": result.total_students}

        step = "recommendations"
        _update_run(admin, run_id, {"step_reached": step, "summary": summary})
        summary[step] = rebuild_recommendations(admin)

        _update_run(admin, run_id, {
            "status": "succeeded",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
        })
        logger.info("Recommendation rebuild %s finished: %s", run_id, summary)
    except Exception as e:
        logger.exception("Recommendation rebuild %s failed at step %s", run_id, step)
        try:
            _update_run(admin, run_id, {
                "status": "failed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "summary": summary,
                "error": f"{type(e).__name__}: {e}"[:2000],
            })
        except Exception:
            logger.exception("Could not record the failure of rebuild %s", run_id)
        notify_librarians(
            "Recommendation rebuild failed",
            f"Last night's rebuild stopped at the {step} step, so recommendations may be out of date.",
        )
