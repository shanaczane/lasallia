# Normalizes accession numbers before any lookup. Some old barcode labels
# have extra zero-padding ("T0045313" for stored "T45313"), so strip it.

import re

_SHAPE = re.compile(r"^([A-Za-z]+)0*(\d+)$")

def normalize_accession_number(raw: str) -> str:
    stripped = (raw or "").strip()
    match = _SHAPE.match(stripped)
    if not match:
        return stripped
    prefix, digits = match.groups()
    return f"{prefix}{digits}"
