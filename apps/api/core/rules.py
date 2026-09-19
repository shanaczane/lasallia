# apps/api/core/rules.py
# Rule-based fast path for the chatbot (thesis: "Hybrid Rule-Based and
# NLP-Driven"). A keyword/regex matcher over a small fixed set of policy
# intents, in English, Filipino and Taglish. NOT a classifier.
#
# The answer text is never hardcoded: each intent points at a policy_chunks
# row (by section_title) and pulls the relevant line(s) out of that row's
# chunk_text, so re-ingesting a revised handbook changes the answers with
# no code change. A miss (no match, ambiguous match, chunk missing, line not
# found) returns None and routers/chat.py falls through to the RAG path
# exactly as before — a miss must cost nothing.

import re
import time

from core.supabase import get_admin_client

MAX_MESSAGE_CHARS = 200


def _normalize(message: str) -> str:
    text = message.lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text).strip()


# Questions about the student's OWN account (or anyone's) belong to the
# account tools in the RAG path, never to a policy rule.
_ACCOUNT_RE = re.compile(
    r"\b(my|mine)\s+(fines?|loans?|books?|account|balance|due|history|borrow\w*)\b"
    r"|\bmy\b.*\b(due|overdue|fines?|multa)\b"
    r"|\bdo i (have|owe)\b|\bi owe\b|\bhow much do i owe\b"
    r"|\b(fine|multa|utang|balance|due)\s+ko\b|\bakong\b|\bako ba\b"
    r"|\b(may|meron|mayroon)\b.*\bako\b"
)

# Each intent: a list of regexes, any one of which matching is enough.
_INTENT_PATTERNS: dict[str, list[re.Pattern]] = {
    "hours": [
        re.compile(p) for p in [
            r"\b(library|lrc|aklatan)\s+(hours|schedule|time)\b",
            r"\bopen(ing)?\s+(hours|time|schedule)\b",
            r"\bhours of (service|operation)\b",
            r"\b(what|anong|ano|when|kailan)\b.*\b(time|oras)\b.*\b(open|close|closing|bukas|sara|magbukas|magsara)",
            r"\b(saturday|sabado)\b.*\b(open|bukas)\b|\b(open|bukas)\b.*\b(saturday|sabado)\b",
            r"\bbukas ba\b|\bmagbubukas\b|\bmagsasara\b|\boras ng (library|lrc|aklatan)\b",
            r"\bwhat time\b.*\b(open|close)\b",
        ]
    ],
    "fine_general": [
        re.compile(p) for p in [
            r"\b(fines?|multa|penalt(y|ies)|late fees?|overdue fees?)\b",
            r"\boverdue\b|\bnaantala\b|\bnahuli\b|\bnalampasan\b|\blagpas sa due\b",
            r"\blate\b.*\b(return|isauli|isoli|pagsauli|pagsoli|mag-?return|book|libro|fee|magkano|how much|due)\b",
            r"\b(return|isauli|isoli|pagsauli|mag-?return)\b.*\blate\b",
        ]
    ],
    "fine_reserve": [
        re.compile(p) for p in [
            r"\bhourly fines?\b|\bfines? per hour\b|\bper library hour\b",
            r"\b(multa|fine)\b.*\b(kada|bawat|sa|per)\s+oras\b",
        ]
    ],
    "lost_damaged": [],  # built from two-part rule below
    "borrow_limit": [
        re.compile(p) for p in [
            r"\bborrow(ing)?\s+(limit|max\w*)\b|\bloan period\b|\bloan limit\b",
            r"\bhow many\b.*\b(books?|items?|titles?)\b.*\b(borrow|check ?out|take|at a time)\b",
            r"\bmax\w*\b.*\b(books?|items?)\b.*\bborrow\b",
            r"\bhow long\b.*\b(borrow|keep|can i have)\b",
            r"\b(ilan|ilang)\b.*\b(libro|books?)\b.*\b(hiram|pwede|puwede|maaari|borrow)\b",
            r"\bhanggang ilan\b.*\b(libro|books?)\b|\b(gaano katagal|ilang araw)\b.*\b(hiram|borrow|hihiramin)\b",
            r"\blimit\b.*\b(libro|hiram)\b",
        ]
    ],
    "visitor": [],  # built from two-part rule below
}

_RESERVE_RE = re.compile(r"\breserve[sd]?\b(?!\s+(a|an|the|this|that)\b)|\breserve books?\b|\bstory ?books?\b|\bbible\b")
_FINE_WORD_RE = re.compile(
    r"\b(fines?|multa|penalt(y|ies)|late|overdue|hourly|per hour|kada oras|bawat oras|naantala|nahuli)\b"
)
_LOST_RE = re.compile(r"\b(lost|damaged?|nawala|nasira|nawawala|napunit|natapon|sira)\b")
_LOST_CUE_RE = re.compile(
    r"\b(fee|fees|bayad|multa|fine|penalt(y|ies)|replace|replacement|palit|magkano|how much|cost|charge|processing|"
    r"book|books|libro|item|material|materials|card)\b"
)
_VISITOR_RE = re.compile(
    r"\b(visitors?|visiting|guests?|alumni|alumnus|outsiders?|outside researchers?|bisita|panauhin|dayo|non-?dlsl|nocei|walk-?in)\b"
)
_VISITOR_CUE_RE = re.compile(
    r"\b(requirements?|require\w*|need|allowed|allow|can|may|rules?|guidelines?|fee|schedule|kailangan|pwede|puwede|"
    r"pumasok|enter|visit|bring|dala|access|use|gamitin|magkano|bayad|id)\b"
)

INTENTS = ("hours", "fine_general", "fine_reserve", "lost_damaged", "borrow_limit", "visitor")


def match_intent(message: str) -> str | None:
    """The single policy intent a message is unambiguously asking about, or
    None (no match, account question, or more than one topic at once — all
    of which should go to the RAG path)."""
    text = _normalize(message)
    if not text or len(text) > MAX_MESSAGE_CHARS or _ACCOUNT_RE.search(text):
        return None

    hits: set[str] = set()
    for intent, patterns in _INTENT_PATTERNS.items():
        if any(p.search(text) for p in patterns):
            hits.add(intent)
    if _LOST_RE.search(text) and _LOST_CUE_RE.search(text):
        hits.add("lost_damaged")
    if _VISITOR_RE.search(text) and _VISITOR_CUE_RE.search(text):
        hits.add("visitor")
    if _RESERVE_RE.search(text) and _FINE_WORD_RE.search(text):
        hits.add("fine_reserve")

    # More specific intents subsume the general fine intent.
    if hits & {"lost_damaged", "fine_reserve"}:
        hits.discard("fine_general")
    return next(iter(hits)) if len(hits) == 1 else None


# ─── Answers, sourced from policy_chunks ────────────────────────────────

# section_title ilike key per intent. The fines table chunk holds the
# general, reserve and lost/damaged rates together, so those three share it.
_SECTION_KEY = {
    "hours": "Hours of Service",
    "fine_general": "Loan Policies - Fines Table",
    "fine_reserve": "Loan Policies - Fines Table",
    "lost_damaged": "Loan Policies - Fines Table",
    "borrow_limit": "4.3.2.1. Loan Policies",
    "visitor": "GUIDELINES FOR VISITING USERS",
}


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _first_line(chunk: str, pattern: str) -> str | None:
    m = re.search(pattern, chunk, re.MULTILINE | re.IGNORECASE)
    return m.group(0).strip() if m else None


def _extract(intent: str, chunk: str) -> str | None:
    if intent == "fine_general":
        return _first_line(chunk, r"^Non-Reserve[^\n]*Php\s*[\d.]+[^\n]*$")
    if intent == "fine_reserve":
        return _first_line(chunk, r"^Reserve books:?\s*Php\s*[\d.]+[^\n]*$")
    if intent == "lost_damaged":
        flat = _flat(chunk)
        fee = re.search(r"Lost and/or Damaged\s+Php\s*[\d.]+\s*processing fee\.?", flat, re.IGNORECASE)
        rule = re.search(r"Library Materials will be paid for or replaced.*?plus processing fee", flat, re.IGNORECASE)
        if not fee:
            return None
        return fee.group(0) + (f" (Library materials will be {rule.group(0).split('will be', 1)[1].strip()}.)" if rule else "")
    if intent == "borrow_limit":
        body = chunk.split("\n", 1)[1].strip() if "\n" in chunk else ""
        return body or None
    if intent == "hours":
        lines = re.findall(r"^(?:Monday-Friday|Wednesday) \([^)]*\)[^\n:]*:[^\n]*$", chunk, re.MULTILINE)
        return "\n".join(l.strip() for l in lines) or None
    if intent == "visitor":
        body = chunk.split("\n", 1)[1].strip() if "\n" in chunk else ""
        if not body:
            return None
        cut = body[:900]
        return cut[: cut.rfind("\n")] if len(body) > 900 and "\n" in cut else cut
    return None


def _citation_name(section_title: str) -> str:
    tail = section_title.split("—")[-1].strip()
    tail = re.sub(r"^[\d.]+\s*", "", tail)
    return tail.split(" - ")[0].strip()


def answer_for(intent: str) -> str | None:
    """The cited handbook answer for an intent, or None if the chunk or the
    expected line isn't there (caller falls through to RAG)."""
    try:
        rows = (
            get_admin_client().table("policy_chunks")
            .select("section_title, chunk_text")
            .ilike("section_title", f"%{_SECTION_KEY[intent]}%")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
    except Exception as e:
        print(f"rules.answer_for() lookup failed ({intent}): {e}")
        return None
    if not rows:
        return None
    extracted = _extract(intent, rows[0]["chunk_text"])
    if not extracted:
        return None
    return f"According to the {_citation_name(rows[0]['section_title'])} section:\n{extracted}"


def match_and_answer(message: str) -> tuple[str, str] | None:
    """(intent, reply) when the rule path can answer, else None."""
    intent = match_intent(message)
    if intent is None:
        return None
    reply = answer_for(intent)
    return (intent, reply) if reply else None


# ─── Instrumentation ────────────────────────────────────────────────────
# In-memory like core/rate_limit.py: single-instance deployment, resets on
# restart, no new dependency. Each request also prints one log line.

_stats: dict[str, dict[str, float]] = {
    "rule": {"count": 0, "total_ms": 0.0},
    "rag": {"count": 0, "total_ms": 0.0},
}


def record(path: str, started_at: float, intent: str | None = None) -> float:
    """Log which path handled a request and its latency; returns ms."""
    ms = (time.perf_counter() - started_at) * 1000
    _stats[path]["count"] += 1
    _stats[path]["total_ms"] += ms
    print(f"chat path={path} latency_ms={ms:.0f}" + (f" intent={intent}" if intent else ""))
    return ms


def get_stats() -> dict[str, dict[str, float]]:
    return {
        path: {
            "count": s["count"],
            "avg_ms": round(s["total_ms"] / s["count"], 1) if s["count"] else 0.0,
        }
        for path, s in _stats.items()
    }
