-- 0004_phase1_kiosk_foundation.sql
-- Phase 1 of the borrow/return kiosk plan: schema, copy-level status
-- machine, and station sessions. Does NOT touch the existing books.status/
-- accession_no/total_copies/available_copies columns or borrow_transactions
-- — those stay authoritative for the already-shipped catalog/borrow-return
-- UI until a later phase migrates the app over to book_copies.

-- ─── profiles: RFID tap credential ─────────────────────────────────────
alter table profiles
  add column if not exists rfid_uid text unique;

-- ─── books: collection type (borrowability gate comes in a later phase) ─
alter table books drop constraint if exists books_collection_type_check;
alter table books
  add column if not exists collection_type text not null default 'General';
alter table books add constraint books_collection_type_check
  check (collection_type in (
    'General', 'Reference', 'Thesis', 'Capstone', 'MTR', 'Archives',
    'Reserve', 'Story book', 'Bible'
  ));

-- ─── book_copies: one row per physical item ────────────────────────────
create table if not exists book_copies (
  id                uuid primary key default gen_random_uuid(),
  book_id           uuid not null references books(id) on delete cascade,
  accession_number  text not null unique,
  status            text not null default 'available'
                       check (status in (
                         'available', 'on_loan', 'for_reshelving', 'reserved',
                         'overdue', 'lost', 'damaged', 'missing'
                       )),
  shelf_location    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists book_copies_set_updated_at on book_copies;
create trigger book_copies_set_updated_at
  before update on book_copies
  for each row execute function set_updated_at();

create index if not exists book_copies_book_idx on book_copies (book_id);
create index if not exists book_copies_status_idx on book_copies (status);

-- ─── Status machine — enforced here, not in application code ───────────
-- Rationale: a trigger is the one enforcement point nothing can route
-- around — not the FastAPI layer, not a future script, not even this
-- app's own service-role client. Raising with errcode 23514 (check
-- violation) means PostgREST surfaces illegal transitions as a clean
-- HTTP 400 to any caller, automatically.
--
-- Allowed transitions (matches the plan's diagram exactly):
--   available      -> on_loan
--   on_loan        -> for_reshelving | reserved
--   for_reshelving -> available
--   reserved       -> on_loan | for_reshelving
-- Side states (overdue/lost/damaged/missing) can be entered from any
-- active state, and can only exit back through for_reshelving (or, for
-- overdue, directly back to on_loan once resolved) — never straight to
-- available, matching "nothing goes from On Loan straight to Available."
create or replace function book_copies_check_transition()
returns trigger as $$
declare
  is_allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  is_allowed := (old.status, new.status) in (
    ('available', 'on_loan'),
    ('on_loan', 'for_reshelving'),
    ('on_loan', 'reserved'),
    ('for_reshelving', 'available'),
    ('reserved', 'on_loan'),
    ('reserved', 'for_reshelving'),
    ('available', 'overdue'), ('on_loan', 'overdue'), ('reserved', 'overdue'), ('for_reshelving', 'overdue'),
    ('available', 'lost'), ('on_loan', 'lost'), ('reserved', 'lost'), ('for_reshelving', 'lost'),
    ('available', 'damaged'), ('on_loan', 'damaged'), ('reserved', 'damaged'), ('for_reshelving', 'damaged'),
    ('available', 'missing'), ('on_loan', 'missing'), ('reserved', 'missing'), ('for_reshelving', 'missing'),
    ('overdue', 'for_reshelving'), ('overdue', 'on_loan'),
    ('lost', 'for_reshelving'),
    ('damaged', 'for_reshelving'),
    ('missing', 'for_reshelving')
  );

  if not is_allowed then
    raise exception 'Illegal book_copies status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists book_copies_enforce_status_machine on book_copies;
create trigger book_copies_enforce_status_machine
  before update on book_copies
  for each row execute function book_copies_check_transition();

-- ─── Migrate existing books -> book_copies, 1:1 ────────────────────────
-- Every current book row already represents exactly one physical copy
-- (confirmed: all 185 accession numbers are unique, no title repeats),
-- so this is a clean, lossless copy — not a real "split" of shared data.
insert into book_copies (book_id, accession_number, status, shelf_location)
select
  id,
  accession_no,
  case status
    when 'available' then 'available'
    when 'borrowed'  then 'on_loan'
    when 'reserved'  then 'reserved'
    when 'misplaced' then 'missing'
    else 'available'
  end,
  shelf_location
from books
where accession_no is not null
on conflict (accession_number) do nothing;

-- ─── station_sessions ───────────────────────────────────────────────────
-- Written only via the service-role client (see routers/sessions.py) —
-- an RFID tap has no Supabase JWT to satisfy RLS with, and manual_login
-- sessions use the identical code path so both auth methods produce
-- indistinguishable rows. RLS stays enabled with no policies: deny by
-- default for every other caller.
create table if not exists station_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  auth_method  text not null check (auth_method in ('manual_login', 'rfid')),
  station_id   text not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);

alter table station_sessions enable row level security;

create index if not exists station_sessions_student_idx on station_sessions (student_id);

-- ─── Phase 1 seed data (acceptance criteria: multi-copy title, a title
-- with zero copies available, a non-borrowable collection type, one
-- RFID-tappable test account) ───────────────────────────────────────────

-- One extra copy of an existing title -> "multiple copies"
insert into book_copies (book_id, accession_number, status, shelf_location)
select id, accession_no || '-C2', 'available', shelf_location
from books
where accession_no is not null
order by title
limit 1
on conflict (accession_number) do nothing;

-- Take a different title's only copy off the shelf -> "zero available".
-- Explicitly excludes the multi-copy title above (rather than relying on
-- row offset, which breaks once that title has 2 rows instead of 1).
update book_copies set status = 'on_loan'
where id = (
  select bc.id
  from book_copies bc
  join books b on b.id = bc.book_id
  where b.id <> (select id from books where accession_no is not null order by title limit 1)
  order by b.title
  limit 1
);

-- Mark a third title non-borrowable
update books set collection_type = 'Reference'
where id = (select id from books order by title offset 2 limit 1);

-- Fake RFID UID on one real seeded account, since no reader hardware
-- exists to test against — replace with a real UID once available.
update profiles set rfid_uid = 'TEST-RFID-0001'
where email = 'shana_czane_cruzat@dlsl.edu.ph' and rfid_uid is null;
