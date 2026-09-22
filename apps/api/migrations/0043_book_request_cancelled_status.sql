-- 0043_book_request_cancelled_status.sql
-- Faculty can withdraw their own request while it's still pending (before a
-- librarian has acted on it) — POST /book-requests/{id}/cancel. A distinct
-- 'cancelled' status keeps this visible and separate from 'rejected' on the
-- librarian side (that one's a librarian decision; this one is the
-- requester's own). Drops and recreates the check constraint since Postgres
-- has no ALTER CONSTRAINT for changing a check's condition in place.
alter table book_requests
  drop constraint if exists book_requests_status_check;

alter table book_requests
  add constraint book_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled'));
