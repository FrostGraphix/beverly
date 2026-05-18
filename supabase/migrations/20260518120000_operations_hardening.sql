-- Phase 6: Operations Hardening
-- Tables: disputes, dispute_messages, refund_requests,
--         settlement_batches, reconciliation_runs

-- ── Disputes ─────────────────────────────────────────────────────────────────
create type dispute_actor_type_enum  as enum ('customer', 'vendor');
create type dispute_status_enum      as enum ('open', 'under_review', 'resolved', 'rejected', 'refund_issued');

create sequence dispute_reference_seq start 1;

create table disputes (
  id                    uuid primary key default gen_random_uuid(),
  reference             text unique not null
                          default ('DISP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('dispute_reference_seq')::text, 5, '0')),
  raised_by_actor_type  dispute_actor_type_enum not null,
  raised_by_actor_id    uuid not null,
  customer_id           uuid references customers(id) on delete set null,
  vendor_organization_id uuid references vendor_organizations(id) on delete set null,
  purchase_order_id     uuid,            -- loosely coupled (may be deleted)
  subject               text not null,
  description           text not null,
  status                dispute_status_enum not null default 'open',
  resolution_note       text,
  resolved_by_user_id   uuid,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index disputes_customer_idx  on disputes (customer_id, created_at desc) where customer_id is not null;
create index disputes_vendor_idx    on disputes (vendor_organization_id, created_at desc) where vendor_organization_id is not null;
create index disputes_status_idx    on disputes (status, created_at asc) where status in ('open','under_review');

create table dispute_messages (
  id                uuid primary key default gen_random_uuid(),
  dispute_id        uuid not null references disputes(id) on delete cascade,
  sender_actor_type text not null,        -- 'customer' | 'vendor' | 'staff'
  sender_actor_id   uuid not null,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index dispute_messages_dispute_idx on dispute_messages (dispute_id, created_at asc);

-- Auto-update disputes.updated_at
create or replace function set_dispute_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger disputes_updated_at
  before update on disputes
  for each row execute function set_dispute_updated_at();

-- ── Refund requests ───────────────────────────────────────────────────────────
create type refund_status_enum as enum ('pending', 'approved', 'rejected');

create table refund_requests (
  id                uuid primary key default gen_random_uuid(),
  dispute_id        uuid references disputes(id) on delete set null,
  wallet_id         uuid not null references wallets(id) on delete restrict,
  amount_minor      bigint not null check (amount_minor > 0),
  reason            text not null,
  status            refund_status_enum not null default 'pending',
  requested_by_user_id uuid,
  approved_by_user_id  uuid,
  rejected_by_user_id  uuid,
  ledger_entry_id   uuid,               -- set once ledger credit written
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index refund_requests_wallet_idx  on refund_requests (wallet_id, created_at desc);
create index refund_requests_status_idx  on refund_requests (status, created_at asc) where status = 'pending';
create index refund_requests_dispute_idx on refund_requests (dispute_id) where dispute_id is not null;

create trigger refund_requests_updated_at
  before update on refund_requests
  for each row execute function set_dispute_updated_at();  -- reuse generic trigger fn

-- ── Settlement batches ────────────────────────────────────────────────────────
create type settlement_status_enum as enum ('pending', 'processing', 'settled', 'failed');

create table settlement_batches (
  id                      uuid primary key default gen_random_uuid(),
  vendor_organization_id  uuid not null references vendor_organizations(id) on delete restrict,
  period_start            date not null,
  period_end              date not null,
  total_vends             int not null default 0,
  gross_amount_minor      bigint not null default 0,
  fee_minor               bigint not null default 0,  -- Beverly platform fee
  net_amount_minor        bigint not null default 0,
  status                  settlement_status_enum not null default 'pending',
  settled_at              timestamptz,
  notes                   text,
  created_at              timestamptz not null default now(),
  unique (vendor_organization_id, period_start, period_end)
);

create index settlement_batches_vendor_idx on settlement_batches (vendor_organization_id, period_start desc);
create index settlement_batches_status_idx on settlement_batches (status) where status = 'pending';

-- ── Reconciliation runs ───────────────────────────────────────────────────────
create type reconciliation_status_enum as enum ('ok', 'mismatch', 'failed', 'running');

create table reconciliation_runs (
  id                    uuid primary key default gen_random_uuid(),
  run_date              date not null unique,
  status                reconciliation_status_enum not null default 'running',
  total_purchases       int not null default 0,
  total_amount_minor    bigint not null default 0,
  gateway_total_minor   bigint,         -- null if gateway query failed
  mismatch_minor        bigint,         -- abs difference; null if status=ok
  notes                 text,
  created_at            timestamptz not null default now(),
  checked_at            timestamptz
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table disputes              enable row level security;
alter table dispute_messages      enable row level security;
alter table refund_requests       enable row level security;
alter table settlement_batches    enable row level security;
alter table reconciliation_runs   enable row level security;
-- All access goes through service role (backend) — no direct client RLS policies needed.
