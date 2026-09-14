begin;

-- Align callable database defaults with the production policy. This keeps manual
-- service-role invocations identical to scheduled application cleanup.
create or replace function public.cleanup_data_governance(
  cache_retention_days integer default 1,
  snapshot_retention_days integer default 14,
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

  delete from public.operational_snapshots where captured_at < now() - make_interval(days => snapshot_retention_days);
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

-- Application cleanup owns only tables without a separate configured policy.
-- Import history remains 365 days. Audit logs remain indefinite.
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

  return jsonb_build_object(
    'notificationReceiptsDeleted', notification_receipts_deleted,
    'notificationsDeleted', notifications_deleted,
    'analysisRunsDeleted', analysis_runs_deleted,
    'remoteTasksDeleted', remote_tasks_deleted,
    'importJobsDeleted', 0,
    'auditLogsDeleted', 0
  );
end;
$$;

-- One canonical retention path owns consumption pruning. The old job used a
-- positional cron identifier and could delete raw readings without proving that a
-- durable archive existed. This function delegates every raw deletion to the
-- checksummed archive interlock.
create or replace function public.run_consumption_retention()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  aggregate_rows bigint := 0;
  delta_rows bigint := 0;
  reading_rows bigint := 0;
begin
  delete from public.meter_consumption_aggregates
  where period_type in ('day', 'week')
    and period_start < (current_date - interval '90 days');
  get diagnostics aggregate_rows = row_count;

  delete from public.daily_meter_deltas
  where reading_date < (current_date - interval '90 days');
  get diagnostics delta_rows = row_count;

  reading_rows := public.prune_archived_daily_meter_readings(
    (current_date - interval '90 days')::date,
    50000
  );

  return jsonb_build_object(
    'aggregateRows', aggregate_rows,
    'deltaRows', delta_rows,
    'readingRows', reading_rows,
    'hotReadingDays', 90,
    'completedAt', now()
  );
end;
$$;

revoke all on function public.run_consumption_retention() from public, anon, authenticated;
grant execute on function public.run_consumption_retention() to service_role;

-- Remove both historical owners. Recreating one named job makes migration replay
-- idempotent and prevents the unguarded twelve-month delete from surviving.
do $migration$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'nightly-database-retention-cleanup',
      'prune-archived-daily-meter-readings',
      'run-consumption-retention'
    );

    perform cron.schedule(
      'run-consumption-retention',
      '0 4 * * *',
      $job$select public.run_consumption_retention();$job$
    );
  end if;
end
$migration$;

notify pgrst, 'reload schema';

commit;
