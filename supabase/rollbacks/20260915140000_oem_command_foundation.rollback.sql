-- Reviewed emergency rollback only.
-- This script refuses automatic execution.
-- Preserve unresolved command evidence externally.
-- Replace the guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;
drop table if exists public.oem_health_snapshots;
drop table if exists public.outbox_events;
drop table if exists public.oem_webhook_events;
drop table if exists public.oem_raw_events;
drop table if exists public.oem_command_attempts;
drop table if exists public.oem_commands;
commit;
