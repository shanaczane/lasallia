-- 0028_librarian_assisted_borrow.sql
-- Desk-side librarian-assisted checkout: the librarian taps the student's
-- ID (a normal 'rfid' station_sessions row, see routers/sessions.py — it
-- doesn't care who operates the reader) and scans/types the accession
-- number of the physical book already in hand. Same loans/book_copies
-- write, same eligibility checks, same notifications as the digital kiosk
-- flow (core/loans.py) — this column is the only new state: an audit trail
-- for which librarian performed it. NULL for every ordinary self-service
-- loan.
alter table loans
  add column if not exists assisted_by uuid references profiles(id) on delete set null;
