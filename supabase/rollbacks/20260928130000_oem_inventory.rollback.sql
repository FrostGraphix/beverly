-- Reviewed emergency rollback. Inventory remains recoverable by default.
begin;
do $guard$ begin
  if current_setting('beverly.allow_oem_inventory_rollback', true) is distinct from 'reviewed'
    then raise exception 'Manual rollback review required'; end if;
  if exists(select 1 from public.oem_inventory_customers) or exists(select 1 from public.oem_inventory_meters)
    then raise exception 'Retain populated OEM inventory'; end if;
end $guard$;
delete from public.oem_sync_cursors where cursor_type = 'inventory_snapshot';
drop function public.get_authorized_oem_inventory_reconciliation(uuid,uuid);
drop function public.list_authorized_oem_inventory_meters(uuid,uuid,uuid,integer);
drop function public.apply_oem_inventory_snapshot(uuid,jsonb,jsonb);
drop table public.oem_inventory_meters;
drop table public.oem_inventory_customers;
notify pgrst, 'reload schema';
commit;
