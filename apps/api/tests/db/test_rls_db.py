# The real policies, from every migration in order, against a real Postgres.
# Queries run as the `authenticated` role with a user id, the way PostgREST
# runs them, so these prove what a browser with its own token can do.
#
# Needs pgvector, for migration 0014: use the pgvector/pgvector:pg16 image.

import re
from pathlib import Path

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb

MIGRATIONS = sorted((Path(__file__).resolve().parents[2] / "migrations").glob("*.sql"))

# What Supabase provides and the migrations rely on. `profiles` was created by
# Supabase's signup flow; 0065 records its rules.
SUPABASE_STUBS = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter role service_role bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);

create table profiles (
  id        uuid primary key,
  email     text,
  full_name text,
  role      text not null default 'student'
);
alter table profiles enable row level security;
"""

GRANTS = """
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
"""

STUDENT_A = "00000000-0000-0000-0000-00000000000a"
STUDENT_B = "00000000-0000-0000-0000-00000000000b"
LIBRARIAN = "00000000-0000-0000-0000-00000000000c"


def _sql(path: Path) -> str:
    # The local Postgres may lack pgcrypto; gen_random_uuid() is built in.
    return re.sub(r"create extension if not exists pgcrypto;", "", path.read_text(encoding="utf-8"))


def _apply_all(c, before_grants: list[Path], after_grants: list[Path]) -> None:
    # Supabase grants on every new table by default, before later migrations
    # revoke, so grants go in just before the ones that tighten access.
    for path in before_grants:
        c.execute(_sql(path))
    c.execute(GRANTS)
    for path in after_grants:
        c.execute(_sql(path))


@pytest.fixture
def db(conn):
    conn.execute("""
        drop schema if exists auth cascade;
        drop schema if exists storage cascade;
        drop schema public cascade;
        create schema public;
    """)
    try:
        conn.execute("create extension if not exists vector")
    except errors.FeatureNotSupported:
        pytest.skip("pgvector isn't available in this Postgres")
    except errors.UndefinedFile:
        pytest.skip("pgvector isn't available in this Postgres")
    conn.execute(SUPABASE_STUBS)

    tightening = [p for p in MIGRATIONS if p.name[:4] >= "0061"]
    _apply_all(conn, [p for p in MIGRATIONS if p.name[:4] < "0061"], tightening)

    conn.execute("create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user()")
    conn.execute("""
        insert into profiles (id, email, role) values
          (%s, 'a@dlsl.edu.ph', 'student'), (%s, 'b@dlsl.edu.ph', 'student'), (%s, 'lrc@dlsl.edu.ph', 'librarian')
    """, (STUDENT_A, STUDENT_B, LIBRARIAN))
    book = conn.execute(
        "insert into books (title, author, call_number, category, shelf_location) "
        "values ('Book', 'A', '005.1', 'IT', 'Aisle 1') returning id"
    ).fetchone()[0]
    conn.execute("alter table book_copies disable trigger user")
    conn.execute("alter table loans disable trigger user")
    conn.execute("alter table reservations disable trigger user")
    for i, student in enumerate((STUDENT_A, STUDENT_B)):
        copy = conn.execute(
            "insert into book_copies (book_id, accession_number) values (%s, %s) returning id", (book, f"T{i}")
        ).fetchone()[0]
        session = conn.execute(
            "insert into station_sessions (student_id, auth_method, station_id) values (%s, 'rfid', 'kiosk') returning id",
            (student,),
        ).fetchone()[0]
        conn.execute(
            "insert into loans (student_id, book_copy_id, station_session_id, due_date, status, fine_amount, fine_status, condition_at_borrow) "
            "values (%s, %s, %s, now(), 'returned', 25, 'unsettled', 'good')",
            (student, copy, session),
        )
        conn.execute("insert into reservations (user_id, book_id, status) values (%s, %s, 'pending')", (student, book))
        conn.execute("insert into notifications (user_id, type, title, message) values (%s, 'overdue', 'T', 'M')", (student,))
        chat = conn.execute(
            "insert into chat_sessions (id, student_id, surface) values (gen_random_uuid(), %s, 'web') returning id", (student,)
        ).fetchone()[0]
        conn.execute("insert into chat_messages (session_id, role, content) values (%s, 'user', 'hello')", (chat,))
    return conn


class _As:
    """Runs statements the way PostgREST does for this user."""

    def __init__(self, conn, user_id: str | None, role: str = "authenticated"):
        self.conn, self.user_id, self.role = conn, user_id, role

    def __enter__(self):
        self.conn.execute("select set_config('request.jwt.claim.sub', %s, false)", (self.user_id or "",))
        self.conn.execute(f"set role {self.role}")
        return self.conn

    def __exit__(self, *_):
        self.conn.execute("reset role")
        self.conn.execute("select set_config('request.jwt.claim.sub', '', false)")


OWNED = [
    ("loans", "student_id"),
    ("reservations", "user_id"),
    ("notifications", "user_id"),
]


@pytest.mark.parametrize("table, owner", OWNED)
def test_a_student_reads_only_their_own_rows(db, table, owner):
    with _As(db, STUDENT_A) as c:
        rows = c.execute(f"select {owner}::text from {table}").fetchall()
    assert rows == [(STUDENT_A,)]


def test_fines_are_visible_only_to_the_student_who_owes_them(db):
    with _As(db, STUDENT_A) as c:
        rows = c.execute("select student_id::text, fine_amount from loans where fine_status = 'unsettled'").fetchall()
    assert [r[0] for r in rows] == [STUDENT_A]


@pytest.mark.parametrize("table, owner", OWNED[:2])
def test_librarians_read_everyones_loans_and_reservations(db, table, owner):
    with _As(db, LIBRARIAN) as c:
        assert c.execute(f"select count(*) from {table}").fetchone()[0] == 2


def test_notifications_stay_private_even_from_librarians(db):
    with _As(db, LIBRARIAN) as c:
        assert c.execute("select count(*) from notifications").fetchone()[0] == 0


@pytest.mark.parametrize("table", ["chat_sessions", "chat_messages"])
@pytest.mark.parametrize("user", [STUDENT_A, LIBRARIAN])
def test_chat_history_is_only_reachable_through_the_api(db, table, user):
    with _As(db, user) as c:
        assert c.execute(f"select count(*) from {table}").fetchone()[0] == 0


@pytest.mark.parametrize("table", ["loans", "reservations", "notifications", "chat_sessions", "chat_messages", "librarian_profiles", "audit_log"])
def test_logged_out_visitors_see_nothing(db, table):
    with _As(db, None, role="anon") as c:
        try:
            assert c.execute(f"select count(*) from {table}").fetchone()[0] == 0
        except errors.InsufficientPrivilege:
            pass


def test_a_student_cant_mark_another_students_notification_read(db):
    with _As(db, STUDENT_A) as c:
        c.execute("update notifications set is_read = true")
    assert db.execute("select user_id::text from notifications where is_read").fetchall() == [(STUDENT_A,)]


# ── writes only through the API ──

@pytest.mark.parametrize("statement", [
    "update reservations set status = 'ready'",
    "update reservations set status = 'cancelled'",
    "delete from reservations",
    f"insert into reservations (user_id, book_id, status) select '{STUDENT_A}', id, 'ready' from books limit 1",
])
@pytest.mark.parametrize("user", [STUDENT_A, LIBRARIAN])
def test_nobody_writes_reservations_directly(db, user, statement):
    with _As(db, user) as c:
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute(statement)


@pytest.mark.parametrize("statement", [
    "insert into books (title, author) values ('X', 'Y')",
    "update books set title = 'Changed'",
    "delete from books",
    "update in_house_loans set status = 'returned'",
    "delete from in_house_loans",
    "insert into library_calendar (date, is_school_day) values ('2026-12-25', false)",
    "update library_calendar set is_school_day = false",
    "update borrow_transactions set status = 'returned'",
])
def test_the_shared_librarian_token_cant_write_directly(db, statement):
    with _As(db, LIBRARIAN) as c:
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute(statement)


def test_librarians_can_still_read_what_the_pages_need(db):
    with _As(db, LIBRARIAN) as c:
        assert c.execute("select count(*) from books").fetchone()[0] == 1
        assert c.execute("select count(*) from in_house_loans").fetchone()[0] == 0


def test_the_service_role_can_still_write_for_the_api(db):
    with _As(db, None, role="service_role") as c:
        c.execute("update reservations set status = 'cancelled'")
        c.execute("update books set title = 'Changed'")


def test_students_keep_their_saved_books(db):
    book = db.execute("select id from books").fetchone()[0]
    with _As(db, STUDENT_A) as c:
        c.execute("insert into saved_books (user_id, book_id) values (%s, %s)", (STUDENT_A, book))
        assert c.execute("select count(*) from saved_books").fetchone()[0] == 1
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute("insert into saved_books (user_id, book_id) values (%s, %s)", (STUDENT_B, book))


# ── profiles and book_copies (0065) ──

def _sign_up(db, email: str, metadata: dict) -> dict:
    new_id = db.execute("select gen_random_uuid()").fetchone()[0]
    db.execute("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)", (new_id, email, Jsonb(metadata)))
    role, name = db.execute("select role, full_name from profiles where id = %s", (new_id,)).fetchone()
    return {"role": role, "full_name": name}


@pytest.mark.parametrize("email", ["attacker@gmail.com", "someone_new@dlsl.edu.ph", "first.last@dlsl.edu.ph"])
@pytest.mark.parametrize("asked_for", ["librarian", "faculty", "student"])
def test_signing_up_cant_choose_a_role(db, email, asked_for):
    expected = {"attacker@gmail.com": "guest", "someone_new@dlsl.edu.ph": "student", "first.last@dlsl.edu.ph": "faculty"}
    assert _sign_up(db, email, {"role": asked_for})["role"] == expected[email]


@pytest.mark.parametrize("email, role", [
    ("shana_czane_cruzat@dlsl.edu.ph", "student"),
    ("khatrina.joice.gonzales@dlsl.edu.ph", "faculty"),
    ("mixed.name_here@dlsl.edu.ph", "student"),
    ("plainname@dlsl.edu.ph", "student"),
    ("UPPER_CASE@DLSL.EDU.PH", "student"),
    ("outsider@yahoo.com", "guest"),
])
def test_the_role_comes_from_the_email_address(db, email, role):
    assert _sign_up(db, email, {})["role"] == role


def test_sign_up_keeps_the_name(db):
    assert _sign_up(db, "a_b@dlsl.edu.ph", {"full_name": "Ana Reyes"})["full_name"] == "Ana Reyes"
    assert _sign_up(db, "c_d@dlsl.edu.ph", {"name": "Ben Cruz"})["full_name"] == "Ben Cruz"


@pytest.mark.parametrize("statement", [
    "update profiles set role = 'librarian'",
    "delete from profiles",
    "truncate profiles cascade",
    f"insert into profiles (id, email, role) values (gen_random_uuid(), 'x@y.z', 'librarian')",
    "update book_copies set status = 'available'",
    "delete from book_copies",
    "truncate book_copies cascade",
])
@pytest.mark.parametrize("user, role", [(STUDENT_A, "authenticated"), (LIBRARIAN, "authenticated"), (None, "anon")])
def test_browsers_cant_write_profiles_or_copies(db, user, role, statement):
    with _As(db, user, role=role) as c:
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute(statement)


def test_a_student_reads_only_their_own_profile(db):
    with _As(db, STUDENT_A) as c:
        assert c.execute("select id::text from profiles").fetchall() == [(STUDENT_A,)]


def test_a_librarian_reads_every_profile(db):
    with _As(db, LIBRARIAN) as c:
        assert c.execute("select count(*) from profiles").fetchone()[0] == 3


def test_logged_out_visitors_see_no_profiles(db):
    with _As(db, None, role="anon") as c:
        assert c.execute("select count(*) from profiles").fetchone()[0] == 0


@pytest.mark.parametrize("user", [STUDENT_A, LIBRARIAN])
def test_copies_are_only_read_through_the_api(db, user):
    with _As(db, user) as c:
        assert c.execute("select count(*) from book_copies").fetchone()[0] == 0


def test_the_service_role_can_still_change_a_role(db):
    with _As(db, None, role="service_role") as c:
        c.execute("update profiles set role = 'faculty' where id = %s", (STUDENT_A,))
    assert db.execute("select role from profiles where id = %s", (STUDENT_A,)).fetchone()[0] == "faculty"


# ── loan_reminder_log (0066) and library_calendar.note (0067) ──

def _any_loan(db) -> str:
    return db.execute("select id::text from loans limit 1").fetchone()[0]


@pytest.mark.parametrize("user, role", [(STUDENT_A, "authenticated"), (LIBRARIAN, "authenticated"), (None, "anon")])
@pytest.mark.parametrize("statement", [
    "select * from loan_reminder_log",
    "delete from loan_reminder_log",
])
def test_browsers_cant_reach_the_reminder_log(db, user, role, statement):
    with _As(db, user, role=role) as c:
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute(statement)


def test_the_same_reminder_can_only_be_logged_once(db):
    loan_id = _any_loan(db)
    insert = "insert into loan_reminder_log (loan_id, kind, occurrence, channel) values (%s, 'overdue_repeat', 2, 'email')"
    db.execute(insert, (loan_id,))
    with pytest.raises(errors.UniqueViolation):
        db.execute(insert, (loan_id,))


def test_each_channel_and_repeat_gets_its_own_row(db):
    loan_id = _any_loan(db)
    for occurrence, channel in ((1, "in_app"), (1, "email"), (2, "in_app")):
        db.execute(
            "insert into loan_reminder_log (loan_id, kind, occurrence, channel) values (%s, 'overdue_repeat', %s, %s)",
            (loan_id, occurrence, channel),
        )
    assert db.execute("select count(*) from loan_reminder_log").fetchone()[0] == 3


def test_an_unknown_kind_is_refused(db):
    with pytest.raises(errors.CheckViolation):
        db.execute("insert into loan_reminder_log (loan_id, kind, channel) values (%s, 'nope', 'email')", (_any_loan(db),))


def test_the_migration_copies_the_old_markers(db):
    loan_id = _any_loan(db)
    db.execute("update loans set due_reminder_sent_at = now(), overdue_notified_at = now() where id = %s", (loan_id,))
    sql = next(p for p in MIGRATIONS if p.name.startswith("0066")).read_text(encoding="utf8")
    db.execute(sql)
    db.execute(sql)  # safe to run twice
    rows = db.execute("select kind, channel from loan_reminder_log where loan_id = %s order by 1, 2", (loan_id,)).fetchall()
    assert rows == [("due_tomorrow", "email"), ("due_tomorrow", "in_app"), ("overdue_first", "email"), ("overdue_first", "in_app")]


def test_a_closed_date_keeps_its_reason(db):
    db.execute("insert into library_calendar (date, is_school_day, note) values ('2026-12-25', false, 'Christmas Day')")
    assert db.execute("select note from library_calendar where date = '2026-12-25'").fetchone()[0] == "Christmas Day"


# ── book requests (0068) ──

def _request(db, status: str) -> None:
    db.execute(
        "insert into book_requests (requester_id, title, status) values (%s, 'A book', %s)", (STUDENT_A, status),
    )


def test_under_review_is_a_valid_status(db):
    _request(db, "under_review")
    assert db.execute("select status from book_requests").fetchone()[0] == "under_review"


def test_an_unknown_request_status_is_refused(db):
    with pytest.raises(errors.CheckViolation):
        _request(db, "maybe")


def test_the_copies_limit_defaults_to_ten(db):
    db.execute("insert into library_settings (id) values (1) on conflict do nothing")
    assert db.execute("select max_copies_per_request from library_settings").fetchone()[0] == 10


def test_the_copies_limit_cant_be_zero(db):
    db.execute("insert into library_settings (id) values (1) on conflict do nothing")
    with pytest.raises(errors.CheckViolation):
        db.execute("update library_settings set max_copies_per_request = 0")


# ── reserve loan length (0069) ──

def test_the_reserve_loan_period_defaults_to_seven_days(db):
    db.execute("insert into library_settings (id) values (1) on conflict do nothing")
    assert db.execute("select reserve_loan_period_days from library_settings").fetchone()[0] == 7


def test_the_reserve_loan_period_cant_be_zero(db):
    db.execute("insert into library_settings (id) values (1) on conflict do nothing")
    with pytest.raises(errors.CheckViolation):
        db.execute("update library_settings set reserve_loan_period_days = 0")
