-- 0010_phase4_returns.sql
-- Phase 4 of the kiosk plan: librarian-side returns, fines, and reshelving.
--
-- library_calendar backs fine computation (school-day / library-hour
-- counting — see apps/api/core/calendar.py). No rows are required for the
-- system to work: any date with no row is treated as a normal school day
-- with default hours, so this ships correct-but-generic and gets more
-- accurate as real holidays/breaks are entered later — same placeholder
-- spirit as Phase 3's BORROW_LIMIT constant.
create table if not exists library_calendar (
  date            date primary key,
  is_school_day   boolean not null default true,
  open_time       time not null default '08:00',
  close_time      time not null default '17:00'
);

alter table library_calendar enable row level security;

-- Every authenticated caller can read the calendar (it's used to preview
-- fines before they're charged); only librarians can edit it.
create policy library_calendar_select_all
  on library_calendar for select
  using (true);

create policy library_calendar_write_librarian
  on library_calendar for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

-- loans: return-time fields. All nullable — only populated once a loan is
-- actually returned (routers/loans.py's new POST /loans/{id}/return).
alter table loans
  add column if not exists condition_at_return text
    check (condition_at_return in ('good', 'fair', 'damaged', 'incomplete')),
  add column if not exists condition_notes text,
  add column if not exists fine_amount numeric(10, 2),
  add column if not exists fine_status text
    check (fine_status in ('none', 'paid', 'unsettled')),
  add column if not exists receipt_number text;
