-- meter_reading_refresh_watermarks (added 20260804190000) was created without
-- RLS -- flagged Critical by Supabase's own Advisor. This is pure internal
-- cron-job state (station_id, last_run_at) with no user-facing meaning; unlike
-- daily_meter_deltas/meter_consumption_aggregates, which need customer/vendor/
-- staff-scoped SELECT policies for real application features, this table only
-- needs the same service-role-only baseline those tables also carry -- nothing
-- else should ever read or write it. The refresh function itself is
-- unaffected: it runs SECURITY DEFINER as the migration-owning role, which
-- bypasses RLS regardless of policy.
alter table public.meter_reading_refresh_watermarks enable row level security;

create policy "watermarks service role" on public.meter_reading_refresh_watermarks
  for all to public
  using (auth.role() = 'service_role');
