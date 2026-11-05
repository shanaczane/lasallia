-- 0057_kiosk_borrow_security.sql
-- Kiosk borrowing is now confirmed in three steps: the student taps their ID,
-- types the accession number on their own signed-in phone, then taps their
-- ID again at the kiosk. The phone's answers wait on the hold until that
-- second tap creates the loan.
--
-- The kiosk and hold timers move from code into Library Settings so the
-- librarian can change them.

alter table library_settings
  add column if not exists kiosk_idle_timeout_seconds  int not null default 90  check (kiosk_idle_timeout_seconds >= 30),
  add column if not exists kiosk_idle_warning_seconds  int not null default 15  check (kiosk_idle_warning_seconds >= 5),
  add column if not exists hold_duration_seconds       int not null default 180 check (hold_duration_seconds >= 60),
  add column if not exists hold_extend_window_seconds  int not null default 45  check (hold_extend_window_seconds >= 10),
  add column if not exists hold_max_seconds            int not null default 540 check (hold_max_seconds >= 60),
  add column if not exists kiosk_tap_confirm_seconds   int not null default 60  check (kiosk_tap_confirm_seconds >= 15);

-- Set when the phone has checked the accession number; the loan is created
-- by the second ID tap at the kiosk, using these answers.
alter table soft_holds
  add column if not exists verified_at        timestamptz,
  add column if not exists pending_condition  text,
  add column if not exists pending_purpose    text,
  add column if not exists pending_notes      text;
