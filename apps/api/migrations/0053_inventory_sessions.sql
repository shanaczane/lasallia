-- 0053_inventory_sessions.sql
-- Inventory module (docs/lasallia-inventory-build-plan.md): one row per
-- shelf check a librarian starts. A check covers one aisle, or a whole
-- floor when aisle is null — the same floor/aisle pair books already carry
-- (book_copies.shelf_location is always "Unassigned", so the book's own
-- location is the only real one).
--
-- No RLS policies: deny by default, service-role (admin client) only —
-- same pattern as book_requests (0039). Every access goes through
-- routers/inventory.py's require_librarian.
create table if not exists inventory_sessions (
  id            uuid primary key default gen_random_uuid(),
  floor         text not null,
  aisle         text,

  status        text not null default 'in_progress'
                  check (status in ('in_progress', 'completed', 'cancelled')),
  started_by    uuid not null references profiles(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references profiles(id)
);

create index if not exists inventory_sessions_started_at_idx on inventory_sessions (started_at desc);

-- One open check per location at a time — two librarians scanning the same
-- aisle join the same session instead of splitting the results across two.
-- coalesce so a whole-floor check (aisle null) is unique too.
create unique index if not exists inventory_sessions_one_open_per_location
  on inventory_sessions (floor, coalesce(aisle, ''))
  where status = 'in_progress';

alter table inventory_sessions enable row level security;
