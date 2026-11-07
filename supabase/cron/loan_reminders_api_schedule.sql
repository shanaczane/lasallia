-- Run ONCE in the Supabase SQL editor, after migration 0066 and after the API
-- with /internal/send-loan-reminders is deployed.
-- Not in apps/api/migrations because it holds a secret.
--
-- Before running: replace <API_URL> (the Railway URL, no trailing slash) and
-- <INTERNAL_CRON_SECRET> (the same value as on the API), both places.
--
-- Replaces the old Edge Function job, so reminders can't go out twice.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'loan-reminders-daily') then
    perform cron.unschedule('loan-reminders-daily');
  end if;
end;
$$;

-- 00:00 UTC = 8:00 AM Philippine time, daily.
select cron.schedule(
  'loan-reminders-api-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := '<API_URL>/internal/send-loan-reminders',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', '<INTERNAL_CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Every 15 minutes: reserve materials, 30 minutes before and at the due time.
select cron.schedule(
  'reserve-reminders-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := '<API_URL>/internal/send-reserve-reminders',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', '<INTERNAL_CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- To see what was sent:
--   select sent_at, kind, occurrence, channel from loan_reminder_log order by sent_at desc limit 20;
-- To see whether the calls reached the API:
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- To remove:
--   select cron.unschedule('loan-reminders-api-daily');
--   select cron.unschedule('reserve-reminders-15min');
