begin;
create or replace function public.list_authorized_oem_telemetry(
  p_auth_user_id uuid, p_installation_id uuid, p_after uuid default null, p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_authorized boolean; v_readings jsonb; v_next uuid; v_total integer; v_cursor_at timestamptz;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid telemetry page limit'; end if;
  select exists(
    select 1 from public.oem_installations i
    join public.tenants t on t.id=i.tenant_id and t.status='active'
    join public.oem_tenant_memberships tm on tm.tenant_id=t.id and tm.auth_user_id=p_auth_user_id and tm.status='active'
    join public.oem_actor_installation_access ia on ia.oem_installation_id=i.id and ia.auth_user_id=p_auth_user_id and ia.status='active'
    where i.id=p_installation_id and i.status in ('active','suspended')
  ) into v_authorized;
  if not v_authorized then return jsonb_build_object('authorized',false,'readings','[]'::jsonb,'next_cursor',null); end if;
  if p_after is not null then
    select reading_at into v_cursor_at from public.oem_telemetry_readings
      where id=p_after and oem_installation_id=p_installation_id;
    if v_cursor_at is null then raise exception 'invalid telemetry cursor'; end if;
  end if;
  with page as (
    select id,external_site_id,external_meter_id,reading_at,energy_kwh,energy_interpretation,
      voltage_avg,current_avg,power_factor_avg,provider_credit_balance,meter_state,reading_type,received_at,
      row_number() over(order by reading_at desc,id desc) rn
    from public.oem_telemetry_readings
    where oem_installation_id=p_installation_id
      and (p_after is null or (reading_at,id)<(v_cursor_at,p_after))
    order by reading_at desc,id desc limit p_limit+1
  ) select coalesce(jsonb_agg(to_jsonb(page)-'rn' order by reading_at desc,id desc)
      filter(where rn<=p_limit),'[]'::jsonb),
      (array_agg(id order by reading_at desc,id desc) filter(where rn=p_limit))[1],count(*)
    into v_readings,v_next,v_total from page;
  if v_total <= p_limit then v_next := null; end if;
  return jsonb_build_object('authorized',true,'readings',v_readings,'next_cursor',v_next);
end $$;
revoke all on function public.list_authorized_oem_telemetry(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_authorized_oem_telemetry(uuid,uuid,uuid,integer) to service_role;
notify pgrst, 'reload schema';
commit;
