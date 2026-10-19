# Shelf inventory checks: scan an aisle or floor and sort copies into found,
# misplaced and not found. Location comes from the book (floor + aisle),
# since book_copies.shelf_location is always "Unassigned".

import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from core.accession import normalize_accession_number
from core.loans import reshelve_copy_now
from schemas.inventory import (
    FlaggedCopy,
    InventoryCopy,
    InventoryCounts,
    InventoryItem,
    InventoryLocation,
    InventoryReportItem,
    InventorySession,
    InventorySessionDetail,
    ScanResult,
)

# Copies not expected on the shelf: on loan, on the hold shelf, or lost.
# Missing copies are expected, so a check can find them again.
NOT_EXPECTED_STATUSES = {"on_loan", "overdue", "reserved", "lost"}

# Statuses a copy can only leave through for_reshelving.
_SIDE_STATES = {"missing", "lost", "misplaced"}

# A smart check skips copies seen this recently.
SEEN_WINDOW_DAYS = 180


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def location_label(floor: str | None, aisle: str | None) -> str:
    """A check's label: one aisle, or the whole floor."""
    return f"{floor} - {aisle}" if aisle else f"{floor} - whole floor"


def book_location_label(book: dict) -> str:
    """Where one book belongs — what a Misplaced scan tells the librarian."""
    return f"{book.get('floor') or 'No floor'} - {book.get('aisle') or 'No aisle'}"


def _natural_key(value: str | None) -> list:
    # "Aisle 2" before "Aisle 10".
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", value or "")]


def _belongs_here(book: dict, session: dict) -> bool:
    if book.get("floor") != session["floor"]:
        return False
    return session["aisle"] is None or book.get("aisle") == session["aisle"]


def _seen_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=SEEN_WINDOW_DAYS)).isoformat()


_PAGE_SIZE = 1000  # PostgREST's default max rows per request


def _fetch_all(build_query) -> list[dict]:
    """Every row of a query, one PostgREST page at a time. build_query
    returns a fresh query each call, since .range() can't be reapplied."""
    rows: list[dict] = []
    start = 0
    while True:
        page = build_query().range(start, start + _PAGE_SIZE - 1).execute().data
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        start += _PAGE_SIZE


def _last_seen_by_copy(admin: Client, since: str | None = None) -> dict[str, str]:
    """When each copy was last known to be physically in hand: returned
    from a loan or in-house use, or found on its shelf by a check."""
    sources = [
        ("loans", "returned_at", lambda q: q.not_.is_("returned_at", "null")),
        ("in_house_loans", "returned_at", lambda q: q.not_.is_("returned_at", "null")),
        ("inventory_items", "scanned_at", lambda q: q.eq("result", "found").not_.is_("scanned_at", "null")),
    ]
    last: dict[str, str] = {}
    for table, column, only_seen in sources:
        def build(table=table, column=column, only_seen=only_seen):
            query = only_seen(admin.table(table).select(f"book_copy_id, {column}"))
            return query.gte(column, since) if since else query
        for r in _fetch_all(build):
            when = r[column]
            if when and when > last.get(r["book_copy_id"], ""):
                last[r["book_copy_id"]] = when
    return last


def _recently_seen_copy_ids(admin: Client, since: str) -> set[str]:
    """Copies seen since the cutoff. A smart check doesn't ask the librarian
    to scan these again."""
    return set(_last_seen_by_copy(admin, since))


def _profile_names(admin: Client, ids: set[str]) -> dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = admin.table("profiles").select("id, full_name").in_("id", list(ids)).execute().data
    return {r["id"]: r["full_name"] for r in rows}


# ─── Locations ──────────────────────────────────────────────────────────

def list_locations(admin: Client) -> list[InventoryLocation]:
    """Every aisle that has books, plus one whole-floor entry per floor,
    each with how many copies a check there would expect."""
    books = (
        admin.table("books").select("id, floor, aisle").is_("archived_at", "null").not_.is_("floor", "null").execute()
    ).data
    if not books:
        return []
    books_by_id = {b["id"]: b for b in books}
    copies = (
        admin.table("book_copies").select("id, book_id, status").in_("book_id", list(books_by_id)).execute()
    ).data
    seen = _recently_seen_copy_ids(admin, _seen_cutoff())

    # [all expected copies, expected copies not seen recently]
    per_aisle: dict[tuple[str, str], list[int]] = {}
    per_floor: dict[str, list[int]] = {}
    for b in books:
        per_floor.setdefault(b["floor"], [0, 0])
        if b.get("aisle"):
            per_aisle.setdefault((b["floor"], b["aisle"]), [0, 0])
    for c in copies:
        if c["status"] in NOT_EXPECTED_STATUSES:
            continue
        book = books_by_id[c["book_id"]]
        unseen = c["id"] not in seen
        targets = [per_floor[book["floor"]]]
        if book.get("aisle"):
            targets.append(per_aisle[(book["floor"], book["aisle"])])
        for t in targets:
            t[0] += 1
            t[1] += unseen

    open_sessions = (
        admin.table("inventory_sessions").select("id, floor, aisle").eq("status", "in_progress").execute()
    ).data
    open_by_location = {(s["floor"], s["aisle"]): s["id"] for s in open_sessions}

    locations = [
        InventoryLocation(
            floor=floor, aisle=None, label=location_label(floor, None),
            expected_copies=count, unseen_copies=unseen, open_session_id=open_by_location.get((floor, None)),
        )
        for floor, (count, unseen) in per_floor.items()
    ] + [
        InventoryLocation(
            floor=floor, aisle=aisle, label=location_label(floor, aisle),
            expected_copies=count, unseen_copies=unseen, open_session_id=open_by_location.get((floor, aisle)),
        )
        for (floor, aisle), (count, unseen) in per_aisle.items()
    ]
    # Each floor, then its aisles in natural order, whole floor first.
    locations.sort(key=lambda l: (_natural_key(l.floor), l.aisle is not None, _natural_key(l.aisle)))
    return locations


# ─── Sessions ───────────────────────────────────────────────────────────

def _get_session_row(admin: Client, session_id: str) -> dict:
    rows = admin.table("inventory_sessions").select("*").eq("id", session_id).execute().data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inventory check not found")
    return rows[0]


def _require_open(session: dict) -> None:
    if session["status"] != "in_progress":
        raise HTTPException(status.HTTP_409_CONFLICT, "This inventory check is already finished")


def _summaries(admin: Client, sessions: list[dict]) -> list[InventorySession]:
    if not sessions:
        return []
    items = (
        admin.table("inventory_items")
        .select("session_id, expected, result, resolution")
        .in_("session_id", [s["id"] for s in sessions])
        .execute()
    ).data
    names = _profile_names(admin, {s["started_by"] for s in sessions})

    counts: dict[str, dict[str, int]] = {
        s["id"]: {"expected": 0, "found": 0, "misplaced": 0, "not_found": 0, "pending": 0, "resolved": 0}
        for s in sessions
    }
    for i in items:
        c = counts[i["session_id"]]
        if i["expected"]:
            c["expected"] += 1
        c[i["result"]] += 1
        if i["resolution"]:
            c["resolved"] += 1

    return [
        InventorySession(
            id=s["id"], floor=s["floor"], aisle=s["aisle"], label=location_label(s["floor"], s["aisle"]),
            status=s["status"], started_by_name=names.get(s["started_by"]),
            started_at=s["started_at"], completed_at=s["completed_at"],
            skip_seen_since=s.get("skip_seen_since"), **counts[s["id"]],
        )
        for s in sessions
    ]


def get_session_summary(admin: Client, session_id: str) -> InventorySession:
    return _summaries(admin, [_get_session_row(admin, session_id)])[0]


def list_sessions(
    admin: Client, limit: int = 100, date_from: str | None = None, date_to: str | None = None,
) -> list[InventorySession]:
    query = admin.table("inventory_sessions").select("*").order("started_at", desc=True).limit(limit)
    if date_from:
        query = query.gte("started_at", date_from)
    if date_to:
        query = query.lte("started_at", date_to)
    return _summaries(admin, query.execute().data)


def start_session(
    admin: Client, floor: str, aisle: str | None, librarian_id: str, skip_recently_seen: bool = False,
) -> InventorySession:
    """Opens a check and snapshots every copy expected there as 'pending'.
    A smart check (skip_recently_seen) leaves out copies seen in the last
    SEEN_WINDOW_DAYS. If a check of this exact location is already open,
    returns that one instead, so two librarians share one check."""
    def open_one() -> dict | None:
        query = admin.table("inventory_sessions").select("*").eq("status", "in_progress").eq("floor", floor)
        query = query.eq("aisle", aisle) if aisle else query.is_("aisle", "null")
        rows = query.execute().data
        return rows[0] if rows else None

    existing = open_one()
    if existing:
        return _summaries(admin, [existing])[0]

    books_query = admin.table("books").select("id, floor, aisle").is_("archived_at", "null").eq("floor", floor)
    if aisle:
        books_query = books_query.eq("aisle", aisle)
    books = books_query.execute().data
    if not books:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No books are shelved in {location_label(floor, aisle)}")

    books_by_id = {b["id"]: b for b in books}
    copies = (
        admin.table("book_copies").select("id, book_id, status").in_("book_id", list(books_by_id)).execute()
    ).data
    copies = [c for c in copies if c["status"] not in NOT_EXPECTED_STATUSES]
    since = _seen_cutoff() if skip_recently_seen else None
    if since:
        seen = _recently_seen_copy_ids(admin, since)
        copies = [c for c in copies if c["id"] not in seen]
        if not copies:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Every book in {location_label(floor, aisle)} was seen in the last {SEEN_WINDOW_DAYS // 30} months — nothing to check",
            )

    try:
        new_session = {"floor": floor, "aisle": aisle, "started_by": librarian_id}
        if since:
            new_session["skip_seen_since"] = since
        session = admin.table("inventory_sessions").insert(new_session).execute().data[0]
    except APIError:
        # Another librarian started the same location at the same moment;
        # the database only allows one, so join theirs.
        existing = open_one()
        if existing:
            return _summaries(admin, [existing])[0]
        raise

    rows = [
        {
            "session_id": session["id"],
            "book_copy_id": c["id"],
            "expected": True,
            "result": "pending",
            "expected_location": book_location_label(books_by_id[c["book_id"]]),
        }
        for c in copies
    ]
    if rows:
        admin.table("inventory_items").insert(rows).execute()
    return _summaries(admin, [session])[0]


def _item_rows(admin: Client, query_filter) -> list[InventoryItem]:
    rows = query_filter(
        admin.table("inventory_items").select(
            "*, book_copies(accession_number, status, book_id, books(title, author, call_number))"
        )
    ).execute().data
    items = []
    for r in rows:
        copy = r.get("book_copies") or {}
        book = copy.get("books") or {}
        items.append(InventoryItem(
            id=r["id"], session_id=r["session_id"], book_copy_id=r["book_copy_id"], book_id=copy.get("book_id"),
            accession_number=copy.get("accession_number"), title=book.get("title"), author=book.get("author"),
            call_number=book.get("call_number"), copy_status=copy.get("status"),
            expected=r["expected"], result=r["result"], expected_location=r["expected_location"],
            scanned_at=r["scanned_at"], resolution=r["resolution"], resolved_at=r["resolved_at"],
        ))
    return items


def _one_item(admin: Client, item_id: str) -> InventoryItem:
    items = _item_rows(admin, lambda q: q.eq("id", item_id))
    if not items:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inventory item not found")
    return items[0]


def get_session_detail(admin: Client, session_id: str) -> InventorySessionDetail:
    summary = get_session_summary(admin, session_id)
    items = _item_rows(admin, lambda q: q.eq("session_id", session_id))
    items.sort(key=lambda i: (_natural_key(i.call_number), i.accession_number or ""))
    return InventorySessionDetail(**summary.model_dump(), items=items)


def complete_session(admin: Client, session_id: str, librarian_id: str) -> InventorySession:
    session = _get_session_row(admin, session_id)
    _require_open(session)
    admin.table("inventory_items").update({"result": "not_found"}).eq("session_id", session_id).eq("result", "pending").execute()
    admin.table("inventory_sessions").update({
        "status": "completed", "completed_at": _now(), "completed_by": librarian_id,
    }).eq("id", session_id).execute()
    return get_session_summary(admin, session_id)


def cancel_session(admin: Client, session_id: str) -> InventorySession:
    session = _get_session_row(admin, session_id)
    _require_open(session)
    admin.table("inventory_sessions").update({"status": "cancelled", "completed_at": _now()}).eq("id", session_id).execute()
    return get_session_summary(admin, session_id)


# ─── Scanning ───────────────────────────────────────────────────────────

def _to_for_reshelving(admin: Client, copy: dict) -> None:
    """missing/lost/misplaced can only leave through for_reshelving."""
    if copy["status"] in _SIDE_STATES:
        admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()
        copy["status"] = "for_reshelving"


def scan(admin: Client, session_id: str, code: str, librarian_id: str) -> ScanResult:
    session = _get_session_row(admin, session_id)
    _require_open(session)

    def result(outcome: str, message: str, item_id: str | None = None) -> ScanResult:
        return ScanResult(
            outcome=outcome, message=message,
            item=_one_item(admin, item_id) if item_id else None,
            session=get_session_summary(admin, session_id),
        )

    accession = normalize_accession_number(code)
    copies = (
        admin.table("book_copies").select("id, book_id, status, accession_number").eq("accession_number", accession).execute()
    ).data
    if not copies:
        return result("unknown", f"No copy has the barcode {code.strip()}")
    copy = copies[0]
    book = admin.table("books").select("id, title, floor, aisle").eq("id", copy["book_id"]).execute().data[0]
    title = book["title"]

    existing = (
        admin.table("inventory_items").select("id, result").eq("session_id", session_id).eq("book_copy_id", copy["id"]).execute()
    ).data
    if existing and existing[0]["result"] != "pending":
        return result("already_scanned", f'"{title}" was already scanned in this check', existing[0]["id"])

    # The record says this copy isn't on a shelf; fix it at the desk first.
    if copy["status"] in ("on_loan", "overdue"):
        return result("on_loan", f'"{title}" is recorded as on loan — check it in at the desk first')
    if copy["status"] == "reserved":
        return result("reserved", f'"{title}" is being held for a reservation — take it to the hold shelf')
    if copy["status"] == "damaged":
        return result("damaged", f'"{title}" is marked as damaged — set it aside for repair')

    scanned = {"scanned_at": _now(), "scanned_by": librarian_id}

    if _belongs_here(book, session):
        if existing:
            # Conditional on still pending, so two devices scanning the same
            # copy at once only count it once.
            updated = (
                admin.table("inventory_items").update({"result": "found", **scanned})
                .eq("id", existing[0]["id"]).eq("result", "pending").execute()
            ).data
            if not updated:
                return result("already_scanned", f'"{title}" was already scanned in this check', existing[0]["id"])
            item_id = existing[0]["id"]
        else:
            # A lost copy turned up on its own shelf.
            item_id = _insert_item(admin, session_id, copy, book, expected=False, item_result="found", scanned=scanned)
            if item_id is None:
                return result("already_scanned", f'"{title}" was already scanned in this check')

        # Seen on its own shelf: a copy flagged missing/lost/misplaced, or
        # still waiting in the reshelving queue, is back in circulation.
        message = f'Found "{title}"'
        if copy["status"] in _SIDE_STATES | {"for_reshelving"}:
            was = copy["status"]
            _to_for_reshelving(admin, copy)
            if reshelve_copy_now(admin, copy, copy["accession_number"]) == "reserved":
                message += " — someone reserved it, take it to the hold shelf"
            elif was in _SIDE_STATES:
                message += f" — it was marked {was}, now available again"
        also = _count_in_other_checks(admin, session, copy, book, scanned)
        if also:
            message += f" (also counted in {', '.join(also)})"
        return result("found", message, item_id)

    # Belongs on another shelf: Misplaced, and say where it goes.
    item_id = _insert_item(admin, session_id, copy, book, expected=False, item_result="misplaced", scanned=scanned)
    if item_id is None:
        return result("already_scanned", f'"{title}" was already scanned in this check')
    if copy["status"] != "misplaced":
        _to_for_reshelving(admin, copy)
        admin.table("book_copies").update({"status": "misplaced"}).eq("id", copy["id"]).execute()
    return result("misplaced", f'Misplaced: "{title}" belongs in {book_location_label(book)}', item_id)


def _count_in_other_checks(admin: Client, session: dict, copy: dict, book: dict, scanned: dict) -> list[str]:
    """A copy found on its own shelf is found for every open check that
    covers that shelf, so scanning an aisle also ticks the copy off an open
    whole-floor check (and the other way round). Returns those checks' labels."""
    others = (
        admin.table("inventory_sessions").select("id, floor, aisle")
        .eq("status", "in_progress").eq("floor", session["floor"]).neq("id", session["id"]).execute()
    ).data
    others = [s for s in others if _belongs_here(book, s)]
    if not others:
        return []
    updated = (
        admin.table("inventory_items").update({"result": "found", **scanned})
        .in_("session_id", [s["id"] for s in others]).eq("book_copy_id", copy["id"]).eq("result", "pending").execute()
    ).data
    updated_sessions = {r["session_id"] for r in updated}
    return [location_label(s["floor"], s["aisle"]) for s in others if s["id"] in updated_sessions]


def _insert_item(admin: Client, session_id: str, copy: dict, book: dict, *, expected: bool, item_result: str, scanned: dict) -> str | None:
    """Returns the new row's id, or None if another device already added
    this copy to the check."""
    try:
        return admin.table("inventory_items").insert({
            "session_id": session_id, "book_copy_id": copy["id"], "expected": expected,
            "result": item_result, "expected_location": book_location_label(book), **scanned,
        }).execute().data[0]["id"]
    except APIError:
        return None


# ─── Resolving ──────────────────────────────────────────────────────────

def resolve_item(admin: Client, item_id: str, action: str, librarian_id: str) -> InventoryItem:
    """One-click follow-up on a Not Found or Misplaced row. Missing writes
    the copy off as missing; Found means the librarian has located it (or
    moved a misplaced copy back), which sends it to the reshelving queue —
    only a scan on its shelf puts it straight back into circulation."""
    rows = admin.table("inventory_items").select("id, result, book_copy_id").eq("id", item_id).execute().data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inventory item not found")
    row = rows[0]
    if row["result"] not in ("not_found", "misplaced"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only Not Found and Misplaced copies can be marked")

    copy = admin.table("book_copies").select("id, book_id, status, accession_number").eq("id", row["book_copy_id"]).execute().data[0]
    if copy["status"] in ("on_loan", "overdue", "reserved"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This copy is '{copy['status'].replace('_', ' ')}' now, so there's nothing to mark",
        )

    if action == "missing":
        if copy["status"] != "missing":
            admin.table("book_copies").update({"status": "missing"}).eq("id", copy["id"]).execute()
        resolution = "marked_missing"
    else:
        _to_for_reshelving(admin, copy)
        resolution = "marked_found"

    admin.table("inventory_items").update({
        "resolution": resolution, "resolved_at": _now(), "resolved_by": librarian_id,
    }).eq("id", item_id).execute()
    return _one_item(admin, item_id)


# ─── Dashboard + reports ────────────────────────────────────────────────

def copy_counts(admin: Client) -> InventoryCounts:
    def count(copy_status: str) -> int:
        return admin.table("book_copies").select("id", count="exact").eq("status", copy_status).limit(1).execute().count or 0
    return InventoryCounts(missing=count("missing"), misplaced=count("misplaced"))


def all_copies(admin: Client) -> list[InventoryCopy]:
    """Every copy of every catalogued book with its current status — the
    Inventory page's All books list."""
    rows = _fetch_all(lambda: (
        admin.table("book_copies")
        .select("id, accession_number, status, book_id, books!inner(title, author, call_number, floor, aisle, archived_at)")
        .is_("books.archived_at", "null")
        .order("id")
    ))
    last_seen = _last_seen_by_copy(admin)
    copies = []
    for r in rows:
        book = r.get("books") or {}
        copies.append(InventoryCopy(
            copy_id=r["id"], book_id=r["book_id"], accession_number=r["accession_number"],
            title=book.get("title") or "Untitled", author=book.get("author"), call_number=book.get("call_number"),
            status=r["status"], floor=book.get("floor"), aisle=book.get("aisle"),
            location=book_location_label(book), last_seen_at=last_seen.get(r["id"]),
        ))
    copies.sort(key=lambda c: (_natural_key(c.floor), _natural_key(c.aisle), _natural_key(c.call_number), c.accession_number or ""))
    return copies


def flagged_copies(admin: Client) -> list[FlaggedCopy]:
    rows = (
        admin.table("book_copies")
        .select("id, accession_number, status, book_id, books(title, call_number, floor, aisle)")
        .in_("status", ["missing", "misplaced"])
        .execute()
    ).data
    copies = [
        FlaggedCopy(
            copy_id=r["id"], book_id=r["book_id"], accession_number=r["accession_number"],
            title=(r.get("books") or {}).get("title") or "Untitled", call_number=(r.get("books") or {}).get("call_number"),
            status=r["status"], location=book_location_label(r.get("books") or {}),
        )
        for r in rows
    ]
    copies.sort(key=lambda c: (c.status, _natural_key(c.call_number)))
    return copies


def report_items(admin: Client, date_from: str | None = None, date_to: str | None = None) -> list[InventoryReportItem]:
    """One row per copy per check, for Reports > Inventory "Export details"."""
    query = admin.table("inventory_sessions").select("id, floor, aisle, started_at").order("started_at", desc=True)
    if date_from:
        query = query.gte("started_at", date_from)
    if date_to:
        query = query.lte("started_at", date_to)
    sessions = {s["id"]: s for s in query.execute().data}
    if not sessions:
        return []
    items = _item_rows(admin, lambda q: q.in_("session_id", list(sessions)))

    rows = []
    for i in items:
        s = sessions[i.session_id]
        rows.append(InventoryReportItem(
            session_id=s["id"], location=location_label(s["floor"], s["aisle"]), started_at=s["started_at"],
            accession_number=i.accession_number, title=i.title, call_number=i.call_number,
            result=i.result, expected_location=i.expected_location, resolution=i.resolution,
        ))
    # Newest check first; within a check, shelf (call-number) order.
    rows.sort(key=lambda r: _natural_key(r.call_number))
    rows.sort(key=lambda r: r.started_at, reverse=True)
    return rows
