-- 0043_catalog_sync.sql
-- Destiny catalog import (routers/sync.py). One-way: a MARC 21 export from
-- Follett Destiny is previewed and then applied onto books/book_copies.
-- Additive only — nothing existing is altered or dropped. Safe to re-run.
--
-- To undo:
--   drop table if exists sync_runs;
--   alter table books drop column if exists last_synced_at;

-- When a Destiny import last created or changed this book. Null for books
-- that were only ever added through Lasallia itself.
alter table books
  add column if not exists last_synced_at timestamptz;

-- One row per applied import (dry-run previews aren't logged). Read and
-- written only through the service-role client in routers/sync.py, so RLS
-- is on with no policies — no direct client access.
create table if not exists sync_runs (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'destiny_marc',
  file_name        text,
  started_by       uuid references profiles(id) on delete set null,
  records_read     int not null default 0,
  books_added      int not null default 0,
  books_updated    int not null default 0,
  books_unchanged  int not null default 0,
  copies_added     int not null default 0,
  errors           jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

alter table sync_runs enable row level security;

create index if not exists sync_runs_created_idx on sync_runs (created_at desc);
