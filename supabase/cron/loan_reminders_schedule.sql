-- Run ONCE in the Supabase SQL editor after deploying the function
-- (`supabase functions deploy loan-reminders --project-ref <ref>`).
-- Not in apps/api/migrations because it holds a secret.
--
-- Before running: Database > Extensions > enable pg_cron and pg_net, then
-- replace <PROJECT_REF> and <SERVICE_ROLE_KEY>.
--
-- 00:00 UTC = 8:00 AM Philippine time, daily.
select cron.schedule(
  'loan-reminders-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/loan-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('loan-reminders-daily');
