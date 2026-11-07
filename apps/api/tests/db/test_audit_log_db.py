# migrations/0063_audit_log.sql against a real Postgres.

from pathlib import Path

import pytest
from psycopg import errors

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


@pytest.fixture
def db(conn):
    conn.execute("""
        create or replace function set_updated_at() returns trigger as $$
        begin new.updated_at = now(); return new; end;
        $$ language plpgsql;
        create table library_settings (id int primary key);
        create table claims (is_librarian boolean);
        insert into claims values (false);
        grant select on claims to anon, authenticated;
        create or replace function is_librarian() returns boolean
          language sql stable as $$ select is_librarian from claims $$;
    """)
    for name in ("0061_librarian_profiles.sql", "0063_audit_log.sql", "0063_audit_log.sql"):
        conn.execute((MIGRATIONS / name).read_text(encoding="utf-8"))
    conn.execute("grant all on librarian_profiles, audit_log to service_role")
    # As on Supabase.
    conn.execute("alter role service_role bypassrls")
    return conn


def _profile(db) -> str:
    return db.execute(
        "insert into librarian_profiles (full_name, pin_hash) values ('Ana', 'x') returning id"
    ).fetchone()[0]


def _entry(db, profile_id) -> str:
    return db.execute(
        "insert into audit_log (librarian_profile_id, librarian_name, action, entity_type) "
        "values (%s, 'Ana', 'loan.return', 'loan') returning id",
        (profile_id,),
    ).fetchone()[0]


def _as(db, role):
    db.execute(f"set role {role}")


def test_the_service_role_can_add_entries(db):
    profile_id = _profile(db)
    _as(db, "service_role")
    try:
        assert _entry(db, profile_id)
    finally:
        db.execute("reset role")


@pytest.mark.parametrize("statement", [
    "update audit_log set action = 'changed'",
    "delete from audit_log",
    "truncate audit_log",
])
@pytest.mark.parametrize("role", ["postgres", "service_role"])
def test_nobody_can_change_or_delete_entries(db, role, statement):
    _entry(db, _profile(db))
    _as(db, role)
    try:
        with pytest.raises(errors.RaiseException, match="append-only"):
            db.execute(statement)
    finally:
        db.execute("reset role")
    assert db.execute("select count(*), min(action) from audit_log").fetchone() == (1, "loan.return")


def test_a_profile_with_history_cant_be_deleted(db):
    profile_id = _profile(db)
    _entry(db, profile_id)
    with pytest.raises(errors.ForeignKeyViolation):
        db.execute("delete from librarian_profiles where id = %s", (profile_id,))


def test_librarians_can_read_entries_and_nobody_else(db):
    _entry(db, _profile(db))

    _as(db, "authenticated")
    assert db.execute("select count(*) from audit_log").fetchone()[0] == 0
    db.execute("reset role")

    db.execute("update claims set is_librarian = true")
    _as(db, "authenticated")
    assert db.execute("select count(*) from audit_log").fetchone()[0] == 1
    db.execute("reset role")

    _as(db, "anon")
    with pytest.raises(errors.InsufficientPrivilege):
        db.execute("select * from audit_log")
    db.execute("reset role")


def test_a_signed_in_user_cant_write_entries(db):
    profile_id = _profile(db)
    db.execute("update claims set is_librarian = true")
    _as(db, "authenticated")
    try:
        with pytest.raises(errors.InsufficientPrivilege):
            _entry(db, profile_id)
    finally:
        db.execute("reset role")
