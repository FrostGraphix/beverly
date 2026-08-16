alter table public.payment_transactions
  add column if not exists channel text;

alter table public.payment_transactions
  add column if not exists completed_at timestamptz;

update public.payment_transactions
set
  status = 'succeeded',
  completed_at = coalesce(completed_at, updated_at, created_at),
  updated_at = now()
where status = 'success';

create index if not exists payment_transactions_gateway_status_created_idx
  on public.payment_transactions(gateway, status, created_at desc);

create table if not exists public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_type text not null,
  gateway_reference text,
  signature text,
  signature_valid boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists payment_webhooks_gateway_reference_idx
  on public.payment_webhooks(gateway, gateway_reference, created_at desc);

create index if not exists payment_webhooks_unprocessed_reference_idx
  on public.payment_webhooks(gateway, gateway_reference)
  where processed = false;

alter table public.payment_webhooks enable row level security;

drop policy if exists "wallet service role all payment webhooks" on public.payment_webhooks;
create policy "wallet service role all payment webhooks"
  on public.payment_webhooks for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
