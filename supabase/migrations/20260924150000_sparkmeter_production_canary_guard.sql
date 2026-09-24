begin;

create table if not exists public.oem_canary_authorizations (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  operation_key text not null,
  external_customer_id text not null,
  currency text not null,
  maximum_amount_minor bigint not null check (maximum_amount_minor > 0),
  remaining_uses integer not null default 1 check (remaining_uses in (0, 1)),
  write_contract_acknowledged boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved', 'consumed', 'revoked', 'expired')),
  authorized_by text not null,
  authorization_reference text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_command_id uuid references public.oem_commands(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(operation_key) <> ''),
  check (btrim(external_customer_id) <> ''),
  check (currency = upper(currency) and btrim(currency) <> ''),
  check (btrim(authorized_by) <> ''),
  check (btrim(authorization_reference) <> ''),
  check (expires_at > created_at),
  check (
    (status = 'consumed' and remaining_uses = 0 and consumed_at is not null and consumed_by_command_id is not null)
    or
    (status <> 'consumed' and consumed_at is null and consumed_by_command_id is null)
  )
);

create unique index if not exists oem_canary_authorizations_single_approved_idx
  on public.oem_canary_authorizations (oem_installation_id, operation_key)
  where status = 'approved' and remaining_uses = 1;

alter table public.oem_canary_authorizations enable row level security;
alter table public.oem_canary_authorizations force row level security;
revoke all on public.oem_canary_authorizations from public, anon, authenticated;
grant all on public.oem_canary_authorizations to service_role;

create or replace function public.claim_oem_canary_authorization(
  p_oem_installation_id uuid,
  p_operation_key text,
  p_external_customer_id text,
  p_currency text,
  p_amount_minor bigint,
  p_command_id uuid,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_id uuid;
begin
  if p_amount_minor <= 0 then
    return null;
  end if;

  select authorization.id
    into claimed_id
    from public.oem_canary_authorizations authorization
   where authorization.oem_installation_id = p_oem_installation_id
     and authorization.operation_key = p_operation_key
     and authorization.external_customer_id = p_external_customer_id
     and authorization.currency = upper(btrim(p_currency))
     and authorization.maximum_amount_minor >= p_amount_minor
     and authorization.status = 'approved'
     and authorization.remaining_uses = 1
     and authorization.write_contract_acknowledged = true
     and authorization.expires_at > p_now
   order by authorization.created_at asc
   for update skip locked
   limit 1;

  if claimed_id is null then
    return null;
  end if;

  update public.oem_canary_authorizations
     set remaining_uses = 0,
         status = 'consumed',
         consumed_at = p_now,
         consumed_by_command_id = p_command_id,
         updated_at = p_now
   where id = claimed_id
     and status = 'approved'
     and remaining_uses = 1;

  if not found then
    return null;
  end if;

  return claimed_id;
end;
$$;

revoke all on function public.claim_oem_canary_authorization(uuid, text, text, text, bigint, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_oem_canary_authorization(uuid, text, text, text, bigint, uuid, timestamptz)
  to service_role;

comment on table public.oem_canary_authorizations is
  'Single-use production OEM canary approvals. Provider writes remain disabled without an atomically claimed row.';

commit;
