-- 0054_inventory_items.sql
-- Inventory module: one row per copy in a check. Starting a check snapshots
-- every expected copy as 'pending', so a book borrowed later in the day
-- can't change what the check expected. A scan flips a pending row to
-- 'found'; a copy that belongs on another shelf gets its own row with
-- expected = false and result 'misplaced'; finishing the check turns every
-- remaining pending row into 'not_found'.
--
-- No RLS policies, same as inventory_sessions (0053).
create table if not exists inventory_items (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references inventory_sessions(id) on delete cascade,
  book_copy_id       uuid not null references book_copies(id) on delete cascade,

  expected           boolean not null,
  result             text not null default 'pending'
                       check (result in ('pending', 'found', 'misplaced', 'not_found')),
  -- Where the copy belongs ("Floor 2 · Aisle 7"), captured when the row is
  -- written so a Misplaced row still says where to take it.
  expected_location  text,

  scanned_at         timestamptz,
  scanned_by         uuid references profiles(id),

  resolution         text check (resolution in ('marked_missing', 'marked_found')),
  resolved_at        timestamptz,
  resolved_by        uuid references profiles(id),

  created_at         timestamptz not null default now(),

  -- A second scan of the same copy in the same check is a no-op, enforced
  -- here rather than trusted to the scan endpoint alone (two devices can
  -- scan at once — decision 6 in the build plan).
  unique (session_id, book_copy_id)
);

create index if not exists inventory_items_session_idx on inventory_items (session_id);

alter table inventory_items enable row level security;
