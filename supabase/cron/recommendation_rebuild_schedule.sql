-- Run ONCE in the Supabase SQL editor, after migration 0064 and after setting
-- INTERNAL_CRON_SECRET on the API.
-- Not in apps/api/migrations because it holds a secret.
--
-- Before running: Database > Extensions > enable pg_cron and pg_net, then
-- replace <API_URL> (the Railway URL, no trailing slash) and
-- <INTERNAL_CRON_SECRET> (the same value as on the API).
--
-- 18:00 UTC = 2:00 AM Philippine time, daily. One call runs all three steps
-- in order, so they can't overlap. The API answers at once and rebuilds in
-- the background.
select cron.schedule(
  'recommendation-rebuild-nightly',
  '0 18 * * *',
  $$
  select net.http_post(
    url     := '<API_URL>/internal/rebuild-recommendations',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', '<INTERNAL_CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- To see recent runs (a partial run shows the step it reached):
--   select started_at, finished_at, status, step_reached, error, summary
--   from recommendation_rebuild_runs order by started_at desc limit 14;
-- To see whether the call reached the API:
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- To remove: select cron.unschedule('recommendation-rebuild-nightly');
