from typing import Literal

from pydantic import BaseModel

SessionStatus = Literal["in_progress", "completed", "cancelled"]
ItemResult = Literal["pending", "found", "misplaced", "not_found"]
Resolution = Literal["marked_missing", "marked_found"]
ScanOutcome = Literal["found", "misplaced", "already_scanned", "on_loan", "reserved", "damaged", "unknown"]


class InventoryLocation(BaseModel):
    floor: str
    aisle: str | None = None  # None = the whole floor
    label: str
    expected_copies: int
    # Of those, how many weren't seen in the last 6 months — what a smart
    # check would ask the librarian to scan.
    unseen_copies: int = 0
    # Set when a check of this exact location is already open — starting
    # it again joins that check instead of creating a second one.
    open_session_id: str | None = None


class StartSessionRequest(BaseModel):
    floor: str
    aisle: str | None = None
    skip_recently_seen: bool = False


class InventorySession(BaseModel):
    id: str
    floor: str
    aisle: str | None = None
    label: str
    status: SessionStatus
    started_by_name: str | None = None
    started_at: str
    completed_at: str | None = None
    # Set on a smart check: copies seen since then weren't expected.
    skip_seen_since: str | None = None
    expected: int = 0
    found: int = 0
    misplaced: int = 0
    not_found: int = 0
    pending: int = 0
    resolved: int = 0


class InventoryItem(BaseModel):
    id: str
    session_id: str
    book_copy_id: str
    book_id: str | None = None
    accession_number: str | None = None
    title: str | None = None
    author: str | None = None
    call_number: str | None = None
    copy_status: str | None = None  # the copy's status right now, not at scan time
    expected: bool
    result: ItemResult
    expected_location: str | None = None
    scanned_at: str | None = None
    resolution: Resolution | None = None
    resolved_at: str | None = None


class InventorySessionDetail(InventorySession):
    items: list[InventoryItem] = []


class ScanRequest(BaseModel):
    code: str


class ScanResult(BaseModel):
    outcome: ScanOutcome
    message: str
    item: InventoryItem | None = None
    session: InventorySession


class ResolveRequest(BaseModel):
    action: Literal["missing", "found"]


class InventoryCounts(BaseModel):
    missing: int
    misplaced: int


# A copy currently missing or misplaced — the Inventory page's follow-up
# list, linked from the dashboard counts.
class FlaggedCopy(BaseModel):
    copy_id: str
    book_id: str
    accession_number: str
    title: str
    call_number: str | None = None
    status: Literal["missing", "misplaced"]
    location: str  # where it belongs


# One row of the Inventory page's All books list: every copy, its current
# status, and when it was last known to be in hand.
class InventoryCopy(BaseModel):
    copy_id: str
    book_id: str
    accession_number: str | None = None
    title: str
    author: str | None = None
    call_number: str | None = None
    status: str
    floor: str | None = None
    aisle: str | None = None
    location: str
    # Last returned from a loan / in-house use, or found by a check.
    last_seen_at: str | None = None


# Reports > Inventory "Export details" — one row per copy per check.
class InventoryReportItem(BaseModel):
    session_id: str
    location: str
    started_at: str
    accession_number: str | None = None
    title: str | None = None
    call_number: str | None = None
    result: ItemResult
    expected_location: str | None = None
    resolution: Resolution | None = None
