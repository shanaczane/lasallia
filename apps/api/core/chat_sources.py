"""Builds the "Sources" list shown under each chatbot reply.

Handbook sections are only listed if the reply actually names them, since
search returns several near misses the model doesn't use.
"""

import re

from schemas.chat import ChatSource


def citation_name(section_title: str) -> str:
    """Short name of a handbook section, e.g. "4.3.2.1. Loan Policies -
    Fines Table" becomes "Loan Policies"."""
    tail = section_title.split("—")[-1].strip()
    tail = re.sub(r"^[\d.]+\s*", "", tail)
    return tail.split(" - ")[0].strip()


def _name_variants(section_title: str) -> set[str]:
    """The ways a reply might name this section, lowercased."""
    variants = {citation_name(section_title)}
    for part in section_title.split("—"):
        part = re.sub(r"^[\d.]+\s*", "", part.strip())
        variants.add(part)
        variants.add(part.split(" - ")[0].strip())
    return {v.lower() for v in variants if len(v) >= 4}


def handbook_source(section_title: str, source_page: int | None) -> ChatSource:
    return ChatSource(
        kind="handbook",
        label=citation_name(section_title),
        detail=f"p. {source_page}" if source_page else None,
    )


def cited_handbook_sources(chunks: list[tuple[str, int | None]], reply: str) -> list[ChatSource]:
    """Handbook sections (section_title, source_page) the reply names,
    deduplicated by citation name, in retrieval order."""
    text = reply.lower()
    out: list[ChatSource] = []
    seen: set[str] = set()
    for title, page in chunks:
        name = citation_name(title)
        if name in seen:
            continue
        if any(v in text for v in _name_variants(title)):
            seen.add(name)
            out.append(handbook_source(title, page))
    return out


def book_source(book_id: str, title: str, call_number: str | None) -> ChatSource:
    return ChatSource(kind="book", label=title, detail=call_number or None, book_id=book_id)


def catalog_source(record_count: int) -> ChatSource:
    noun = "record" if record_count == 1 else "records"
    return ChatSource(kind="catalog", label="Library catalog", detail=f"{record_count} matching {noun}")


HOURS_SOURCE = ChatSource(kind="hours", label="Library operating hours", detail="Current LRC schedule")

ACCOUNT_SOURCES = {
    "get_my_loans": ChatSource(kind="account", label="Your library account", detail="Current loans"),
    "get_my_fines": ChatSource(kind="account", label="Your library account", detail="Fines"),
    "get_my_history": ChatSource(kind="account", label="Your library account", detail="Borrowing history"),
}
