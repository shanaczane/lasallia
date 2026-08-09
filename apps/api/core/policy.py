"""Chatbot Phase 4 — LRC handbook ingestion and chunking.

Mirrors core/embeddings.py's shape for a second document type. Chunks
by section, not fixed character count (plan 4.1) — a rule split across
two chunks retrieves as two half-answers. Each chunk keeps its section
title so an answer can cite it, and keeping a version/date means
re-ingesting a revised handbook replaces old chunks outright rather than
accumulating contradictory ones (plan 4.4).
"""

from supabase import Client


def chunk_handbook(text: str) -> list[dict]:
    """Splits handbook text into section-bounded chunks. Each returned
    dict has at least `chunk_text` and `section_title` — whole enough to
    be self-contained (plan 4.1: a chunk saying "the fine is ₱5.00" is
    useless without the sentence establishing what it applies to)."""
    raise NotImplementedError


def ingest_handbook(admin: Client, source_path: str, version: str) -> int:
    """Reads the handbook at `source_path`, chunks it, embeds each chunk
    (reusing core/embeddings.py's embed_text), and replaces any prior
    version's rows in policy_chunks — never accumulates alongside them.
    Returns the number of chunks stored."""
    raise NotImplementedError
