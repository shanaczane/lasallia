# migrations/0060_report_signatures.sql against a real Postgres.

from pathlib import Path

import pytest
from psycopg import errors

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "0060_report_signatures.sql"


def test_titles_get_placeholder_defaults_and_rerunning_is_harmless(conn):
    conn.execute("create table library_settings (id int primary key, library_name text)")
    conn.execute("insert into library_settings (id, library_name) values (1, 'LRC')")
    for _ in range(2):
        conn.execute(MIGRATION.read_text(encoding="utf-8"))
    row = conn.execute(
        "select report_prepared_by_title, report_noted_by_title, report_approved_by_title from library_settings"
    ).fetchone()
    assert row == ("Librarian", "Head Librarian", "Director, Learning Resource Center")


@pytest.mark.parametrize("value", ["", "   ", "x" * 121])
def test_titles_cant_be_blank_or_too_long(conn, value):
    conn.execute("create table library_settings (id int primary key)")
    conn.execute("insert into library_settings (id) values (1)")
    conn.execute(MIGRATION.read_text(encoding="utf-8"))
    with pytest.raises(errors.CheckViolation):
        conn.execute("update library_settings set report_noted_by_title = %s", (value,))
