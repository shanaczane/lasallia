-- 0012_phase7_guest_inhouse_loans.sql
-- Phase 7 of the kiosk plan: guests never open a station session or reach
-- the borrow endpoints (enforced in code, routers/sessions.py) — their
-- entire path is a librarian manually recording an in-house loan.
--
-- Guests have no Supabase account/profile row to hang a loan off of (see
-- schemas/auth.py's Role: 'guest' is really "no recognized profile role",
-- not a registered identity) — so this is a separate table with the
-- guest's details entered ad-hoc each visit, rather than extending `loans`
-- (which is keyed to student_id) or inventing a persistent guest identity
-- the plan never asked for. This also satisfies the acceptance criterion
-- that in-house loans be visibly distinct from student loans — they are,
-- structurally.
--
-- No due_date/fine columns: plan 7 says these are same-day, library-use-
-- only items with no fine schedule of their own.
create table if not exists in_house_loans (
  id                 uuid primary key default gen_random_uuid(),
  book_copy_id       uuid not null references book_copies(id),
  librarian_id       uuid not null references profiles(id),
  guest_name         text not null,
  guest_id_number    text not null,
  -- Plan 7's fee rule: "₱50.00 for non-NOCEI visitors". NOCEI-affiliated
  -- guests are exempt.
  visitor_type       text not null check (visitor_type in ('nocei', 'non_nocei')),
  fee_paid           boolean not null default false,
  purpose            text not null check (purpose in ('library_use', 'photocopy')),
  checked_out_at     timestamptz not null default now(),
  returned_at        timestamptz,
  status             text not null default 'active' check (status in ('active', 'returned')),
  notes              text
);

alter table in_house_loans enable row level security;

-- Staff-entered and staff-read only — a guest has no JWT that could ever
-- carry student_id = their own row, unlike loans' RLS pattern.
create policy in_house_loans_all_librarian
  on in_house_loans for all
  using (is_librarian())
  with check (is_librarian());
