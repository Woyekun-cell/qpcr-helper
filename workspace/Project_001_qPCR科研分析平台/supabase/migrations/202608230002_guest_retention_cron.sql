create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-qpcr-guest-jobs',
  '* * * * *',
  $$delete from public.guest_analysis_jobs where expires_at <= now()$$
);
