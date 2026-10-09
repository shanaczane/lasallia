from pydantic import BaseModel


class SyncIssue(BaseModel):
    record: int
    title: str | None = None
    message: str
    location: str | None = None  # "Sheet BSIT, row 12" for spreadsheet imports


class SyncFieldChange(BaseModel):
    field: str
    old: str | int | None = None
    new: str | int | None = None


class SyncItem(BaseModel):
    action: str  # "add" | "update"
    record: int
    title: str
    author: str | None = None
    book_id: str | None = None
    matched_by: str | None = None
    archived: bool = False
    changes: list[SyncFieldChange] = []
    new_copies: list[str] = []
    copies_not_in_export: list[str] = []
    location: str | None = None


class SyncPreview(BaseModel):
    dry_run: bool
    source: str  # "destiny_marc" | "lrc_spreadsheet"
    file_name: str | None = None
    records_read: int
    books_added: int
    books_updated: int
    books_unchanged: int
    copies_added: int
    # Unchanged books are counted but not listed — on a re-import of the
    # same file that would be the entire catalog.
    items: list[SyncItem]
    errors: list[SyncIssue]
    # Spreadsheet only: rows that import fine but look like typos.
    warnings: list[SyncIssue] = []
    run_id: str | None = None


class SyncRun(BaseModel):
    id: str
    source: str
    file_name: str | None = None
    started_by: str | None = None
    started_by_name: str | None = None
    records_read: int
    books_added: int
    books_updated: int
    books_unchanged: int
    copies_added: int
    errors: list[SyncIssue] = []
    created_at: str
