# migrations/0059_copy_origin.sql: which copies count as added by Lasallia.

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb


def _origins(conn, book_id):
    rows = conn.execute(
        "select accession_number, origin from book_copies where book_id = %s order by accession_number", (book_id,)
    ).fetchall()
    return {acc: origin for acc, origin in rows}


def test_add_book_marks_its_copies_assigned(conn):
    result = conn.execute(
        "select create_book_with_copies(%s, 'T', 2)", (Jsonb({"title": "New", "author": "A"}),)
    ).fetchone()[0]
    assert _origins(conn, result["book"]["id"]) == {"T46646": "assigned", "T46647": "assigned"}


def test_add_copies_marks_them_assigned_and_leaves_older_copies_alone(conn):
    book_id = conn.execute("insert into books (title, author) values ('Old', 'A') returning id").fetchone()[0]
    conn.execute("insert into book_copies (book_id, accession_number) values (%s, 'T100')", (book_id,))
    conn.execute("select add_book_copies(%s, 'T', 1)", (book_id,))
    assert _origins(conn, book_id) == {"T100": None, "T46646": "assigned"}


def test_any_other_insert_has_no_origin(conn):
    # The seed/backfill scripts, ensure_initial_copy and the SQL editor
    # don't set it, so their copies are never exported.
    book_id = conn.execute("insert into books (title, author) values ('Legacy', 'A') returning id").fetchone()[0]
    conn.execute("insert into book_copies (book_id, accession_number) values (%s, 'T200')", (book_id,))
    assert _origins(conn, book_id) == {"T200": None}


@pytest.mark.parametrize("origin", ["assigned", "registered", "imported"])
def test_the_api_origins_are_accepted(conn, origin):
    book_id = conn.execute("insert into books (title, author) values ('B', 'A') returning id").fetchone()[0]
    conn.execute(
        "insert into book_copies (book_id, accession_number, origin) values (%s, 'T300', %s)", (book_id, origin)
    )
    assert _origins(conn, book_id) == {"T300": origin}


def test_unknown_origins_are_rejected(conn):
    book_id = conn.execute("insert into books (title, author) values ('B', 'A') returning id").fetchone()[0]
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            "insert into book_copies (book_id, accession_number, origin) values (%s, 'T400', 'manual')", (book_id,)
        )


@pytest.mark.parametrize("origin", ["assigned", None])
def test_correcting_a_number_keeps_the_origin(conn, origin):
    book_id = conn.execute("insert into books (title, author) values ('B', 'A') returning id").fetchone()[0]
    copy_id = conn.execute(
        "insert into book_copies (book_id, accession_number, origin) values (%s, 'T500', %s) returning id",
        (book_id, origin),
    ).fetchone()[0]
    conn.execute("select correct_accession_number(%s, 'T501', 'typo', null)", (copy_id,))
    assert _origins(conn, book_id) == {"T501": origin}
