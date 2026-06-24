-- Repair production retention functions discovered by schema lint.

create table if not exists public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null,
  incident_kind text not null,
  incident_title text not null,
  webhook_id text,
  webhook_name text,
  attempt_number integer not null default 1,
  ok boolean not null default false,
  status_code integer not null default 0,
  error_text text,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_deliveries_created_at_idx
  on public.automation_deliveries(created_at desc);

alter table public.automation_deliveries enable row level security;
alter table public.automation_deliveries force row level security;

drop policy if exists "automation deliveries service role" on public.automation_deliveries;
create policy "automation deliveries service role"
  on public.automation_deliveries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.cleanup_app_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_receipts_deleted integer := 0;
  notifications_deleted integer := 0;
  analysis_runs_deleted integer := 0;
  remote_tasks_deleted integer := 0;
  import_jobs_deleted integer := 0;
  audit_logs_deleted integer := 0;
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

  delete from public.import_jobs
  where status in ('completed', 'failed', 'cancelled')
    and coalesce(completed_at, updated_at, created_at) < now() - interval '90 days';
  get diagnostics import_jobs_deleted = row_count;

  delete from public.audit_logs
  where created_at < now() - interval '365 days';
  get diagnostics audit_logs_deleted = row_count;

  return jsonb_build_object(
    'notificationReceiptsDeleted', notification_receipts_deleted,
    'notificationsDeleted', notifications_deleted,
    'analysisRunsDeleted', analysis_runs_deleted,
    'remoteTasksDeleted', remote_tasks_deleted,
    'importJobsDeleted', import_jobs_deleted,
    'auditLogsDeleted', audit_logs_deleted
  );
end;
$$;

create or replace function public.cleanup_data_governance(
  cache_retention_days integer default 7,
  snapshot_retention_days integer default 90,
  export_retention_days integer default 180,
  print_retention_days integer default 365,
  import_retention_days integer default 365,
  write_confirmation_retention_days integer default 730,
  automation_delivery_retention_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
