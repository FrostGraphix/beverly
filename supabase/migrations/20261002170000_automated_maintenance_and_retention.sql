begin;
-- Automated Data Governance & Daily Maintenance Expansion
-- Ensures that ephemeral cache (api_cache), short-lived snapshots (operational_snapshots),
-- and historical pg_cron execution logs (cron.job_run_details) are automatically
-- purged on a daily schedule, preventing disk bloat.

create or replace function public.cleanup_data_governance(
  cache_retention_days integer default 1,
  snapshot_retention_days integer default 1,
  export_retention_days integer default 180,
  print_retention_days integer default 365,
  import_retention_days integer default 365,
  write_confirmation_retention_days integer default 730,
  automation_delivery_retention_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb := '{}'::jsonb;
  deleted_count integer;
begin
  delete from public.api_cache where updated_at < now() - make_interval(days => cache_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('api_cache', deleted_count);

  delete from public.operational_snapshots
  where (expires_at is not null and expires_at < now())
     or captured_at < now() - make_interval(days => snapshot_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('operational_snapshots', deleted_count);

  delete from public.export_jobs where created_at < now() - make_interval(days => export_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('export_jobs', deleted_count);

  delete from public.print_jobs where created_at < now() - make_interval(days => print_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('print_jobs', deleted_count);

  delete from public.import_jobs where created_at < now() - make_interval(days => import_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('import_jobs', deleted_count);

  delete from public.write_confirmations where created_at < now() - make_interval(days => write_confirmation_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('write_confirmations', deleted_count);

  delete from public.automation_deliveries where created_at < now() - make_interval(days => automation_delivery_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('automation_deliveries', deleted_count);

  return result;
end;
$$;
-- Expand cleanup_app_retention (invoked nightly by pg_cron job cleanup_app_retention_daily at 02:20 UTC)
-- to purge expired operational snapshots, stale API cache, and cron job run logs older than 7 days.
create or replace function public.cleanup_app_retention()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_receipts_deleted integer := 0;
  notifications_deleted integer := 0;
  analysis_runs_deleted integer := 0;
  remote_tasks_deleted integer := 0;
  operational_snapshots_deleted integer := 0;
  api_cache_deleted integer := 0;
  cron_logs_deleted integer := 0;
begin
  delete from public.notification_receipts
  where coalesce(dismissed_at, read_at, created_at) < now() - interval '180 days';
  get diagnostics notification_receipts_deleted = row_count;

  delete from public.notifications
  where (expires_at is not null and expires_at < now() - interval '30 days')
     or (expires_at is null and created_at < now() - interval '90 days');
  get diagnostics notifications_deleted = row_count;

  delete from public.analysis_runs
  where status <> 'running' and started_at < now() - interval '60 days';
  get diagnostics analysis_runs_deleted = row_count;

  delete from public.remote_tasks
  where status in ('completed', 'failed', 'cancelled', 'timed_out')
    and queued_at < now() - interval '60 days';
  get diagnostics remote_tasks_deleted = row_count;

  delete from public.operational_snapshots
  where (expires_at is not null and expires_at < now())
     or captured_at < now() - interval '1 day';
  get diagnostics operational_snapshots_deleted = row_count;

  delete from public.api_cache
  where updated_at < now() - interval '1 day';
  get diagnostics api_cache_deleted = row_count;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    delete from cron.job_run_details
    where start_time < now() - interval '7 days';
    get diagnostics cron_logs_deleted = row_count;
  end if;

  return jsonb_build_object(
    'notificationReceiptsDeleted', notification_receipts_deleted,
    'notificationsDeleted', notifications_deleted,
    'analysisRunsDeleted', analysis_runs_deleted,
    'remoteTasksDeleted', remote_tasks_deleted,
    'operationalSnapshotsDeleted', operational_snapshots_deleted,
    'apiCacheDeleted', api_cache_deleted,
    'cronLogsDeleted', cron_logs_deleted,
    'cleanedAt', now()
  );
end;
$$;
revoke all on function public.cleanup_data_governance(integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.cleanup_app_retention() from public, anon, authenticated;
grant execute on function public.cleanup_data_governance(integer, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.cleanup_app_retention() to service_role;
notify pgrst, 'reload schema';
commit;
