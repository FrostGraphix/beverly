-- =============================================================================
-- Consumption Aggregates
-- =============================================================================
-- Pre-aggregated kWh consumption derived from purchase_orders.units_kwh.
-- One row per (scope, scope_id, period_type, period_start).
--
-- scope:
--   'meter'      — a single meter_id
--   'station'    — all meters under a station_id
--   'cumulative' — all meters system-wide (scope_id = 'ALL')
--
-- period_type: 'day' | 'week' | 'month' | 'year'
-- period_start: truncated date for the period (e.g. first day of the month)
--
-- Refreshed by refresh_consumption_aggregates() called every 6 h via pg_cron.
-- =============================================================================

create table if not exists public.consumption_aggregates (
    id                  bigserial       primary key,
    scope               text            not null,           -- 'meter' | 'station' | 'cumulative'
    scope_id            text            not null,           -- meter_id | station_id | 'ALL'
    period_type         text            not null,           -- 'day' | 'week' | 'month' | 'year'
    period_start        date            not null,           -- truncated to period boundary
    kwh_total           numeric(14,4)   not null default 0,
    transaction_count   int             not null default 0,
    amount_minor_total  bigint          not null default 0,
    last_refreshed_at   timestamptz     not null default now(),
    constraint consumption_aggregates_scope_check   check (scope in ('meter','station','cumulative')),
    constraint consumption_aggregates_period_check  check (period_type in ('day','week','month','year')),
    constraint consumption_aggregates_unique
        unique (scope, scope_id, period_type, period_start)
);

create index if not exists consumption_aggregates_lookup_idx
    on public.consumption_aggregates(scope, scope_id, period_type, period_start desc);

create index if not exists consumption_aggregates_station_idx
    on public.consumption_aggregates(scope_id, period_type, period_start desc)
    where scope = 'station';

-- =============================================================================
-- Refresh function
-- =============================================================================
-- Incrementally recomputes all periods that had new purchase activity since
-- the last refresh for that (scope, scope_id, period_type) combination.
-- For new meters/stations/periods not yet in the table it inserts fresh rows.
-- Safe to run repeatedly — uses INSERT ... ON CONFLICT DO UPDATE.
-- =============================================================================

create or replace function public.refresh_consumption_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_period text;
begin
    foreach v_period in array array['day','week','month','year']
    loop
        -- ── meter-level ──────────────────────────────────────────────────────
        insert into public.consumption_aggregates
            (scope, scope_id, period_type, period_start,
             kwh_total, transaction_count, amount_minor_total, last_refreshed_at)
        select
            'meter',
            po.meter_id,
            v_period,
            date_trunc(v_period, po.created_at)::date,
            coalesce(sum(po.units_kwh), 0),
            count(*),
            coalesce(sum(po.amount_minor), 0),
            now()
        from public.purchase_orders po
        where po.status = 'delivered'
          and po.units_kwh is not null
          and po.units_kwh > 0
        group by po.meter_id, date_trunc(v_period, po.created_at)::date
        on conflict (scope, scope_id, period_type, period_start)
        do update set
            kwh_total           = excluded.kwh_total,
            transaction_count   = excluded.transaction_count,
            amount_minor_total  = excluded.amount_minor_total,
            last_refreshed_at   = now();

        -- ── station-level ────────────────────────────────────────────────────
        insert into public.consumption_aggregates
            (scope, scope_id, period_type, period_start,
             kwh_total, transaction_count, amount_minor_total, last_refreshed_at)
        select
            'station',
            coalesce(po.station_id, 'UNKNOWN'),
            v_period,
            date_trunc(v_period, po.created_at)::date,
            coalesce(sum(po.units_kwh), 0),
            count(*),
            coalesce(sum(po.amount_minor), 0),
            now()
        from public.purchase_orders po
        where po.status = 'delivered'
          and po.units_kwh is not null
          and po.units_kwh > 0
          and po.station_id is not null
        group by po.station_id, date_trunc(v_period, po.created_at)::date
        on conflict (scope, scope_id, period_type, period_start)
        do update set
            kwh_total           = excluded.kwh_total,
            transaction_count   = excluded.transaction_count,
            amount_minor_total  = excluded.amount_minor_total,
            last_refreshed_at   = now();

        -- ── cumulative (system-wide) ─────────────────────────────────────────
        insert into public.consumption_aggregates
            (scope, scope_id, period_type, period_start,
             kwh_total, transaction_count, amount_minor_total, last_refreshed_at)
        select
            'cumulative',
            'ALL',
            v_period,
            date_trunc(v_period, po.created_at)::date,
            coalesce(sum(po.units_kwh), 0),
            count(*),
            coalesce(sum(po.amount_minor), 0),
            now()
        from public.purchase_orders po
        where po.status = 'delivered'
          and po.units_kwh is not null
          and po.units_kwh > 0
        group by date_trunc(v_period, po.created_at)::date
        on conflict (scope, scope_id, period_type, period_start)
        do update set
            kwh_total           = excluded.kwh_total,
            transaction_count   = excluded.transaction_count,
            amount_minor_total  = excluded.amount_minor_total,
            last_refreshed_at   = now();
    end loop;
end;
$$;

-- =============================================================================
-- Schedule via pg_cron (every 6 hours)
-- pg_cron must be enabled in Supabase: Database → Extensions → pg_cron
-- =============================================================================

-- Remove old schedule if it exists, then create fresh
select cron.unschedule('refresh-consumption-aggregates')
from cron.job
where jobname = 'refresh-consumption-aggregates'
limit 1;

select cron.schedule(
    'refresh-consumption-aggregates',
    '0 */6 * * *',          -- every 6 hours at :00
    $$select public.refresh_consumption_aggregates()$$
);

-- Run immediately to seed the table from existing purchase history
select public.refresh_consumption_aggregates();

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
