-- =============================================================================
-- Per-station aggregate refresh
-- =============================================================================
-- The full refresh_meter_reading_aggregates() scans all 290k+ rows in one
-- pass and hits Supabase's statement timeout.  This migration adds a
-- station-scoped variant that processes ONE station at a time so each call
-- completes in ~5–15 s well within the 30 s REST limit.
--
-- Usage:
--   select public.refresh_meter_reading_aggregates_for_station('TUNGA');
--   select public.refresh_meter_reading_aggregates_for_station('UMAISHA');
--   ... (one call per station)
--
-- The existing refresh_meter_reading_aggregates() is kept unchanged as the
-- authoritative full refresh (run from the SQL editor, no timeout).
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
    v_period    text;
    v_delta_cnt int;
    v_agg_cnt   int;
begin
    -- ── Step 1: recompute daily deltas for this station only ─────────────────
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
            else greatest(0,
                round(
                    cast(dmr.total1 - lag(dmr.total1) over w as numeric),
                    3
                ))
        end                                as delta_kwh,
        dmr.total1                         as total1_snapshot,
        dmr.remain1                        as remain1_snapshot,
        dmr.customer_id,
        dmr.customer_name,
        now()
    from public.daily_meter_readings dmr
    where dmr.station_id = p_station_id
    window w as (partition by dmr.meter_id order by dmr.reading_date asc)
    on conflict (station_id, meter_id, reading_date)
    do update set
        delta_kwh           = excluded.delta_kwh,
        total1_snapshot     = excluded.total1_snapshot,
        remain1_snapshot    = excluded.remain1_snapshot,
        customer_id         = coalesce(excluded.customer_id,   daily_meter_deltas.customer_id),
        customer_name       = coalesce(nullif(excluded.customer_name,''), daily_meter_deltas.customer_name),
        last_refreshed_at   = now();

    get diagnostics v_delta_cnt = row_count;

    -- ── Step 2: roll up period aggregates for this station only ──────────────
    v_agg_cnt := 0;
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
            count(*)
        from public.daily_meter_deltas dmd
        where dmd.station_id = p_station_id
        group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
        on conflict (station_id, meter_id, period_type, period_start)
        do update set
            kwh_total           = excluded.kwh_total,
            reading_count       = excluded.reading_count,
            customer_id         = coalesce(excluded.customer_id,   meter_consumption_aggregates.customer_id),
            customer_name       = coalesce(nullif(excluded.customer_name,''), meter_consumption_aggregates.customer_name),
            last_refreshed_at   = now();

        get diagnostics v_agg_cnt = row_count;
    end loop;

    return jsonb_build_object(
        'station',     p_station_id,
        'delta_rows',  v_delta_cnt,
        'agg_rows',    v_agg_cnt,
        'refreshed_at', now()
    );
end;
$$;

-- Grant execute to service role (PostgREST uses this for /rpc/ calls)
grant execute on function public.refresh_meter_reading_aggregates_for_station(text)
    to service_role;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
