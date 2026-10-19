# AI-written one-line summaries of reports. The AI only describes numbers
# core/reports.py already computed; it never calculates anything.

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
