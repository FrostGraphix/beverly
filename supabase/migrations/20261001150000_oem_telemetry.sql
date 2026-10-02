begin;
create table if not exists public.oem_telemetry_readings (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  external_site_id text not null check (btrim(external_site_id) <> ''),
  external_meter_id text not null check (btrim(external_meter_id) <> ''),
  external_customer_id text,
  reading_at timestamptz not null,
  energy_kwh numeric,
  energy_interpretation text not null default 'provider_total_unknown_semantics'
    check (energy_interpretation = 'provider_total_unknown_semantics'),
  voltage_avg numeric, current_avg numeric, power_factor_avg numeric,
  provider_credit_balance numeric,
  meter_state text not null check (meter_state in ('on','off','fault')),
  reading_type text not null check (reading_type in ('customer','totalizer')),
  provider_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (oem_installation_id, external_site_id, external_meter_id, reading_at, reading_type)
);
create index oem_telemetry_readings_lookup_idx on public.oem_telemetry_readings
  (oem_installation_id, external_meter_id, reading_at desc);

create table if not exists public.oem_telemetry_quarantine (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  provider_payload jsonb not null,
  observed_at timestamptz not null default now()
);

alter table public.oem_telemetry_readings enable row level security;
alter table public.oem_telemetry_readings force row level security;
alter table public.oem_telemetry_quarantine enable row level security;
alter table public.oem_telemetry_quarantine force row level security;
revoke all on public.oem_telemetry_readings, public.oem_telemetry_quarantine from public, anon, authenticated;
grant select, insert, update on public.oem_telemetry_readings to service_role;
grant select, insert on public.oem_telemetry_quarantine to service_role;

create or replace function public.apply_oem_telemetry_page(
  p_installation_id uuid, p_mode text, p_scope_key text,
  p_readings jsonb, p_quarantine jsonb, p_cursor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_installation_id uuid; v_readings integer; v_quarantine integer;
begin
  if p_mode not in ('live','historical') or coalesce(btrim(p_scope_key),'') = '' then
    raise exception 'invalid telemetry scope';
  end if;
  if jsonb_typeof(p_readings) <> 'array' or jsonb_typeof(p_quarantine) <> 'array'
    or jsonb_array_length(p_readings) > 200 or jsonb_array_length(p_quarantine) > 200 then
    raise exception 'invalid telemetry page';
  end if;
  select id into v_installation_id from public.oem_installations
    where id=p_installation_id and status = 'active' for update;
  if v_installation_id is null then raise exception 'installation must be active'; end if;

  create temporary table incoming_readings on commit drop as
    select nullif(btrim(x.external_site_id),'') external_site_id,
      nullif(btrim(x.external_meter_id),'') external_meter_id,
      nullif(btrim(x.external_customer_id),'') external_customer_id,
      x.reading_at, x.energy_kwh, x.voltage_avg, x.current_avg, x.power_factor_avg,
      x.provider_credit_balance, x.meter_state, x.reading_type, x.provider_payload
    from jsonb_to_recordset(p_readings) x(
      external_site_id text, external_meter_id text, external_customer_id text,
      reading_at timestamptz, energy_kwh numeric, voltage_avg numeric, current_avg numeric,
      power_factor_avg numeric, provider_credit_balance numeric, meter_state text,
      reading_type text, provider_payload jsonb
    );
  if exists(select 1 from incoming_readings where external_site_id is null or external_meter_id is null
      or reading_at is null or meter_state not in ('on','off','fault')
      or reading_type not in ('customer','totalizer') or provider_payload is null) then
    raise exception 'invalid telemetry reading';
  end if;
  if exists(select 1 from incoming_readings group by external_site_id,external_meter_id,reading_at,reading_type having count(*)>1) then
    raise exception 'duplicate telemetry reading';
  end if;

  insert into public.oem_telemetry_readings(
    oem_installation_id,external_site_id,external_meter_id,external_customer_id,reading_at,
    energy_kwh,voltage_avg,current_avg,power_factor_avg,provider_credit_balance,
    meter_state,reading_type,provider_payload
  ) select p_installation_id,external_site_id,external_meter_id,external_customer_id,reading_at,
    energy_kwh,voltage_avg,current_avg,power_factor_avg,provider_credit_balance,
    meter_state,reading_type,provider_payload from incoming_readings
  on conflict(oem_installation_id,external_site_id,external_meter_id,reading_at,reading_type)
  do update set external_customer_id=excluded.external_customer_id,energy_kwh=excluded.energy_kwh,
    voltage_avg=excluded.voltage_avg,current_avg=excluded.current_avg,
    power_factor_avg=excluded.power_factor_avg,provider_credit_balance=excluded.provider_credit_balance,
    meter_state=excluded.meter_state,provider_payload=excluded.provider_payload,received_at=now();
  get diagnostics v_readings = row_count;

  insert into public.oem_telemetry_quarantine(oem_installation_id,reason,provider_payload)
    select p_installation_id, nullif(btrim(x.reason),''), x.provider_payload
    from jsonb_to_recordset(p_quarantine) x(reason text,provider_payload jsonb)
    where nullif(btrim(x.reason),'') is not null and x.provider_payload is not null;
  get diagnostics v_quarantine = row_count;

  insert into public.oem_sync_cursors(oem_installation_id,operation_key,scope_key,cursor,updated_at)
    values(p_installation_id,'telemetry_' || p_mode,p_scope_key,coalesce(p_cursor,'{}'::jsonb),now())
  on conflict(oem_installation_id,operation_key,scope_key)
  do update set cursor=excluded.cursor,updated_at=excluded.updated_at;
  return jsonb_build_object('readings',v_readings,'quarantine',v_quarantine);
end $$;
revoke all on function public.apply_oem_telemetry_page(uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_oem_telemetry_page(uuid,text,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
