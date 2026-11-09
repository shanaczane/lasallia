# Some physical accession-number barcode labels were printed with
# different zero-padding than what's actually stored in
# book_copies.accession_number (e.g. a label reading "T0045313" for a copy
# whose real accession number is "T45313") — these labels predate this
# app and nothing here generates or reprints them, so a scan has to
# tolerate the drift rather than the database chasing every label's
# padding. Every accession-number lookup or comparison in the API should
# run the input through this first.
#
# New numbers are handed out by the database (next_accession_numbers in
# migrations/0058), never worked out here.

import re

_SHAPE = re.compile(r"^([A-Za-z]+)0*(\d+)$")
_STANDARD = re.compile(r"^([A-Z]+)(\d+)$")

def normalize_accession_number(raw: str) -> str:
    stripped = (raw or "").strip()
    match = _SHAPE.match(stripped)
    if not match:
        return stripped
    prefix, digits = match.groups()
    return f"{prefix}{digits}"


def clean_accession_input(raw: str | None) -> str:
    """A number typed by staff, normalized and upper-cased ("t046646" ->
    "T46646"). Raises ValueError unless it's letters followed by digits."""
    value = normalize_accession_number(raw or "").upper()
    if not _STANDARD.match(value):
        raise ValueError("Accession numbers are letters followed by digits, like T46646.")
    return value


def accession_sort_key(value: str) -> tuple:
    """Orders T9 before T10. Nonstandard values sort after, alphabetically."""
    match = _STANDARD.match(normalize_accession_number(value).upper())
    if not match:
        return (1, "", 0, value)
    return (0, match.group(1), int(match.group(2)), value)


def accession_counters(admin) -> dict[str, int]:
    """Next number per prefix, e.g. {"T": 46646, "GS": 676}."""
    rows = admin.table("accession_counters").select("prefix, next_value").execute().data
    return {r["prefix"]: int(r["next_value"]) for r in rows}


def preview_accession_numbers(admin, prefix: str, count: int) -> list[str]:
    """The numbers next_accession_numbers would hand out right now, without
    taking them: the counter's value onward, skipping numbers already used.
    Only a preview; whoever saves first gets them. Raises KeyError for an
    unknown prefix."""
    next_value = accession_counters(admin)[prefix]
    found: list[str] = []
    while len(found) < count:
        candidates = [f"{prefix}{n}" for n in range(next_value, next_value + count - len(found) + 10)]
        copies = admin.table("book_copies").select("accession_number").in_("accession_number", candidates).execute().data
        books = admin.table("books").select("accession_no").in_("accession_no", candidates).execute().data
        used = {normalize_accession_number(r["accession_number"]).upper() for r in copies}
        used |= {normalize_accession_number(r["accession_no"]).upper() for r in books if r.get("accession_no")}
        for candidate in candidates:
            if candidate not in used:
                found.append(candidate)
                if len(found) == count:
                    break
        next_value += len(candidates)
    return found


def accession_in_use(admin, accession: str) -> dict | None:
    """Who already has this number: {"book_id": ...} for a copy or a legacy
    books.accession_no, or None. Case-insensitive; `accession` must already
    be cleaned (letters + digits only, so ilike has no wildcards to match)."""
    copy = admin.table("book_copies").select("book_id").ilike("accession_number", accession).limit(1).execute().data
    if copy:
        return copy[0]
    book = admin.table("books").select("id").ilike("accession_no", accession).limit(1).execute().data
    if book:
        return {"book_id": book[0]["id"]}
    return None
