-- Preserve the existing audible-login experience unless a user opts out.
alter table public.customers add column if not exists login_voice_enabled boolean not null default true;
alter table public.vendor_users add column if not exists login_voice_enabled boolean not null default true;
alter table public.users add column if not exists login_voice_enabled boolean not null default true;
