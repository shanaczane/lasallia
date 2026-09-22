-- 0044_notification_types_book_requests.sql
-- Book request lifecycle notifications: librarians hear about new/cancelled
-- requests, the requesting faculty member hears about approve/reject/
-- fulfil decisions. Dedicated types (not the generic 'student_activity'
-- broadcast support_tickets.py reuses) so both the librarian and student
-- notification feeds can give these their own icon/label instead of an
-- "Other" catch-all. Must restate the full prior list — every migration in
-- this chain does, since Postgres has no ALTER CONSTRAINT for this.
alter table notifications drop constraint if exists notifications_type_check;

alter table notifications add constraint notifications_type_check
  check (type in (
    'due_reminder', 'overdue', 'reservation_confirmed',
    'reservation_cancelled', 'return_confirmed',
    'loan_confirmed', 'student_activity',
    'reservation_placed', 'reservation_queue_advanced',
    'fine_settled', 'fine_reminder',
    'book_request_submitted', 'book_request_approved', 'book_request_rejected',
    'book_request_fulfilled', 'book_request_cancelled'
  ));
