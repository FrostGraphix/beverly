-- Expand authentication strategies for documented dual-header APIs.

alter table public.oem_installation_credentials
  drop constraint if exists oem_installation_credentials_auth_strategy_check;

alter table public.oem_installation_credentials
  add constraint oem_installation_credentials_auth_strategy_check
  check (auth_strategy in (
    'bearer_static',
    'bearer_login',
    'api_key_header',
    'api_key_pair',
    'oauth2_client_credentials'
  )) not valid;

notify pgrst, 'reload schema';
