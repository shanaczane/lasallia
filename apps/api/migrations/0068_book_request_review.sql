-- 0068_book_request_review.sql
-- A review step for book requests, a stored reason when one is rejected, and
-- a limit on copies per request. The API enforces the order of the statuses:
-- pending -> under_review -> approved or rejected, approved -> fulfilled.
-- Only the requester can cancel. Existing rows keep their status.
--
-- Additive. To undo (first move any under_review rows back to pending):
--   alter table book_requests drop constraint book_requests_status_check;
--   alter table book_requests add constraint book_requests_status_check
--     check (status in ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled'));
--   alter table book_requests drop column rejection_reason;
--   alter table library_settings drop column max_copies_per_request;

alter table book_requests
  drop constraint if exists book_requests_status_check;

alter table book_requests
  add constraint book_requests_status_check
  check (status in ('pending', 'under_review', 'approved', 'rejected', 'fulfilled', 'cancelled'));

alter table book_requests
  add column if not exists rejection_reason text;

alter table library_settings
  add column if not exists max_copies_per_request integer not null default 10
    check (max_copies_per_request >= 1);

notify pgrst, 'reload schema';
