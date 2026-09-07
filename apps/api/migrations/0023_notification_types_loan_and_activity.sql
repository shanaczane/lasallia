-- 0023_notification_types_loan_and_activity.sql
-- Two new notification types:
--   loan_confirmed   — student-facing. Sent the moment a borrow actually
--                      succeeds (confirm_loan / pickup_reservation). This
--                      was simply missing before: neither loan-creation path
--                      called notify() at all, so a successful checkout
--                      never produced a notification for the student.
--   student_activity — librarian-facing. One row per librarian for every
--                      student transaction (checkout, return, reservation
--                      placed/cancelled) — nothing notified librarians
--                      of student activity before this.
--
-- notifications.type has no name of its own in 0001_core_schema.sql, so
-- Postgres auto-named the check constraint <table>_<column>_check.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'due_reminder', 'overdue', 'reservation_confirmed',
    'reservation_cancelled', 'return_confirmed',
    'loan_confirmed', 'student_activity'
  ));
