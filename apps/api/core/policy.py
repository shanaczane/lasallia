"""Loads the LRC handbook into searchable chunks for the chatbot.

Splits by section (not by length) so a rule isn't cut in half, and keeps
each section's title so answers can cite it. Uses pdfplumber because it
keeps table rows together; other tools mixed up the hours and fines tables.
"""

import re

import pdfplumber
from supabase import Client

from core.embeddings import DEFAULT_MODEL, embed_text

MIN_CHUNK_CHARS = 80

# Header lines repeated on every page, removed line by line.
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

# Section headings: "I. INTRODUCTION" (top level) and "3.2.1. The school ID"
# (subsections). Lettered bullets like "C. Legal forms" also match the roman
# numeral pattern, so top-level headings must also be ALL CAPS (checked below).
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
    """PDF to text: a page marker, the page's text, then its tables as
    "Label: Value" lines."""
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
    """Removes page headers and page markers. Also returns where each page
    starts, so chunks can be tagged with their page number."""
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
    """Splits the handbook into one chunk per section, each with
    `chunk_text`, `section_title` and `source_page`."""
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
    """Loads a .pdf (or already-extracted .txt) handbook, embeds each chunk
    and replaces that version's old chunks. Returns how many were stored."""
    if source_path.lower().endswith(".pdf"):
        text = extract_pdf_text(source_path)
    else:
        # Replace odd bytes from the PDF rather than crash on them.
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

    # Replace this version's old chunks instead of adding duplicates.
    admin.table("policy_chunks").delete().eq("version", version).execute()
    admin.table("policy_chunks").insert(rows).execute()
    return len(rows)
