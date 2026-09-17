-- 0031_reshelved_at_and_loan_date_filters.sql
-- The librarian's Borrow & Return page tracked "borrowed/returned/
-- reshelved this session" in browser memory only — refreshing the page
-- (or a shift change) silently wiped it. Borrowed/returned can already be
-- reconstructed from loans.borrowed_at/returned_at (see the new date-range
-- filters added to GET /loans in routers/loans.py), but reshelving had no
-- persisted timestamp anywhere — only book_copies.status flips, with
-- nothing recording *when*. This column is that timestamp, set every time
-- POST /loans/reshelve runs, so "reshelved today" survives a refresh the
-- same way the other two tabs now do.
alter table book_copies
  add column if not exists reshelved_at timestamptz;
