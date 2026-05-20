-- ════════════════════════════════════════════════════════════════════
-- Wallet ecosystem: append-only audit trail + security events
--
-- The existing `audit_logs` table is CRM-shaped (method/path/outcome).
-- The wallet code writes a richer actor/action/target shape, so we add
-- a dedicated `wallet_audit_log` table to avoid breaking either side.
--
-- Both tables are append-only. RLS allows super-admin read, service-role
-- write (via adminClient). No update / delete.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.wallet_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid,                        -- auth.users.id
  actor_type      text not null,               -- staff | vendor_user | customer | system | webhook
  actor_role      text,                        -- super-admin | vendor_manager | ...
  action          text not null,               -- dotted: 'wallet.funding.approve'
  target_type     text,
  target_id       text,
  before          jsonb,
  after           jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  ip              text,
  user_agent      text,
  correlation_id  text,
  created_at      timestamptz not null default now()
);

create index if not exists wallet_audit_log_created_at_idx on public.wallet_audit_log(created_at desc);
create index if not exists wallet_audit_log_actor_idx      on public.wallet_audit_log(actor_user_id, created_at desc);
create index if not exists wallet_audit_log_action_idx     on public.wallet_audit_log(action, created_at desc);
create index if not exists wallet_audit_log_target_idx     on public.wallet_audit_log(target_type, target_id, created_at desc);

-- Security events: auth + abuse signals (separate from business audit)
do $$ begin
  create type wallet_security_event_type as enum (
    'login_success', 'login_failure', 'logout',
    'password_change', 'mfa_enabled', 'mfa_disabled', 'mfa_failure',
    'suspicious_activity', 'rate_limit_hit', 'permission_denied',
    'impersonation_start', 'impersonation_end', 'session_revoked',
    'session_timeout', 'temp_password_issued', 'temp_password_used'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type wallet_security_severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.wallet_security_events (
  id              uuid primary key default gen_random_uuid(),
  event_type      wallet_security_event_type not null,
  severity        wallet_security_severity   not null default 'info',
  actor_user_id   uuid,
  ip_address      text,
  user_agent      text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists wallet_security_events_created_at_idx on public.wallet_security_events(created_at desc);
create index if not exists wallet_security_events_type_idx       on public.wallet_security_events(event_type, created_at desc);
create index if not exists wallet_security_events_severity_idx   on public.wallet_security_events(severity, created_at desc);
create index if not exists wallet_security_events_actor_idx      on public.wallet_security_events(actor_user_id, created_at desc);

-- RLS: locked down. Service role bypasses; authenticated users get nothing.
-- Admin reads go through wallet backend (which uses adminClient = service role).
alter table public.wallet_audit_log     enable row level security;
alter table public.wallet_security_events enable row level security;

drop policy if exists "deny all client access — wallet_audit_log"     on public.wallet_audit_log;
drop policy if exists "deny all client access — wallet_security_events" on public.wallet_security_events;

create policy "deny all client access — wallet_audit_log"
  on public.wallet_audit_log
  for all to authenticated using (false) with check (false);

create policy "deny all client access — wallet_security_events"
  on public.wallet_security_events
  for all to authenticated using (false) with check (false);

-- Prevent updates / deletes outright (defence in depth — even service role)
create or replace function public.deny_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wallet audit tables are append-only';
end;
$$;

drop trigger if exists wallet_audit_log_no_update on public.wallet_audit_log;
drop trigger if exists wallet_audit_log_no_delete on public.wallet_audit_log;
drop trigger if exists wallet_security_events_no_update on public.wallet_security_events;
drop trigger if exists wallet_security_events_no_delete on public.wallet_security_events;

create trigger wallet_audit_log_no_update before update on public.wallet_audit_log
  for each row execute function public.deny_audit_mutation();
create trigger wallet_audit_log_no_delete before delete on public.wallet_audit_log
  for each row execute function public.deny_audit_mutation();
create trigger wallet_security_events_no_update before update on public.wallet_security_events
  for each row execute function public.deny_audit_mutation();
create trigger wallet_security_events_no_delete before delete on public.wallet_security_events
  for each row execute function public.deny_audit_mutation();

comment on table public.wallet_audit_log     is 'Append-only audit trail for wallet mutations. Written via service role only.';
comment on table public.wallet_security_events is 'Append-only security signals (auth, abuse, MFA). Written via service role only.';
