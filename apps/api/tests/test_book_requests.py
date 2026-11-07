# Book request validation and the approval flow. Each rule has its own test.

import pytest
from pathlib import Path
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.book_requests as requests_router
from core.deps import PROFILE_REQUIRED, get_current_user, require_faculty
from main import app as real_app
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.librarian_auth import allow_librarian

FACULTY = UserProfile(id="f1", email="ana.reyes@dlsl.edu.ph", role="faculty", full_name="Ana Reyes")
OTHER = UserProfile(id="f2", email="ben.cruz@dlsl.edu.ph", role="faculty", full_name="Ben Cruz")
LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Shared Login")

GOOD = {"title": "Clean Code", "author": "Robert Martin", "copies": 2, "course": "CS 302"}
ISBN = "978-0-13-235088-4"
ISBN_STORED = "9780132350884"
NOW = "2026-11-01T00:00:00+00:00"
PDF = b"%PDF-1.7 test"


def row(request_id="r1", status="pending", requester="f1", **extra) -> dict:
    return {
        "id": request_id, "requester_id": requester, "status": status, "title": "Old Title", "author": "An Author",
        "isbn": None, "note": None, "format": "either", "copies": 1, "course": "CS 101",
        "created_at": NOW, "updated_at": NOW, "attachments": [], **extra,
    }


@pytest.fixture
def db():
    d = FakeSupabase(
        book_requests=[], book_request_attachments=[], audit_log=[],
        books=[{"id": "b1", "title": "Refactoring", "isbn": "978-0-13-475759-9", "archived_at": None}],
        book_copies=[
            {"id": "c1", "book_id": "b1", "status": "available"},
            {"id": "c2", "book_id": "b1", "status": "on_loan"},
            {"id": "c3", "book_id": "b1", "status": "lost"},
        ],
        library_settings=[{"id": 1, "max_copies_per_request": 10}],
    )
    d.column_defaults["book_requests"] = {"status": "pending", "created_at": NOW, "updated_at": NOW, "attachments": []}
    d.column_defaults["book_request_attachments"] = {"created_at": NOW}
    uploads = []
    bucket = SimpleNamespace(
        upload=lambda path, data, opts: uploads.append(path),
        get_public_url=lambda path: f"https://files/{path}",
    )
    d.storage = SimpleNamespace(from_=lambda _name: bucket)
    d.uploads = uploads
    return d


@pytest.fixture
def notices(monkeypatch):
    log = []
    monkeypatch.setattr(requests_router, "notify", lambda *a, **k: log.append((a, k)))
    monkeypatch.setattr(requests_router, "notify_librarians", lambda *a, **k: None)
    return log


@pytest.fixture
def client(db, notices, monkeypatch):
    app = FastAPI()
    app.include_router(requests_router.router)
    app.dependency_overrides[require_faculty] = lambda: FACULTY
    allow_librarian(app, LIBRARIAN)
    monkeypatch.setattr(requests_router, "get_admin_client", lambda: db)
    client = TestClient(app)
    client.app_under_test = app
    return client


def create(client, **changes):
    return client.post("/book-requests", json={**GOOD, **changes})


# ── required fields ──

def test_a_complete_request_is_saved(client, db):
    res = create(client, note=" for class ")
    assert res.status_code == 201
    saved = db.tables["book_requests"][0]
    assert (saved["title"], saved["author"], saved["copies"], saved["course"], saved["note"]) == (
        "Clean Code", "Robert Martin", 2, "CS 302", "for class",
    )
    assert saved["requester_id"] == "f1"


@pytest.mark.parametrize("field, value, message", [
    ("title", "   ", "Title is required"),
    ("author", "", "Author is required"),
    ("author", None, "Author is required"),
    ("course", "  ", "Related course is required"),
    ("course", None, "Related course is required"),
])
def test_required_fields(client, db, field, value, message):
    res = create(client, **{field: value})
    assert (res.status_code, res.json()["detail"]) == (400, message)
    assert db.tables["book_requests"] == []


@pytest.mark.parametrize("copies", [0, -1, 11])
def test_copies_stay_inside_the_limit(client, copies):
    res = create(client, copies=copies)
    assert (res.status_code, res.json()["detail"]) == (400, "Copies must be a whole number from 1 to 10")


@pytest.mark.parametrize("copies", [1, 10])
def test_the_ends_of_the_limit_are_allowed(client, copies):
    assert create(client, copies=copies).status_code == 201


def test_copies_must_be_whole(client):
    assert create(client, copies=1.5).status_code == 422


def test_the_limit_comes_from_settings(client, db):
    db.tables["library_settings"][0]["max_copies_per_request"] = 3
    assert create(client, copies=4).json()["detail"] == "Copies must be a whole number from 1 to 3"


# ── ISBN ──

def test_isbn_is_optional(client, db):
    assert create(client).status_code == 201
    assert db.tables["book_requests"][0]["isbn"] is None


def test_isbn_is_stored_normalized(client, db):
    create(client, isbn=ISBN)
    assert db.tables["book_requests"][0]["isbn"] == ISBN_STORED


def test_a_bad_isbn_is_refused(client):
    res = create(client, isbn="978-0-13-235088-5")
    assert (res.status_code, res.json()["detail"]) == (400, "Enter a valid ISBN-10 or ISBN-13. Check the digits for a typo.")


# ── duplicates ──

@pytest.mark.parametrize("status", ["pending", "under_review", "approved"])
def test_an_open_request_for_the_same_isbn_blocks_another(client, db, status):
    db.tables["book_requests"].append(row(status=status, isbn=ISBN_STORED))
    res = create(client, isbn=ISBN, title="Another Name")
    assert (res.status_code, res.json()["detail"]) == (409, "You already have an open request for this book")


@pytest.mark.parametrize("title, author", [
    ("Clean Code", "Robert Martin"),
    ("  clean   CODE!", "ROBERT MARTIN"),
    ("Clean: Code", "Robert, Martin"),
])
def test_the_same_title_and_author_block_another(client, db, title, author):
    db.tables["book_requests"].append(row(title="Clean Code", author="Robert Martin"))
    assert create(client, title=title, author=author).status_code == 409


@pytest.mark.parametrize("status", ["rejected", "fulfilled", "cancelled"])
def test_a_closed_request_doesnt_block_asking_again(client, db, status):
    db.tables["book_requests"].append(row(status=status, title="Clean Code", author="Robert Martin"))
    assert create(client).status_code == 201


def test_someone_elses_request_doesnt_block(client, db):
    db.tables["book_requests"].append(row(requester="f2", title="Clean Code", author="Robert Martin"))
    assert create(client).status_code == 201


def test_a_different_isbn_isnt_a_duplicate(client, db):
    db.tables["book_requests"].append(row(title="Clean Code", author="Robert Martin", isbn="9780134757599"))
    assert create(client, isbn=ISBN).status_code == 201


def test_a_different_author_isnt_a_duplicate(client, db):
    db.tables["book_requests"].append(row(title="Clean Code", author="Someone Else"))
    assert create(client).status_code == 201


# ── already in the catalog ──

def test_a_catalog_title_needs_confirming(client, db):
    res = create(client, title="refactoring")
    assert res.status_code == 409
    assert res.json()["detail"] == {
        "code": "in_catalog", "copies": 2, "message": "This title is already in the catalog (2 copies).",
    }
    assert db.tables["book_requests"] == []


def test_the_isbn_also_finds_it_in_the_catalog(client):
    res = create(client, title="Another Name", isbn="9780134757599")
    assert res.json()["detail"]["code"] == "in_catalog"


def test_confirming_goes_ahead(client, db):
    assert create(client, title="Refactoring", confirm_in_catalog=True).status_code == 201


def test_an_archived_book_isnt_in_the_catalog(client, db):
    db.tables["books"][0]["archived_at"] = NOW
    assert create(client, title="Refactoring").status_code == 201


# ── editing ──

def edit(client, request_id="r1", **fields):
    return client.patch(f"/book-requests/{request_id}/edit", json=fields)


def test_editing_saves_the_change(client, db):
    db.tables["book_requests"].append(row())
    assert edit(client, copies=3).status_code == 200
    assert db.tables["book_requests"][0]["copies"] == 3


@pytest.mark.parametrize("fields, message", [
    ({"title": " "}, "Title is required"),
    ({"author": ""}, "Author is required"),
    ({"course": ""}, "Related course is required"),
    ({"copies": 11}, "Copies must be a whole number from 1 to 10"),
    ({"isbn": "123"}, "Enter a valid ISBN-10 or ISBN-13. Check the digits for a typo."),
])
def test_editing_follows_the_same_rules(client, db, fields, message):
    db.tables["book_requests"].append(row())
    res = edit(client, **fields)
    assert (res.status_code, res.json()["detail"]) == (400, message)


def test_an_older_request_must_be_completed_when_edited(client, db):
    db.tables["book_requests"].append(row(author=None, course=None))
    assert edit(client, note="more").json()["detail"] == "Author is required"
    assert edit(client, author="A", course="B", note="more").status_code == 200


def test_editing_stores_the_isbn_normalized(client, db):
    db.tables["book_requests"].append(row())
    edit(client, isbn=ISBN)
    assert db.tables["book_requests"][0]["isbn"] == ISBN_STORED


def test_a_request_isnt_a_duplicate_of_itself(client, db):
    db.tables["book_requests"].append(row())
    assert edit(client, title="Old Title", copies=4).status_code == 200


def test_editing_into_another_open_request_is_refused(client, db):
    db.tables["book_requests"] += [row(), row("r2", title="Clean Code", author="An Author")]
    assert edit(client, title="Clean Code").status_code == 409


def test_editing_into_a_catalog_title_needs_confirming(client, db):
    db.tables["book_requests"].append(row())
    assert edit(client, title="Refactoring").json()["detail"]["code"] == "in_catalog"
    assert edit(client, title="Refactoring", confirm_in_catalog=True).status_code == 200


def test_a_confirmed_catalog_title_isnt_asked_again(client, db):
    db.tables["book_requests"].append(row(title="Refactoring"))
    assert edit(client, copies=2).status_code == 200


@pytest.mark.parametrize("status", ["under_review", "approved", "rejected", "fulfilled", "cancelled"])
def test_only_a_pending_request_can_be_edited(client, db, status):
    db.tables["book_requests"].append(row(status=status))
    assert edit(client, copies=2).status_code == 409


def test_you_cant_edit_someone_elses_request(client, db):
    db.tables["book_requests"].append(row(requester="f2"))
    assert edit(client, copies=2).status_code == 403


# ── attachments ──

def upload(client, *files, request_id="r1"):
    return client.post(f"/book-requests/{request_id}/attachments", files=[("files", f) for f in files])


def test_files_are_saved(client, db):
    db.tables["book_requests"].append(row())
    assert upload(client, ("a.pdf", PDF)).status_code == 200
    assert len(db.tables["book_request_attachments"]) == 1


def test_a_file_that_isnt_a_real_image_or_pdf_is_refused(client, db):
    db.tables["book_requests"].append(row())
    res = upload(client, ("a.pdf", b"MZ not really a pdf"))
    assert res.status_code == 400
    assert db.uploads == []


def test_a_file_over_10_mb_is_refused(client, db):
    db.tables["book_requests"].append(row())
    assert upload(client, ("a.pdf", PDF + b"0" * (10 * 1024 * 1024))).status_code == 413


def test_five_files_are_allowed(client, db):
    db.tables["book_requests"].append(row())
    assert upload(client, *[(f"{i}.pdf", PDF) for i in range(5)]).status_code == 200


def test_six_files_are_refused(client, db):
    db.tables["book_requests"].append(row())
    res = upload(client, *[(f"{i}.pdf", PDF) for i in range(6)])
    assert (res.status_code, res.json()["detail"]) == (400, "A request can have at most 5 files")
    assert db.uploads == []


def test_the_limit_counts_files_already_attached(client, db):
    db.tables["book_requests"].append(row())
    db.tables["book_request_attachments"] += [{"id": str(i), "request_id": "r1"} for i in range(4)]
    assert upload(client, ("a.pdf", PDF), ("b.pdf", PDF)).status_code == 400
    assert upload(client, ("a.pdf", PDF)).status_code == 200


def test_the_debug_log_is_gone():
    source = Path(requests_router.__file__).read_text(encoding="utf8")
    assert "attachment_debug" not in source and "traceback" not in source


# ── approval ──

def decide(client, status, reason=None, request_id="r1"):
    body = {"status": status}
    if reason is not None:
        body["rejection_reason"] = reason
    return client.patch(f"/book-requests/{request_id}", json=body)


REASON = "Not in the current curriculum"
ALLOWED = [
    ("pending", "under_review"),
    ("under_review", "approved"),
    ("under_review", "rejected"),
    ("approved", "fulfilled"),
]
ALL_STATUSES = ["pending", "under_review", "approved", "rejected", "fulfilled", "cancelled"]


@pytest.mark.parametrize("current, new", ALLOWED)
def test_allowed_moves(client, db, current, new):
    db.tables["book_requests"].append(row(status=current))
    assert decide(client, new, REASON if new == "rejected" else None).status_code == 200
    assert db.tables["book_requests"][0]["status"] == new


@pytest.mark.parametrize("current, new", [
    (c, n) for c in ALL_STATUSES for n in ALL_STATUSES if (c, n) not in ALLOWED
])
def test_every_other_move_is_refused(client, db, current, new):
    db.tables["book_requests"].append(row(status=current))
    assert decide(client, new, REASON).status_code == 409
    assert db.tables["book_requests"][0]["status"] == current
    assert db.tables["audit_log"] == []


def test_a_librarian_cant_cancel_for_the_requester(client, db):
    db.tables["book_requests"].append(row())
    res = decide(client, "cancelled")
    assert (res.status_code, res.json()["detail"]) == (409, "A request that is pending can't be marked cancelled")


def test_the_requester_can_still_cancel_a_pending_request(client, db):
    db.tables["book_requests"].append(row())
    assert client.post("/book-requests/r1/cancel").status_code == 200
    assert db.tables["book_requests"][0]["status"] == "cancelled"


def test_no_status_is_refused(client, db):
    db.tables["book_requests"].append(row())
    assert client.patch("/book-requests/r1", json={}).status_code == 400


def test_an_unknown_request(client):
    assert decide(client, "under_review").status_code == 404


@pytest.mark.parametrize("reason", [None, "", "   ", "too short"])
def test_rejecting_needs_a_reason(client, db, reason):
    db.tables["book_requests"].append(row(status="under_review"))
    res = decide(client, "rejected", reason)
    assert (res.status_code, res.json()["detail"]) == (400, "Give a reason of at least 10 characters")
    assert db.tables["book_requests"][0]["status"] == "under_review"


def test_ten_characters_is_enough(client, db):
    db.tables["book_requests"].append(row(status="under_review"))
    assert decide(client, "rejected", "0123456789").status_code == 200


def test_the_reason_is_stored_and_returned(client, db):
    db.tables["book_requests"].append(row(status="under_review"))
    res = decide(client, "rejected", f"  {REASON}  ")
    assert res.json()["rejection_reason"] == REASON
    assert db.tables["book_requests"][0]["rejection_reason"] == REASON


def test_the_reason_is_in_the_notification_and_email(client, db, notices):
    db.tables["book_requests"].append(row(status="under_review"))
    decide(client, "rejected", REASON)
    (args, kwargs), = notices
    assert args[1] == "book_request_rejected"
    assert REASON in args[3]
    assert ("Reason", REASON) in kwargs["email"].details


def test_approving_has_no_reason_line(client, db, notices):
    db.tables["book_requests"].append(row(status="under_review"))
    decide(client, "approved")
    (_args, kwargs), = notices
    assert ("Reason", None) in kwargs["email"].details  # empty lines are left out of the email


def test_starting_a_review_doesnt_notify(client, db, notices):
    db.tables["book_requests"].append(row())
    decide(client, "under_review")
    assert notices == []


@pytest.mark.parametrize("current, new, action", [
    ("pending", "under_review", "book_request.review"),
    ("under_review", "approved", "book_request.approve"),
    ("under_review", "rejected", "book_request.reject"),
    ("approved", "fulfilled", "book_request.fulfill"),
])
def test_every_decision_is_audited(client, db, current, new, action):
    db.tables["book_requests"].append(row(status=current))
    decide(client, new, REASON if new == "rejected" else None)
    entry = db.tables["audit_log"][-1]
    assert (entry["action"], entry["entity_type"], entry["entity_id"]) == (action, "book_request", "r1")
    assert entry["librarian_name"] == "Test Profile"
    assert (entry["details"]["from"], entry["details"]["to"]) == (current, new)


def test_a_decision_needs_an_active_profile():
    real_app.dependency_overrides[get_current_user] = lambda: LIBRARIAN
    try:
        res = TestClient(real_app).patch("/book-requests/r1", json={"status": "under_review"}, headers={"Authorization": "Bearer x"})
    finally:
        real_app.dependency_overrides.clear()
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED
