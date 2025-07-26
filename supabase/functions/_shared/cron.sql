-- Supabase cron job configuration for auto-sync
-- This sets up automatic synchronization with Odoo at regular intervals

-- Create the pg_cron extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule auto-sync to run every 2 hours
-- This will trigger the auto-sync edge function which handles the sync logic
SELECT cron.schedule(
    'odoo-auto-sync',           -- job name
    '0 */2 * * *',              -- cron expression: every 2 hours at minute 0
    $$
    SELECT
      net.http_post(
          url:='https://your-project.supabase.co/functions/v1/auto-sync',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);

-- Alternative: Schedule auto-sync to run every 30 minutes during business hours (9 AM to 5 PM, Monday to Friday)
-- Uncomment the following if you prefer this schedule instead:

-- SELECT cron.schedule(
--     'odoo-auto-sync-business-hours',
--     '0,30 9-17 * * 1-5',        -- Every 30 minutes during business hours, weekdays only
--     $$
--     SELECT
--       net.http_post(
--           url:='https://your-project.supabase.co/functions/v1/auto-sync',
--           headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
--           body:='{}'::jsonb
--       ) as request_id;
--     $$
-- );

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- To remove the scheduled job if needed:
-- SELECT cron.unschedule('odoo-auto-sync');