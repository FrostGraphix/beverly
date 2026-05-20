-- Align wallet runtime ledger schema with backend/wallet/src/services.
-- Idempotent repair for environments that have vendor onboarding tables but
-- are missing ledger-backed funding primitives.

create table if not exists public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  direction text not null,
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint not null default 0,
  entry_type text not null,
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger_entries
  add column if not exists balance_after_minor bigint not null default 0,
  add column if not exists memo text,
  add column if not exists created_by uuid;

alter table public.wallet_ledger_entries
  drop constraint if exists wallet_ledger_entries_direction_check,
  drop constraint if exists wallet_ledger_entries_entry_type_check,
  add constraint wallet_ledger_entries_direction_check check (direction in ('credit', 'debit')),
  add constraint wallet_ledger_entries_entry_type_check check (entry_type in (
    'funding_credit',
    'payment_credit',
    'purchase_debit',
    'meter_order_debit',
    'manual_credit',
    'manual_debit',
    'reversal_credit',
    'reversal_debit',
    'fee_debit',
    'promo_credit'
  ));

alter table public.wallet_ledger_entries
  alter column reference_type drop not null,
  alter column reference_id drop not null,
  alter column balance_after_minor set not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_ledger_entries'
      and column_name = 'organization_id'
  ) then
    alter table public.wallet_ledger_entries alter column organization_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_ledger_entries'
      and column_name = 'actor_id'
  ) then
    alter table public.wallet_ledger_entries alter column actor_id drop not null;
  end if;
end $$;

drop index if exists public.wallet_ledger_entries_wallet_id_idempotency_key_key;
create unique index if not exists wallet_ledger_entries_wallet_idempotency_idx
  on public.wallet_ledger_entries(wallet_id, idempotency_key);
create index if not exists wallet_ledger_entries_wallet_created_idx
  on public.wallet_ledger_entries(wallet_id, created_at desc);

create table if not exists public.wallet_holds (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'active',
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  captured_at timestamptz,
  released_at timestamptz,
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.wallet_holds
  add column if not exists expires_at timestamptz not null default (now() + interval '15 minutes'),
  add column if not exists captured_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists created_by uuid;

alter table public.wallet_holds
  drop constraint if exists wallet_holds_status_check,
  add constraint wallet_holds_status_check check (status in ('active', 'captured', 'released', 'expired'));

alter table public.wallet_holds
  alter column reference_type drop not null,
  alter column reference_id drop not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_holds'
      and column_name = 'organization_id'
  ) then
    alter table public.wallet_holds alter column organization_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_holds'
      and column_name = 'actor_id'
  ) then
    alter table public.wallet_holds alter column actor_id drop not null;
  end if;
end $$;

create unique index if not exists wallet_holds_wallet_idempotency_idx
  on public.wallet_holds(wallet_id, idempotency_key);
create index if not exists wallet_holds_wallet_status_idx
  on public.wallet_holds(wallet_id, status);

create table if not exists public.funding_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_organization_id uuid not null references public.vendor_organizations(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  funding_reference text,
  proof_file_path text,
  proof_hash text,
  channel text not null,
  status text not null,
  submitted_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.funding_requests
  drop constraint if exists funding_requests_channel_check,
  drop constraint if exists funding_requests_status_check,
  add constraint funding_requests_channel_check check (channel in ('bank_transfer', 'paystack', 'manual')),
  add constraint funding_requests_status_check check (status in (
    'initiated',
    'proof_uploaded',
    'under_review',
    'approved',
    'rejected',
    'expired',
    'cancelled'
  ));

create index if not exists funding_requests_status_created_idx
  on public.funding_requests(status, created_at asc);
create unique index if not exists funding_requests_vendor_proof_hash_idx
  on public.funding_requests(vendor_organization_id, proof_hash)
  where proof_hash is not null;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  gateway_reference text not null,
  actor_type text not null,
  actor_id uuid not null,
  purpose text not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_transactions_gateway_reference_idx
  on public.payment_transactions(gateway, gateway_reference);
create index if not exists payment_transactions_status_created_idx
  on public.payment_transactions(status, created_at desc);

create or replace view public.v_wallet_balances as
select
  w.id as wallet_id,
  w.currency,
  w.status,
  coalesce(sum(
    case
      when e.direction = 'credit' then e.amount_minor
      when e.direction = 'debit' then -e.amount_minor
      else 0
    end
  ), 0)::bigint as ledger_balance_minor,
  coalesce((
    select sum(h.amount_minor)
    from public.wallet_holds h
    where h.wallet_id = w.id
      and h.status = 'active'
  ), 0)::bigint as active_holds_minor,
  (
    coalesce(sum(
      case
        when e.direction = 'credit' then e.amount_minor
        when e.direction = 'debit' then -e.amount_minor
        else 0
      end
    ), 0)
    - coalesce((
      select sum(h.amount_minor)
      from public.wallet_holds h
      where h.wallet_id = w.id
        and h.status = 'active'
    ), 0)
  )::bigint as available_balance_minor
from public.wallets w
left join public.wallet_ledger_entries e on e.wallet_id = w.id
group by w.id, w.currency, w.status;

create or replace function public.fn_post_ledger_entry(
  p_wallet_id uuid,
  p_direction text,
  p_amount_minor bigint,
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
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_ledger_entries%rowtype;
  v_balance bigint;
  v_holds bigint;
  v_available bigint;
  v_after bigint;
  v_entry public.wallet_ledger_entries%rowtype;
begin
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
  from public.wallet_ledger_entries
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

  v_available := v_balance - v_holds;
  if p_direction = 'debit' and v_available < p_amount_minor then
    raise exception 'insufficient available balance';
  end if;

  v_after := case
    when p_direction = 'credit' then v_balance + p_amount_minor
    else v_balance - p_amount_minor
  end;

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
    p_wallet_id,
    p_direction,
    p_amount_minor,
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
  where id = p_wallet_id;

  return v_entry;
end;
$$;

create or replace function public.fn_release_hold(p_hold_id uuid)
returns public.wallet_holds
language plpgsql
security definer
as $$
declare
  v_hold public.wallet_holds%rowtype;
begin
  update public.wallet_holds
  set status = 'released',
      released_at = now()
  where id = p_hold_id
    and status = 'active'
  returning * into v_hold;

  if not found then
    select * into v_hold from public.wallet_holds where id = p_hold_id;
  end if;

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
as $$
declare
  v_hold public.wallet_holds%rowtype;
  v_entry public.wallet_ledger_entries%rowtype;
begin
  select * into v_hold
  from public.wallet_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'hold not found';
  end if;
  if v_hold.status <> 'active' then
    raise exception 'hold not active';
  end if;

  v_entry := public.fn_post_ledger_entry(
    v_hold.wallet_id,
    'debit',
    v_hold.amount_minor,
    p_entry_type,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    p_memo,
    p_created_by
  );

  update public.wallet_holds
  set status = 'captured',
      captured_at = now()
  where id = p_hold_id;

  return v_entry;
end;
$$;

alter table public.wallet_ledger_entries enable row level security;
alter table public.wallet_holds enable row level security;
alter table public.funding_requests enable row level security;
alter table public.payment_transactions enable row level security;

drop policy if exists "wallet service role all ledger entries" on public.wallet_ledger_entries;
create policy "wallet service role all ledger entries"
  on public.wallet_ledger_entries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all holds" on public.wallet_holds;
create policy "wallet service role all holds"
  on public.wallet_holds for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all funding requests" on public.funding_requests;
create policy "wallet service role all funding requests"
  on public.funding_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all payment transactions" on public.payment_transactions;
create policy "wallet service role all payment transactions"
  on public.payment_transactions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
