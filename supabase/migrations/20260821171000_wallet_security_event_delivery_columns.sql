-- Restores request context required by password-reset and authentication
-- security events on databases created from the reduced compatibility table.
alter table public.wallet_security_events
    add column if not exists ip_address text,
    add column if not exists user_agent text;

notify pgrst, 'reload schema';
