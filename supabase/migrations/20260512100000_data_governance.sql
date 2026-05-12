create table if not exists public.data_governance_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  ok boolean not null default false,
  cleanup_json jsonb not null default '{}'::jsonb,
  permission_audit_json jsonb not null default '{}'::jsonb,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_governance_runs_created_at_idx
on public.data_governance_runs(created_at desc);

alter table public.data_governance_runs enable row level security;

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
as $$
declare
  result jsonb := '{}'::jsonb;
  deleted_count integer;
begin
  delete from public.api_cache
  where updated_at < now() - make_interval(days => cache_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('api_cache', deleted_count);

  delete from public.operational_snapshots
  where captured_at < now() - make_interval(days => snapshot_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('operational_snapshots', deleted_count);

  delete from public.export_jobs
  where created_at < now() - make_interval(days => export_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('export_jobs', deleted_count);

  delete from public.print_jobs
  where created_at < now() - make_interval(days => print_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('print_jobs', deleted_count);

  delete from public.import_jobs
  where created_at < now() - make_interval(days => import_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('import_jobs', deleted_count);

  delete from public.write_confirmations
  where created_at < now() - make_interval(days => write_confirmation_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('write_confirmations', deleted_count);

  delete from public.automation_deliveries
  where created_at < now() - make_interval(days => automation_delivery_retention_days);
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('automation_deliveries', deleted_count);

  return result;
end;
$$;
