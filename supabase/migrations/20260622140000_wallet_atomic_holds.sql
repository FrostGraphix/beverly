-- Atomic wallet hold and capture operations.
-- These functions are the only supported write path for production holds.

create or replace function public.fn_create_hold(
  p_wallet_id uuid,
  p_amount_minor bigint,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns public.wallet_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_holds%rowtype;
  v_balance bigint;
  v_holds bigint;
  v_hold public.wallet_holds%rowtype;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'hold amount must be positive';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'hold idempotency key is required';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'hold expiry must be in the future';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id
  for update;

  if not found then
    raise exception 'wallet not found';
  end if;
  if v_wallet.status <> 'active' then
    raise exception 'wallet not active';
  end if;

  select * into v_existing
  from public.wallet_holds
  where wallet_id = p_wallet_id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_balance
  from public.wallet_ledger_entries
  where wallet_id = p_wallet_id;

  select coalesce(sum(amount_minor), 0)
  into v_holds
  from public.wallet_holds
  where wallet_id = p_wallet_id
    and status = 'active';

  if v_balance - v_holds < p_amount_minor then
    raise exception 'insufficient available balance for hold';
  end if;

  insert into public.wallet_holds (
    wallet_id,
    amount_minor,
    status,
    expires_at,
    reference_type,
    reference_id,
    idempotency_key,
    created_by
  )
  values (
    p_wallet_id,
    p_amount_minor,
    'active',
    p_expires_at,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    p_created_by
  )
  returning * into v_hold;

  return v_hold;
end;
$$;

create or replace function public.fn_capture_hold(
  p_hold_id uuid,
  p_entry_type text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_memo text,
  p_created_by uuid
)
returns public.wallet_ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.wallet_holds%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_ledger_entries%rowtype;
  v_balance bigint;
  v_other_holds bigint;
  v_after bigint;
  v_entry public.wallet_ledger_entries%rowtype;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'capture idempotency key is required';
  end if;

  select * into v_hold
  from public.wallet_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'hold not found';
  end if;

  select * into v_wallet
  from public.wallets
  where id = v_hold.wallet_id
  for update;

  if not found then
    raise exception 'wallet not found';
  end if;

  select * into v_existing
  from public.wallet_ledger_entries
  where wallet_id = v_hold.wallet_id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if v_wallet.status <> 'active' then
    raise exception 'wallet not active';
  end if;
  if v_hold.status <> 'active' then
    raise exception 'hold not active';
  end if;
  if v_hold.expires_at <= now() then
    raise exception 'hold expired';
  end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_balance
  from public.wallet_ledger_entries
  where wallet_id = v_hold.wallet_id;

  select coalesce(sum(amount_minor), 0)
  into v_other_holds
  from public.wallet_holds
  where wallet_id = v_hold.wallet_id
    and status = 'active'
    and id <> v_hold.id;

  if v_balance - v_other_holds < v_hold.amount_minor then
    raise exception 'insufficient available balance for capture';
  end if;

  v_after := v_balance - v_hold.amount_minor;

  insert into public.wallet_ledger_entries (
    wallet_id,
    direction,
    amount_minor,
    balance_after_minor,
    entry_type,
    reference_type,
    reference_id,
    idempotency_key,
    memo,
    created_by
  )
  values (
    v_hold.wallet_id,
    'debit',
    v_hold.amount_minor,
    v_after,
    p_entry_type,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    p_memo,
    p_created_by
  )
  returning * into v_entry;

  update public.wallets
  set balance_minor = v_after,
      updated_at = now()
  where id = v_hold.wallet_id;

  update public.wallet_holds
  set status = 'captured',
      captured_at = now()
  where id = v_hold.id
    and status = 'active';

  if not found then
    raise exception 'hold capture race';
  end if;

  return v_entry;
end;
$$;

revoke all on function public.fn_create_hold(uuid, bigint, text, text, text, timestamptz, uuid) from public;
grant execute on function public.fn_create_hold(uuid, bigint, text, text, text, timestamptz, uuid) to service_role;

revoke all on function public.fn_capture_hold(uuid, text, text, text, text, text, uuid) from public;
grant execute on function public.fn_capture_hold(uuid, text, text, text, text, text, uuid) to service_role;

create table if not exists public.wallet_idempotency_requests (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scope, idempotency_key)
);

alter table public.wallet_idempotency_requests enable row level security;

create or replace function public.fn_claim_wallet_idempotency(
  p_scope text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table(state text, response_payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.wallet_idempotency_requests%rowtype;
begin
  if coalesce(trim(p_scope), '') = '' then
    raise exception 'idempotency scope is required';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'idempotency key is required';
  end if;
  if coalesce(trim(p_request_fingerprint), '') = '' then
    raise exception 'request fingerprint is required';
  end if;

  insert into public.wallet_idempotency_requests (
    scope,
    idempotency_key,
    request_fingerprint
  )
  values (
    p_scope,
    p_idempotency_key,
    p_request_fingerprint
  )
  on conflict (scope, idempotency_key) do nothing
  returning * into v_request;

  if found then
    return query select 'claimed'::text, null::jsonb;
    return;
  end if;

  select * into v_request
  from public.wallet_idempotency_requests
  where scope = p_scope
    and idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint <> p_request_fingerprint then
    raise exception 'idempotency key payload mismatch';
  end if;
  if v_request.response_payload is not null then
    return query select 'replay'::text, v_request.response_payload;
    return;
  end if;

  return query select 'pending'::text, null::jsonb;
end;
$$;

create or replace function public.fn_complete_wallet_idempotency(
  p_scope text,
  p_idempotency_key text,
  p_response_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallet_idempotency_requests
  set response_payload = p_response_payload,
      completed_at = now()
  where scope = p_scope
    and idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'idempotency request not claimed';
  end if;
end;
$$;

create or replace function public.fn_abandon_wallet_idempotency(
  p_scope text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wallet_idempotency_requests
  where scope = p_scope
    and idempotency_key = p_idempotency_key
    and request_fingerprint = p_request_fingerprint
    and response_payload is null;
end;
$$;

revoke all on table public.wallet_idempotency_requests from public;
revoke all on function public.fn_claim_wallet_idempotency(text, text, text) from public;
revoke all on function public.fn_complete_wallet_idempotency(text, text, jsonb) from public;
revoke all on function public.fn_abandon_wallet_idempotency(text, text, text) from public;
grant execute on function public.fn_claim_wallet_idempotency(text, text, text) to service_role;
grant execute on function public.fn_complete_wallet_idempotency(text, text, jsonb) to service_role;
grant execute on function public.fn_abandon_wallet_idempotency(text, text, text) to service_role;
