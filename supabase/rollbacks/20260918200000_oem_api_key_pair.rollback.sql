-- Reviewed emergency rollback only.
-- Replace this guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;

do $dependency_guard$
begin
  if exists (
    select 1
    from public.oem_installation_credentials
    where auth_strategy = 'api_key_pair'
  ) then
    raise exception 'API-key pair credentials still exist';
  end if;
end
$dependency_guard$;

alter table public.oem_installation_credentials
  drop constraint if exists oem_installation_credentials_auth_strategy_check;

alter table public.oem_installation_credentials
  add constraint oem_installation_credentials_auth_strategy_check
  check (auth_strategy in (
    'bearer_static',
    'bearer_login',
    'api_key_header',
    'oauth2_client_credentials'
  ));

commit;

notify pgrst, 'reload schema';
