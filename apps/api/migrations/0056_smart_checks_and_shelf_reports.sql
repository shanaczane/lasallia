-- 0056_smart_checks_and_shelf_reports.sql
-- Two ways to make inventory lighter for the librarian.
--
-- 1. Smart checks: a check can skip every copy the system has already seen
--    recently (returned from a loan or in-house use, or found in another
--    check). skip_seen_since is the cutoff it used; null means a full check
--    that expects every copy on the shelf.
--
-- 2. Shelf reports: a student who can't find an "available" book on its
--    shelf taps "Can't find it?" on the book page. The librarian gets a
--    notification and checks just that one book instead of a whole aisle.
--
-- No RLS policies on shelf_reports: deny by default, service-role (admin
-- client) only, same as inventory_sessions (0053).
--
-- Undo:
--   drop table if exists shelf_reports;
--   alter table inventory_sessions drop column if exists skip_seen_since;

alter table inventory_sessions add column if not exists skip_seen_since timestamptz;

create table if not exists shelf_reports (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  reported_by  uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),

  status       text not null default 'open' check (status in ('open', 'resolved')),
  resolution   text check (resolution in ('on_shelf', 'marked_missing')),
  resolved_by  uuid references profiles(id),
  resolved_at  timestamptz
);

-- One open report per book: a second student reporting the same book joins
-- the open report instead of notifying the librarian again.
create unique index if not exists shelf_reports_one_open_per_book
  on shelf_reports (book_id)
  where status = 'open';

create index if not exists shelf_reports_created_at_idx on shelf_reports (created_at desc);

alter table shelf_reports enable row level security;
