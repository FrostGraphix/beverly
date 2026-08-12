-- Immediate Wallet Admin vendor-to-vendor balance transfers.
-- One RPC owns the immutable transfer record and both balanced ledger legs.
-- Applied to the non-production project as migration 20260812145901.

create table if not exists public.wallet_rate_limit_counters (
  scope text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash, window_started_at)
);

create index if not exists wallet_rate_limit_counters_expiry_idx
  on public.wallet_rate_limit_counters(expires_at);

alter table public.wallet_rate_limit_counters enable row level security;
alter table public.wallet_rate_limit_counters force row level security;

revoke all on table public.wallet_rate_limit_counters from public, anon, authenticated;
grant all on table public.wallet_rate_limit_counters to service_role;

create or replace function public.fn_observe_wallet_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_window_ends_at timestamptz;
  v_count integer;
begin
  if char_length(btrim(coalesce(p_scope, ''))) not between 3 and 100 then
    raise exception 'rate limit scope is invalid';
  end if;
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'rate limit key hash is invalid';
  end if;
  if p_window_seconds not between 10 and 3600 then
    raise exception 'rate limit window is invalid';
  end if;
  if p_max_requests not between 1 and 100 then
    raise exception 'rate limit maximum is invalid';
  end if;

  v_window_started_at := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) / p_window_seconds)
      * p_window_seconds
  );
  v_window_ends_at := v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds);

  insert into public.wallet_rate_limit_counters (
    scope, key_hash, window_started_at, request_count, expires_at
  ) values (
    btrim(p_scope), p_key_hash, v_window_started_at, 1, v_window_ends_at + interval '1 hour'
  )
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = public.wallet_rate_limit_counters.request_count + 1
  returning request_count into v_count;

  return jsonb_build_object(
    'count', v_count,
    'limit', p_max_requests,
    'exceeded', v_count > p_max_requests,
    'retry_after_seconds', greatest(
      1,
      ceil(pg_catalog.date_part('epoch', v_window_ends_at - pg_catalog.clock_timestamp()))::integer
    )
  );
end;
$$;

revoke all on function public.fn_observe_wallet_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_observe_wallet_rate_limit(text, text, integer, integer)
  to service_role;

create table if not exists public.vendor_wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'completed' check (status = 'completed'),
  source_vendor_id uuid not null references public.vendor_organizations(id) on delete restrict,
  destination_vendor_id uuid not null references public.vendor_organizations(id) on delete restrict,
  source_vendor_name text not null,
  destination_vendor_name text not null,
  source_wallet_id uuid not null references public.wallets(id) on delete restrict,
  destination_wallet_id uuid not null references public.wallets(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  reason text not null check (char_length(btrim(reason)) between 8 and 500),
  idempotency_key text not null unique,
  request_fingerprint text not null,
  debit_entry_id uuid not null references public.wallet_ledger_entries(id) on delete restrict,
  credit_entry_id uuid not null references public.wallet_ledger_entries(id) on delete restrict,
  source_balance_after_minor bigint not null,
  destination_balance_after_minor bigint not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint vendor_wallet_transfers_distinct_vendors check (source_vendor_id <> destination_vendor_id),
  constraint vendor_wallet_transfers_distinct_wallets check (source_wallet_id <> destination_wallet_id)
);

create index if not exists vendor_wallet_transfers_created_idx
  on public.vendor_wallet_transfers(created_at desc, id desc);
create index if not exists vendor_wallet_transfers_source_idx
  on public.vendor_wallet_transfers(source_vendor_id, created_at desc);
create index if not exists vendor_wallet_transfers_destination_idx
  on public.vendor_wallet_transfers(destination_vendor_id, created_at desc);

alter table public.vendor_wallet_transfers enable row level security;
alter table public.vendor_wallet_transfers force row level security;

drop policy if exists "service role manages vendor wallet transfers" on public.vendor_wallet_transfers;
create policy "service role manages vendor wallet transfers"
  on public.vendor_wallet_transfers
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.vendor_wallet_transfers from public, anon, authenticated;
grant select on table public.vendor_wallet_transfers to authenticated;
grant all on table public.vendor_wallet_transfers to service_role;

create or replace function private.deny_vendor_wallet_transfer_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'completed vendor wallet transfers are immutable';
end;
$$;

revoke all on function private.deny_vendor_wallet_transfer_mutation() from public, anon, authenticated;
grant execute on function private.deny_vendor_wallet_transfer_mutation() to service_role;

drop trigger if exists vendor_wallet_transfers_immutable on public.vendor_wallet_transfers;
create trigger vendor_wallet_transfers_immutable
  before update or delete on public.vendor_wallet_transfers
  for each row execute function private.deny_vendor_wallet_transfer_mutation();

alter table public.wallet_ledger_entries
  drop constraint if exists wallet_ledger_entries_entry_type_check,
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
    'promo_credit',
    'refund_credit',
    'vendor_transfer_debit',
    'vendor_transfer_credit'
  ));

insert into public.roles (role_key, role_name, label, description)
values ('developer', 'Developer', 'Developer', 'Developer Console access and vendor balance transfer operations.')
on conflict (role_key) do update
set role_name = excluded.role_name,
    label = excluded.label,
    description = excluded.description,
    updated_at = now();

insert into public.permissions (role_key, route_hash)
values
  ('super-admin', 'wallet.vendor_transfers.manage'),
  ('developer', 'dev.console'),
  ('developer', 'wallet.vendor_transfers.manage')
on conflict (role_key, route_hash) do nothing;

insert into public.feature_flags (key, description, enabled, rollout_percent, regions)
values ('wallet.vendor_transfers', 'Allow authorized Wallet Admin vendor-to-vendor balance transfers.', false, 0, '{}')
on conflict (key) do nothing;

create or replace function public.fn_preview_admin_vendor_balance_transfer(
  p_source_vendor_id uuid,
  p_destination_vendor_id uuid,
  p_amount_minor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.wallets%rowtype;
  v_destination public.wallets%rowtype;
  v_source_balance bigint;
  v_destination_balance bigint;
  v_holds bigint;
  v_daily_debits bigint;
  v_monthly_debits bigint;
begin
  if p_source_vendor_id = p_destination_vendor_id then raise exception 'source and destination vendors must differ'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'transfer amount must be positive'; end if;

  select w.* into v_source from public.wallets w
  join public.vendor_organizations v on v.id = w.owner_id
  where w.owner_type = 'vendor' and w.owner_id = p_source_vendor_id and v.status = 'approved';
  select w.* into v_destination from public.wallets w
  join public.vendor_organizations v on v.id = w.owner_id
  where w.owner_type = 'vendor' and w.owner_id = p_destination_vendor_id and v.status = 'approved';

  if v_source.id is null then raise exception 'source wallet not found'; end if;
  if v_destination.id is null then raise exception 'destination wallet not found'; end if;
  if v_source.status <> 'active' then raise exception 'source wallet is not active'; end if;
  if v_destination.status <> 'active' then raise exception 'destination wallet is not active'; end if;
  if v_source.currency <> v_destination.currency then raise exception 'wallet currencies must match'; end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_source_balance from public.wallet_ledger_entries where wallet_id = v_source.id;
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_destination_balance from public.wallet_ledger_entries where wallet_id = v_destination.id;
  select coalesce(sum(amount_minor), 0) into v_holds
  from public.wallet_holds where wallet_id = v_source.id and status = 'active';

  if v_source_balance - v_holds < p_amount_minor then raise exception 'insufficient available balance'; end if;

  select coalesce(sum(amount_minor), 0) into v_daily_debits
  from public.wallet_ledger_entries
  where wallet_id = v_source.id and direction = 'debit' and created_at >= now() - interval '24 hours';
  select coalesce(sum(amount_minor), 0) into v_monthly_debits
  from public.wallet_ledger_entries
  where wallet_id = v_source.id and direction = 'debit' and created_at >= now() - interval '30 days';
  if v_source.daily_debit_cap_minor is not null and v_daily_debits + p_amount_minor > v_source.daily_debit_cap_minor then
    raise exception 'daily debit cap exceeded';
  end if;
  if v_source.monthly_debit_cap_minor is not null and v_monthly_debits + p_amount_minor > v_source.monthly_debit_cap_minor then
    raise exception 'monthly debit cap exceeded';
  end if;

  return jsonb_build_object(
    'amount_minor', p_amount_minor,
    'currency', v_source.currency,
    'source_balance_after_minor', v_source_balance - p_amount_minor,
    'destination_balance_after_minor', v_destination_balance + p_amount_minor
  );
end;
$$;

revoke all on function public.fn_preview_admin_vendor_balance_transfer(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.fn_preview_admin_vendor_balance_transfer(uuid, uuid, bigint) to service_role;

create or replace function public.fn_admin_transfer_vendor_balance(
  p_source_vendor_id uuid,
  p_destination_vendor_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.vendor_wallet_transfers%rowtype;
  v_source_vendor public.vendor_organizations%rowtype;
  v_destination_vendor public.vendor_organizations%rowtype;
  v_source_wallet public.wallets%rowtype;
  v_destination_wallet public.wallets%rowtype;
  v_transfer_id uuid := gen_random_uuid();
  v_debit_entry_id uuid := gen_random_uuid();
  v_credit_entry_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_source_balance bigint;
  v_destination_balance bigint;
  v_active_holds bigint;
  v_available bigint;
  v_daily_debits bigint;
  v_monthly_debits bigint;
  v_source_after bigint;
  v_destination_after bigint;
  v_amount_label text;
begin
  if p_source_vendor_id is null or p_destination_vendor_id is null then
    raise exception 'source and destination vendors are required';
  end if;
  if p_source_vendor_id = p_destination_vendor_id then
    raise exception 'source and destination vendors must differ';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'transfer amount must be positive';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 8 and 500 then
    raise exception 'transfer reason must be between 8 and 500 characters';
  end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 16 and 200 then
    raise exception 'idempotency key must be between 16 and 200 characters';
  end if;
  if p_created_by is null then
    raise exception 'created by is required';
  end if;

  v_fingerprint := p_source_vendor_id::text || '|' || p_destination_vendor_id::text || '|' ||
    p_amount_minor::text || '|' || btrim(p_reason);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  select * into v_existing
  from public.vendor_wallet_transfers
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key payload mismatch';
    end if;
    return to_jsonb(v_existing) - 'request_fingerprint';
  end if;

  if not exists (
    select 1 from public.feature_flags
    where key = 'wallet.vendor_transfers'
      and enabled = true
      and rollout_percent > 0
  ) then
    raise exception 'vendor transfers are disabled';
  end if;

  perform 1
  from public.vendor_organizations
  where id in (p_source_vendor_id, p_destination_vendor_id)
  order by id
  for share;

  select * into v_source_vendor
  from public.vendor_organizations
  where id = p_source_vendor_id;
  select * into v_destination_vendor
  from public.vendor_organizations
  where id = p_destination_vendor_id;

  if v_source_vendor.id is null then raise exception 'source vendor not found'; end if;
  if v_destination_vendor.id is null then raise exception 'destination vendor not found'; end if;
  if v_source_vendor.status <> 'approved' then raise exception 'source vendor is not approved'; end if;
  if v_destination_vendor.status <> 'approved' then raise exception 'destination vendor is not approved'; end if;

  select * into v_source_wallet
  from public.wallets
  where owner_type = 'vendor' and owner_id = p_source_vendor_id;
  select * into v_destination_wallet
  from public.wallets
  where owner_type = 'vendor' and owner_id = p_destination_vendor_id;

  if v_source_wallet.id is null then raise exception 'source wallet not found'; end if;
  if v_destination_wallet.id is null then raise exception 'destination wallet not found'; end if;

  perform 1
  from public.wallets
  where id in (v_source_wallet.id, v_destination_wallet.id)
  order by id for update;

  select * into v_source_wallet from public.wallets where id = v_source_wallet.id;
  select * into v_destination_wallet from public.wallets where id = v_destination_wallet.id;

  if v_source_wallet.status <> 'active' then raise exception 'source wallet is not active'; end if;
  if v_destination_wallet.status <> 'active' then raise exception 'destination wallet is not active'; end if;
  if v_source_wallet.currency <> v_destination_wallet.currency then raise exception 'wallet currencies must match'; end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_source_balance
  from public.wallet_ledger_entries where wallet_id = v_source_wallet.id;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_destination_balance
  from public.wallet_ledger_entries where wallet_id = v_destination_wallet.id;

  select coalesce(sum(amount_minor), 0) into v_active_holds
  from public.wallet_holds
  where wallet_id = v_source_wallet.id and status = 'active';

  v_available := v_source_balance - v_active_holds;
  if v_available < p_amount_minor then raise exception 'insufficient available balance'; end if;

  select coalesce(sum(amount_minor), 0) into v_daily_debits
  from public.wallet_ledger_entries
  where wallet_id = v_source_wallet.id and direction = 'debit' and created_at >= now() - interval '24 hours';
  select coalesce(sum(amount_minor), 0) into v_monthly_debits
  from public.wallet_ledger_entries
  where wallet_id = v_source_wallet.id and direction = 'debit' and created_at >= now() - interval '30 days';

  if v_source_wallet.daily_debit_cap_minor is not null
     and v_daily_debits + p_amount_minor > v_source_wallet.daily_debit_cap_minor then
    raise exception 'daily debit cap exceeded';
  end if;
  if v_source_wallet.monthly_debit_cap_minor is not null
     and v_monthly_debits + p_amount_minor > v_source_wallet.monthly_debit_cap_minor then
    raise exception 'monthly debit cap exceeded';
  end if;

  v_source_after := v_source_balance - p_amount_minor;
  v_destination_after := v_destination_balance + p_amount_minor;

  insert into public.wallet_ledger_entries (
    id, wallet_id, direction, amount_minor, balance_after_minor, entry_type,
    reference_type, reference_id, idempotency_key, memo, created_by
  ) values (
    v_debit_entry_id, v_source_wallet.id, 'debit', p_amount_minor, v_source_after, 'vendor_transfer_debit',
    'vendor_wallet_transfer', v_transfer_id::text, p_idempotency_key || ':debit', btrim(p_reason), p_created_by
  );

  insert into public.wallet_ledger_entries (
    id, wallet_id, direction, amount_minor, balance_after_minor, entry_type,
    reference_type, reference_id, idempotency_key, memo, created_by
  ) values (
    v_credit_entry_id, v_destination_wallet.id, 'credit', p_amount_minor, v_destination_after, 'vendor_transfer_credit',
    'vendor_wallet_transfer', v_transfer_id::text, p_idempotency_key || ':credit', btrim(p_reason), p_created_by
  );

  update public.wallets set balance_minor = v_source_after, updated_at = now() where id = v_source_wallet.id;
  update public.wallets set balance_minor = v_destination_after, updated_at = now() where id = v_destination_wallet.id;

  insert into public.vendor_wallet_transfers (
    id, source_vendor_id, destination_vendor_id, source_vendor_name, destination_vendor_name,
    source_wallet_id, destination_wallet_id,
    amount_minor, currency, reason, idempotency_key, request_fingerprint,
    debit_entry_id, credit_entry_id, source_balance_after_minor, destination_balance_after_minor, created_by
  ) values (
    v_transfer_id, p_source_vendor_id, p_destination_vendor_id,
    coalesce(v_source_vendor.trading_name, v_source_vendor.legal_name),
    coalesce(v_destination_vendor.trading_name, v_destination_vendor.legal_name),
    v_source_wallet.id, v_destination_wallet.id,
    p_amount_minor, v_source_wallet.currency, btrim(p_reason), p_idempotency_key, v_fingerprint,
    v_debit_entry_id, v_credit_entry_id, v_source_after, v_destination_after, p_created_by
  ) returning * into v_existing;

  v_amount_label := '₦' || to_char(p_amount_minor::numeric / 100, 'FM999G999G999G990D00');

  insert into public.notifications (
    customer_id, recipient_type, recipient_id, vendor_organization_id,
    type, category, title, message, body, payload, metadata, audience, read
  ) values (
    null, 'vendor', p_source_vendor_id, p_source_vendor_id,
    'vendor_balance_transferred', 'vendor_balance_transferred',
    'Balance transferred',
    v_amount_label || ' was transferred to ' || coalesce(v_destination_vendor.trading_name, v_destination_vendor.legal_name, 'another vendor') || '.',
    v_amount_label || ' was transferred to ' || coalesce(v_destination_vendor.trading_name, v_destination_vendor.legal_name, 'another vendor') || '.',
    jsonb_build_object('transferId', v_transfer_id, 'direction', 'debit', 'amountMinor', p_amount_minor),
    jsonb_build_object('transferId', v_transfer_id, 'direction', 'debit', 'amountMinor', p_amount_minor),
    'vendor', false
  );

  insert into public.notifications (
    customer_id, recipient_type, recipient_id, vendor_organization_id,
    type, category, title, message, body, payload, metadata, audience, read
  ) values (
    null, 'vendor', p_destination_vendor_id, p_destination_vendor_id,
    'vendor_balance_transferred', 'vendor_balance_transferred',
    'Balance received',
    v_amount_label || ' was received from ' || coalesce(v_source_vendor.trading_name, v_source_vendor.legal_name, 'another vendor') || '.',
    v_amount_label || ' was received from ' || coalesce(v_source_vendor.trading_name, v_source_vendor.legal_name, 'another vendor') || '.',
    jsonb_build_object('transferId', v_transfer_id, 'direction', 'credit', 'amountMinor', p_amount_minor),
    jsonb_build_object('transferId', v_transfer_id, 'direction', 'credit', 'amountMinor', p_amount_minor),
    'vendor', false
  );

  return to_jsonb(v_existing) - 'request_fingerprint';
end;
$$;

revoke all on function public.fn_admin_transfer_vendor_balance(uuid, uuid, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_admin_transfer_vendor_balance(uuid, uuid, bigint, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
