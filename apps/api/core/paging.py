# Reading more rows than PostgREST returns at once (1000 by default).

from typing import Callable, Iterable

PAGE_SIZE = 1000
# Ids go in the URL, so a long `in` list has to be split.
IDS_PER_REQUEST = 200


def fetch_all_rows(make_query: Callable, page_size: int = PAGE_SIZE) -> list[dict]:
    """Every row of a select, page by page. make_query builds a fresh query
    for each page and needs a stable order, or rows can repeat across pages."""
    rows: list[dict] = []
    start = 0
    while True:
        page = make_query().range(start, start + page_size - 1).execute().data
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def fetch_rows_for_ids(make_query: Callable, ids: Iterable[str], chunk: int = IDS_PER_REQUEST) -> list[dict]:
    """Every row for these ids. make_query takes one chunk of ids."""
    ids = list(ids)
    rows: list[dict] = []
    for start in range(0, len(ids), chunk):
        part = ids[start:start + chunk]
        rows.extend(fetch_all_rows(lambda: make_query(part)))
    return rows
