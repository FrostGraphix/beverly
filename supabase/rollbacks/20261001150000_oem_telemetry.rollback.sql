begin;
do $guard$ begin
  if current_setting('beverly.allow_oem_telemetry_rollback', true) is distinct from 'reviewed'
    then raise exception 'Manual rollback review required'; end if;
  if exists(select 1 from public.oem_telemetry_readings) or exists(select 1 from public.oem_telemetry_quarantine)
    then raise exception 'Retain populated OEM telemetry'; end if;
end $guard$;
delete from public.oem_sync_cursors where operation_key in ('telemetry_live','telemetry_historical');
drop function public.apply_oem_telemetry_page(uuid,text,text,jsonb,jsonb,jsonb);
drop table public.oem_telemetry_quarantine;
drop table public.oem_telemetry_readings;
notify pgrst, 'reload schema';
commit;
