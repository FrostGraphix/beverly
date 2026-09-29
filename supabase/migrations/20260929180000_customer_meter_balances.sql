-- Customer-facing meter balances use the last meter reading received from the
-- OEM sync. They intentionally do not claim real-time data. Ownership is
-- resolved in the database before telemetry is returned.

create index if not exists daily_meter_readings_station_meter_captured_idx
    on public.daily_meter_readings (station_id, meter_id, captured_at desc, reading_date desc);

create or replace function public.get_customer_meter_balances(
    p_customer_id uuid,
    p_meter_id text default null
)
returns table (
    meter_id text,
    station_id text,
    balance_kwh numeric,
    reading_date date,
    captured_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    with entitled_meters as (
        select cm.meter_id, cm.station_id
        from public.customer_meters cm
        where cm.customer_id = p_customer_id
          and cm.status = 'approved'
          and (p_meter_id is null or cm.meter_id = btrim(p_meter_id))
    )
    select
        entitled.meter_id,
        entitled.station_id,
        latest.remain1 as balance_kwh,
        latest.reading_date,
        latest.captured_at
    from entitled_meters entitled
    left join lateral (
        select reading.remain1, reading.reading_date, reading.captured_at
        from public.daily_meter_readings reading
        where reading.station_id = entitled.station_id
          and reading.meter_id = entitled.meter_id
        order by reading.captured_at desc, reading.reading_date desc
        limit 1
    ) latest on true
    order by entitled.meter_id;
$$;

revoke all on function public.get_customer_meter_balances(uuid, text) from public, anon, authenticated;
grant execute on function public.get_customer_meter_balances(uuid, text) to service_role;

notify pgrst, 'reload schema';
