-- Adds the missing piece for the api_key_header auth strategy: the header name
-- the OEM expects its API key under (e.g. "X-Api-Key", "Ocp-Apim-Subscription-Key").
-- Additive, nullable — existing rows (Calinmeter, bearer_static) are unaffected.
alter table public.oem_credentials add column if not exists api_key_header_name text not null default '';

notify pgrst, 'reload schema';
