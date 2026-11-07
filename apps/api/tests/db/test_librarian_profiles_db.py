# migrations/0061_librarian_profiles.sql against a real Postgres.

from pathlib import Path

import pytest
from psycopg import errors

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "0061_librarian_profiles.sql"


@pytest.fixture
def db(conn):
    conn.execute("""
        create or replace function set_updated_at() returns trigger as $$
        begin new.updated_at = now(); return new; end;
        $$ language plpgsql;
        create table library_settings (id int primary key);
        insert into library_settings (id) values (1);
    """)
    for _ in range(2):
        conn.execute(MIGRATION.read_text(encoding="utf-8"))
    conn.execute("grant all on librarian_profiles to service_role")
    return conn


def _add(db, name="Ana", card=None) -> str:
    return db.execute(
        "insert into librarian_profiles (full_name, pin_hash, staff_rfid_uid) values (%s, 'hash', %s) returning id",
        (name, card),
    ).fetchone()[0]


def _fail(db, profile_id):
    return db.execute("select record_librarian_sign_in_failure(%s, 5, 300)", (profile_id,)).fetchone()[0]


def test_the_fifth_failure_locks_for_five_minutes_and_restarts_the_count(db):
    profile_id = _add(db)
    for expected in range(1, 5):
        result = _fail(db, profile_id)
        assert result == {"failed_attempts": expected, "locked_until": None}

    assert _fail(db, profile_id)["locked_until"] is not None
    failed, seconds = db.execute(
        "select failed_attempts, extract(epoch from locked_until - now()) from librarian_profiles"
    ).fetchone()
    assert failed == 0
    assert 295 < seconds <= 300


def test_a_staff_card_belongs_to_one_profile(db):
    _add(db, "Ana", "card-1")
    with pytest.raises(errors.UniqueViolation):
        _add(db, "Ben", "card-1")


def test_many_profiles_can_have_no_card(db):
    _add(db, "Ana")
    _add(db, "Ben")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_browsers_can_neither_read_nor_write_profiles(db, role):
    _add(db)
    db.execute(f"set role {role}")
    try:
        with pytest.raises(errors.InsufficientPrivilege):
            db.execute("select pin_hash from librarian_profiles")
        with pytest.raises(errors.InsufficientPrivilege):
            db.execute("insert into librarian_profiles (full_name, pin_hash) values ('X', 'y')")
    finally:
        db.execute("reset role")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_browsers_cant_call_the_failure_counter(db, role):
    profile_id = _add(db)
    db.execute(f"set role {role}")
    try:
        with pytest.raises(errors.InsufficientPrivilege):
            _fail(db, profile_id)
    finally:
        db.execute("reset role")


def test_the_idle_lock_defaults_to_15_minutes_within_its_limits(db):
    assert db.execute("select librarian_idle_timeout_minutes from library_settings").fetchone()[0] == 15
    for value in (4, 121):
        with pytest.raises(errors.CheckViolation):
            db.execute("update library_settings set librarian_idle_timeout_minutes = %s", (value,))
