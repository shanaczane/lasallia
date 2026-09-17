-- 0030_notification_type_fine_settled.sql
-- New type for PATCH /loans/{id}/settle-fine (Patrons > Fines tab): lets a
-- librarian record that a previously-unsettled fine was paid after the
-- fact — the student was already returned days ago, they're just settling
-- the balance now — without re-opening the return flow. The student gets
-- a confirmation the same way loan_confirmed/return_confirmed already do.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'due_reminder', 'overdue', 'reservation_confirmed',
    'reservation_cancelled', 'return_confirmed',
    'loan_confirmed', 'student_activity',
    'reservation_placed', 'reservation_queue_advanced',
    'fine_settled'
  ));
