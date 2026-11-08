# Reading every row of a query. PostgREST returns at most 1,000 rows per
# request, so anything that can grow past that is read page by page, and
# long id lists are sent in chunks to keep the URL short.

import re
from decimal import Decimal, InvalidOperation
from typing import Callable, Iterable

PAGE_SIZE = 1000
ID_CHUNK = 100


def fetch_all_rows(make_query: Callable, page_size: int = PAGE_SIZE) -> list[dict]:
    """Every row of a select, page by page. make_query builds a fresh query
    for each page; give it an .order() so pages don't overlap."""
    rows: list[dict] = []
    start = 0
    while True:
        page = make_query().range(start, start + page_size - 1).execute().data
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def fetch_rows_by_ids(make_query: Callable, ids: Iterable[str], chunk: int = ID_CHUNK) -> list[dict]:
    """Every row matching a list of ids. make_query(chunk_of_ids) builds the
    query for one chunk (with its .in_() and .order()); each chunk is paged."""
    ids = list(dict.fromkeys(i for i in ids if i))
    rows: list[dict] = []
    for start in range(0, len(ids), chunk):
        part = ids[start:start + chunk]
        rows.extend(fetch_all_rows(lambda: make_query(part)))
    return rows


_CALL_NUMBER = re.compile(r"^\s*([A-Za-z]*)\s*(\d+(?:\.\d+)?)?\s*(.*)$")


def call_number_key(value: str | None) -> tuple:
    """Shelf order for call numbers like "005.133 B197j 2021" or
    "FIL 658.4038011 P298d 2015": by section prefix (none first), then the
    class number as a decimal (005.13 before 005.2), then the rest as text,
    where Cutter numbers compare digit by digit (M379 before M38)."""
    match = _CALL_NUMBER.match(value or "")
    prefix, number, rest = match.groups() if match else ("", None, value or "")
    try:
        numeric = Decimal(number) if number else None
    except InvalidOperation:
        numeric = None
    return (prefix.upper(), numeric is None, numeric or Decimal(0), (rest or "").strip().lower())


def natural_key(value: str | None) -> list:
    """Sorts numbers inside text by value: "Aisle 2" before "Aisle 10",
    "005.1 M379" before "005.13 B197". Numbers and text never compare
    directly, so mixed values sort without errors."""
    return [(0, int(part), "") if part.isdigit() else (1, 0, part.lower())
            for part in re.split(r"(\d+)", value or "") if part != ""]
