-- =============================================================================
-- P1 — Bound the aggregate orphan prune to the delta retention window
-- =============================================================================
-- Two migrations implement contradictory retention policies:
--
--   20260717130000_consumption_refresh_prune_orphans.sql  and
--   20260722150000_optimize_consumption_aggregate_pruning.sql
--       delete any meter_consumption_aggregates bucket with no backing delta.
--
--   20260725100000_database_quota_resolution.sql
--       prunes daily_meter_deltas to 90 days, explicitly intending to preserve the
--       rollups: "Monthly and yearly rollups remain 100% intact for long-term trends".
--
-- Net effect: every month/year bucket older than the delta window is orphaned by
-- construction, and is deleted on the next successful refresh.
--
-- Measured against live data on 2026-08-01:
--   per-station delete, unguarded : 9,273 month + 444 year = NGN 21,380,551.50
--   per-station delete, guarded   : 0 rows
--   wrapper delete, unguarded     : 10 month + 4 year      = NGN 0.00
--   delta window                  : 2026-05-03 .. 2026-07-29
--   current_date - 90 days        : 2026-05-03  (boundary aligns exactly)
--
-- These rows survive today only because cron job 7 has failed since 2026-07-14.
-- Job 7 has succeeded 62 times historically, so the risk is live, not theoretical.
--
-- Both bodies below are reproduced verbatim from pg_proc.prosrc as captured on
-- 2026-08-01. The ONLY change in each is the added period_start guard.
--
-- This migration deliberately does NOT alter the wrapper's statement_timeout.
-- That is the job 7 root cause and belongs to P5; fixing it here would make the
-- job start succeeding before the rest of the refresh contract is in place.
-- =============================================================================

create or replace function public.refresh_meter_reading_aggregates_for_station(p_station_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $fn$
declare
  v_period text;
  v_delta_cnt int;
  v_agg_cnt int;
  v_pruned_d int := 0;
  v_pruned_a int := 0;
  v_pruned_loop int;
begin
  with reading_steps as (
    select dmr.*,
      lag(dmr.total1) over (partition by dmr.station_id, dmr.meter_id order by dmr.reading_date) previous_total1
    from public.daily_meter_readings dmr where dmr.station_id = p_station_id
  ), deltas as (
    select rs.*,
      case when rs.total1 is null or rs.total1 < 0 or rs.previous_total1 is null or rs.previous_total1 < 0 then 0
           else greatest(0, round(cast(rs.total1 - rs.previous_total1 as numeric), 3)) end computed_delta
    from reading_steps rs
  ), valued as (
    select d.*, coalesce(ath.tariff_id, '') resolved_tariff_id,
      case when trh.is_valid and trh.effective_price_ngn > 0 then trh.effective_price_ngn end resolved_price
    from deltas d
    left join lateral (
      select h.tariff_id from public.account_tariff_history h
      where upper(h.station_id) = upper(d.station_id) and h.meter_id = d.meter_id
        and h.effective_from <= d.reading_date
      order by h.effective_from desc, h.observed_at desc limit 1
    ) ath on true
    left join lateral (
      select h.effective_price_ngn, h.is_valid from public.tariff_rate_history h
      where upper(h.tariff_id) = upper(coalesce(ath.tariff_id, ''))
        and h.effective_from <= d.reading_date
        and (upper(h.station_scope) = upper(d.station_id) or h.station_scope = '*')
      order by (upper(h.station_scope) = upper(d.station_id)) desc, h.effective_from desc, h.observed_at desc
      limit 1
    ) trh on true
  )
  insert into public.daily_meter_deltas
    (station_id, meter_id, reading_date, delta_kwh, total1_snapshot, remain1_snapshot,
     customer_id, customer_name, tariff_id, effective_price_ngn, tariff_value_ngn,
     priced_kwh, unpriced_kwh, last_refreshed_at)
  select station_id, meter_id, reading_date, computed_delta, total1, remain1, customer_id,
    customer_name, resolved_tariff_id, resolved_price,
    case when resolved_price is not null then round(computed_delta * resolved_price, 2) else 0 end,
    case when resolved_price is not null then computed_delta else 0 end,
    case when resolved_price is null then computed_delta else 0 end, now()
  from valued
  on conflict (station_id, meter_id, reading_date) do update set
    delta_kwh = excluded.delta_kwh, total1_snapshot = excluded.total1_snapshot,
    remain1_snapshot = excluded.remain1_snapshot,
    customer_id = coalesce(excluded.customer_id, daily_meter_deltas.customer_id),
    customer_name = coalesce(nullif(excluded.customer_name, ''), daily_meter_deltas.customer_name),
    tariff_id = excluded.tariff_id, effective_price_ngn = excluded.effective_price_ngn,
    tariff_value_ngn = excluded.tariff_value_ngn, priced_kwh = excluded.priced_kwh,
    unpriced_kwh = excluded.unpriced_kwh, last_refreshed_at = now();
  get diagnostics v_delta_cnt = row_count;

  delete from public.daily_meter_deltas dmd
  where dmd.station_id = p_station_id and not exists (
    select 1 from public.daily_meter_readings dmr
    where dmr.station_id = dmd.station_id and dmr.meter_id = dmd.meter_id
      and dmr.reading_date = dmd.reading_date
  );
  get diagnostics v_pruned_d = row_count;

  foreach v_period in array array['day','week','month','year'] loop
    insert into public.meter_consumption_aggregates
      (station_id, meter_id, customer_id, customer_name, period_type, period_start,
       kwh_total, tariff_value_ngn, priced_kwh, unpriced_kwh, reading_count, last_refreshed_at)
    select dmd.station_id, dmd.meter_id,
      (array_agg(dmd.customer_id order by dmd.reading_date desc) filter (where coalesce(dmd.customer_id, '') <> ''))[1],
      (array_agg(dmd.customer_name order by dmd.reading_date desc) filter (where coalesce(dmd.customer_name, '') <> ''))[1],
      v_period, date_trunc(v_period, dmd.reading_date)::date,
      round(sum(dmd.delta_kwh), 3), round(sum(dmd.tariff_value_ngn), 2),
      round(sum(dmd.priced_kwh), 3), round(sum(dmd.unpriced_kwh), 3), count(*), now()
    from public.daily_meter_deltas dmd where dmd.station_id = p_station_id
    group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
    on conflict (station_id, meter_id, period_type, period_start) do update set
      kwh_total = excluded.kwh_total, tariff_value_ngn = excluded.tariff_value_ngn,
      priced_kwh = excluded.priced_kwh, unpriced_kwh = excluded.unpriced_kwh,
      reading_count = excluded.reading_count,
      customer_id = coalesce(excluded.customer_id, meter_consumption_aggregates.customer_id),
      customer_name = coalesce(nullif(excluded.customer_name, ''), meter_consumption_aggregates.customer_name),
      last_refreshed_at = now();
    get diagnostics v_agg_cnt = row_count;

    delete from public.meter_consumption_aggregates mca
    where mca.station_id = p_station_id and mca.period_type = v_period
      -- P1 GUARD: daily_meter_deltas is pruned to 90 days by cron job 18. Outside
      -- that window the absence of a delta proves nothing, so pruning there destroys
      -- history no source can regenerate (upstream /api/tariff/read carries current
      -- state only, no time series). Measured exposure without this guard:
      -- 9,273 month rows + 444 year rows = NGN 21,380,551.50 / 62,370.5 kWh.
      and mca.period_start >= (current_date - interval '90 days')
      and not exists (
      select 1 from public.daily_meter_deltas dmd
      where dmd.station_id = mca.station_id and dmd.meter_id = mca.meter_id
        and dmd.reading_date >= mca.period_start
        and dmd.reading_date < case v_period
          when 'day' then mca.period_start + 1
          when 'week' then mca.period_start + 7
          when 'month' then (mca.period_start + interval '1 month')::date
          else (mca.period_start + interval '1 year')::date
        end
    );
    get diagnostics v_pruned_loop = row_count;
    v_pruned_a := v_pruned_a + v_pruned_loop;
  end loop;

  return jsonb_build_object('station', p_station_id, 'delta_rows', v_delta_cnt,
    'agg_rows', v_agg_cnt, 'pruned_deltas', v_pruned_d, 'pruned_aggs', v_pruned_a,
    'refreshed_at', now());
end;
$fn$;

create or replace function public.refresh_meter_reading_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
    -- P1 GUARD (rationale as in the per-station function).
    -- Measured exposure here: 10 month + 4 year rows, NGN 0.00.
    where mca.period_start >= (current_date - interval '90 days')
      and not exists (
        select 1 from public.daily_meter_deltas dmd
        where dmd.station_id = mca.station_id
          and dmd.meter_id   = mca.meter_id
    );
end;
$fn$;

notify pgrst, 'reload schema';
