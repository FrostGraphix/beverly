-- Vendor wallet foundation.
-- Financial truth is ledger-derived.
-- Rows are scoped by vendor organization.

create table if not exists public.vendor_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  status text not null check (status in (
    'draft',
    'pending_password_reset',
    'pending_onboarding',
    'pending_review',
    'active',
    'rejected',
    'suspended',
    'locked'
  )),
  station_ids_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.vendor_organizations(id),
  wallet_number text not null unique,
  currency text not null default 'NGN',
  status text not null check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table if not exists public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_wallets(id),
  organization_id uuid not null references public.vendor_organizations(id),
  entry_type text not null check (entry_type in (
    'funding_credit',
    'manual_credit',
    'hold_placement',
    'hold_release',
    'purchase_capture',
    'purchase_reversal',
    'refund_adjustment',
    'admin_adjustment',
    'reconciliation_correction'
  )),
  direction text not null check (direction in ('credit', 'debit')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN',
  reference_type text not null,
  reference_id text not null,
  idempotency_key text not null,
  actor_id text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (wallet_id, idempotency_key)
);

create table if not exists public.wallet_holds (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_wallets(id),
  organization_id uuid not null references public.vendor_organizations(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN',
  status text not null check (status in ('active', 'captured', 'released', 'expired', 'reversed')),
  reference_type text not null,
  reference_id text not null,
  idempotency_key text not null,
  actor_id text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, idempotency_key)
);

create table if not exists public.wallet_funding_requests (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_wallets(id),
  organization_id uuid not null references public.vendor_organizations(id),
  amount_minor bigint not null check (amount_minor > 0),
  verified_amount_minor bigint not null default 0 check (verified_amount_minor >= 0),
  currency text not null default 'NGN',
  status text not null check (status in (
    'initiated',
    'proof_uploaded',
    'under_review',
    'approved',
    'rejected',
    'expired',
    'cancelled'
  )),
  reference_code text not null unique,
  idempotency_key text not null,
  requested_by text not null,
  reviewed_by text not null default '',
  reviewer_note text not null default '',
  detail_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, idempotency_key)
);

create table if not exists public.wallet_funding_proofs (
  id uuid primary key default gen_random_uuid(),
  funding_request_id uuid not null references public.wallet_funding_requests(id),
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  uploaded_by text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_wallets(id),
  organization_id uuid not null references public.vendor_organizations(id),
  mode text not null check (mode in ('token', 'remote_send')),
  target_meter text not null,
  customer_name text not null default '',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN',
  status text not null check (status in (
    'created',
    'hold_active',
    'dispatching',
    'delivered',
    'delivery_pending_review',
    'failed',
    'reversed'
  )),
  hold_id uuid not null references public.wallet_holds(id),
  receipt_number text not null unique,
  idempotency_key text not null,
  actor_id text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, idempotency_key)
);

create table if not exists public.wallet_purchase_deliveries (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.wallet_purchase_orders(id),
  status text not null check (status in (
    'token_generated',
    'remote_send_success',
    'remote_send_pending',
    'delivery_failed',
    'delivery_unknown'
  )),
  token_value text not null default '',
  remote_reference text not null default '',
  failure_reason text not null default '',
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  wallet_id uuid,
  event_type text not null,
  actor_id text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.vendor_organizations(id),
  status text not null check (status in ('pending_review', 'approved', 'rejected')),
  submitted_by text not null,
  reviewed_by text not null default '',
  reviewer_note text not null default '',
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.vendor_organizations(id),
  onboarding_submission_id uuid not null references public.vendor_onboarding_submissions(id),
  document_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_approval_requests (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_wallets(id),
  organization_id uuid not null references public.vendor_organizations(id),
  approval_type text not null check (approval_type in ('manual_credit')),
  status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN',
  reason_code text not null,
  maker_id text not null,
  checker_id text not null default '',
  reviewer_note text not null default '',
  idempotency_key text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, idempotency_key)
);

create table if not exists public.wallet_reconciliation_runs (
  id text primary key,
  status text not null check (status in ('balanced', 'mismatch')),
  mismatch_count integer not null default 0,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_risk_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.vendor_organizations(id),
  wallet_id uuid not null references public.vendor_wallets(id),
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vendor_organizations_status_created_idx
  on public.vendor_organizations(status, created_at);
create index if not exists wallet_ledger_entries_wallet_created_idx
  on public.wallet_ledger_entries(wallet_id, created_at);
create index if not exists wallet_holds_wallet_status_idx
  on public.wallet_holds(wallet_id, status);
create index if not exists wallet_funding_requests_status_created_idx
  on public.wallet_funding_requests(status, created_at);
create index if not exists wallet_purchase_orders_org_created_idx
  on public.wallet_purchase_orders(organization_id, created_at);
create index if not exists wallet_audit_events_org_created_idx
  on public.wallet_audit_events(organization_id, created_at);
create index if not exists vendor_onboarding_status_created_idx
  on public.vendor_onboarding_submissions(status, created_at);
create index if not exists wallet_approval_status_created_idx
  on public.wallet_approval_requests(status, created_at);
create index if not exists wallet_reconciliation_created_idx
  on public.wallet_reconciliation_runs(created_at);

alter table public.vendor_organizations enable row level security;
alter table public.vendor_wallets enable row level security;
alter table public.wallet_ledger_entries enable row level security;
alter table public.wallet_holds enable row level security;
alter table public.wallet_funding_requests enable row level security;
alter table public.wallet_funding_proofs enable row level security;
alter table public.wallet_purchase_orders enable row level security;
alter table public.wallet_purchase_deliveries enable row level security;
alter table public.wallet_audit_events enable row level security;
alter table public.vendor_onboarding_submissions enable row level security;
alter table public.vendor_documents enable row level security;
alter table public.wallet_approval_requests enable row level security;
alter table public.wallet_reconciliation_runs enable row level security;
alter table public.wallet_risk_events enable row level security;

create or replace function public.normalized_role_key(input text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(input, ''))
    when 'admin' then 'super-admin'
    when 'administrator' then 'super-admin'
    when 'superadmin' then 'super-admin'
    when 'super_admin' then 'super-admin'
    when 'super-admin' then 'super-admin'
    when '0' then 'super-admin'
    when '1' then 'super-admin'
    when 'operator' then 'operations-manager'
    when 'operations' then 'operations-manager'
    when 'operation-manager' then 'operations-manager'
    when 'operations-manager' then 'operations-manager'
    when 'account' then 'account'
    when 'accountant' then 'account'
    when 'finance' then 'account'
    when 'account-officer' then 'account'
    when 'account_officer' then 'account'
    when 'finance_checker' then 'finance-checker'
    when 'finance-checker' then 'finance-checker'
    when 'checker' then 'finance-checker'
    when 'vendor' then 'vendor_user'
    when 'vendor-user' then 'vendor_user'
    when 'vendor_user' then 'vendor_user'
    when 'vendor-manager' then 'vendor_manager'
    when 'vendor_manager' then 'vendor_manager'
    else lower(coalesce(input, ''))
  end
$$;

create or replace function public.current_vendor_organization_id()
returns uuid
language sql
stable
as $$
  select case
    when coalesce(
      auth.jwt() -> 'user_metadata' ->> 'vendor_organization_id',
      auth.jwt() ->> 'vendor_organization_id',
      ''
    ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(
      auth.jwt() -> 'user_metadata' ->> 'vendor_organization_id',
      auth.jwt() ->> 'vendor_organization_id'
    )::uuid
    else null
  end
$$;

create or replace function public.is_wallet_staff()
returns boolean
language sql
stable
as $$
  select public.current_role_key() in ('super-admin', 'account', 'finance-checker')
$$;

create or replace function public.is_vendor_wallet_role()
returns boolean
language sql
stable
as $$
  select public.current_role_key() in ('vendor_user', 'vendor_manager')
$$;

drop policy if exists "wallet service role all vendor orgs" on public.vendor_organizations;
create policy "wallet service role all vendor orgs"
  on public.vendor_organizations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads vendor orgs" on public.vendor_organizations;
create policy "wallet staff reads vendor orgs"
  on public.vendor_organizations for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own organization" on public.vendor_organizations;
create policy "vendors read own organization"
  on public.vendor_organizations for select
  to authenticated
  using (public.is_vendor_wallet_role() and id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all wallets" on public.vendor_wallets;
create policy "wallet service role all wallets"
  on public.vendor_wallets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads wallets" on public.vendor_wallets;
create policy "wallet staff reads wallets"
  on public.vendor_wallets for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own wallet" on public.vendor_wallets;
create policy "vendors read own wallet"
  on public.vendor_wallets for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all ledger" on public.wallet_ledger_entries;
create policy "wallet service role all ledger"
  on public.wallet_ledger_entries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads ledger" on public.wallet_ledger_entries;
create policy "wallet staff reads ledger"
  on public.wallet_ledger_entries for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own ledger" on public.wallet_ledger_entries;
create policy "vendors read own ledger"
  on public.wallet_ledger_entries for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all holds" on public.wallet_holds;
create policy "wallet service role all holds"
  on public.wallet_holds for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads holds" on public.wallet_holds;
create policy "wallet staff reads holds"
  on public.wallet_holds for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own holds" on public.wallet_holds;
create policy "vendors read own holds"
  on public.wallet_holds for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all funding" on public.wallet_funding_requests;
create policy "wallet service role all funding"
  on public.wallet_funding_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads funding" on public.wallet_funding_requests;
create policy "wallet staff reads funding"
  on public.wallet_funding_requests for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own funding" on public.wallet_funding_requests;
create policy "vendors read own funding"
  on public.wallet_funding_requests for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all proofs" on public.wallet_funding_proofs;
create policy "wallet service role all proofs"
  on public.wallet_funding_proofs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads proofs" on public.wallet_funding_proofs;
create policy "wallet staff reads proofs"
  on public.wallet_funding_proofs for select
  to authenticated
  using (
    public.is_wallet_staff()
    or exists (
      select 1 from public.wallet_funding_requests request
      where request.id = wallet_funding_proofs.funding_request_id
        and request.organization_id = public.current_vendor_organization_id()
        and public.is_vendor_wallet_role()
    )
  );

drop policy if exists "wallet service role all purchases" on public.wallet_purchase_orders;
create policy "wallet service role all purchases"
  on public.wallet_purchase_orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads purchases" on public.wallet_purchase_orders;
create policy "wallet staff reads purchases"
  on public.wallet_purchase_orders for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own purchases" on public.wallet_purchase_orders;
create policy "vendors read own purchases"
  on public.wallet_purchase_orders for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all deliveries" on public.wallet_purchase_deliveries;
create policy "wallet service role all deliveries"
  on public.wallet_purchase_deliveries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads deliveries" on public.wallet_purchase_deliveries;
create policy "wallet staff reads deliveries"
  on public.wallet_purchase_deliveries for select
  to authenticated
  using (
    public.is_wallet_staff()
    or exists (
      select 1 from public.wallet_purchase_orders orders
      where orders.id = wallet_purchase_deliveries.purchase_order_id
        and orders.organization_id = public.current_vendor_organization_id()
        and public.is_vendor_wallet_role()
    )
  );

drop policy if exists "wallet service role all audit" on public.wallet_audit_events;
create policy "wallet service role all audit"
  on public.wallet_audit_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads audit" on public.wallet_audit_events;
create policy "wallet staff reads audit"
  on public.wallet_audit_events for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "wallet service role all onboarding" on public.vendor_onboarding_submissions;
create policy "wallet service role all onboarding"
  on public.vendor_onboarding_submissions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads onboarding" on public.vendor_onboarding_submissions;
create policy "wallet staff reads onboarding"
  on public.vendor_onboarding_submissions for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own onboarding" on public.vendor_onboarding_submissions;
create policy "vendors read own onboarding"
  on public.vendor_onboarding_submissions for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all vendor documents" on public.vendor_documents;
create policy "wallet service role all vendor documents"
  on public.vendor_documents for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads vendor documents" on public.vendor_documents;
create policy "wallet staff reads vendor documents"
  on public.vendor_documents for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "vendors read own vendor documents" on public.vendor_documents;
create policy "vendors read own vendor documents"
  on public.vendor_documents for select
  to authenticated
  using (public.is_vendor_wallet_role() and organization_id = public.current_vendor_organization_id());

drop policy if exists "wallet service role all approvals" on public.wallet_approval_requests;
create policy "wallet service role all approvals"
  on public.wallet_approval_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads approvals" on public.wallet_approval_requests;
create policy "wallet staff reads approvals"
  on public.wallet_approval_requests for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "wallet service role all reconciliation" on public.wallet_reconciliation_runs;
create policy "wallet service role all reconciliation"
  on public.wallet_reconciliation_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads reconciliation" on public.wallet_reconciliation_runs;
create policy "wallet staff reads reconciliation"
  on public.wallet_reconciliation_runs for select
  to authenticated
  using (public.is_wallet_staff());

drop policy if exists "wallet service role all risk events" on public.wallet_risk_events;
create policy "wallet service role all risk events"
  on public.wallet_risk_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet staff reads risk events" on public.wallet_risk_events;
create policy "wallet staff reads risk events"
  on public.wallet_risk_events for select
  to authenticated
  using (public.is_wallet_staff());
