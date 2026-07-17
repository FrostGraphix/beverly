-- =============================================================================
-- Consumption Access Model
-- =============================================================================
-- Establishes the four-way consumption visibility contract:
--
--   super-admin      -> every station
--   staff (assigned) -> only their assigned station(s), any staff role
--   vendor           -> exactly one station, meter-level detail within it
--   customer         -> only their own meters (registered UNION purchased)
--
-- The wallet API queries these tables with the service role, which bypasses
-- RLS, so these policies are defence-in-depth: they make direct PostgREST
-- access safe if a client is ever pointed at these tables. Application-level
-- scoping in the route handlers remains the primary gate.
--
-- Vendors hold exactly one station. `station_ids_json` stays in place because
-- the CRM SQLite mirror still mirrors that shape; a trigger keeps it in sync
-- with the new authoritative `station_id` column.
-- =============================================================================

-- ── Vendor single-station model ──────────────────────────────────────────────

alter table public.vendor_organizations
  add column if not exists station_id text,
  add column if not exists station_ids_json jsonb not null default '[]'::jsonb,
  add column if not exists operating_stations text[] not null default '{}'::text[];

-- Backfill from whichever legacy station column this environment retained.
update public.vendor_organizations
set station_id = upper(nullif(trim(coalesce(station_ids_json->>0, operating_stations[1])), ''))
where station_id is null
  and coalesce(station_ids_json->>0, operating_stations[1], '') <> '';

-- vendor_organizations accumulated three station columns over time:
--   station_ids_json  jsonb   — original; mirrored by the CRM SQLite schema
--   operating_stations text[] — added 20260518153000; read by the admin
--                               VendorDetail view for its station count
--   station_id        text    — this migration; now the single source of truth
--
-- Rather than leave three fields to drift (an admin reassigning a vendor would
-- otherwise update one and leave VendorDetail showing a stale count), one
-- trigger derives the other two from station_id on every write.
create or replace function public.sync_vendor_station_columns()
returns trigger
language plpgsql
as $$
begin
  new.station_id := upper(nullif(trim(new.station_id), ''));
  new.station_ids_json := case
    when new.station_id is null then '[]'::jsonb
    else jsonb_build_array(new.station_id)
  end;
  new.operating_stations := case
    when new.station_id is null then '{}'::text[]
    else array[new.station_id]
  end;
  return new;
end
$$;

drop trigger if exists vendor_organizations_sync_station on public.vendor_organizations;
create trigger vendor_organizations_sync_station
  before insert or update of station_id on public.vendor_organizations
  for each row execute function public.sync_vendor_station_columns();

-- Reconcile the derived columns for rows that predate the trigger.
update public.vendor_organizations
set station_id = station_id
where station_id is not null;

create index if not exists vendor_organizations_station_idx
  on public.vendor_organizations(station_id);

-- ── Scope helpers ────────────────────────────────────────────────────────────

-- The single station assigned to the calling vendor user, or '' when none.
create or replace function public.current_vendor_station_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select upper(vo.station_id)
    from public.vendor_organizations vo
    where vo.id = (select private.current_vendor_organization_id())
      and coalesce(vo.station_id, '') <> ''
    limit 1
  ), '')
$$;

-- Meters the calling customer may see: registered meters UNION meters they
-- have actually purchased tokens for. A customer who bought for a meter but
-- never registered it still sees that meter's consumption.
create or replace function public.current_customer_meter_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct meter_id), '{}'::text[])
  from (
    select cm.meter_id
    from public.customer_meters cm
    where cm.customer_id = (select private.current_customer_id())
      and coalesce(cm.meter_id, '') <> ''
    union
    select po.meter_id
    from public.purchase_orders po
    where po.actor_type = 'customer'
      and po.actor_id = (select private.current_customer_id())
      and coalesce(po.meter_id, '') <> ''
  ) meters
$$;

grant execute on function public.current_vendor_station_id() to authenticated;
grant execute on function public.current_customer_meter_ids() to authenticated;

-- ── RLS: meter_consumption_aggregates ────────────────────────────────────────
-- Created by 20260521210000 with no policies; the 20260702150000 blanket loop
-- force-enabled RLS, leaving it deny-all. These policies make each audience's
-- legitimate slice readable and nothing more.

alter table public.meter_consumption_aggregates enable row level security;
alter table public.meter_consumption_aggregates force row level security;

drop policy if exists "consumption aggregates service role" on public.meter_consumption_aggregates;
create policy "consumption aggregates service role"
  on public.meter_consumption_aggregates for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Any staff role holding the permission: super-admin sees all, everyone else
-- is confined to their assigned stations.
drop policy if exists "consumption aggregates staff scope" on public.meter_consumption_aggregates;
create policy "consumption aggregates staff scope"
  on public.meter_consumption_aggregates for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or upper(station_id) = any(public.current_station_ids())
    )
  );

drop policy if exists "consumption aggregates vendor scope" on public.meter_consumption_aggregates;
create policy "consumption aggregates vendor scope"
  on public.meter_consumption_aggregates for select to authenticated
  using (
    public.current_vendor_station_id() <> ''
    and upper(station_id) = public.current_vendor_station_id()
  );

drop policy if exists "consumption aggregates customer scope" on public.meter_consumption_aggregates;
create policy "consumption aggregates customer scope"
  on public.meter_consumption_aggregates for select to authenticated
  using (meter_id = any(public.current_customer_meter_ids()));

-- ── RLS: daily_meter_deltas ──────────────────────────────────────────────────

alter table public.daily_meter_deltas enable row level security;
alter table public.daily_meter_deltas force row level security;

drop policy if exists "meter deltas service role" on public.daily_meter_deltas;
create policy "meter deltas service role"
  on public.daily_meter_deltas for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "meter deltas staff scope" on public.daily_meter_deltas;
create policy "meter deltas staff scope"
  on public.daily_meter_deltas for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or upper(station_id) = any(public.current_station_ids())
    )
  );

drop policy if exists "meter deltas vendor scope" on public.daily_meter_deltas;
create policy "meter deltas vendor scope"
  on public.daily_meter_deltas for select to authenticated
  using (
    public.current_vendor_station_id() <> ''
    and upper(station_id) = public.current_vendor_station_id()
  );

drop policy if exists "meter deltas customer scope" on public.daily_meter_deltas;
create policy "meter deltas customer scope"
  on public.daily_meter_deltas for select to authenticated
  using (meter_id = any(public.current_customer_meter_ids()));

-- ── Indexes for the new access paths ─────────────────────────────────────────
-- Customer reads filter by a meter_id allow-list across period buckets; vendor
-- reads filter station + period. Both are covered below.

create index if not exists meter_consumption_agg_meter_period_start_idx
  on public.meter_consumption_aggregates(meter_id, period_type, period_start desc);

create index if not exists meter_consumption_agg_station_meter_idx
  on public.meter_consumption_aggregates(station_id, meter_id, period_type, period_start desc);

create index if not exists purchase_orders_customer_meter_idx
  on public.purchase_orders(actor_type, actor_id, meter_id);

create index if not exists customer_meters_customer_meter_idx
  on public.customer_meters(customer_id, meter_id);

notify pgrst, 'reload schema';
