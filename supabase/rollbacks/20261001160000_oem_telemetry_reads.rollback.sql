begin;
drop function if exists public.list_authorized_oem_telemetry(uuid,uuid,uuid,integer);
notify pgrst, 'reload schema';
commit;
