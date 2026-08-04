-- Fix cron job 7 (refresh-meter-reading-aggregates), which has failed on every one
-- of its last 30+ days of runs at the platform's 2-minute statement_timeout default.
-- Root cause, confirmed live: refresh_meter_reading_aggregates_for_station() recomputes
-- EVERY delta and EVERY aggregate bucket for a station from its ENTIRE reading history,
-- on every 6-hourly run, via an unbounded lag() window over all of daily_meter_readings.
-- The function already carries SET statement_timeout TO '600s', but the wrapper that
-- cron actually calls does not, and every observed failure lands at ~120s (the
-- platform default) rather than 600s -- so this migration also adds the override to
-- the wrapper, as cheap defense in depth, alongside the real fix below.
--
-- Design: only recompute deltas/aggregates for (station, meter, reading_date) rows
-- that actually changed since the function's own last successful run for that
-- station, tracked in a new watermark table. "Changed" is `updated_at` on
-- daily_meter_readings, which the table's own set_updated_at trigger already bumps
-- on every insert AND every correction -- not just `reading_date` monotonically
-- increasing. This matters: this codebase's own backfill/reconciliation tools
-- (tools/consumption-backfill-windowed.cjs etc.) intentionally re-touch historical
-- reading_date rows, and a naive "only reading_date > last-seen-date" watermark would
-- silently miss those corrections. A delta only ever depends on its own day's total1
-- and the immediately preceding day's total1 (deltas are pairwise, not a running
-- chain), so recomputation only needs to cover each touched date plus the day after
-- it (whose delta reads the touched day's total1) -- bounded, and correct regardless
-- of whether the touched row is brand new or a correction to an old date.
--
-- Existing historical delta/aggregate rows are untouched by this migration -- it only
-- changes how *future* runs compute, so there is no backfill/migration risk to
-- already-correct data.

create table if not exists public.meter_reading_refresh_watermarks (
  station_id text primary key,
  last_run_at timestamptz not null
);

-- Supports the new "which rows changed since last run" lookup this function needs.
create index if not exists daily_meter_readings_station_updated_idx
  on public.daily_meter_readings (station_id, updated_at);

create or replace function public.refresh_meter_reading_aggregates_for_station(p_station_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '600s'
as $function$
declare
  v_period text;
  v_delta_cnt int;
  v_agg_cnt int;
  v_pruned_d int := 0;
  v_pruned_a int := 0;
  v_pruned_loop int;
  v_run_started_at timestamptz := now();
  v_watermark timestamptz;
begin
  select last_run_at into v_watermark
  from public.meter_reading_refresh_watermarks
  where station_id = p_station_id;

  -- Cutover bootstrap: a station with no watermark row yet would otherwise fall
  -- back to updated_at > -infinity, i.e. "everything is touched" -- reproducing the
  -- exact full-history hang this migration exists to fix, on its very first call.
  -- Every row currently in daily_meter_deltas was correctly computed by the OLD
  -- function before it started failing, so that table's own latest reading_date is
  -- a legitimate "known-good as of" marker: only reading_dates strictly after it
  -- need reprocessing on this first run. (Narrow, documented limitation: a
  -- correction to a date on-or-before that marker, landing during the outage
  -- window before cutover, would not be caught until that row is next touched
  -- again -- self-healing, not silently wrong forever, just possibly delayed.)
  if v_watermark is null then
    select max(reading_date)::timestamptz into v_watermark
    from public.daily_meter_deltas where station_id = p_station_id;
  end if;

  with touched_dates as (
    select distinct station_id, meter_id, reading_date
    from public.daily_meter_readings
    where station_id = p_station_id
      and updated_at > coalesce(v_watermark, '-infinity'::timestamptz)
  ), affected_dates as (
    -- the touched date itself, and the day after it (whose delta reads this total1)
    select station_id, meter_id, reading_date from touched_dates
    union
    select station_id, meter_id, reading_date + 1 from touched_dates
  ), recompute as (
    select ad.station_id, ad.meter_id, ad.reading_date,
      cur.total1, cur.remain1, cur.customer_id, cur.customer_name,
      prev.total1 as previous_total1
    from affected_dates ad
    join public.daily_meter_readings cur
      on cur.station_id = ad.station_id and cur.meter_id = ad.meter_id and cur.reading_date = ad.reading_date
    left join public.daily_meter_readings prev
      on prev.station_id = ad.station_id and prev.meter_id = ad.meter_id and prev.reading_date = ad.reading_date - 1
  ), deltas as (
    select r.*,
      case when r.total1 is null or r.total1 < 0 or r.previous_total1 is null or r.previous_total1 < 0 then 0
           else greatest(0, round(cast(r.total1 - r.previous_total1 as numeric), 3)) end computed_delta
    from recompute r
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
    case when resolved_price is null then computed_delta else 0 end, v_run_started_at
  from valued
  on conflict (station_id, meter_id, reading_date) do update set
    delta_kwh = excluded.delta_kwh, total1_snapshot = excluded.total1_snapshot,
    remain1_snapshot = excluded.remain1_snapshot,
    customer_id = coalesce(excluded.customer_id, daily_meter_deltas.customer_id),
    customer_name = coalesce(nullif(excluded.customer_name, ''), daily_meter_deltas.customer_name),
    tariff_id = excluded.tariff_id, effective_price_ngn = excluded.effective_price_ngn,
    tariff_value_ngn = excluded.tariff_value_ngn, priced_kwh = excluded.priced_kwh,
    unpriced_kwh = excluded.unpriced_kwh, last_refreshed_at = excluded.last_refreshed_at;
  get diagnostics v_delta_cnt = row_count;

  -- Unchanged from the prior version: catches deltas whose backing reading was
  -- deleted entirely (e.g. by retention), not just corrected. Anti-join, index
  -- supported on the (station_id, meter_id, reading_date) unique keys on both sides.
  delete from public.daily_meter_deltas dmd
  where dmd.station_id = p_station_id and not exists (
    select 1 from public.daily_meter_readings dmr
    where dmr.station_id = dmd.station_id and dmr.meter_id = dmd.meter_id
      and dmr.reading_date = dmd.reading_date
  );
  get diagnostics v_pruned_d = row_count;

  foreach v_period in array array['day','week','month','year'] loop
    -- Only the exact buckets a delta row touched THIS run need re-summing --
    -- identified via last_refreshed_at = v_run_started_at (this transaction's own
    -- now(), stable for its whole duration), not a full per-station re-aggregation.
    insert into public.meter_consumption_aggregates
      (station_id, meter_id, customer_id, customer_name, period_type, period_start,
       kwh_total, tariff_value_ngn, priced_kwh, unpriced_kwh, reading_count, last_refreshed_at)
    select dmd.station_id, dmd.meter_id,
      (array_agg(dmd.customer_id order by dmd.reading_date desc) filter (where coalesce(dmd.customer_id, '') <> ''))[1],
      (array_agg(dmd.customer_name order by dmd.reading_date desc) filter (where coalesce(dmd.customer_name, '') <> ''))[1],
      v_period, tp.period_start,
      round(sum(dmd.delta_kwh), 3), round(sum(dmd.tariff_value_ngn), 2),
      round(sum(dmd.priced_kwh), 3), round(sum(dmd.unpriced_kwh), 3), count(*), now()
    from (
      select distinct station_id, meter_id, date_trunc(v_period, reading_date)::date as period_start
      from public.daily_meter_deltas
      where station_id = p_station_id and last_refreshed_at = v_run_started_at
    ) tp
    join public.daily_meter_deltas dmd
      on dmd.station_id = tp.station_id and dmd.meter_id = tp.meter_id
      and date_trunc(v_period, dmd.reading_date)::date = tp.period_start
    group by dmd.station_id, dmd.meter_id, tp.period_start
    on conflict (station_id, meter_id, period_type, period_start) do update set
      kwh_total = excluded.kwh_total, tariff_value_ngn = excluded.tariff_value_ngn,
      priced_kwh = excluded.priced_kwh, unpriced_kwh = excluded.unpriced_kwh,
      reading_count = excluded.reading_count,
      customer_id = coalesce(excluded.customer_id, meter_consumption_aggregates.customer_id),
      customer_name = coalesce(nullif(excluded.customer_name, ''), meter_consumption_aggregates.customer_name),
      last_refreshed_at = now();
    get diagnostics v_agg_cnt = row_count;

    -- P1 GUARD, unchanged: daily_meter_deltas is pruned to 90 days by cron job 18.
    -- Outside that window the absence of a delta proves nothing, so pruning there
    -- destroys history no source can regenerate.
    delete from public.meter_consumption_aggregates mca
    where mca.station_id = p_station_id and mca.period_type = v_period
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

  insert into public.meter_reading_refresh_watermarks (station_id, last_run_at)
  values (p_station_id, v_run_started_at)
  on conflict (station_id) do update set last_run_at = excluded.last_run_at;

  return jsonb_build_object('station', p_station_id, 'delta_rows', v_delta_cnt,
    'agg_rows', v_agg_cnt, 'pruned_deltas', v_pruned_d, 'pruned_aggs', v_pruned_a,
    'refreshed_at', v_run_started_at);
end;
$function$;

-- Defense in depth: the wrapper cron actually calls had no override at all, so its
-- own execution (including the PERFORM into the per-station function) ran under the
-- ambient 2-minute platform default regardless of the inner function's own SET.
create or replace function public.refresh_meter_reading_aggregates()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '600s'
as $function$
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
    where mca.period_start >= (current_date - interval '90 days')
      and not exists (
        select 1 from public.daily_meter_deltas dmd
        where dmd.station_id = mca.station_id
          and dmd.meter_id   = mca.meter_id
    );
end;
$function$;
