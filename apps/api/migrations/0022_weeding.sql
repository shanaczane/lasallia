-- 0022_weeding.sql
-- Reports plan, Phase 2 — archive/restore + the weeding candidate log.
--
-- archived_at is deliberately its own nullable timestamp column, not a
-- new value on books.status: that column is largely vestigial already
-- (routers/books.py's _apply_real_availability overwrites it in-memory
-- from book_copies on every read) and 'Archives' is already taken as a
-- collection_type value (a physical section, a different concept from
-- "archived/weeded"). weeding_dismissed_at is separate from archived_at
-- on purpose — dismissing a candidate means "keep this book, don't
-- flag it again," not "remove it from the catalog."
alter table books add column if not exists archived_at timestamptz;
alter table books add column if not exists weeding_dismissed_at timestamptz;

create index if not exists books_archived_idx on books (archived_at) where archived_at is not null;

-- Append-only audit trail ("Weeding logs") — every flag/archive/
-- restore/dismiss action, never updated or deleted. No RLS policies:
-- deny by default, service-role only, same pattern as book_similarities
-- and student_recommendations.
create table if not exists weeding_events (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references books(id) on delete cascade,
  event_type    text not null check (event_type in ('archived', 'restored', 'dismissed')),
  reason        text,
  performed_by  uuid references profiles(id),
  occurred_at   timestamptz not null default now()
);

alter table weeding_events enable row level security;

create index if not exists weeding_events_book_idx on weeding_events (book_id, occurred_at desc);
create index if not exists weeding_events_occurred_idx on weeding_events (occurred_at desc);
