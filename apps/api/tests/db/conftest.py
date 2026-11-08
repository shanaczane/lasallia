# Database tests for migrations/0058_accession_numbers.sql and
# 0059_copy_origin.sql (applied here for every test), plus
# 0060_report_signatures.sql and 0070_assistant_usage.sql, which their own
# test files apply. They run the real SQL against a throwaway Postgres and are skipped unless
# TEST_DATABASE_URL is set. Never point it at the Supabase project: every
# test drops and recreates the public schema.
#
#   docker run --rm -d --name lasallia-test-db -e POSTGRES_PASSWORD=test -p 54329:5432 pgvector/pgvector:pg16
#   set TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/postgres
#   venv/Scripts/python.exe -m pytest tests/db
#   docker stop lasallia-test-db

import os
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DB_URL = os.environ.get("TEST_DATABASE_URL")
_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
# Applied in this order, like the live database.
MIGRATIONS = [_MIGRATIONS_DIR / "0058_accession_numbers.sql", _MIGRATIONS_DIR / "0059_copy_origin.sql"]

# The parts of books / book_copies / profiles the migration relies on, as
# they are in the live schema (see migrations 0001, 0002, 0004, 0022).
BASE_SCHEMA = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table profiles (id uuid primary key default gen_random_uuid(), full_name text);

create table books (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  author            text not null,
  isbn              text,
  accession_no      text unique,
  call_number       text not null default '',
  category          text not null default 'General',
  shelf_location    text not null default 'Aisle 1',
  status            text not null default 'available',
  collection_type   text not null default 'General',
  keywords          text[],
  total_copies      int default 1,
  available_copies  int default 1,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table book_copies (
  id                uuid primary key default gen_random_uuid(),
  book_id           uuid not null references books(id) on delete cascade,
  accession_number  text not null unique,
  status            text not null default 'available',
  shelf_location    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

grant usage on schema public to service_role, anon, authenticated;
grant all on all tables in schema public to service_role;
"""


@pytest.fixture
def db_url():
    if not DB_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    return DB_URL


@pytest.fixture
def conn(db_url):
    """A fresh schema with the migrations applied. Autocommit, like PostgREST
    (one transaction per call)."""
    with psycopg.connect(db_url, autocommit=True) as setup:
        setup.execute("drop schema if exists public cascade; create schema public;")
        setup.execute(BASE_SCHEMA)
        # Applying them twice must be harmless (every migration is re-runnable).
        for _ in range(2):
            for migration in MIGRATIONS:
                setup.execute(migration.read_text(encoding="utf-8"))
        setup.execute("grant all on all tables in schema public to service_role;")
    with psycopg.connect(db_url, autocommit=True) as c:
        yield c
