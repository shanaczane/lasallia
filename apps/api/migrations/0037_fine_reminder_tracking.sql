-- 0037_fine_reminder_tracking.sql
-- New notification type for a recurring nudge about a fine that's been
-- sitting unsettled — distinct from fine_settled (0030), which is a
-- one-time payment CONFIRMATION fired the moment a librarian marks a
-- fine paid, not a reminder before then.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'due_reminder', 'overdue', 'reservation_confirmed',
    'reservation_cancelled', 'return_confirmed',
    'loan_confirmed', 'student_activity',
    'reservation_placed', 'reservation_queue_advanced',
    'fine_settled', 'fine_reminder'
  ));

-- Last time a fine_reminder was sent for this loan. Unlike
-- due_reminder_sent_at/overdue_notified_at (0032), which mark a one-time
-- event and are never reset, an unsettled fine can sit unpaid for a long
-- time — this is re-checked on a cooldown by the loan-reminders Edge
-- Function (send again once it's been more than N days since the last
-- nudge), not a fire-once-ever marker.
alter table loans add column if not exists fine_reminder_last_sent_at timestamptz;
