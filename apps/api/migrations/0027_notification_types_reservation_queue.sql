-- 0027_notification_types_reservation_queue.sql
-- Two new student-facing notification types, closing gaps in the
-- reservation queue flow:
--   reservation_placed         — sent the moment a student successfully
--                                joins the queue for a title. Previously
--                                create_reservation only notified
--                                librarians; the student got no
--                                confirmation of their own action.
--   reservation_queue_advanced — sent to whoever becomes #1 in line when
--                                the reservation ahead of them is
--                                fulfilled, cancelled, or expires. They
--                                aren't getting the book yet, but knowing
--                                they're next is its own useful signal.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'due_reminder', 'overdue', 'reservation_confirmed',
    'reservation_cancelled', 'return_confirmed',
    'loan_confirmed', 'student_activity',
    'reservation_placed', 'reservation_queue_advanced'
  ));
