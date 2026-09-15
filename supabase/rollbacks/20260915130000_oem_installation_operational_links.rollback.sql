-- Reviewed emergency rollback only.
-- This script refuses automatic execution.
-- Verify no application consumes these columns.
-- Replace the guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;
alter table if exists public.purchase_orders drop column if exists oem_installation_id;
alter table if exists public.meter_purchase_orders drop column if exists oem_installation_id;
alter table if exists public.customer_meters drop column if exists oem_installation_id;
alter table if exists public.daily_meter_readings drop column if exists oem_installation_id;
alter table if exists public.daily_meter_raw_duplicates drop column if exists oem_installation_id;
alter table if exists public.daily_meter_deltas drop column if exists oem_installation_id;
alter table if exists public.meter_consumption_aggregates drop column if exists oem_installation_id;
alter table if exists public.station_meter_read_rollups drop column if exists oem_installation_id;
alter table if exists public.consumption_aggregates drop column if exists oem_installation_id;
alter table if exists public.consumption_sync_station_state drop column if exists oem_installation_id;
alter table if exists public.archive_reports drop column if exists oem_installation_id;
alter table if exists public.meter_token_overrides drop column if exists oem_installation_id;
alter table if exists public.sgc_token_rules drop column if exists oem_installation_id;
commit;
