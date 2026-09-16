-- 0024_library_settings.sql
-- Librarian Settings page (Library Info + Borrowing Rules) was entirely
-- local useState with a fake "Saved" button — nothing persisted, and
-- every borrowing-rule number shown (max books, loan period, fine rate...)
-- was a UI placeholder that didn't even match the values actually
-- enforced elsewhere (BORROW_LIMIT=3 vs the mock's "5", BORROW_PERIOD_DAYS=7
-- vs the mock's "14"). One real, shared row now backs both: routers/*.py
-- reads it at request time instead of a hardcoded constant, so a change
-- here genuinely changes system behavior for every borrower, not just
-- what one librarian's browser remembers.
--
-- Singleton by convention (id = 1, enforced below), not a table meant to
-- ever hold more than one row — same reasoning a per-user settings row
-- would use id = user_id; there's just one library. No RLS policies:
-- deny by default, service-role (admin client) only, same pattern as
-- weeding_events and every other librarian-only table in this schema.
create table if not exists library_settings (
  id                            int primary key default 1 check (id = 1),

  -- Real DLSL LRC details (verified against dlsl.edu.ph / its support
  -- hub, Sept 2026) — the campus's official trunk line, not an LRC-direct
  -- extension (none is publicly listed), and the library's own contact
  -- email, not the university's general admissions address.
  library_name                  text not null default 'De La Salle Lipa — Learning Resource Center',
  address                       text not null default 'Sen. Jose Diokno Building, 1962 J.P. Laurel National Highway, Lipa City, Batangas 4217',
  contact_email                 text not null default 'learningresourcecenter@dlsl.edu.ph',
  contact_number                text not null default '(043) 302-2900',

  -- Mirrors the real values already enforced in code at the time of this
  -- migration (BORROW_LIMIT, BORROW_PERIOD_DAYS, PICKUP_WINDOW_DAYS,
  -- DAILY_FINE_RATE) — not the Settings page's old mock display numbers,
  -- so turning this table on doesn't silently change behavior for
  -- anyone already borrowing under the real limits.
  max_books_per_borrower        int not null default 3,
  standard_loan_period_days     int not null default 7,
  max_renewals                  int not null default 2,
  renewal_period_days           int not null default 7,
  fine_per_day                  numeric(10, 2) not null default 5.00,
  max_fine_per_book             numeric(10, 2) not null default 100.00,
  reservation_hold_period_days  int not null default 3,
  max_active_reservations       int not null default 3,

  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references profiles(id)
);

insert into library_settings (id) values (1) on conflict (id) do nothing;

alter table library_settings enable row level security;
