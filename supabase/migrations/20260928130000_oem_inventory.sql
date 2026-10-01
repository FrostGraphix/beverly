-- Installation-scoped inventory. Legacy Calinmeter tables remain unchanged.
begin;
create table if not exists public.oem_inventory_customers (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  external_id text not null check (btrim(external_id) <> ''),
  code text, name text not null check (btrim(name) <> ''), phone text,
  service_area_id text, site_id text,
  status text not null default 'active' check (status in ('active', 'stale')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (oem_installation_id, external_id)
);
create table if not exists public.oem_inventory_meters (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  external_id text not null check (btrim(external_id) <> ''),
  customer_external_id text not null check (btrim(customer_external_id) <> ''),
  serial text not null check (btrim(serial) <> ''),
  tariff_id text, meter_phase text, site_id text,
  status text not null default 'active' check (status in ('active', 'stale')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (oem_installation_id, external_id),
  unique (oem_installation_id, serial),
  foreign key (oem_installation_id, customer_external_id)
    references public.oem_inventory_customers(oem_installation_id, external_id) on delete restrict
);
alter table public.oem_inventory_customers enable row level security;
alter table public.oem_inventory_customers force row level security;
alter table public.oem_inventory_meters enable row level security;
alter table public.oem_inventory_meters force row level security;
revoke all on public.oem_inventory_customers, public.oem_inventory_meters from public, anon, authenticated;
grant select, insert, update on public.oem_inventory_customers, public.oem_inventory_meters to service_role;

create or replace function public.apply_oem_inventory_snapshot(
  p_installation_id uuid, p_customers jsonb, p_meters jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := now(); v_customer_count integer; v_meter_count integer;
  v_stale_customers integer; v_stale_meters integer; v_installation_id uuid; v_checksum text;
begin
  if p_customers is null or p_meters is null
    or jsonb_typeof(p_customers) <> 'array' or jsonb_typeof(p_meters) <> 'array' then
    raise exception 'inventory payloads must be arrays';
  end if;
  if jsonb_array_length(p_customers) = 0 or jsonb_array_length(p_meters) = 0 then
    raise exception 'inventory snapshot cannot be empty';
  end if;
  select id into v_installation_id from public.oem_installations
    where id = p_installation_id and status in ('draft','active') for update;
  if v_installation_id is null then raise exception 'installation must be writable'; end if;

  create temporary table incoming_customers on commit drop as
    select nullif(btrim(x.external_id),'') external_id, nullif(btrim(x.code),'') code,
      nullif(btrim(x.name),'') name, nullif(btrim(x.phone),'') phone,
      nullif(btrim(x.service_area_id),'') service_area_id, nullif(btrim(x.site_id),'') site_id
    from jsonb_to_recordset(p_customers) x(external_id text, code text, name text, phone text, service_area_id text, site_id text);
  create temporary table incoming_meters on commit drop as
    select nullif(btrim(x.external_id),'') external_id,
      nullif(btrim(x.customer_external_id),'') customer_external_id,
      nullif(btrim(x.serial),'') serial, nullif(btrim(x.tariff_id),'') tariff_id,
      nullif(btrim(x.meter_phase),'') meter_phase, nullif(btrim(x.site_id),'') site_id
    from jsonb_to_recordset(p_meters) x(external_id text, customer_external_id text, serial text, tariff_id text, meter_phase text, site_id text);
  if exists(select 1 from incoming_customers where external_id is null or name is null)
    or exists(select 1 from incoming_meters where external_id is null or customer_external_id is null or serial is null)
    then raise exception 'inventory contains incomplete identities'; end if;
  if exists(select 1 from incoming_customers group by external_id having count(*) > 1)
    or exists(select 1 from incoming_meters group by external_id having count(*) > 1)
    or exists(select 1 from incoming_meters group by serial having count(*) > 1)
    then raise exception 'inventory contains duplicate identities'; end if;
  if exists(select 1 from incoming_meters m left join incoming_customers c on c.external_id=m.customer_external_id where c.external_id is null)
    then raise exception 'meter references missing customer'; end if;
  if exists(select 1 from incoming_meters n join public.oem_inventory_meters m
      on m.oem_installation_id=p_installation_id and m.external_id=n.external_id
      where m.customer_external_id <> n.customer_external_id)
    then raise exception 'meter ownership change requires review'; end if;

  insert into public.oem_inventory_customers(oem_installation_id,external_id,code,name,phone,service_area_id,site_id,status,last_seen_at,updated_at)
    select p_installation_id,external_id,code,name,phone,service_area_id,site_id,'active',v_now,v_now from incoming_customers
    on conflict(oem_installation_id,external_id) do update set code=excluded.code,name=excluded.name,
      phone=excluded.phone,service_area_id=excluded.service_area_id,site_id=excluded.site_id,status='active',last_seen_at=v_now,updated_at=v_now;
  update public.oem_inventory_meters m
    set serial='__beverly_serial_swap__' || m.id::text, updated_at=v_now
    from incoming_meters n
    where m.oem_installation_id=p_installation_id and m.external_id=n.external_id and m.serial<>n.serial;
  insert into public.oem_inventory_meters(oem_installation_id,external_id,customer_external_id,serial,tariff_id,meter_phase,site_id,status,last_seen_at,updated_at)
    select p_installation_id,external_id,customer_external_id,serial,tariff_id,meter_phase,site_id,'active',v_now,v_now from incoming_meters
    on conflict(oem_installation_id,external_id) do update set serial=excluded.serial,tariff_id=excluded.tariff_id,
      meter_phase=excluded.meter_phase,site_id=excluded.site_id,status='active',last_seen_at=v_now,updated_at=v_now;
  update public.oem_inventory_meters set status = 'stale', updated_at=v_now
    where oem_installation_id=p_installation_id and status='active'
      and not exists(select 1 from incoming_meters n where n.external_id=oem_inventory_meters.external_id);
  get diagnostics v_stale_meters = row_count;
  update public.oem_inventory_customers set status = 'stale', updated_at=v_now
    where oem_installation_id=p_installation_id and status='active'
      and not exists(select 1 from incoming_customers n where n.external_id=oem_inventory_customers.external_id);
  get diagnostics v_stale_customers = row_count;
  select count(*) into v_customer_count from incoming_customers;
  select count(*) into v_meter_count from incoming_meters;
  select md5(
    coalesce((select jsonb_agg(to_jsonb(c) order by external_id)::text from incoming_customers c),'[]') ||
    coalesce((select jsonb_agg(to_jsonb(m) order by external_id)::text from incoming_meters m),'[]')
  ) into v_checksum;
  insert into public.oem_sync_cursors(oem_installation_id,operation_key,scope_key,cursor,updated_at)
    values(p_installation_id,'inventory_snapshot','',jsonb_build_object('customers',v_customer_count,'meters',v_meter_count,
      'checksum',v_checksum,'completed_at',v_now),v_now)
    on conflict(oem_installation_id,operation_key,scope_key) do update set cursor=excluded.cursor,updated_at=excluded.updated_at;
  return jsonb_build_object('customers',v_customer_count,'meters',v_meter_count,
    'stale_customers',v_stale_customers,'stale_meters',v_stale_meters);
end $$;
revoke all on function public.apply_oem_inventory_snapshot(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_oem_inventory_snapshot(uuid,jsonb,jsonb) to service_role;

create or replace function public.list_authorized_oem_inventory_meters(
  p_auth_user_id uuid, p_installation_id uuid, p_after uuid default null, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_authorized boolean; v_meters jsonb; v_next uuid; v_total integer;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid inventory page limit'; end if;
  select exists(
    select 1 from public.oem_installations i
    join public.tenants t on t.id=i.tenant_id and t.status='active'
    join public.oem_tenant_memberships tm on tm.tenant_id=t.id and tm.auth_user_id=p_auth_user_id and tm.status='active'
    join public.oem_actor_installation_access ia on ia.oem_installation_id=i.id and ia.auth_user_id=p_auth_user_id and ia.status='active'
    where i.id=p_installation_id and i.status in ('draft','active','suspended')
  ) into v_authorized;
  if not v_authorized then return jsonb_build_object('authorized',false,'meters','[]'::jsonb,'next_cursor',null); end if;
  with page as (
    select id,external_id,serial,site_id,meter_phase,tariff_id,status,last_seen_at,
      row_number() over(order by id) rn
    from public.oem_inventory_meters
    where oem_installation_id=p_installation_id and (p_after is null or id>p_after)
    order by id limit p_limit+1
  ) select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'external_id',external_id,'serial',serial,'site_id',site_id,'meter_phase',meter_phase,
      'tariff_id',tariff_id,'status',status,'last_seen_at',last_seen_at) order by id) filter(where rn<=p_limit),'[]'::jsonb),
      (array_agg(id order by id) filter(where rn=p_limit))[1], count(*)
    into v_meters,v_next,v_total from page;
  if v_total <= p_limit then v_next := null; end if;
  return jsonb_build_object('authorized',true,'meters',v_meters,'next_cursor',v_next);
end $$;
revoke all on function public.list_authorized_oem_inventory_meters(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_authorized_oem_inventory_meters(uuid,uuid,uuid,integer) to service_role;

create or replace function public.get_authorized_oem_inventory_reconciliation(
  p_auth_user_id uuid, p_installation_id uuid
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with authority as (
    select exists(
      select 1 from public.oem_installations i
      join public.tenants t on t.id=i.tenant_id and t.status='active'
      join public.oem_tenant_memberships tm on tm.tenant_id=t.id and tm.auth_user_id=p_auth_user_id and tm.status='active'
      join public.oem_actor_installation_access ia on ia.oem_installation_id=i.id and ia.auth_user_id=p_auth_user_id and ia.status='active'
      where i.id=p_installation_id and i.status in ('draft','active','suspended')
    ) authorized
  ), snapshot as (
    select cursor from public.oem_sync_cursors
    where oem_installation_id=p_installation_id and operation_key='inventory_snapshot' and scope_key=''
  )
  select jsonb_build_object('authorized',authority.authorized,'snapshot',
    case when authority.authorized then (select cursor from snapshot) else null end)
  from authority
$$;
revoke all on function public.get_authorized_oem_inventory_reconciliation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_authorized_oem_inventory_reconciliation(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
