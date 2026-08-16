# apps/api/core/weeding.py
# Reports plan, Phase 2 — weeding candidates: a deterministic heuristic
# decides what gets flagged (low/zero borrows over a lookback window +
# old), AI only narrates that decision in plain English. Same "AI
# narrates, doesn't decide" boundary the chatbot and recommendations
# modules already hold to. If OPENAI_API_KEY isn't configured, or the
# call fails for any reason, the feature still works — every candidate
# falls back to its heuristic_reason untouched. A weeding report that
# silently stopped working without an API key would violate the same
# "must degrade, never blank" principle the recommendations plan states
# outright.

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from openai import OpenAI
from supabase import Client

from core.config import OPENAI_API_KEY

# Policy thresholds — genuinely a librarian judgment call, not a
# technical one. Kept as named constants in one place, not scattered,
# same as the recommendations plan's COOCCURRENCE_ALPHA.
WEEDING_LOOKBACK_MONTHS = 24
WEEDING_MAX_BORROWS_IN_WINDOW = 1  # 0 or 1 borrow in the window counts as "low"
WEEDING_MIN_AGE_YEARS = 5.0  # by published_year, falling back to created_at if published_year is missing

NARRATION_MODEL = "gpt-4o-mini"
_NARRATION_SYSTEM_PROMPT = (
    "You write one short, plain-English sentence explaining why a library book was "
    "flagged as a weeding candidate. You are given the exact facts already established "
    "by a deterministic rule — restate every one of those facts naturally in your "
    "sentence, dropping none of them, but never add a claim, number, or reason that "
    "isn't in the facts given. No recommendation about whether to keep or remove it — "
    "that's the librarian's call, not yours."
)

_client: OpenAI | None = None


def _get_client() -> OpenAI | None:
    global _client
    if not OPENAI_API_KEY:
        return None
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


@dataclass
class WeedingCandidateData:
    book_id: str
    title: str
    author: str
    category: str
    published_year: int | None
    borrow_count_in_window: int
    years_since_added: float
    heuristic_reason: str


def _heuristic_reason(borrow_count: int, published_year: int | None, years_since_added: float) -> str:
    window_years = WEEDING_LOOKBACK_MONTHS // 12
    borrow_clause = (
        f"{borrow_count} borrow{'s' if borrow_count != 1 else ''} in the last {window_years} years"
    )
    if published_year:
        age_clause = f"published {published_year}"
    else:
        age_clause = f"added to the catalog {years_since_added:.0f} years ago"
    return f"{borrow_clause}; {age_clause}."


def find_weeding_candidates(admin: Client) -> list[WeedingCandidateData]:
    """Live heuristic scan — no precompute, no staleness. This is a
    librarian-triggered report, not a student-facing hot path, so it
    doesn't need Phase 5's precompute treatment; it just needs to be
    correct and current, same as every other report in core/reports.py."""
    now = datetime.now(timezone.utc)
    lookback_start = now - timedelta(days=WEEDING_LOOKBACK_MONTHS * 30)

    books = (
        admin.table("books")
        .select("id, title, author, category, published_year, created_at")
        .is_("archived_at", "null")
        .is_("weeding_dismissed_at", "null")
        .execute()
    ).data
    if not books:
        return []

    book_ids = [b["id"] for b in books]
    copies = admin.table("book_copies").select("id, book_id").in_("book_id", book_ids).execute().data
    copy_to_book = {c["id"]: c["book_id"] for c in copies}
    copy_ids = list(copy_to_book.keys())

    borrow_counts: dict[str, int] = {}
    if copy_ids:
        loans = (
            admin.table("loans")
            .select("book_copy_id")
            .in_("book_copy_id", copy_ids)
            .gte("borrowed_at", lookback_start.isoformat())
            .execute()
        ).data
        for loan in loans:
            book_id = copy_to_book.get(loan["book_copy_id"])
            if book_id:
                borrow_counts[book_id] = borrow_counts.get(book_id, 0) + 1

    candidates = []
    for b in books:
        borrow_count = borrow_counts.get(b["id"], 0)
        if borrow_count > WEEDING_MAX_BORROWS_IN_WINDOW:
            continue

        years_since_added = (now - datetime.fromisoformat(b["created_at"])).days / 365.25
        published_year = b.get("published_year")
        age_years = (now.year - published_year) if published_year else years_since_added
        if age_years < WEEDING_MIN_AGE_YEARS:
            continue

        candidates.append(WeedingCandidateData(
            book_id=b["id"],
            title=b["title"],
            author=b["author"],
            category=b.get("category") or "Uncategorized",
            published_year=published_year,
            borrow_count_in_window=borrow_count,
            years_since_added=years_since_added,
            heuristic_reason=_heuristic_reason(borrow_count, published_year, years_since_added),
        ))

    candidates.sort(key=lambda c: (c.borrow_count_in_window, -c.years_since_added))
    return candidates


def narrate(candidate: WeedingCandidateData) -> str:
    """Returns an AI-polished version of candidate.heuristic_reason, or
    the heuristic_reason itself if no key is configured or the call
    fails for any reason."""
    client = _get_client()
    if client is None:
        return candidate.heuristic_reason
    try:
        res = client.chat.completions.create(
            model=NARRATION_MODEL,
            messages=[
                {"role": "system", "content": _NARRATION_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"Title: {candidate.title}\n"
                    f"Facts: {candidate.heuristic_reason}"
                )},
            ],
        )
        text = (res.choices[0].message.content or "").strip()
        return text or candidate.heuristic_reason
    except Exception:
        return candidate.heuristic_reason


def _log_event(admin: Client, book_id: str, event_type: str, reason: str | None, performed_by: str | None) -> None:
    admin.table("weeding_events").insert({
        "book_id": book_id,
        "event_type": event_type,
        "reason": reason,
        "performed_by": performed_by,
    }).execute()


def archive_book(admin: Client, book_id: str, performed_by: str, reason: str | None = None) -> None:
    admin.table("books").update({"archived_at": datetime.now(timezone.utc).isoformat()}).eq("id", book_id).execute()
    _log_event(admin, book_id, "archived", reason, performed_by)


def restore_book(admin: Client, book_id: str, performed_by: str) -> None:
    admin.table("books").update({"archived_at": None}).eq("id", book_id).execute()
    _log_event(admin, book_id, "restored", None, performed_by)


def dismiss_candidate(admin: Client, book_id: str, performed_by: str, reason: str | None = None) -> None:
    """Librarian looked at a flagged candidate and decided to keep it —
    excluded from future candidate scans from here on, distinct from
    archiving (the book stays fully in the live catalog)."""
    admin.table("books").update({"weeding_dismissed_at": datetime.now(timezone.utc).isoformat()}).eq("id", book_id).execute()
    _log_event(admin, book_id, "dismissed", reason, performed_by)


def get_weeding_events(admin: Client, limit: int = 50) -> list[dict]:
    rows = (
        admin.table("weeding_events")
        .select("*, books(title), profiles(full_name)")
        .order("occurred_at", desc=True)
        .limit(limit)
        .execute()
    ).data
    events = []
    for r in rows:
        book = r.pop("books", None)
        profile = r.pop("profiles", None)
        r["book_title"] = book["title"] if book else None
        r["performed_by_name"] = profile["full_name"] if profile else None
        events.append(r)
    return events
