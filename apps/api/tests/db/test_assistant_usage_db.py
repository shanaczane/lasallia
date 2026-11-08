# migrations/0070_assistant_usage.sql against a real Postgres: the
# backfill, re-running it, and that anon and signed-in users can't reach
# the table.

from pathlib import Path

import pytest
from psycopg import errors

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "0070_assistant_usage.sql"

# chat_sessions / chat_messages / station_sessions as in 0004 and 0016,
# plus profiles.role.
CHAT_SCHEMA = """
alter table profiles add column role text not null default 'student';

create table station_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  auth_method text not null,
  station_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table chat_sessions (
  id uuid primary key,
  student_id uuid references profiles(id) on delete set null,
  surface text not null check (surface in ('kiosk', 'web')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
"""

# Supabase gives anon and authenticated every privilege on new public
# tables by default; the migration has to take them away.
SUPABASE_DEFAULTS = "alter default privileges in schema public grant all on tables to anon, authenticated;"


def _migrate(conn, times=1):
    for _ in range(times):
        conn.execute(MIGRATION.read_text(encoding="utf-8"))


def _profile(conn, role):
    return conn.execute("insert into profiles (full_name, role) values ('Someone', %s) returning id", (role,)).fetchone()[0]


def _chat(conn, surface, student_id, replies, at="2026-11-02 09:00+08"):
    session_id = conn.execute(
        "insert into chat_sessions (id, student_id, surface) values (gen_random_uuid(), %s, %s) returning id",
        (student_id, surface),
    ).fetchone()[0]
    for _ in range(replies):
        conn.execute("insert into chat_messages (session_id, role, content, created_at) values (%s, 'user', 'my question', %s)",
                     (session_id, at))
        conn.execute("insert into chat_messages (session_id, role, content, created_at) values (%s, 'assistant', 'the answer', %s)",
                     (session_id, at))
    return session_id


@pytest.fixture
def chat_db(conn):
    conn.execute(SUPABASE_DEFAULTS)
    conn.execute("alter role service_role bypassrls")  # as on Supabase
    conn.execute(CHAT_SCHEMA)
    return conn


def test_backfill_counts_each_surviving_reply_once(chat_db):
    student, faculty, librarian = _profile(chat_db, "student"), _profile(chat_db, "faculty"), _profile(chat_db, "librarian")
    web = _chat(chat_db, "web", student, replies=2)
    _chat(chat_db, "web", faculty, replies=1)
    _chat(chat_db, "web", librarian, replies=1)
    _chat(chat_db, "kiosk", None, replies=3)
    _chat(chat_db, "web", student, replies=0)  # a chat with no reply isn't a question answered

    _migrate(chat_db, times=2)  # re-running must not copy anything twice

    rows = chat_db.execute(
        "select surface, user_type, answered_by, count(*) from assistant_usage group by 1, 2, 3 order by 1, 2"
    ).fetchall()
    assert rows == [("kiosk", "guest", None, 3), ("web", "faculty", None, 1), ("web", "staff", None, 1),
                    ("web", "student", None, 2)]
    # Session keys let the report count chats; occurred_at is the reply's time.
    assert chat_db.execute("select count(distinct session_key) from assistant_usage").fetchone()[0] == 4
    assert chat_db.execute("select count(*) from assistant_usage where session_key = %s", (web,)).fetchone()[0] == 2
    assert str(chat_db.execute("select min(occurred_at) from assistant_usage").fetchone()[0]).startswith("2026-11-02 01:00")


def test_no_text_or_user_id_is_stored(chat_db):
    _migrate(chat_db)
    columns = {r[0] for r in chat_db.execute(
        "select column_name from information_schema.columns where table_name = 'assistant_usage'").fetchall()}
    assert columns == {"id", "occurred_at", "surface", "user_type", "answered_by", "session_key"}


def test_deleting_a_chat_keeps_its_count(chat_db):
    session_id = _chat(chat_db, "kiosk", _profile(chat_db, "student"), replies=2)
    _migrate(chat_db)
    chat_db.execute("delete from chat_sessions where id = %s", (session_id,))
    assert chat_db.execute("select count(*) from assistant_usage").fetchone()[0] == 2


def test_live_rows_and_checks(chat_db):
    _migrate(chat_db)
    chat_db.execute("insert into assistant_usage (surface, user_type, answered_by, session_key) "
                    "values ('web', 'student', 'ai', gen_random_uuid())")
    for column, value in [("surface", "phone"), ("user_type", "librarian"), ("answered_by", "maybe")]:
        values = {"surface": "web", "user_type": "guest", "answered_by": "rule", column: value}
        with pytest.raises(errors.CheckViolation):
            chat_db.execute("insert into assistant_usage (surface, user_type, answered_by, session_key) "
                            "values (%(surface)s, %(user_type)s, %(answered_by)s, gen_random_uuid())", values)
    # A re-run doesn't touch rows recorded since.
    _migrate(chat_db)
    assert chat_db.execute("select count(*) from assistant_usage").fetchone()[0] == 1


def test_row_level_security_is_on_with_no_policies(chat_db):
    _migrate(chat_db)
    assert chat_db.execute("select relrowsecurity from pg_class where relname = 'assistant_usage'").fetchone()[0] is True
    assert chat_db.execute("select count(*) from pg_policies where tablename = 'assistant_usage'").fetchone()[0] == 0


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_anon_and_signed_in_users_have_no_access(chat_db, role):
    _chat(chat_db, "web", None, replies=1)
    _migrate(chat_db)
    chat_db.execute(f"set role {role}")
    try:
        for statement in [
            "select count(*) from assistant_usage",
            "insert into assistant_usage (surface, user_type, answered_by, session_key) values ('web', 'guest', 'ai', gen_random_uuid())",
            "update assistant_usage set answered_by = 'ai'",
            "delete from assistant_usage",
        ]:
            with pytest.raises(errors.InsufficientPrivilege):
                chat_db.execute(statement)
    finally:
        chat_db.execute("reset role")
    assert chat_db.execute("select count(*) from assistant_usage").fetchone()[0] == 1


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_rls_still_hides_rows_if_a_grant_comes_back(chat_db, role):
    # If someone re-grants access by mistake, RLS with no policies still
    # shows nothing and refuses writes.
    _chat(chat_db, "web", None, replies=1)
    _migrate(chat_db)
    chat_db.execute(f"grant select, insert on assistant_usage to {role}")
    chat_db.execute(f"set role {role}")
    try:
        assert chat_db.execute("select count(*) from assistant_usage").fetchone()[0] == 0
        with pytest.raises(errors.InsufficientPrivilege):
            chat_db.execute("insert into assistant_usage (surface, user_type, answered_by, session_key) "
                            "values ('web', 'guest', 'ai', gen_random_uuid())")
    finally:
        chat_db.execute("reset role")


def test_service_role_can_read_and_write(chat_db):
    _migrate(chat_db)
    chat_db.execute("set role service_role")
    try:
        chat_db.execute("insert into assistant_usage (surface, user_type, answered_by, session_key) "
                        "values ('kiosk', 'guest', 'rule', gen_random_uuid())")
        assert chat_db.execute("select count(*) from assistant_usage").fetchone()[0] == 1
    finally:
        chat_db.execute("reset role")


def test_station_sessions_index(chat_db):
    _migrate(chat_db)
    assert chat_db.execute("select count(*) from pg_indexes where indexname = 'station_sessions_started_idx'").fetchone()[0] == 1
