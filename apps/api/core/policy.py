"""Chatbot Phase 4 — LRC handbook ingestion and chunking.

Mirrors core/embeddings.py's shape for a second document type. Chunks
by section, not fixed character count (plan 4.1) — a rule split across
two chunks retrieves as two half-answers. Each chunk keeps its section
title so an answer can cite it, and keeping a version/date means
re-ingesting a revised handbook replaces old chunks outright rather than
accumulating contradictory ones (plan 4.4).

Text extraction: pdfplumber, not a plain `pdftotext -layout` subprocess.
Measured directly against this handbook's own tables (the Hours of
Service and Loan Policies/fines tables): pdftotext's positional text
flow scrambles multi-column tables into the wrong row/column pairing —
it read Saturday's hours as the College's Monday-Friday hours, a wrong
answer the model would have cited as if authoritative. pdfplumber's
extract_tables() preserves real row structure, so table rows are
flattened as explicit "Label: Value" lines instead of trusting
positional reading order.
"""

import re

import pdfplumber
from supabase import Client

from core.embeddings import DEFAULT_MODEL, embed_text

MIN_CHUNK_CHARS = 80

# Repeats verbatim on every page of this document (doc-control header,
# title bar, page-number line) — filtered by exact/pattern line match
# rather than a single multi-line regex, which broke the moment the
# extractor (and therefore exact whitespace/line-wrap) changed. A
# per-line filter is robust to that in a way a block regex isn't.
_BOILERPLATE_LINES = {
    "DE LA SALLE LIPA",
    "INSTITUTIONAL QUALITY ASSURANCE OFFICE",
    "Title:",
    "Procedures",
}
_BOILERPLATE_LINE_RES = [
    re.compile(r"^Supersedes:"),
    re.compile(r"^LRC-VCA-001\b"),
    re.compile(r"^Page:\s*$"),
    re.compile(r"^\d+ of \d+\s*$"),
    re.compile(r"^LRC Manual of Policies, Guidelines, Standards and\s*$"),
    re.compile(r"^Date Issued:\s*Date Effective:\s*$"),
]

_PAGE_MARKER_RE = re.compile(r"^Page: (\d+) of (\d+)\s*$")

# Top-level roman-numeral sections ("I. INTRODUCTION") and numbered
# subsection headings ("9. LIBRARY PATRONS", "3.2.1. The school ID...").
# The handbook's own numbering restarts across sections (there are two
# "10."s) — tolerated rather than "fixed", since citing "section 10
# (Referral Services)" is still unambiguous once paired with the nearest
# enclosing roman-numeral heading.
#
# [IVXLC]+ alone also matches single letters from this document's
# lettered sub-bullets ("C. Legal forms", "F. General dictionary") since
# C/L/V/I/X are individually valid roman numerals — those are Title Case,
# while every real top-level heading in this document is ALL CAPS, so
# .isupper() is the actual disambiguator, checked after the regex match.
_TOP_SECTION_RE = re.compile(r"^([IVXLC]+)\.\s+([A-Z][A-Za-z\s\-/]+)\s*$")
_SUBSECTION_RE = re.compile(r"^(\d+(?:\.\d+)*)\.\s+([A-Z][A-Za-z0-9\s,()/&\-]{2,60})\s*$")


def _clean_cell(v: str | None) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", v).strip()


def _is_boilerplate_table_row(row: list) -> bool:
    joined = " ".join(_clean_cell(c) for c in row)
    return (
        "DE LA SALLE LIPA" in joined
        or "LRC-VCA-001" in joined
        or "LRC Manual of Policies" in joined
        or not joined.strip()
    )


def extract_pdf_text(pdf_path: str) -> str:
    """Renders a PDF to the plain-text format chunk_handbook expects:
    page markers (`\\x0cPage: N of TOTAL`) followed by that page's prose,
    followed by any tables on that page flattened into unambiguous
    "Label: Value" lines. See the module docstring for why tables get
    special handling instead of trusting extract_text() alone."""
    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            parts.append(f"\x0cPage: {i + 1} of {total}\n\n")
            parts.append(page.extract_text() or "")
            parts.append("\n")

            clean_rows = []
            for table in page.extract_tables():
                for row in table:
                    if _is_boilerplate_table_row(row):
                        continue
                    cells = [_clean_cell(c) for c in row]
                    if len(cells) >= 2 and cells[0] and cells[1]:
                        clean_rows.append(f"{cells[0]}: {cells[1]}")
                    elif cells and cells[0]:
                        clean_rows.append(cells[0])

            if clean_rows:
                parts.append("\n[Table data on this page]\n")
                parts.append("\n".join(clean_rows))
                parts.append("\n")

    return "".join(parts)


def _strip_boilerplate(text: str) -> tuple[str, dict[int, int]]:
    """Removes the repeating per-page header lines and the `\\x0cPage: N
    of TOTAL` markers themselves. Returns the cleaned text plus a char
    offset -> page-number map, used to tag chunks with source_page."""
    cleaned_lines: list[str] = []
    page_at_offset: dict[int, int] = {}
    current_page: int | None = None
    running_len = 0

    for raw_line in text.split("\n"):
        line = raw_line.lstrip("\x0c")
        marker = _PAGE_MARKER_RE.match(line.strip())
        if marker:
            current_page = int(marker.group(1))
            page_at_offset[running_len] = current_page
            continue
        stripped = line.strip()
        if stripped in _BOILERPLATE_LINES or any(p.match(stripped) for p in _BOILERPLATE_LINE_RES):
            continue
        cleaned_lines.append(line)
        running_len += len(line) + 1

    return "\n".join(cleaned_lines), page_at_offset


def chunk_handbook(text: str) -> list[dict]:
    """Splits handbook text into section-bounded chunks. Each returned
    dict has `chunk_text`, `section_title`, and `source_page` — whole
    enough to be self-contained (plan 4.1: a chunk saying "the fine is
    ₱5.00" is useless without the sentence establishing what it applies
    to)."""
    cleaned, page_map = _strip_boilerplate(text)
    page_offsets = sorted(page_map.keys())

    def page_for(offset: int) -> int | None:
        page = None
        for o in page_offsets:
            if o <= offset:
                page = page_map[o]
            else:
                break
        return page

    lines = cleaned.split("\n")
    chunks: list[dict] = []
    top_section = ""
    sub_section = ""
    buffer: list[str] = []
    buffer_start_offset = 0
    offset = 0

    def flush():
        body = "\n".join(buffer).strip()
        if len(body) < MIN_CHUNK_CHARS:
            return
        title = f"{top_section} — {sub_section}" if sub_section else top_section
        chunks.append({
            "chunk_text": body,
            "section_title": title or "LRC Manual",
            "source_page": page_for(buffer_start_offset),
        })

    for line in lines:
        stripped = line.strip()
        raw_top_match = _TOP_SECTION_RE.match(stripped)
        top_match = raw_top_match if raw_top_match and raw_top_match.group(2).isupper() else None
        sub_match = _SUBSECTION_RE.match(stripped) if not top_match else None

        if top_match:
            flush()
            buffer = []
            buffer_start_offset = offset
            top_section = stripped
            sub_section = ""
        elif sub_match:
            flush()
            buffer = []
            buffer_start_offset = offset
            sub_section = stripped

        buffer.append(line)
        offset += len(line) + 1

    flush()
    return chunks


def ingest_handbook(admin: Client, source_path: str, version: str) -> int:
    """Reads the handbook at `source_path` — a .pdf (extracted here via
    pdfplumber) or an already-extracted .txt in chunk_handbook's expected
    format — chunks it, embeds each chunk (reusing core/embeddings.py's
    embed_text), and replaces any prior version's rows in policy_chunks
    — never accumulates alongside them (plan 4.4). Returns the number
    of chunks stored."""
    if source_path.lower().endswith(".pdf"):
        text = extract_pdf_text(source_path)
    else:
        # errors="replace": PDF font encodings occasionally produce a
        # stray byte that doesn't round-trip cleanly to UTF-8 (observed:
        # a soft-hyphen, 0xAD). Losing one odd character beats crashing.
        with open(source_path, encoding="utf-8", errors="replace") as f:
            text = f.read()

    chunks = chunk_handbook(text)
    if not chunks:
        return 0

    rows = []
    for c in chunks:
        embedding = embed_text(c["chunk_text"], model=DEFAULT_MODEL)
        rows.append({
            "chunk_text": c["chunk_text"],
            "section_title": c["section_title"],
            "source_page": c["source_page"],
            "version": version,
            "embedding": embedding,
        })

    # Replace, not accumulate: delete this version's prior rows (a
    # re-ingest of the same version means "the extraction changed, not
    # the policy") before inserting the fresh set.
    admin.table("policy_chunks").delete().eq("version", version).execute()
    admin.table("policy_chunks").insert(rows).execute()
    return len(rows)
