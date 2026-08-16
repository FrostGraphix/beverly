-- Date-effective tariff valuation for station consumption analytics.

create table if not exists public.account_tariff_history (
  station_id text not null,
  meter_id text not null,
  customer_id text not null default '',
  tariff_id text not null default '',
  effective_from date not null,
  source_updated_at text not null default '',
  observed_at timestamptz not null default now(),
  source text not null default 'live-account-read',
  primary key (station_id, meter_id, effective_from)
);

create table if not exists public.tariff_rate_history (
  station_scope text not null default '*',
  tariff_id text not null,
  tariff_name text not null default '',
  raw_price text not null default '',
  unit_price_ngn numeric,
  tax_pct numeric not null default 0,
  effective_price_ngn numeric,
  is_valid boolean not null default false,
  effective_from date not null,
  source_updated_at text not null default '',
  observed_at timestamptz not null default now(),
  source text not null default 'live-tariff-read',
  primary key (station_scope, tariff_id, effective_from)
);

create index if not exists account_tariff_history_lookup_idx
  on public.account_tariff_history (station_id, meter_id, effective_from desc);
create index if not exists tariff_rate_history_lookup_idx
  on public.tariff_rate_history (station_scope, tariff_id, effective_from desc);

alter table public.account_tariff_history enable row level security;
alter table public.account_tariff_history force row level security;
alter table public.tariff_rate_history enable row level security;
alter table public.tariff_rate_history force row level security;

create policy "service role manages account tariff history"
  on public.account_tariff_history for all to service_role using (true) with check (true);
create policy "service role manages tariff rate history"
  on public.tariff_rate_history for all to service_role using (true) with check (true);

revoke all on public.account_tariff_history, public.tariff_rate_history from public, anon, authenticated;
grant all on public.account_tariff_history, public.tariff_rate_history to service_role;

alter table public.daily_meter_deltas
  add column if not exists tariff_id text not null default '',
  add column if not exists effective_price_ngn numeric,
  add column if not exists tariff_value_ngn numeric not null default 0,
  add column if not exists priced_kwh numeric not null default 0,
  add column if not exists unpriced_kwh numeric not null default 0;

alter table public.meter_consumption_aggregates
  add column if not exists tariff_value_ngn numeric not null default 0,
  add column if not exists priced_kwh numeric not null default 0,
  add column if not exists unpriced_kwh numeric not null default 0;

-- Existing energy is deliberately unpriced until the deterministic refresh below
-- can match it to dated history. This prevents a migration window from reporting
-- false NGN completeness.
update public.daily_meter_deltas
set tariff_value_ngn = 0, priced_kwh = 0, unpriced_kwh = delta_kwh;
update public.meter_consumption_aggregates
set tariff_value_ngn = 0, priced_kwh = 0, unpriced_kwh = kwh_total;

create or replace function public.refresh_meter_reading_aggregates_for_station(p_station_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
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
      lag(dmr.total1) over (
        partition by dmr.station_id, dmr.meter_id order by dmr.reading_date asc
      ) as previous_total1
    from public.daily_meter_readings dmr
    where dmr.station_id = p_station_id
  ), deltas as (
    select rs.*,
      case
        when rs.total1 is null or rs.total1 < 0 then 0
        when rs.previous_total1 is null or rs.previous_total1 < 0 then 0
        else greatest(0, round(cast(rs.total1 - rs.previous_total1 as numeric), 3))
      end as computed_delta
    from reading_steps rs
  ), valued as (
    select d.*,
      coalesce(ath.tariff_id, '') as resolved_tariff_id,
      case when trh.is_valid and trh.effective_price_ngn > 0 then trh.effective_price_ngn end as resolved_price
    from deltas d
    left join lateral (
      select h.tariff_id
      from public.account_tariff_history h
      where upper(h.station_id) = upper(d.station_id)
        and h.meter_id = d.meter_id
        and h.effective_from <= d.reading_date
      order by h.effective_from desc, h.observed_at desc
      limit 1
    ) ath on true
    left join lateral (
      select h.effective_price_ngn, h.is_valid
      from public.tariff_rate_history h
      where upper(h.tariff_id) = upper(coalesce(ath.tariff_id, ''))
        and h.effective_from <= d.reading_date
        and (upper(h.station_scope) = upper(d.station_id) or h.station_scope = '*')
      order by (upper(h.station_scope) = upper(d.station_id)) desc,
               h.effective_from desc, h.observed_at desc
      limit 1
    ) trh on true
  )
  insert into public.daily_meter_deltas
    (station_id, meter_id, reading_date, delta_kwh, total1_snapshot,
     remain1_snapshot, customer_id, customer_name, tariff_id,
     effective_price_ngn, tariff_value_ngn, priced_kwh, unpriced_kwh,
     last_refreshed_at)
  select station_id, meter_id, reading_date, computed_delta, total1, remain1,
    customer_id, customer_name, resolved_tariff_id, resolved_price,
    case when resolved_price is not null then round(computed_delta * resolved_price, 2) else 0 end,
    case when resolved_price is not null then computed_delta else 0 end,
    case when resolved_price is null then computed_delta else 0 end,
    now()
  from valued
  on conflict (station_id, meter_id, reading_date) do update set
    delta_kwh = excluded.delta_kwh,
    total1_snapshot = excluded.total1_snapshot,
    remain1_snapshot = excluded.remain1_snapshot,
    customer_id = coalesce(excluded.customer_id, daily_meter_deltas.customer_id),
    customer_name = coalesce(nullif(excluded.customer_name, ''), daily_meter_deltas.customer_name),
    tariff_id = excluded.tariff_id,
    effective_price_ngn = excluded.effective_price_ngn,
    tariff_value_ngn = excluded.tariff_value_ngn,
    priced_kwh = excluded.priced_kwh,
    unpriced_kwh = excluded.unpriced_kwh,
    last_refreshed_at = now();

  get diagnostics v_delta_cnt = row_count;

  delete from public.daily_meter_deltas dmd
  where dmd.station_id = p_station_id
    and not exists (
      select 1 from public.daily_meter_readings dmr
      where dmr.station_id = dmd.station_id
        and dmr.meter_id = dmd.meter_id
        and dmr.reading_date = dmd.reading_date
    );
  get diagnostics v_pruned_d = row_count;

  foreach v_period in array array['day','week','month','year'] loop
    insert into public.meter_consumption_aggregates
      (station_id, meter_id, customer_id, customer_name, period_type,
       period_start, kwh_total, tariff_value_ngn, priced_kwh, unpriced_kwh,
       reading_count, last_refreshed_at)
    select dmd.station_id, dmd.meter_id,
      (array_agg(dmd.customer_id order by dmd.reading_date desc)
        filter (where coalesce(dmd.customer_id, '') <> ''))[1],
      (array_agg(dmd.customer_name order by dmd.reading_date desc)
        filter (where coalesce(dmd.customer_name, '') <> ''))[1],
      v_period, date_trunc(v_period, dmd.reading_date)::date,
      round(sum(dmd.delta_kwh), 3), round(sum(dmd.tariff_value_ngn), 2),
      round(sum(dmd.priced_kwh), 3), round(sum(dmd.unpriced_kwh), 3),
      count(*), now()
    from public.daily_meter_deltas dmd
    where dmd.station_id = p_station_id
    group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
    on conflict (station_id, meter_id, period_type, period_start) do update set
      kwh_total = excluded.kwh_total,
      tariff_value_ngn = excluded.tariff_value_ngn,
      priced_kwh = excluded.priced_kwh,
      unpriced_kwh = excluded.unpriced_kwh,
      reading_count = excluded.reading_count,
      customer_id = coalesce(excluded.customer_id, meter_consumption_aggregates.customer_id),
      customer_name = coalesce(nullif(excluded.customer_name, ''), meter_consumption_aggregates.customer_name),
      last_refreshed_at = now();
    get diagnostics v_agg_cnt = row_count;

    delete from public.meter_consumption_aggregates mca
    where mca.station_id = p_station_id and mca.period_type = v_period
      and not exists (
        select 1 from public.daily_meter_deltas dmd
        where dmd.station_id = mca.station_id and dmd.meter_id = mca.meter_id
          and date_trunc(v_period, dmd.reading_date)::date = mca.period_start
      );
    get diagnostics v_pruned_loop = row_count;
    v_pruned_a := v_pruned_a + v_pruned_loop;
  end loop;

  return jsonb_build_object('station', p_station_id, 'delta_rows', v_delta_cnt,
    'agg_rows', v_agg_cnt, 'pruned_deltas', v_pruned_d,
    'pruned_aggs', v_pruned_a, 'refreshed_at', now());
end;
$$;

grant execute on function public.refresh_meter_reading_aggregates_for_station(text) to service_role;

create or replace function public.get_station_consumption_analytics(
  p_from date, p_to date, p_prior_from date, p_prior_to date,
  p_station_id text default null, p_period_type text default 'day',
  p_top_limit integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_rows as materialized (
    select station_id, meter_id, customer_id, customer_name, period_start,
      kwh_total, reading_count, tariff_value_ngn, priced_kwh, unpriced_kwh
    from public.meter_consumption_aggregates
    where period_type = p_period_type and period_start between p_from and p_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
  ), prior_rows as materialized (
    select station_id, kwh_total from public.meter_consumption_aggregates
    where period_type = p_period_type and period_start between p_prior_from and p_prior_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
  ), station_rows as (
    select c.station_id, sum(c.kwh_total) total_kwh, coalesce(p.prior_kwh, 0) prior_kwh,
      count(distinct c.meter_id) meter_count,
      count(distinct coalesce(nullif(c.customer_id, ''), c.meter_id)) customer_count,
      count(distinct c.meter_id) filter (where c.kwh_total > 0) active_meter_count,
      sum(c.reading_count) reading_count, round(sum(c.tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(c.priced_kwh), 3) priced_kwh, round(sum(c.unpriced_kwh), 3) unpriced_kwh
    from current_rows c left join (
      select station_id, sum(kwh_total) prior_kwh from prior_rows group by station_id
    ) p using (station_id)
    group by c.station_id, p.prior_kwh
  ), temporal_rows as (
    select station_id, period_start, sum(kwh_total) kwh_total
    from current_rows group by station_id, period_start order by period_start, station_id
  ), top_rows as (
    select station_id, meter_id, max(customer_id) customer_id,
      max(customer_name) customer_name, sum(kwh_total) total_kwh,
      count(*) filter (where kwh_total > 0) active_periods,
      round(sum(tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(priced_kwh), 3) priced_kwh, round(sum(unpriced_kwh), 3) unpriced_kwh
    from current_rows group by station_id, meter_id
    order by total_kwh desc limit least(greatest(p_top_limit, 1), 200)
  ), totals as (
    select round(coalesce(sum(tariff_value_ngn), 0), 2) value_ngn,
      round(coalesce(sum(priced_kwh), 0), 3) priced_kwh,
      round(coalesce(sum(unpriced_kwh), 0), 3) unpriced_kwh,
      round(coalesce(sum(kwh_total), 0), 3) total_kwh
    from current_rows
  )
  select jsonb_build_object(
    'sourceRows', (select count(*) from current_rows),
    'customerCount', (select count(distinct coalesce(nullif(customer_id, ''), meter_id)) from current_rows),
    'valuation', (select jsonb_build_object(
      'valueNgn', value_ngn, 'pricedKwh', priced_kwh, 'unpricedKwh', unpriced_kwh,
      'totalKwh', total_kwh,
      'coveragePct', case when total_kwh <= 0 then 100 else round(priced_kwh * 100 / total_kwh, 2) end,
      'complete', unpriced_kwh <= 0.0005, 'basis', 'historical-snapshot'
    ) from totals),
    'stations', coalesce((select jsonb_agg(to_jsonb(s) order by s.total_kwh desc) from station_rows s), '[]'::jsonb),
    'temporal', coalesce((select jsonb_agg(to_jsonb(t) order by t.period_start, t.station_id) from temporal_rows t), '[]'::jsonb),
    'tariffBreakdown', '[]'::jsonb,
    'topMeters', coalesce((select jsonb_agg(to_jsonb(m) order by m.total_kwh desc) from top_rows m), '[]'::jsonb),
    'rollups', coalesce((select jsonb_agg(to_jsonb(r) order by r.station_id)
      from public.station_meter_read_rollups r
      where (p_station_id is null or upper(r.station_id) = upper(p_station_id))
        and upper(r.station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])), '[]'::jsonb)
  )
$$;

revoke all on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  to service_role;

notify pgrst, 'reload schema';
