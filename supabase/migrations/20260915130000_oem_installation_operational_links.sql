-- Expand-only installation links.
-- Existing rows remain unresolved until verified backfill evidence exists.
-- Existing uniqueness and read/write behavior remain unchanged.

alter table if exists public.purchase_orders add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.meter_purchase_orders add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.customer_meters add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.daily_meter_readings add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.daily_meter_raw_duplicates add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.daily_meter_deltas add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.meter_consumption_aggregates add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.station_meter_read_rollups add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.consumption_aggregates add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.consumption_sync_station_state add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.archive_reports add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.meter_token_overrides add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;
alter table if exists public.sgc_token_rules add column if not exists oem_installation_id uuid references public.oem_installations(id) on delete restrict;

create index if not exists purchase_orders_oem_installation_idx on public.purchase_orders(oem_installation_id);
create index if not exists meter_purchase_orders_oem_installation_idx on public.meter_purchase_orders(oem_installation_id);
create index if not exists customer_meters_oem_installation_idx on public.customer_meters(oem_installation_id);
create index if not exists daily_meter_readings_oem_installation_idx on public.daily_meter_readings(oem_installation_id);
create index if not exists daily_meter_raw_duplicates_oem_installation_idx on public.daily_meter_raw_duplicates(oem_installation_id);
create index if not exists daily_meter_deltas_oem_installation_idx on public.daily_meter_deltas(oem_installation_id);
create index if not exists meter_consumption_aggregates_oem_installation_idx on public.meter_consumption_aggregates(oem_installation_id);
create index if not exists station_meter_read_rollups_oem_installation_idx on public.station_meter_read_rollups(oem_installation_id);
create index if not exists consumption_aggregates_oem_installation_idx on public.consumption_aggregates(oem_installation_id);
create index if not exists consumption_sync_station_state_oem_installation_idx on public.consumption_sync_station_state(oem_installation_id);
create index if not exists archive_reports_oem_installation_idx on public.archive_reports(oem_installation_id);
create index if not exists meter_token_overrides_oem_installation_idx on public.meter_token_overrides(oem_installation_id);
create index if not exists sgc_token_rules_oem_installation_idx on public.sgc_token_rules(oem_installation_id);

notify pgrst, 'reload schema';
