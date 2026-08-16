# apps/api/core/report_summaries.py
# Reports plan, Phase 3 — AI narrates already-computed report data, and
# only that. Same "narrates, doesn't decide" boundary as
# core/weeding.py's narrate() and every other AI feature in this
# codebase: the numbers are already final by the time this file sees
# them (core/reports.py already did the real work), so there is nothing
# left for AI to compute, decide, or discover — only to describe.

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from openai import OpenAI
from pydantic import BaseModel

from core.config import OPENAI_API_KEY

SUMMARY_MODEL = "gpt-4o-mini"
_SUMMARY_SYSTEM_PROMPT = (
    "You write a one or two sentence, plain-English summary of a library report "
    "for a librarian. You are given the exact data already computed for this report "
    "— summarize what it shows, but never state a number, trend, or fact that isn't "
    "directly present in the data given. If the data is empty or all zero, say so "
    "plainly rather than inventing something to say."
)

_client: OpenAI | None = None


def _get_client() -> OpenAI | None:
    global _client
    if not OPENAI_API_KEY:
        return None
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _serialize(payload: Any) -> str:
    if isinstance(payload, BaseModel):
        return payload.model_dump_json()
    if isinstance(payload, list):
        return "[" + ", ".join(p.model_dump_json() if isinstance(p, BaseModel) else str(p) for p in payload) + "]"
    return str(payload)


def summarize(report_name: str, payload: Any) -> str | None:
    """Returns None — not an error, not a placeholder string — when
    OPENAI_API_KEY isn't configured or the call fails for any reason.
    There's no deterministic fallback text for a "summary" the way
    core/weeding.py's narrate() has heuristic_reason to fall back to, so
    the honest behavior here is showing nothing for that report rather
    than something fabricated."""
    client = _get_client()
    if client is None:
        return None
    try:
        res = client.chat.completions.create(
            model=SUMMARY_MODEL,
            messages=[
                {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": f"Report: {report_name}\nData: {_serialize(payload)}"},
            ],
        )
        text = (res.choices[0].message.content or "").strip()
        return text or None
    except Exception:
        return None


def summarize_many(payloads: dict[str, Any]) -> dict[str, str | None]:
    """Runs summarize() for every (report_name, payload) pair
    concurrently — seven sequential gpt-4o-mini round trips would
    otherwise stack into multi-second latency for one page load, same
    reasoning as core/recommendations.py's use of ThreadPoolExecutor for
    parallel Supabase calls."""
    if not payloads:
        return {}
    with ThreadPoolExecutor(max_workers=len(payloads)) as pool:
        futures = {name: pool.submit(summarize, name, payload) for name, payload in payloads.items()}
        return {name: future.result() for name, future in futures.items()}
