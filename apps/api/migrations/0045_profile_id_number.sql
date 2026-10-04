-- 0045_profile_id_number.sql
-- profiles has had no student-number/faculty-number column (see the
-- comment on import_rfid_enrollment.py — email was the only reliably-
-- unique field a roster row could carry). Adds one generic `id_number`
-- column that holds a student's or faculty's school-issued number (same
-- "one column, role tells you which kind" shape as `program`, which
-- already holds a degree program for students and a college name for
-- faculty — see routers/auth.py's update_me). A plain unique constraint
-- is enough: Postgres allows any number of NULLs through it, so rows that
-- predate this column (or a guest/librarian account that never gets one)
-- aren't blocked from existing side by side.
alter table profiles
  add column if not exists id_number text;

create unique index if not exists profiles_id_number_key
  on profiles (id_number)
  where id_number is not null;
