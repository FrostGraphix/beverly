begin;

-- Reject readings outside the installation's active, approved inventory.
create function public.require_oem_telemetry_meter_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.oem_inventory_meters m
    where m.oem_installation_id = new.oem_installation_id
      and m.serial = new.external_meter_id
      and m.site_id = new.external_site_id
      and m.customer_external_id = new.external_customer_id
      and m.status = 'active'
  ) then
    raise exception 'telemetry meter ownership mismatch';
  end if;
  return new;
end $$;

create trigger require_oem_telemetry_meter_ownership
before insert or update on public.oem_telemetry_readings
for each row execute function public.require_oem_telemetry_meter_ownership();

commit;
