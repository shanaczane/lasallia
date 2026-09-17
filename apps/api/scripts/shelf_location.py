# apps/api/scripts/shelf_location.py
# Maps an LRC call number to a shelf aisle, based on the photographed aisle
# chart (General Collection: aisles 1-4, Reference: 5-6, Fiction: 7-8,
# Filipiniana: 9-12 — Filipiniana aisles are numbered in descending shelf
# order, so ascending call-number order runs 12, 11, 10, 9).
#
# The chart itself warns some letters were hard to read off the signs, so
# every numeric boundary below is an approximation of what was photographed,
# not an exact transcription. Two known gaps, left unassigned rather than
# guessed:
#   - GS/SP/S-prefixed call numbers aren't on the chart at all (Graduate
#     School / Special collections, presumably shelved elsewhere).
#   - REF-prefixed call numbers outside the low/high bounds seen below.
# FIL call numbers below the chart's lowest Filipiniana range (226.507) are
# placed in Aisle 12 anyway (the lowest-numbered Filipiniana aisle) per an
# explicit call made when this was written, not something the chart confirms.

import re

UNASSIGNED = {"aisle": None, "shelf_location": "Unassigned"}

_PREFIX_RE = re.compile(r"^(REF|FIL|FIC|GS|SP|S)\b\s*")
_DEWEY_RE = re.compile(r"^(\d+(?:\.\d+)?)")
_CUTTER_RE = re.compile(r"^([A-Za-z]+)(\d*)([A-Za-z]*)")

# Collections the chart doesn't cover at all.
_UNMAPPED_PREFIXES = {"GS", "SP", "S"}

# (aisle, upper_bound) — General Collection continues past Aisle 4 (910.2373)
# as the low end of Aisle 5, before Reference call numbers start.
_GENERAL_RANGES = [
    (1, 364.973),
    (2, 658.4013),
    (3, 796.4252),
    (4, 910.2373),
    (5, float("inf")),
]

# (aisle, upper_bound) — Reference spans Aisle 5 (low end) through Aisle 6.
_REF_RANGES = [
    (5, 370.3),
    (6, float("inf")),
]

# (aisle, upper_bound) — Filipiniana, ascending call-number order (12 lowest).
_FIL_RANGES = [
    (12, 371.32),
    (11, 657.45),
    (10, 899.21),
    (9, float("inf")),
]


def _cutter_key(cutter: str | None) -> tuple:
    """Sortable key for a Cutter code like 'L772c' — the digit run is a
    decimal fraction (0.772), not an integer, so 'B974' < 'B99' just like
    0.974 < 0.99."""
    if not cutter:
        return ("", 0.0, "")
    m = _CUTTER_RE.match(cutter)
    if not m:
        return (cutter.upper(), 0.0, "")
    letters, digits, suffix = m.groups()
    frac = float("0." + digits) if digits else 0.0
    return (letters.upper(), frac, suffix.lower())


_FIC_BOUNDARY = _cutter_key("L772c")  # <= this -> Aisle 7, else Aisle 8


def _aisle_result(aisle: int) -> dict:
    return {"aisle": f"Aisle {aisle}", "shelf_location": f"Aisle {aisle}"}


def classify_call_number(call_number: str | None) -> dict:
    """Returns {"aisle": "Aisle N" | None, "shelf_location": str} for a raw
    call number string. Unrecognized / unmapped call numbers come back as
    UNASSIGNED rather than a guessed aisle."""
    s = (call_number or "").strip()
    if not s:
        return dict(UNASSIGNED)

    m = _PREFIX_RE.match(s)
    prefix = m.group(1) if m else None
    rest = s[m.end():] if m else s

    if prefix in _UNMAPPED_PREFIXES:
        return dict(UNASSIGNED)

    if prefix == "FIC":
        cutter_m = _CUTTER_RE.match(rest.strip())
        cutter = cutter_m.group(0) if cutter_m else None
        if not cutter:
            return dict(UNASSIGNED)
        aisle = 7 if _cutter_key(cutter) <= _FIC_BOUNDARY else 8
        return _aisle_result(aisle)

    dewey_m = _DEWEY_RE.match(rest)
    dewey = float(dewey_m.group(1)) if dewey_m else None
    if dewey is None:
        return dict(UNASSIGNED)

    if prefix == "REF":
        for aisle, hi in _REF_RANGES:
            if dewey <= hi:
                return _aisle_result(aisle)

    if prefix == "FIL":
        for aisle, hi in _FIL_RANGES:
            if dewey <= hi:
                return _aisle_result(aisle)

    # No prefix -> General Collection
    for aisle, hi in _GENERAL_RANGES:
        if dewey <= hi:
            return _aisle_result(aisle)

    return dict(UNASSIGNED)
