# AI-written one-line summaries of reports. The AI only describes numbers
# core/reports.py already computed; it never calculates anything.
#
# Privacy: only totals and breakdowns are sent to OpenAI. Reports with rows
# about people (overdue loans, top patrons) are aggregated first by the
# functions below, so no name, email, ID number or accession number leaves
# the server (tests/test_report_export_ai.py).

import json
from collections import Counter
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
        return "[" + ", ".join(
            p.model_dump_json() if isinstance(p, BaseModel) else json.dumps(p, ensure_ascii=False) for p in payload
        ) + "]"
    if isinstance(payload, dict):
        return json.dumps(payload, ensure_ascii=False)
    return str(payload)


def aggregate_overdue(rows: list) -> dict:
    """Overdue loans as counts only (no borrower or book details)."""
    days = [r.daysOverdue for r in rows]
    return {
        "overdue_loans": len(rows),
        "total_fines_php": round(sum(float(r.fine) for r in rows), 2),
        "average_days_overdue": round(sum(days) / len(days), 1) if days else 0,
        "longest_days_overdue": max(days, default=0),
        "loans_by_program": dict(sorted(Counter(r.program for r in rows).items())),
        "loans_by_year_level": dict(sorted(Counter(r.year for r in rows).items())),
    }


def aggregate_top_patrons(rows: list) -> list[dict]:
    """Top borrowers by rank, program and loan count, without names."""
    return [{"rank": i, "program": r.program, "loans": r.count} for i, r in enumerate(rows, start=1)]


def summarize_aggregate(report_name: str, payload: dict) -> str | None:
    """Summary of an already-aggregated report (core/report_export)."""
    return summarize(report_name, json.dumps(payload, ensure_ascii=False))


def summarize(report_name: str, payload: Any) -> str | None:
    """Returns None if there's no OpenAI key or the call fails, so the page
    shows no summary rather than a made-up one."""
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
    """Summarizes all reports in parallel, so the page doesn't wait for
    each AI call in turn."""
    if not payloads:
        return {}
    with ThreadPoolExecutor(max_workers=len(payloads)) as pool:
        futures = {name: pool.submit(summarize, name, payload) for name, payload in payloads.items()}
        return {name: future.result() for name, future in futures.items()}
