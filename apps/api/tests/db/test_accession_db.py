import threading

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb

import psycopg


def _create(conn, title="Test book", prefix="T", count=1, **fields):
    book = {"title": title, "author": "Test Author", **fields}
    return conn.execute(
        "select create_book_with_copies(%s, %s, %s)", (Jsonb(book), prefix, count)
    ).fetchone()[0]


def _counter(conn, prefix="T"):
    return conn.execute("select next_value from accession_counters where prefix = %s", (prefix,)).fetchone()[0]


def _insert_copy(conn, accession, book_id=None):
    if book_id is None:
        book_id = conn.execute("insert into books (title, author) values ('Existing', 'A') returning id").fetchone()[0]
    conn.execute("insert into book_copies (book_id, accession_number) values (%s, %s)", (book_id, accession))
    return book_id


# ─── Assigning numbers ──────────────────────────────────────────────────

def test_counters_start_at_the_demo_values(conn):
    assert _counter(conn, "T") == 46646
    assert _counter(conn, "GS") == 676


def test_book_and_copies_saved_together(conn):
    result = _create(conn, count=3, keywords=["java", "oop"])
    assert result["accession_numbers"] == ["T46646", "T46647", "T46648"]
    book_id = result["book"]["id"]
    rows = conn.execute("select accession_number from book_copies where book_id = %s order by 1", (book_id,)).fetchall()
    assert [r[0] for r in rows] == ["T46646", "T46647", "T46648"]
    assert result["book"]["keywords"] == ["java", "oop"]
    # Defaults still apply to columns not sent; legacy counts stay empty.
    assert result["book"]["collection_type"] == "General"
    assert result["book"]["total_copies"] is None and result["book"]["accession_no"] is None
    assert _counter(conn) == 46649


def test_gs_prefix_has_its_own_counter(conn):
    assert _create(conn, prefix="gs", count=2)["accession_numbers"] == ["GS676", "GS677"]
    assert _counter(conn, "T") == 46646


def test_failure_rolls_back_the_book(conn):
    with pytest.raises(errors.InvalidParameterValue):
        _create(conn, prefix="ZZ")
    with pytest.raises(errors.InvalidParameterValue):
        _create(conn, count=0)
    with pytest.raises(errors.InvalidParameterValue):
        _create(conn, count=51)
    assert conn.execute("select count(*) from books").fetchone()[0] == 0
    assert _counter(conn) == 46646


def test_existing_numbers_are_skipped(conn):
    # Copies above a counter that was set back by hand, plus a legacy
    # books.accession_no: none of them is handed out again.
    book_id = _insert_copy(conn, "T46647")
    _insert_copy(conn, "T46649", book_id)
    conn.execute("insert into books (title, author, accession_no) values ('Legacy', 'A', 'T46651')")
    conn.execute("update accession_counters set next_value = 46646 where prefix = 'T'")

    assert _create(conn, count=3)["accession_numbers"] == ["T46646", "T46648", "T46650"]
    assert _create(conn, count=1)["accession_numbers"] == ["T46652"]


def test_skip_check_ignores_case_and_zero_padding(conn):
    _insert_copy(conn, "t046646")
    conn.execute("update accession_counters set next_value = 46646 where prefix = 'T'")
    assert _create(conn)["accession_numbers"] == ["T46647"]


def test_numbers_are_numeric_not_text(conn):
    conn.execute("update accession_counters set next_value = 9 where prefix = 'T'")
    assert _create(conn, count=3)["accession_numbers"] == ["T9", "T10", "T11"]
    assert _counter(conn) == 12


def test_add_copies_to_an_existing_book(conn):
    book_id = _create(conn)["book"]["id"]
    numbers = conn.execute("select add_book_copies(%s, 'T', 2)", (book_id,)).fetchone()[0]
    assert numbers == ["T46647", "T46648"]
    assert conn.execute("select count(*) from book_copies where book_id = %s", (book_id,)).fetchone()[0] == 3


def test_add_copies_refuses_archived_and_missing_books(conn):
    book_id = _create(conn)["book"]["id"]
    conn.execute("update books set archived_at = now() where id = %s", (book_id,))
    with pytest.raises(errors.InvalidParameterValue):
        conn.execute("select add_book_copies(%s, 'T', 1)", (book_id,))
    with pytest.raises(errors.NoDataFound):
        conn.execute("select add_book_copies(gen_random_uuid(), 'T', 1)")
    assert _counter(conn) == 46647


def test_concurrent_saves_never_share_a_number(conn, db_url):
    # Half the workers save a book with 3 copies; the other half save a book
    # with 1 copy and then add 2, so both functions race each other.
    workers, per_book = 20, 3
    barrier = threading.Barrier(workers)
    failures = []

    def save(i):
        try:
            with psycopg.connect(db_url, autocommit=True) as c:
                barrier.wait()
                if i % 2:
                    _create(c, title=f"Concurrent {i}", count=per_book)
                else:
                    book_id = _create(c, title=f"Concurrent {i}", count=1)["book"]["id"]
                    c.execute("select add_book_copies(%s, 'T', %s)", (book_id, per_book - 1))
        except Exception as e:  # reported by the assert below
            failures.append(e)

    threads = [threading.Thread(target=save, args=(i,)) for i in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert failures == []
    stored = [r[0] for r in conn.execute("select accession_number from book_copies").fetchall()]
    assert len(stored) == workers * per_book
    assert len(set(stored)) == len(stored)
    # No gaps: exactly T46646 .. T46705.
    assert sorted(int(s[1:]) for s in stored) == list(range(46646, 46646 + workers * per_book))
    assert _counter(conn) == 46646 + workers * per_book


# ─── The counter follows numbers added from outside ─────────────────────

def test_imported_or_registered_numbers_move_the_counter(conn):
    _insert_copy(conn, "T50000")
    assert _counter(conn) == 50001
    _insert_copy(conn, "GS0700")
    assert _counter(conn, "GS") == 701
    # Lower numbers leave it alone.
    _insert_copy(conn, "T44869")
    assert _counter(conn) == 50001
    assert _create(conn)["accession_numbers"] == ["T50001"]


def test_unknown_prefixes_and_nonstandard_values_are_ignored(conn):
    book_id = _insert_copy(conn, "X99999")
    for value in ("T45312-C2", "T44846 T44847 T44848", "T" + "9" * 20, "FIL123"):
        _insert_copy(conn, value, book_id)
    assert _counter(conn, "T") == 46646
    assert _counter(conn, "GS") == 676
    assert conn.execute("select count(*) from accession_counters").fetchone()[0] == 2


def test_case_or_padding_duplicates_are_rejected(conn):
    _insert_copy(conn, "T44869")
    with pytest.raises(errors.UniqueViolation):
        _insert_copy(conn, "t044869")


# ─── Read-only numbers and corrections ──────────────────────────────────

def test_direct_accession_edits_are_blocked(conn):
    copy_id = conn.execute("select id from book_copies where book_id = %s",
                           (_create(conn)["book"]["id"],)).fetchone()[0]
    with pytest.raises(errors.CheckViolation):
        conn.execute("update book_copies set accession_number = 'T1' where id = %s", (copy_id,))
    # Other columns can still change.
    conn.execute("update book_copies set shelf_location = 'Aisle 9' where id = %s", (copy_id,))
    assert conn.execute("select accession_number from book_copies where id = %s", (copy_id,)).fetchone()[0] == "T46646"


def _legacy_book(conn, accession="T45000"):
    book_id = conn.execute(
        "insert into books (title, author, accession_no) values ('Seeded', 'A', %s) returning id", (accession,)
    ).fetchone()[0]
    conn.execute("insert into book_copies (book_id, accession_number) values (%s, %s)", (book_id, accession))
    return book_id


def test_resending_the_same_number_still_saves(conn):
    # What every edit from the pre-0058 API does: the whole books row,
    # accession_no included, written back unchanged.
    book_id = _legacy_book(conn)
    conn.execute("update books set title = 'Edited', accession_no = 'T45000' where id = %s", (book_id,))
    conn.execute("update book_copies set accession_number = 'T45000', shelf_location = 'X' where book_id = %s", (book_id,))
    assert conn.execute("select title from books where id = %s", (book_id,)).fetchone()[0] == "Edited"


def test_old_api_number_change_is_rejected_before_anything_is_saved(conn):
    # The pre-0058 API wrote books first, then the copy. The books lock makes
    # that first statement fail, so the edit leaves no stale number behind.
    book_id = _legacy_book(conn)
    with pytest.raises(errors.CheckViolation):
        conn.execute("update books set title = 'Edited', accession_no = 'T45999' where id = %s", (book_id,))
    assert conn.execute("select title, accession_no from books where id = %s", (book_id,)).fetchone() == ("Seeded", "T45000")


def test_typing_a_number_onto_a_book_without_one_is_rejected(conn):
    book_id = _create(conn)["book"]["id"]       # new books have no accession_no
    with pytest.raises(errors.CheckViolation):
        conn.execute("update books set accession_no = 'T50000' where id = %s", (book_id,))
    # Leaving it empty, as the new API does, is fine.
    conn.execute("update books set title = 'Edited', accession_no = null where id = %s", (book_id,))


def test_correction_changes_the_number_and_logs_it(conn):
    staff = conn.execute("insert into profiles (full_name) values ('Librarian') returning id").fetchone()[0]
    book_id = conn.execute("insert into books (title, author, accession_no) values ('Seeded', 'A', 'T45000') returning id").fetchone()[0]
    copy_id = conn.execute("insert into book_copies (book_id, accession_number) values (%s, 'T45000') returning id",
                           (book_id,)).fetchone()[0]

    row = conn.execute(
        "select old_value, new_value, reason, corrected_by, corrected_at from correct_accession_number(%s, %s, %s, %s)",
        (copy_id, " t045001 ", "  label misread  ", staff),
    ).fetchone()
    assert row[:4] == ("T45000", "T45001", "label misread", staff)
    assert row[4] is not None
    assert conn.execute("select accession_number from book_copies where id = %s", (copy_id,)).fetchone()[0] == "T45001"
    # The legacy mirror moved too, so T45000 is free again.
    assert conn.execute("select accession_no from books where id = %s", (book_id,)).fetchone()[0] == "T45001"
    assert conn.execute("select count(*) from accession_corrections").fetchone()[0] == 1

    # The correction switch doesn't stay on for later statements.
    with pytest.raises(errors.CheckViolation):
        conn.execute("update book_copies set accession_number = 'T1' where id = %s", (copy_id,))


def test_correction_rules(conn):
    book_id = _insert_copy(conn, "T45000")
    _insert_copy(conn, "T45002", book_id)
    conn.execute("insert into books (title, author, accession_no) values ('Legacy', 'A', 'T45003')")
    copy_id = conn.execute("select id from book_copies where accession_number = 'T45000'").fetchone()[0]

    def correct(new, reason="typo"):
        conn.execute("select correct_accession_number(%s, %s, %s, null)", (copy_id, new, reason))

    with pytest.raises(errors.InvalidParameterValue):
        correct("T45001", reason="  ")
    with pytest.raises(errors.InvalidParameterValue):
        correct("T45001-B")
    with pytest.raises(errors.InvalidParameterValue):
        correct("T045000")              # same number
    with pytest.raises(errors.UniqueViolation):
        correct("t45002")              # another copy has it
    with pytest.raises(errors.UniqueViolation):
        correct("T45003")              # a legacy books.accession_no has it
    assert conn.execute("select count(*) from accession_corrections").fetchone()[0] == 0


def test_a_correction_upward_moves_the_counter(conn):
    copy_id = conn.execute("select id from book_copies where book_id = %s",
                           (_create(conn)["book"]["id"],)).fetchone()[0]
    conn.execute("select correct_accession_number(%s, 'T47000', 'typo', null)", (copy_id,))
    assert _counter(conn) == 47001


# ─── Access ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_only_the_service_role_can_assign_or_correct(conn, role):
    conn.execute(f"set role {role}")
    try:
        for sql in (
            "select next_accession_numbers('T', 1)",
            "select create_book_with_copies('{\"title\":\"x\",\"author\":\"y\"}'::jsonb, 'T', 1)",
            "select add_book_copies(gen_random_uuid(), 'T', 1)",
            "select correct_accession_number(gen_random_uuid(), 'T1', 'x', null)",
        ):
            with pytest.raises(errors.InsufficientPrivilege):
                conn.execute(sql)
    finally:
        conn.execute("reset role")
