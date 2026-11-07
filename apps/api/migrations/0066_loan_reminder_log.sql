-- 0066_loan_reminder_log.sql
-- One row per reminder sent for a loan, per channel. Replaces the once-per-
-- loan markers (loans.due_reminder_sent_at, overdue_notified_at), which can't
-- describe a reminder that repeats. Those columns stay, unused, as history.
--
-- The unique key is what stops duplicates: the API inserts the row first and
-- only sends if the insert went through. occurrence tells repeats apart: the
-- nth overdue_repeat, or the Manila date as yyyymmdd for a reminder that can
-- only go out once a day.
--
-- Existing markers are copied in, so nobody is reminded twice. The API
-- (service role) is the only reader and writer.
--
-- Additive. To undo: drop table if exists loan_reminder_log;

create table if not exists loan_reminder_log (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references loans(id) on delete cascade,
  kind        text not null check (kind in (
    'due_tomorrow', 'due_today', 'overdue_first', 'overdue_repeat',
    'reserve_due_soon', 'reserve_overdue', 'manual', 'fine_reminder'
  )),
  occurrence  integer not null default 1,
  channel     text not null check (channel in ('in_app', 'email')),
  sent_at     timestamptz not null default now(),
  unique (loan_id, kind, occurrence, channel)
);

alter table loan_reminder_log enable row level security;
revoke all on loan_reminder_log from anon, authenticated;

insert into loan_reminder_log (loan_id, kind, channel, sent_at)
select l.id, 'due_tomorrow', c.channel, l.due_reminder_sent_at
from loans l cross join (values ('in_app'), ('email')) as c(channel)
where l.due_reminder_sent_at is not null
on conflict do nothing;

insert into loan_reminder_log (loan_id, kind, channel, sent_at)
select l.id, 'overdue_first', c.channel, l.overdue_notified_at
from loans l cross join (values ('in_app'), ('email')) as c(channel)
where l.overdue_notified_at is not null
on conflict do nothing;

notify pgrst, 'reload schema';
