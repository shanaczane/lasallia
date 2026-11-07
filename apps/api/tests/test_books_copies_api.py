# Endpoint tests for adding books and copies, ISBN checks, and accession
# number protection. The database is faked (tests/fake_supabase.py); the
# SQL functions themselves are covered by tests/db/.

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import routers.books as books_router
from tests.librarian_auth import allow_librarian
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")


def _book(**overrides) -> dict:
    row = {
        "id": "book-1", "title": "Clean code", "author": "Robert C. Martin", "isbn": "978-0-13-235088-4",
        "accession_no": "T100", "call_number": "005.1 M379", "category": "IT", "shelf_location": "Aisle 1",
        "status": "available", "archived_at": None,
        "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


def _form(**overrides) -> dict:
    body = {"title": "Refactoring", "author": "Martin Fowler", "call_number": "005.1 F787",
            "category": "IT", "shelf_location": "Aisle 1"}
    body.update(overrides)
    return body


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        books=[_book()],
        book_copies=[{"id": "copy-1", "book_id": "book-1", "accession_number": "T100", "status": "available",
                      "shelf_location": "Aisle 1"}],
        accession_counters=[{"prefix": "T", "next_value": 46646}, {"prefix": "GS", "next_value": 676}],
    )
    monkeypatch.setattr(books_router, "get_admin_client", lambda: fake)
    monkeypatch.setattr(books_router, "embed_single_book", lambda admin, book: fake.writes.append(("embed", book["id"])))
    return fake


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(books_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app)


def _create_handler(db, numbers):
    def handler(params):
        book = {**_book(id="book-new", accession_no=None, isbn=None), **params["p_book"], "id": "book-new"}
        db.tables["books"].append(book)
        for n in numbers:
            db.tables["book_copies"].append({"id": f"c-{n}", "book_id": "book-new", "accession_number": n,
                                             "status": "available"})
        return {"book": book, "accession_numbers": numbers}
    return handler


# ─── Adding a book ──────────────────────────────────────────────────────

def test_new_book_and_copies_are_saved_by_one_database_call(client, db):
    db.rpc_handlers["create_book_with_copies"] = _create_handler(db, ["T46646", "T46647", "T46648"])

    res = client.post("/books", json=_form(isbn="978-0-201-48567-7", copy_count=3))

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["assigned_accession_numbers"] == ["T46646", "T46647", "T46648"]
    assert body["total_copies"] == 3 and body["available_copies"] == 3
    name, params = db.rpc_calls[0]
    assert name == "create_book_with_copies"
    assert params["p_prefix"] == "T" and params["p_count"] == 3
    # ISBN stored digits-only; legacy columns never sent.
    assert params["p_book"]["isbn"] == "9780201485677"
    for legacy in ("accession_no", "total_copies", "available_copies", "copy_count", "prefix"):
        assert legacy not in params["p_book"]
    # Still embedded for search and recommendations.
    assert ("embed", "book-new") in db.writes


def test_gs_prefix_is_passed_through(client, db):
    db.rpc_handlers["create_book_with_copies"] = _create_handler(db, ["GS676"])
    res = client.post("/books", json=_form(prefix="gs"))
    assert res.status_code == 201, res.text
    assert db.rpc_calls[0][1]["p_prefix"] == "GS"


def test_accession_number_on_the_add_form_is_rejected(client, db):
    res = client.post("/books", json=_form(accession_no="T50000"))
    assert res.status_code == 422
    assert "automatically" in res.json()["detail"]
    assert db.rpc_calls == []


def test_old_count_fields_are_ignored(client, db):
    db.rpc_handlers["create_book_with_copies"] = _create_handler(db, ["T46646"])
    res = client.post("/books", json=_form(total_copies=5, available_copies=5))
    assert res.status_code == 201, res.text
    assert "total_copies" not in db.rpc_calls[0][1]["p_book"]


def test_invalid_isbn_is_rejected(client, db):
    res = client.post("/books", json=_form(isbn="78-6-210-42480-5"))
    assert res.status_code == 422
    assert db.rpc_calls == []


def test_duplicate_isbn_is_blocked_with_the_matching_book(client, db):
    # Same ISBN as book-1, typed differently.
    res = client.post("/books", json=_form(isbn="9780132350884"))
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "duplicate_isbn"
    assert detail["book"] == {"id": "book-1", "title": "Clean code", "author": "Robert C. Martin", "archived": False}
    # Accession numbers never appear in the response.
    assert "T100" not in res.text
    assert db.rpc_calls == []


def test_book_without_isbn_warns_on_same_title_and_author(client, db):
    res = client.post("/books", json=_form(title="Clean Code", author="robert c. martin"))
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "possible_duplicate"
    assert "T100" not in res.text

    db.rpc_handlers["create_book_with_copies"] = _create_handler(db, ["T46646"])
    res = client.post("/books", json=_form(title="Clean Code", author="robert c. martin", confirm_possible_duplicate=True))
    assert res.status_code == 201, res.text


def test_book_without_isbn_and_a_new_title_saves(client, db):
    db.rpc_handlers["create_book_with_copies"] = _create_handler(db, ["T46646"])
    res = client.post("/books", json=_form())
    assert res.status_code == 201, res.text
    assert "isbn" not in db.rpc_calls[0][1]["p_book"]


def test_copy_count_limits(client, db):
    assert client.post("/books", json=_form(copy_count=0)).status_code == 422
    assert client.post("/books", json=_form(copy_count=51)).status_code == 422


def test_a_number_race_is_retried_once(client, db):
    calls = {"n": 0}
    good = _create_handler(db, ["T46647"])

    def flaky(params):
        calls["n"] += 1
        if calls["n"] == 1:
            raise APIError({"code": "23505", "message": "duplicate key", "details": None, "hint": None})
        return good(params)

    db.rpc_handlers["create_book_with_copies"] = flaky
    res = client.post("/books", json=_form())
    assert res.status_code == 201, res.text
    assert calls["n"] == 2


# ─── Editing a book ─────────────────────────────────────────────────────

def test_changing_the_accession_number_on_edit_is_blocked(client, db):
    res = client.patch("/books/book-1", json=_form(title="Clean code", accession_no="T999"))
    assert res.status_code == 422
    assert db.tables["book_copies"][0]["accession_number"] == "T100"


def test_unchanged_accession_number_from_an_older_form_is_ignored(client, db):
    res = client.patch("/books/book-1", json=_form(title="Clean code", accession_no="t0100", isbn="978-0-13-235088-4"))
    assert res.status_code == 200, res.text
    update = next(w for w in db.writes if w[:2] == ("books", "update"))[2]
    assert "accession_no" not in update and "total_copies" not in update


def test_unchanged_isbn_is_kept_as_stored_even_if_shared(client, db):
    # A second book already shares book-1's ISBN (like the audit's pair).
    db.tables["books"].append(_book(id="book-2", title="Other", isbn="9780132350884"))
    res = client.patch("/books/book-1", json=_form(title="Clean code", isbn="9780132350884"))
    assert res.status_code == 200, res.text
    update = next(w for w in db.writes if w[:2] == ("books", "update"))[2]
    assert update["isbn"] == "978-0-13-235088-4"


def test_changing_isbn_to_another_books_isbn_is_blocked(client, db):
    db.tables["books"].append(_book(id="book-2", title="Other", isbn="9780201485677"))
    res = client.patch("/books/book-1", json=_form(title="Clean code", isbn="978-0-201-48567-7"))
    assert res.status_code == 409
    assert res.json()["detail"]["book"]["id"] == "book-2"


# ─── Copies ─────────────────────────────────────────────────────────────

def test_add_copies_creates_numbered_copies(client, db):
    def handler(params):
        for n in ("T46646", "T46647"):
            db.tables["book_copies"].append({"id": n, "book_id": "book-1", "accession_number": n, "status": "available"})
        return ["T46646", "T46647"]
    db.rpc_handlers["add_book_copies"] = handler

    res = client.post("/books/book-1/add-copies", json={"count": 2})

    assert res.status_code == 200, res.text
    assert db.rpc_calls == [("add_book_copies", {"p_book_id": "book-1", "p_prefix": "T", "p_count": 2})]
    assert res.json()["assigned_accession_numbers"] == ["T46646", "T46647"]
    assert res.json()["total_copies"] == 3


def test_add_copies_maps_database_errors(client, db):
    def handler(params):
        raise APIError({"code": "P0002", "message": "Book not found", "details": None, "hint": None})
    db.rpc_handlers["add_book_copies"] = handler
    assert client.post("/books/nope/add-copies", json={"count": 1}).status_code == 404


def test_register_existing_copy(client, db):
    res = client.post("/books/book-1/copies/register", json={"accession_number": " t044869 "})
    assert res.status_code == 201, res.text
    assert res.json()["accession_number"] == "T44869"
    assert db.tables["book_copies"][-1]["book_id"] == "book-1"
    assert db.tables["book_copies"][-1]["origin"] == "registered"


def test_register_rejects_bad_format_and_numbers_in_use(client, db):
    assert client.post("/books/book-1/copies/register", json={"accession_number": "T45312-C2"}).status_code == 422
    # Held by a copy (the old check only looked at books.accession_no).
    db.tables["book_copies"].append({"id": "c2", "book_id": "other", "accession_number": "T200", "status": "available"})
    assert client.post("/books/book-1/copies/register", json={"accession_number": "T200"}).status_code == 409
    # Held only by a legacy books.accession_no.
    db.tables["books"].append(_book(id="book-3", accession_no="T300"))
    assert client.post("/books/book-1/copies/register", json={"accession_number": "t300"}).status_code == 409


def test_register_far_above_the_counter_needs_confirming(client, db):
    res = client.post("/books/book-1/copies/register", json={"accession_number": "T99999"})
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "large_jump"
    assert res.json()["detail"]["next_value"] == "T46646"

    res = client.post("/books/book-1/copies/register", json={"accession_number": "T99999", "confirm_large_jump": True})
    assert res.status_code == 201, res.text


# ─── Corrections ────────────────────────────────────────────────────────

def test_correction_needs_a_reason_and_a_valid_number(client, db):
    assert client.post("/books/copies/copy-1/correct-accession", json={"new_accession": "T101", "reason": "   "}).status_code == 422
    assert client.post("/books/copies/copy-1/correct-accession", json={"new_accession": "T101-B", "reason": "typo"}).status_code == 422
    assert db.rpc_calls == []


def test_correction_is_logged_with_staff_and_reason(client, db):
    db.rpc_handlers["correct_accession_number"] = lambda p: {
        "id": "log-1", "book_copy_id": p["p_copy_id"], "old_value": "T100", "new_value": p["p_new"],
        "reason": p["p_reason"], "corrected_by": p["p_staff"], "corrected_at": "2026-11-05T00:00:00+00:00",
    }
    res = client.post("/books/copies/copy-1/correct-accession", json={"new_accession": "t0101", "reason": " label misread "})
    assert res.status_code == 200, res.text
    assert db.rpc_calls == [("correct_accession_number",
                             {"p_copy_id": "copy-1", "p_new": "T101", "p_reason": "label misread", "p_staff": "lib-1"})]
    assert res.json()["old_value"] == "T100" and res.json()["corrected_by_name"] == "Test Librarian"


def test_correction_to_a_number_in_use_is_a_conflict(client, db):
    def handler(params):
        raise APIError({"code": "23505", "message": "Accession number T200 is already in use", "details": None, "hint": None})
    db.rpc_handlers["correct_accession_number"] = handler
    res = client.post("/books/copies/copy-1/correct-accession", json={"new_accession": "T200", "reason": "typo"})
    assert res.status_code == 409


def test_correction_far_above_the_counter_needs_confirming(client, db):
    res = client.post("/books/copies/copy-1/correct-accession", json={"new_accession": "T90000", "reason": "typo"})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "large_jump"
    assert db.rpc_calls == []


def test_copies_are_listed_in_numeric_order(client, db):
    # book-1 already has T100.
    for n in ("T10", "T1000", "T9"):
        db.tables["book_copies"].append({"id": n, "book_id": "book-1", "accession_number": n, "status": "available"})
    res = client.get("/books/book-1/copies")
    assert [c["accession_number"] for c in res.json()] == ["T9", "T10", "T100", "T1000"]


# ─── Staff only ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("method, path, body", [
    ("post", "/books", _form()),
    ("post", "/books/book-1/add-copies", {"count": 1}),
    ("post", "/books/book-1/copies/register", {"accession_number": "T44869"}),
    ("post", "/books/copies/copy-1/correct-accession", {"new_accession": "T101", "reason": "typo"}),
    ("get", "/books/book-1/accession-corrections", None),
    ("get", "/books/book-1/copies", None),
])
def test_copy_endpoints_are_librarian_only(db, method, path, body):
    app = FastAPI()
    app.include_router(books_router.router)
    res = getattr(TestClient(app), method)(path, **({"json": body} if body is not None else {}))
    assert res.status_code in (401, 403)
