-- 0032_loan_reminder_tracking.sql
-- Idempotency markers for the daily loan-reminders Edge Function
-- (supabase/functions/loan-reminders). The function claims a loan by
-- setting one of these from NULL before it writes the notification, so
-- re-running the job the same day (or two runs overlapping) never sends a
-- second due_reminder / overdue for the same loan. 'due_reminder' and
-- 'overdue' are already allowed by notifications_type_check and
-- schemas/notification.py — nothing to change there.
alter table loans add column if not exists due_reminder_sent_at timestamptz;
alter table loans add column if not exists overdue_notified_at  timestamptz;
