# apps/api/core/accession.py
# Some physical accession-number barcode labels were printed with
# different zero-padding than what's actually stored in
# book_copies.accession_number (e.g. a label reading "T0045313" for a copy
# whose real accession number is "T45313") — these labels predate this
# app and nothing here generates or reprints them, so a scan has to
# tolerate the drift rather than the database chasing every label's
# padding. Every accession-number lookup or comparison in the API should
# run the input through this first.

import re

_SHAPE = re.compile(r"^([A-Za-z]+)0*(\d+)$")

def normalize_accession_number(raw: str) -> str:
    stripped = (raw or "").strip()
    match = _SHAPE.match(stripped)
    if not match:
        return stripped
    prefix, digits = match.groups()
    return f"{prefix}{digits}"
