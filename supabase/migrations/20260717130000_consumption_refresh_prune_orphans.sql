-- =============================================================================
-- Consumption refresh: prune orphans
-- =============================================================================
-- refresh_meter_reading_aggregates_for_station() only ever INSERT ... ON
-- CONFLICT DO UPDATE. It never deletes. Consequences observed:
--
--   * A reading removed from daily_meter_readings leaves its delta row behind
--     forever, and that phantom delta keeps contributing kWh to every period
--     bucket that contains it.
--   * A meter that moves station keeps its rows under the old station, so the
--     old station's totals never fall.
--   * A period bucket whose deltas all disappear keeps its last known total.
--
-- Totals could therefore only ever drift upward, and never self-correct. This
-- makes the refresh reconciling: rebuild, then delete whatever no longer has a
-- source row. Still fully idempotent.
-- =============================================================================

create or replace function public.refresh_meter_reading_aggregates_for_station(
    p_station_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
    v_period      text;
    v_delta_cnt   int;
    v_agg_cnt     int;
    v_pruned_d    int := 0;
    v_pruned_a    int := 0;
    v_pruned_loop int;
begin
    -- ── Step 1: recompute daily deltas for this station ──────────────────────
    insert into public.daily_meter_deltas
        (station_id, meter_id, reading_date,
         delta_kwh, total1_snapshot, remain1_snapshot,
         customer_id, customer_name, last_refreshed_at)
    select
        dmr.station_id,
        dmr.meter_id,
        dmr.reading_date,
        case
            when dmr.total1 is null or dmr.total1 < 0 then 0
            when lag(dmr.total1) over w is null         then 0
            when lag(dmr.total1) over w < 0             then 0
            else greatest(0, round(cast(dmr.total1 - lag(dmr.total1) over w as numeric), 3))
        end                             as delta_kwh,
        dmr.total1                      as total1_snapshot,
        dmr.remain1                     as remain1_snapshot,
        dmr.customer_id,
        dmr.customer_name,
        now()
    from public.daily_meter_readings dmr
    where dmr.station_id = p_station_id
    window w as (partition by dmr.station_id, dmr.meter_id order by dmr.reading_date asc)
    on conflict (station_id, meter_id, reading_date)
    do update set
        delta_kwh         = excluded.delta_kwh,
        total1_snapshot   = excluded.total1_snapshot,
        remain1_snapshot  = excluded.remain1_snapshot,
        customer_id       = coalesce(excluded.customer_id, daily_meter_deltas.customer_id),
        customer_name     = coalesce(nullif(excluded.customer_name, ''), daily_meter_deltas.customer_name),
        last_refreshed_at = now();

    get diagnostics v_delta_cnt = row_count;

    -- ── Step 1b: drop deltas whose source reading no longer exists ───────────
    delete from public.daily_meter_deltas dmd
    where dmd.station_id = p_station_id
      and not exists (
        select 1
        from public.daily_meter_readings dmr
        where dmr.station_id  = dmd.station_id
          and dmr.meter_id    = dmd.meter_id
          and dmr.reading_date = dmd.reading_date
      );

    get diagnostics v_pruned_d = row_count;

    -- ── Step 2: rebuild period buckets ──────────────────────────────────────
    foreach v_period in array array['day','week','month','year']
    loop
        insert into public.meter_consumption_aggregates
            (station_id, meter_id, customer_id, customer_name,
             period_type, period_start, kwh_total, reading_count, last_refreshed_at)
        select
            dmd.station_id,
            dmd.meter_id,
            (array_agg(dmd.customer_id   order by dmd.reading_date desc)
                filter (where dmd.customer_id   is not null and dmd.customer_id   <> ''))[1],
            (array_agg(dmd.customer_name order by dmd.reading_date desc)
                filter (where dmd.customer_name is not null and dmd.customer_name <> ''))[1],
            v_period,
            date_trunc(v_period, dmd.reading_date)::date,
            round(sum(dmd.delta_kwh), 3),
            count(*),
            now()
        from public.daily_meter_deltas dmd
        where dmd.station_id = p_station_id
        group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
        on conflict (station_id, meter_id, period_type, period_start)
        do update set
            kwh_total         = excluded.kwh_total,
            reading_count     = excluded.reading_count,
            customer_id       = coalesce(excluded.customer_id, meter_consumption_aggregates.customer_id),
            customer_name     = coalesce(nullif(excluded.customer_name, ''), meter_consumption_aggregates.customer_name),
            last_refreshed_at = now();

        get diagnostics v_agg_cnt = row_count;

        -- ── Step 2b: drop buckets that no longer have any backing delta ─────
        delete from public.meter_consumption_aggregates mca
        where mca.station_id  = p_station_id
          and mca.period_type = v_period
          and not exists (
            select 1
            from public.daily_meter_deltas dmd
            where dmd.station_id = mca.station_id
              and dmd.meter_id   = mca.meter_id
              and date_trunc(v_period, dmd.reading_date)::date = mca.period_start
          );

        get diagnostics v_pruned_loop = row_count;
        v_pruned_a := v_pruned_a + v_pruned_loop;
    end loop;

    return jsonb_build_object(
        'station',        p_station_id,
        'delta_rows',     v_delta_cnt,
        'agg_rows',       v_agg_cnt,
        'pruned_deltas',  v_pruned_d,
        'pruned_aggs',    v_pruned_a,
        'refreshed_at',   now()
    );
end;
$$;

grant execute on function public.refresh_meter_reading_aggregates_for_station(text)
    to service_role;

-- The all-station entry point delegates per station so both paths share the
-- same reconciling behaviour instead of drifting apart again.
create or replace function public.refresh_meter_reading_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_station text;
begin
    for v_station in
        select distinct station_id
        from public.daily_meter_readings
        where coalesce(station_id, '') <> ''
    loop
        perform public.refresh_meter_reading_aggregates_for_station(v_station);
    end loop;

    -- Stations whose readings are all gone still need their leftovers cleared.
    delete from public.daily_meter_deltas dmd
    where not exists (
        select 1 from public.daily_meter_readings dmr
        where dmr.station_id = dmd.station_id
    );

    delete from public.meter_consumption_aggregates mca
    where not exists (
        select 1 from public.daily_meter_deltas dmd
        where dmd.station_id = mca.station_id
          and dmd.meter_id   = mca.meter_id
    );
end;
$$;

notify pgrst, 'reload schema';
