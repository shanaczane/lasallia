# apps/api/evals/run_eval.py
# Chatbot Phase 6 — the full-pipeline evaluation runner.
#
# Two passes:
#   1. Retrieval hit-rate@5 for catalog + policy questions, baseline vs.
#      query-translation (plan 6.3's A/B) — in-process, no server needed,
#      same reasoning as evals/embedding_comparison.py.
#   2. Answer-accuracy proxy for all four capabilities, driven over real
#      HTTP against a running `uvicorn` instance — the only way to
#      exercise routers/chat.py's actual tool-calling loop, whose logic
#      lives in a request-scoped closure, not an importable function.
#      Needs `pnpm dev:api` (or equivalent) running first; the script
#      checks for this and reports plainly rather than hanging.
#
# "Answer accuracy" here is an automated proxy (substring match against
# an expected fact), not the human-verified correctness the plan asks
# for — see evals/results/phase6_taglish_eval.md's caveat.
#
# Account-capability questions need a real authenticated session, so this
# creates one ephemeral test student (with one active and one returned
# loan, known values), runs every pass-2 question through it, and tears
# everything down afterward — same pattern used for every prior phase's
# live verification.
#
# Usage: venv/Scripts/python.exe evals/run_eval.py

import json
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

import requests

from core.supabase import get_admin_client
from core.tools.catalog import search_catalog
from core.tools.policy import search_policy

API_URL = "http://localhost:8000"
QUERY_SET_PATH = Path(__file__).parent / "queries" / "chatbot_eval_v1.json"
RESULTS_PATH = Path(__file__).parent / "results" / "phase6_taglish_eval.md"
BORROW_PERIOD_DAYS = 14


def load_queries() -> list[dict]:
    rows = json.loads(QUERY_SET_PATH.read_text(encoding="utf-8"))
    return [r for r in rows if not r.get("skip")]


# ─── Pass 1: retrieval hit-rate ─────────────────────────────────────────

def run_retrieval_pass(queries: list[dict]) -> dict:
    """Returns {condition: {language: [hit, hit, ...]}} for catalog+policy
    questions, condition in ('baseline', 'translated')."""
    results: dict[str, dict[str, list[int]]] = {"baseline": defaultdict(list), "translated": defaultdict(list)}

    for q in queries:
        if q["capability"] == "catalog":
            for condition, translate in (("baseline", False), ("translated", True)):
                books = search_catalog(q["query"], limit=5, translate=translate)
                hit = 1 if any(b.title == q["expected_title"] for b in books) else 0
                results[condition][q["language"]].append(hit)
        elif q["capability"] == "policy" and "expected_section_contains" in q:
            for condition, translate in (("baseline", False), ("translated", True)):
                chunks = search_policy(q["query"], limit=5, translate=translate)
                hit = 1 if any(q["expected_section_contains"] in c.section_title for c in chunks) else 0
                results[condition][q["language"]].append(hit)

    return results


# ─── Pass 2: answer-accuracy proxy ──────────────────────────────────────

def parse_sse_done(resp: requests.Response) -> dict:
    """Reads the streamed response and returns the "done" event's data,
    or an error dict if the stream ended in an "error" event instead."""
    buffer = ""
    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
        if not chunk:
            continue
        buffer += chunk
        while "\n\n" in buffer:
            frame, buffer = buffer.split("\n\n", 1)
            lines = frame.split("\n")
            event_line = next((l for l in lines if l.startswith("event:")), None)
            data_line = next((l for l in lines if l.startswith("data:")), None)
            if not event_line or not data_line:
                continue
            event = event_line[len("event:"):].strip()
            data = json.loads(data_line[len("data:"):].strip())
            if event == "done":
                return data
            if event == "error":
                return {"reply": "", "error": data.get("detail")}
    return {"reply": "", "error": "stream ended with no done/error event"}


def ask(query: str, token: str | None = None) -> str:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.post(f"{API_URL}/chat/message", json={"message": query}, headers=headers, stream=True, timeout=60)
    data = parse_sse_done(resp)
    return data.get("reply", "")


def check_server_up() -> bool:
    try:
        requests.get(f"{API_URL}/health", timeout=3)
        return True
    except requests.exceptions.RequestException:
        return False


def run_accuracy_pass(queries: list[dict], token: str) -> list[dict]:
    rows = []
    for q in queries:
        reply = ask(q["query"], token=token if q.get("requires_test_student") else None)
        expected = q.get("expected_answer_contains", [])
        hit = any(e.lower() in reply.lower() for e in expected) if expected else None
        rows.append({**q, "reply": reply, "accuracy_hit": hit})
    return rows


# ─── Ephemeral test student (account-capability questions) ─────────────

def setup_test_student(admin) -> tuple[str, dict]:
    """Creates a student with one active loan (a known due date) and one
    returned loan (for the history question). Returns (jwt, cleanup)."""
    email = f"eval-phase6-{uuid.uuid4().hex[:8]}@example.com"
    password = "Eval-Phase6-Test-1!"
    created = admin.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"role": "student", "full_name": "Phase6 Eval Bot"},
    })
    student_id = created.user.id

    profile_created = False
    if not admin.table("profiles").select("id").eq("id", student_id).execute().data:
        admin.table("profiles").insert({"id": student_id, "role": "student", "full_name": "Phase6 Eval Bot"}).execute()
        profile_created = True
    else:
        admin.table("profiles").update({"role": "student"}).eq("id", student_id).execute()

    copies = admin.table("book_copies").select("id, book_id").eq("status", "available").limit(2).execute().data
    if len(copies) < 2:
        raise RuntimeError("Need at least 2 available book copies in the catalog to seed the eval's test loans")
    active_copy, returned_copy = copies[0], copies[1]

    now = datetime.now(timezone.utc)
    due_date = (now + timedelta(days=BORROW_PERIOD_DAYS)).isoformat()

    admin.table("book_copies").update({"status": "on_loan"}).eq("id", active_copy["id"]).execute()
    active_loan = admin.table("loans").insert({
        "book_copy_id": active_copy["id"],
        "student_id": student_id,
        "due_date": due_date,
        "condition_at_borrow": "good",
        "status": "active",
    }).execute().data[0]

    returned_loan = admin.table("loans").insert({
        "book_copy_id": returned_copy["id"],
        "student_id": student_id,
        "borrowed_at": (now - timedelta(days=30)).isoformat(),
        "due_date": (now - timedelta(days=16)).isoformat(),
        "returned_at": (now - timedelta(days=17)).isoformat(),
        "condition_at_borrow": "good",
        "status": "returned",
        "fine_status": "none",
    }).execute().data[0]

    login = requests.post(f"{API_URL}/auth/login", json={"email": email, "password": password})
    if not login.ok:
        raise RuntimeError(f"Could not log in the ephemeral eval student: {login.text}")
    token = login.json()["access_token"]

    cleanup = {
        "user_id": student_id,
        "profile_created": profile_created,
        "loan_ids": [active_loan["id"], returned_loan["id"]],
        "active_copy_id": active_copy["id"],
    }
    return token, cleanup


def teardown_test_student(admin, cleanup: dict) -> None:
    for loan_id in cleanup["loan_ids"]:
        admin.table("loans").delete().eq("id", loan_id).execute()
    # available -> on_loan can't go straight back — route through
    # for_reshelving, same status-machine rule every prior phase respects.
    admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", cleanup["active_copy_id"]).execute()
    admin.table("book_copies").update({"status": "available"}).eq("id", cleanup["active_copy_id"]).execute()
    if cleanup["profile_created"]:
        admin.table("profiles").delete().eq("id", cleanup["user_id"]).execute()
    try:
        admin.auth.admin.delete_user(cleanup["user_id"])
    except Exception as e:
        print(f"warning: could not delete ephemeral eval user: {e}")


# ─── Reporting ───────────────────────────────────────────────────────────

def summarize_retrieval(results: dict) -> str:
    lines = ["## Retrieval hit-rate@5 (catalog + policy, automated & objective)\n"]
    for condition in ("baseline", "translated"):
        lines.append(f"### {condition}\n")
        all_hits = [h for hits in results[condition].values() for h in hits]
        lines.append(f"- overall: {sum(all_hits)}/{len(all_hits)} ({100 * sum(all_hits) / len(all_hits):.0f}%)")
        for language in ("english", "taglish", "filipino"):
            hits = results[condition].get(language, [])
            if hits:
                lines.append(f"- {language}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")
        lines.append("")
    return "\n".join(lines)


def _accuracy_tallies(rows: list[dict]) -> tuple[dict, dict]:
    by_language: dict[str, list[int]] = defaultdict(list)
    by_capability: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        if r["accuracy_hit"] is None:
            continue
        by_language[r["language"]].append(int(r["accuracy_hit"]))
        by_capability[r["capability"]].append(int(r["accuracy_hit"]))
    return by_language, by_capability


def summarize_accuracy_console(rows: list[dict]) -> str:
    """Tallies only — no reply text. Model replies can contain characters
    (₱, ñ, etc.) the Windows console's cp1252 encoding can't print; the
    full transcript with replies goes to the UTF-8 results file instead,
    never to stdout."""
    by_language, by_capability = _accuracy_tallies(rows)
    lines = ["## Answer-accuracy proxy (automated substring match — NOT human-verified, see caveat below)\n"]
    lines.append("By language:")
    for language, hits in by_language.items():
        lines.append(f"- {language}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")
    lines.append("\nBy capability:")
    for capability, hits in by_capability.items():
        lines.append(f"- {capability}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")
    lines.append("\n(Full transcript with replies is in the results file, not printed here.)")
    return "\n".join(lines)


def summarize_accuracy(rows: list[dict]) -> str:
    by_language, by_capability = _accuracy_tallies(rows)
    lines = ["## Answer-accuracy proxy (automated substring match — NOT human-verified, see caveat below)\n"]
    lines.append("By language:")
    for language, hits in by_language.items():
        lines.append(f"- {language}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")
    lines.append("\nBy capability:")
    for capability, hits in by_capability.items():
        lines.append(f"- {capability}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")

    lines.append("\n### Full transcript (question / reply / automated verdict)\n")
    for r in rows:
        verdict = "[HIT]" if r["accuracy_hit"] else ("[MISS]" if r["accuracy_hit"] is False else "[N/A]")
        lines.append(f"**{r['id']}** ({r['language']}, {r['capability']}) {verdict}")
        lines.append(f"- Q: {r['query']}")
        lines.append(f"- A: {r['reply'][:400]}")
        lines.append("")

    return "\n".join(lines)


def main():
    admin = get_admin_client()
    queries = load_queries()

    print(f"Loaded {len(queries)} questions from {QUERY_SET_PATH.name}\n")

    print("=== Pass 1: retrieval hit-rate (catalog + policy) ===")
    retrieval_results = run_retrieval_pass(queries)
    print(summarize_retrieval(retrieval_results))

    if not check_server_up():
        print(f"API server not reachable at {API_URL} — skipping Pass 2 (answer-accuracy proxy).")
        print("Start it (pnpm dev:api) and re-run to get the full report.")
        accuracy_rows: list[dict] = []
        token = None
        cleanup = None
    else:
        print("=== Pass 2: answer-accuracy proxy (live /chat/message) ===")
        token, cleanup = setup_test_student(admin)
        try:
            accuracy_rows = run_accuracy_pass(queries, token)
        finally:
            teardown_test_student(admin, cleanup)
        print(summarize_accuracy_console(accuracy_rows))

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    report = [
        "# Phase 6 — Taglish handling and retrieval evaluation results\n",
        f"Run at {datetime.now(timezone.utc).isoformat()} against {len(queries)} questions "
        f"({QUERY_SET_PATH.relative_to(Path(__file__).parent.parent)}).\n",
        summarize_retrieval(retrieval_results),
    ]
    if accuracy_rows:
        report.append(summarize_accuracy(accuracy_rows))
    RESULTS_PATH.write_text("\n".join(report), encoding="utf-8")
    print(f"\nWrote {RESULTS_PATH}")


if __name__ == "__main__":
    main()
