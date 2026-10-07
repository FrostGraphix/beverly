begin;

drop trigger if exists require_oem_telemetry_meter_ownership on public.oem_telemetry_readings;
drop function if exists public.require_oem_telemetry_meter_ownership();

commit;
