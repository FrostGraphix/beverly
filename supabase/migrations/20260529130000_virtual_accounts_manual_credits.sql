-- Phase 1: Virtual Accounts (DVA) + Manual Credit maker-checker

-- ── Virtual Accounts ──────────────────────────────────────────────────────────
-- Stores Paystack Dedicated Virtual Account (NUBAN) assignments per wallet.
-- When a customer/vendor transfers to their NUBAN, Paystack fires charge.success
-- with channel='dedicated_nuban', and the webhook credits the linked wallet.

create table if not exists public.virtual_accounts (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references public.wallets(id) on delete restrict,
  owner_type         text not null check (owner_type in ('customer', 'vendor')),
  owner_id           uuid not null,
  -- Paystack customer tracking
  paystack_customer_code text,
  -- Account details
  bank_name          text not null,
  bank_code          text not null,
  account_number     text not null,
  account_name       text not null,
  -- Lifecycle
  gateway            text not null default 'paystack',
  status             text not null default 'active' check (status in ('active', 'inactive', 'frozen')),
  metadata           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (gateway, account_number)
);

create index if not exists virtual_accounts_wallet_idx
  on public.virtual_accounts (wallet_id);

create index if not exists virtual_accounts_owner_idx
  on public.virtual_accounts (owner_type, owner_id);

create trigger virtual_accounts_updated_at
  before update on public.virtual_accounts
  for each row execute function public.set_updated_at();

alter table public.virtual_accounts enable row level security;

drop policy if exists "va service role all" on public.virtual_accounts;
create policy "va service role all"
  on public.virtual_accounts for all
  to service_role using (true);

-- ── Manual Credit Requests (maker-checker) ───────────────────────────────────
-- Finance staff can request a manual wallet credit. A different staff member
-- (checker) must approve before the ledger entry is written.

create table if not exists public.manual_credit_requests (
  id                    uuid primary key default gen_random_uuid(),
  wallet_id             uuid not null references public.wallets(id) on delete restrict,
  amount_minor          bigint not null check (amount_minor > 0),
  reason                text not null,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  requested_by_user_id  uuid not null,
  approved_by_user_id   uuid,
  rejected_by_user_id   uuid,
  ledger_entry_id       uuid,
  rejection_reason      text,
  processed_at          timestamptz,
  idempotency_key       text not null unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists manual_credit_requests_wallet_idx
  on public.manual_credit_requests (wallet_id, created_at desc);

create index if not exists manual_credit_requests_status_idx
  on public.manual_credit_requests (status, created_at asc)
  where status = 'pending';

create trigger manual_credit_requests_updated_at
  before update on public.manual_credit_requests
  for each row execute function public.set_updated_at();

alter table public.manual_credit_requests enable row level security;

drop policy if exists "mcr service role all" on public.manual_credit_requests;
create policy "mcr service role all"
  on public.manual_credit_requests for all
  to service_role using (true);
