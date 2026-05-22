-- =============================================================================
-- Meter Reading Aggregates
-- =============================================================================
-- Pre-computed consumption (kWh) derived from daily_meter_readings.total1
-- odometer deltas.
--
-- Two tables:
--
--   daily_meter_deltas           — one row per (station, meter, date)
--                                  storing the delta kWh for that day.
--                                  Computed via LAG() on total1.
--
--   meter_consumption_aggregates — rolled-up totals per
--                                  (station, meter, period_type, period_start).
--                                  period_type: 'day' | 'week' | 'month' | 'year'
--
-- Refreshed by refresh_meter_reading_aggregates() called every 6 h.
-- readStationConsumptionAnalytics() and readDailyMeterSummary() query these
-- tables directly so they never scan the full daily_meter_readings table on
-- every request.
-- =============================================================================

-- ── Table 1: daily delta kWh per meter ───────────────────────────────────────

create table if not exists public.daily_meter_deltas (
    station_id          text            not null,
    meter_id            text            not null,
    reading_date        date            not null,
    delta_kwh           numeric(12,3)   not null default 0,
    total1_snapshot     numeric,            -- cumulative register reading that day
    remain1_snapshot    numeric,            -- remaining balance that day
    customer_id         text,
    customer_name       text,
    last_refreshed_at   timestamptz     not null default now(),
    constraint daily_meter_deltas_pk unique (station_id, meter_id, reading_date)
);

create index if not exists daily_meter_deltas_station_date_idx
    on public.daily_meter_deltas(station_id, reading_date desc);

create index if not exists daily_meter_deltas_meter_date_idx
    on public.daily_meter_deltas(meter_id, reading_date desc);

-- ── Table 2: period-level rollups ─────────────────────────────────────────────

create table if not exists public.meter_consumption_aggregates (
    station_id          text            not null,
    meter_id            text            not null,
    customer_id         text,
    customer_name       text,
    period_type         text            not null,   -- 'day' | 'week' | 'month' | 'year'
    period_start        date            not null,   -- first day of the period
    kwh_total           numeric(14,3)   not null default 0,
    reading_count       int             not null default 0,
    last_refreshed_at   timestamptz     not null default now(),
    constraint meter_consumption_aggregates_pk
        unique (station_id, meter_id, period_type, period_start),
    constraint meter_consumption_aggregates_period_check
        check (period_type in ('day','week','month','year'))
);

create index if not exists meter_consumption_agg_station_period_idx
    on public.meter_consumption_aggregates(station_id, period_type, period_start desc);

create index if not exists meter_consumption_agg_meter_period_idx
    on public.meter_consumption_aggregates(meter_id, period_type, period_start desc);

-- =============================================================================
-- Refresh function
-- =============================================================================
-- Step 1 — recompute daily_meter_deltas from daily_meter_readings using LAG().
--           The first reading per meter has delta = 0 (no prior baseline).
--           Readings where total1 < 0 (sentinel -1) produce delta = 0.
--
-- Step 2 — aggregate daily_meter_deltas into meter_consumption_aggregates for
--           each period_type.
--
-- Fully idempotent via INSERT ... ON CONFLICT DO UPDATE.
-- Safe to run repeatedly.
-- =============================================================================

create or replace function public.refresh_meter_reading_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_period text;
begin
    -- ── Step 1: recompute daily deltas ────────────────────────────────────────
    insert into public.daily_meter_deltas
        (station_id, meter_id, reading_date,
         delta_kwh, total1_snapshot, remain1_snapshot,
         customer_id, customer_name, last_refreshed_at)
    select
        dmr.station_id,
        dmr.meter_id,
        dmr.reading_date,
        -- delta: current - previous, clamped to 0; sentinel (-1) readings produce 0
        case
            when dmr.total1 is null or dmr.total1 < 0 then 0
            when lag(dmr.total1) over w is null         then 0
            when lag(dmr.total1) over w < 0             then 0
            else greatest(0,
                round(
                    cast(dmr.total1 - lag(dmr.total1) over w as numeric),
                    3
                ))
        end                             as delta_kwh,
        dmr.total1                      as total1_snapshot,
        dmr.remain1                     as remain1_snapshot,
        dmr.customer_id,
        dmr.customer_name,
        now()
    from public.daily_meter_readings dmr
    window w as (partition by dmr.station_id, dmr.meter_id order by dmr.reading_date asc)
    on conflict (station_id, meter_id, reading_date)
    do update set
        delta_kwh           = excluded.delta_kwh,
        total1_snapshot     = excluded.total1_snapshot,
        remain1_snapshot    = excluded.remain1_snapshot,
        customer_id         = coalesce(excluded.customer_id, daily_meter_deltas.customer_id),
        customer_name       = coalesce(nullif(excluded.customer_name, ''), daily_meter_deltas.customer_name),
        last_refreshed_at   = now();

    -- ── Step 2: aggregate into period buckets ─────────────────────────────────
    foreach v_period in array array['day','week','month','year']
    loop
        insert into public.meter_consumption_aggregates
            (station_id, meter_id, customer_id, customer_name,
             period_type, period_start, kwh_total, reading_count, last_refreshed_at)
        select
            dmd.station_id,
            dmd.meter_id,
            -- take most recent non-empty customer_id / name for the meter
            (array_agg(dmd.customer_id   order by dmd.reading_date desc) filter (where dmd.customer_id   is not null and dmd.customer_id   <> ''))[1],
            (array_agg(dmd.customer_name order by dmd.reading_date desc) filter (where dmd.customer_name is not null and dmd.customer_name <> ''))[1],
            v_period,
            date_trunc(v_period, dmd.reading_date)::date,
            round(sum(dmd.delta_kwh), 3),
            count(*),
            now()
        from public.daily_meter_deltas dmd
        group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
        on conflict (station_id, meter_id, period_type, period_start)
        do update set
            kwh_total           = excluded.kwh_total,
            reading_count       = excluded.reading_count,
            customer_id         = coalesce(excluded.customer_id,   meter_consumption_aggregates.customer_id),
            customer_name       = coalesce(nullif(excluded.customer_name,''), meter_consumption_aggregates.customer_name),
            last_refreshed_at   = now();
    end loop;

    if to_regclass('public.station_meter_read_rollups') is not null then
        insert into public.station_meter_read_rollups
            (station_id, meters_with_latest, earliest_latest_reading, latest_reading, latest_odometer_kwh, refreshed_at)
        with latest as (
            select distinct on (station_id, meter_id)
                station_id,
                meter_id,
                reading_date,
                total1_snapshot
            from public.daily_meter_deltas
            where station_id is not null
              and meter_id is not null
              and reading_date is not null
              and total1_snapshot is not null
              and total1_snapshot >= 0
            order by station_id, meter_id, reading_date desc
        )
        select
            station_id,
            count(*)::integer,
            min(reading_date)::date,
            max(reading_date)::date,
            round(sum(total1_snapshot)::numeric, 3),
            now()
        from latest
        group by station_id
        on conflict (station_id)
        do update set
            meters_with_latest     = excluded.meters_with_latest,
            earliest_latest_reading = excluded.earliest_latest_reading,
            latest_reading          = excluded.latest_reading,
            latest_odometer_kwh     = excluded.latest_odometer_kwh,
            refreshed_at            = now();
    end if;
end;
$$;

-- =============================================================================
-- Schedule via pg_cron (every 6 hours)
-- pg_cron must be enabled: Database → Extensions → pg_cron
-- =============================================================================

-- Remove any previous full-table cron job (times out on large histories)
select cron.unschedule('refresh-meter-reading-aggregates')
from cron.job
where jobname = 'refresh-meter-reading-aggregates'
limit 1;

-- =============================================================================
-- Schedule per-station refreshes staggered 2 min apart.
-- Each station (~40-80 k rows) completes well within statement limits.
-- Full-table refresh_meter_reading_aggregates() is kept for SQL-editor use.
-- =============================================================================
select cron.unschedule(j) from unnest(array[
    'refresh-meter-agg-tunga','refresh-meter-agg-umaisha','refresh-meter-agg-ogufa',
    'refresh-meter-agg-kyakale','refresh-meter-agg-musha'
]) as j
where exists (select 1 from cron.job where jobname = j);

select cron.schedule('refresh-meter-agg-tunga',   '30 */6 * * *', $$select public.refresh_meter_reading_aggregates_for_station('TUNGA')$$);
select cron.schedule('refresh-meter-agg-umaisha',  '32 */6 * * *', $$select public.refresh_meter_reading_aggregates_for_station('UMAISHA')$$);
select cron.schedule('refresh-meter-agg-ogufa',    '34 */6 * * *', $$select public.refresh_meter_reading_aggregates_for_station('OGUFA')$$);
select cron.schedule('refresh-meter-agg-kyakale',  '36 */6 * * *', $$select public.refresh_meter_reading_aggregates_for_station('KYAKALE')$$);
select cron.schedule('refresh-meter-agg-musha',    '38 */6 * * *', $$select public.refresh_meter_reading_aggregates_for_station('MUSHA')$$);

-- NOTE: Initial seed → run:  node tools/seed-meter-aggregates.mjs
-- (full-table RPC times out via REST; per-station JS script does not)

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
