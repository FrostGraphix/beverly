-- Comprehensive RLS + RBAC hardening for all wallet domain tables.
-- Adds service-role bypass, staff read, and owner-scoped policies
-- across every table that was missing them. Also enables RLS on
-- operational aggregates and metric tables.

-- ─── Helper: update is_wallet_staff to include operations-manager ─────────────
create or replace function public.is_wallet_staff()
returns boolean
language sql
stable
as $$
  select public.current_role_key() in ('super-admin', 'operations-manager', 'account', 'finance-checker')
$$;

-- ─── Helper: resolve the current customer's UUID from JWT auth.uid() ─────────
create or replace function public.current_customer_id()
returns uuid
language sql
stable
as $$
  select id
  from public.customers
  where auth_user_id = auth.uid()
  limit 1
$$;

-- ─── Helper: check whether the current JWT belongs to a customer ──────────────
create or replace function public.is_customer_role()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.customers
    where auth_user_id = auth.uid()
  )
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- CUSTOMERS (base table — enable RLS and add policies)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.customers enable row level security;
alter table public.customers force  row level security;

drop policy if exists "customers service role all"   on public.customers;
drop policy if exists "customers staff read all"     on public.customers;
drop policy if exists "customers read own row"       on public.customers;
drop policy if exists "customers update own row"     on public.customers;

create policy "customers service role all"
  on public.customers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "customers staff read all"
  on public.customers for select
  to authenticated
  using (public.is_wallet_staff());

create policy "customers read own row"
  on public.customers for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "customers update own row"
  on public.customers for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════════
-- WALLETS (add staff + owner read on top of service_role policy)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.wallets force row level security;

drop policy if exists "wallets staff read all"       on public.wallets;
drop policy if exists "wallets vendor read own"      on public.wallets;
drop policy if exists "wallets customer read own"    on public.wallets;

create policy "wallets staff read all"
  on public.wallets for select
  to authenticated
  using (public.is_wallet_staff());

create policy "wallets vendor read own"
  on public.wallets for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and owner_type = 'vendor'
    and owner_id   = public.current_vendor_organization_id()
  );

create policy "wallets customer read own"
  on public.wallets for select
  to authenticated
  using (
    public.is_customer_role()
    and owner_type = 'customer'
    and owner_id   = public.current_customer_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- VENDOR_USERS (add staff + vendor-self read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.vendor_users force row level security;

drop policy if exists "vendor users staff read"     on public.vendor_users;
drop policy if exists "vendor users read own"       on public.vendor_users;

create policy "vendor users staff read"
  on public.vendor_users for select
  to authenticated
  using (public.is_wallet_staff());

create policy "vendor users read own"
  on public.vendor_users for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and auth_user_id = auth.uid()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- VENDOR_APPLICATIONS (add staff read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.vendor_applications force row level security;

drop policy if exists "vendor apps staff read" on public.vendor_applications;

create policy "vendor apps staff read"
  on public.vendor_applications for select
  to authenticated
  using (public.is_wallet_staff());

-- ══════════════════════════════════════════════════════════════════════════════
-- WALLET_AUDIT_LOG + WALLET_SECURITY_EVENTS (add staff read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.wallet_audit_log      force row level security;
alter table public.wallet_security_events force row level security;

drop policy if exists "audit log staff read"          on public.wallet_audit_log;
drop policy if exists "security events staff read"    on public.wallet_security_events;

create policy "audit log staff read"
  on public.wallet_audit_log for select
  to authenticated
  using (public.is_wallet_staff());

create policy "security events staff read"
  on public.wallet_security_events for select
  to authenticated
  using (public.is_wallet_staff());

-- ══════════════════════════════════════════════════════════════════════════════
-- ACCOUNT_BINDINGS (add customer + staff read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.account_bindings force row level security;

drop policy if exists "account bindings staff read"    on public.account_bindings;
drop policy if exists "account bindings customer read" on public.account_bindings;

create policy "account bindings staff read"
  on public.account_bindings for select
  to authenticated
  using (public.is_wallet_staff());

create policy "account bindings customer read"
  on public.account_bindings for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- PURCHASE_ORDERS (add staff + customer + vendor read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.purchase_orders force row level security;

drop policy if exists "purchase orders staff read"    on public.purchase_orders;
drop policy if exists "purchase orders customer read" on public.purchase_orders;
drop policy if exists "purchase orders vendor read"   on public.purchase_orders;

create policy "purchase orders staff read"
  on public.purchase_orders for select
  to authenticated
  using (public.is_wallet_staff());

create policy "purchase orders customer read"
  on public.purchase_orders for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "purchase orders vendor read"
  on public.purchase_orders for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- RECEIPTS (add staff + customer + vendor read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.receipts force row level security;

drop policy if exists "receipts staff read"    on public.receipts;
drop policy if exists "receipts customer read" on public.receipts;
drop policy if exists "receipts vendor read"   on public.receipts;

create policy "receipts staff read"
  on public.receipts for select
  to authenticated
  using (public.is_wallet_staff());

create policy "receipts customer read"
  on public.receipts for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "receipts vendor read"
  on public.receipts for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- PAYMENT_TRANSACTIONS (add staff + actor-owner read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.payment_transactions force row level security;

drop policy if exists "payment tx staff read"   on public.payment_transactions;
drop policy if exists "payment tx customer read" on public.payment_transactions;
drop policy if exists "payment tx vendor read"  on public.payment_transactions;

create policy "payment tx staff read"
  on public.payment_transactions for select
  to authenticated
  using (public.is_wallet_staff());

create policy "payment tx customer read"
  on public.payment_transactions for select
  to authenticated
  using (
    public.is_customer_role()
    and actor_type = 'customer'
    and actor_id   = public.current_customer_id()
  );

create policy "payment tx vendor read"
  on public.payment_transactions for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and actor_type = 'vendor'
    and actor_id   = public.current_vendor_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- VIRTUAL_ACCOUNTS (add staff + vendor read own)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.virtual_accounts force row level security;

drop policy if exists "virtual accounts staff read"  on public.virtual_accounts;
drop policy if exists "virtual accounts vendor read" on public.virtual_accounts;

create policy "virtual accounts staff read"
  on public.virtual_accounts for select
  to authenticated
  using (public.is_wallet_staff());

create policy "virtual accounts vendor read"
  on public.virtual_accounts for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and owner_type = 'vendor'
    and owner_id   = public.current_vendor_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- MANUAL_CREDIT_REQUESTS (add staff read — finance + super-admin only)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.manual_credit_requests force row level security;

drop policy if exists "manual credits staff read" on public.manual_credit_requests;

create policy "manual credits staff read"
  on public.manual_credit_requests for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker', 'account')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- FUNDING_REQUESTS (add staff + vendor read — already has service_role)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.funding_requests force row level security;

drop policy if exists "funding requests staff read"  on public.funding_requests;
drop policy if exists "funding requests vendor read" on public.funding_requests;

create policy "funding requests staff read"
  on public.funding_requests for select
  to authenticated
  using (public.is_wallet_staff());

create policy "funding requests vendor read"
  on public.funding_requests for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER_METERS (add staff + customer read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.customer_meters force row level security;

drop policy if exists "customer meters staff read"    on public.customer_meters;
drop policy if exists "customer meters customer read" on public.customer_meters;

create policy "customer meters staff read"
  on public.customer_meters for select
  to authenticated
  using (public.is_wallet_staff());

create policy "customer meters customer read"
  on public.customer_meters for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- METER_PURCHASE_ORDERS (add service_role + staff; augment existing customer policy)
-- ══════════════════════════════════════════════════════════════════════════════
alter table meter_purchase_orders force row level security;

drop policy if exists "meter orders service role all" on meter_purchase_orders;
drop policy if exists "meter orders staff read"       on meter_purchase_orders;

create policy "meter orders service role all"
  on meter_purchase_orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "meter orders staff read"
  on meter_purchase_orders for select
  to authenticated
  using (public.is_wallet_staff());

-- ══════════════════════════════════════════════════════════════════════════════
-- KYC_DOCUMENTS (add service_role + staff read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table kyc_documents force row level security;

drop policy if exists "kyc docs service role all" on kyc_documents;
drop policy if exists "kyc docs staff read"       on kyc_documents;

create policy "kyc docs service role all"
  on kyc_documents for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "kyc docs staff read"
  on kyc_documents for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'operations-manager', 'account')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- PASSWORD_RESET_TOKENS (service_role only — no user-facing access)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.password_reset_tokens force row level security;

drop policy if exists "prt service role all" on public.password_reset_tokens;

create policy "prt service role all"
  on public.password_reset_tokens for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- DISPUTES + DISPUTE_MESSAGES (operations_hardening — full policy set)
-- ══════════════════════════════════════════════════════════════════════════════
alter table disputes       force row level security;
alter table dispute_messages force row level security;

drop policy if exists "disputes service role all"     on disputes;
drop policy if exists "disputes staff read"           on disputes;
drop policy if exists "disputes customer read own"    on disputes;
drop policy if exists "disputes vendor read own"      on disputes;
drop policy if exists "disputes customer insert"      on disputes;
drop policy if exists "disputes vendor insert"        on disputes;
drop policy if exists "dispute msg service role all"  on dispute_messages;
drop policy if exists "dispute msg staff read"        on dispute_messages;
drop policy if exists "dispute msg party read"        on dispute_messages;
drop policy if exists "dispute msg party insert"      on dispute_messages;

create policy "disputes service role all"
  on disputes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "disputes staff read"
  on disputes for select
  to authenticated
  using (public.is_wallet_staff());

create policy "disputes customer read own"
  on disputes for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "disputes vendor read own"
  on disputes for select
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  );

create policy "disputes customer insert"
  on disputes for insert
  to authenticated
  with check (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
    and raised_by_actor_type = 'customer'
  );

create policy "disputes vendor insert"
  on disputes for insert
  to authenticated
  with check (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
    and raised_by_actor_type = 'vendor'
  );

-- Dispute messages: parties read+insert on disputes they own
create policy "dispute msg service role all"
  on dispute_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "dispute msg staff read"
  on dispute_messages for select
  to authenticated
  using (public.is_wallet_staff());

create policy "dispute msg party read"
  on dispute_messages for select
  to authenticated
  using (
    exists (
      select 1 from disputes d
      where d.id = dispute_id
        and (
          (public.is_customer_role()     and d.customer_id             = public.current_customer_id())
          or (public.is_vendor_wallet_role() and d.vendor_organization_id = public.current_vendor_organization_id())
        )
    )
  );

create policy "dispute msg party insert"
  on dispute_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from disputes d
      where d.id = dispute_id
        and (
          (public.is_customer_role()     and d.customer_id             = public.current_customer_id()             and sender_actor_type = 'customer')
          or (public.is_vendor_wallet_role() and d.vendor_organization_id = public.current_vendor_organization_id() and sender_actor_type = 'vendor')
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- REFUND_REQUESTS (staff read + service_role)
-- ══════════════════════════════════════════════════════════════════════════════
alter table refund_requests force row level security;

drop policy if exists "refund req service role all" on refund_requests;
drop policy if exists "refund req staff read"       on refund_requests;

create policy "refund req service role all"
  on refund_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "refund req staff read"
  on refund_requests for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'operations-manager', 'finance-checker', 'account')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- SETTLEMENT_BATCHES + RECONCILIATION_RUNS (finance staff only)
-- ══════════════════════════════════════════════════════════════════════════════
alter table settlement_batches   force row level security;
alter table reconciliation_runs  force row level security;

drop policy if exists "settlement service role all" on settlement_batches;
drop policy if exists "settlement staff read"       on settlement_batches;
drop policy if exists "recon service role all"      on reconciliation_runs;
drop policy if exists "recon staff read"            on reconciliation_runs;

create policy "settlement service role all"
  on settlement_batches for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "settlement staff read"
  on settlement_batches for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker', 'account')
  );

create policy "recon service role all"
  on reconciliation_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "recon staff read"
  on reconciliation_runs for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker', 'account')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- FRAUD ENGINE TABLES (service_role + internal-staff read only)
-- ══════════════════════════════════════════════════════════════════════════════
alter table fraud_assessments       force row level security;
alter table fraud_signals           force row level security;
alter table customer_risk_baselines force row level security;
alter table step_up_challenges      force row level security;
alter table customer_known_ips      force row level security;
alter table customer_known_devices  force row level security;

drop policy if exists "fraud assessments service role all"  on fraud_assessments;
drop policy if exists "fraud assessments staff read"        on fraud_assessments;
drop policy if exists "fraud signals service role all"      on fraud_signals;
drop policy if exists "fraud signals staff read"            on fraud_signals;
drop policy if exists "risk baselines service role all"     on customer_risk_baselines;
drop policy if exists "risk baselines staff read"           on customer_risk_baselines;
drop policy if exists "step up service role all"            on step_up_challenges;
drop policy if exists "step up customer read own"           on step_up_challenges;
drop policy if exists "known ips service role all"          on customer_known_ips;
drop policy if exists "known devices service role all"      on customer_known_devices;

create policy "fraud assessments service role all"
  on fraud_assessments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "fraud assessments staff read"
  on fraud_assessments for select
  to authenticated
  using (public.current_role_key() in ('super-admin', 'operations-manager'));

create policy "fraud signals service role all"
  on fraud_signals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "fraud signals staff read"
  on fraud_signals for select
  to authenticated
  using (public.current_role_key() in ('super-admin', 'operations-manager'));

create policy "risk baselines service role all"
  on customer_risk_baselines for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "risk baselines staff read"
  on customer_risk_baselines for select
  to authenticated
  using (public.current_role_key() in ('super-admin', 'operations-manager'));

create policy "step up service role all"
  on step_up_challenges for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "step up customer read own"
  on step_up_challenges for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "known ips service role all"
  on customer_known_ips for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "known devices service role all"
  on customer_known_devices for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- COMPLIANCE TABLES (super-admin + finance-checker read)
-- ══════════════════════════════════════════════════════════════════════════════
alter table currency_transaction_reports force row level security;
alter table aml_screening_results        force row level security;
alter table sanctions_list_entries       force row level security;

drop policy if exists "ctr service role all"     on currency_transaction_reports;
drop policy if exists "ctr staff read"           on currency_transaction_reports;
drop policy if exists "aml service role all"     on aml_screening_results;
drop policy if exists "aml staff read"           on aml_screening_results;
drop policy if exists "sanctions service role all" on sanctions_list_entries;
drop policy if exists "sanctions staff read"     on sanctions_list_entries;

create policy "ctr service role all"
  on currency_transaction_reports for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "ctr staff read"
  on currency_transaction_reports for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker')
  );

create policy "aml service role all"
  on aml_screening_results for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "aml staff read"
  on aml_screening_results for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker', 'operations-manager')
  );

create policy "sanctions service role all"
  on sanctions_list_entries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "sanctions staff read"
  on sanctions_list_entries for select
  to authenticated
  using (
    public.current_role_key() in ('super-admin', 'finance-checker')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS (enable RLS + customer + staff policies)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.notifications enable row level security;
alter table public.notifications force  row level security;

drop policy if exists "notifications service role all"   on public.notifications;
drop policy if exists "notifications staff read"         on public.notifications;
drop policy if exists "notifications customer read own"  on public.notifications;
drop policy if exists "notifications customer update own" on public.notifications;

create policy "notifications service role all"
  on public.notifications for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "notifications staff read"
  on public.notifications for select
  to authenticated
  using (public.is_wallet_staff());

create policy "notifications customer read own"
  on public.notifications for select
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "notifications customer update own"
  on public.notifications for update
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  )
  with check (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATION_DELIVERY_RECEIPTS (service_role only)
-- ══════════════════════════════════════════════════════════════════════════════
alter table notification_delivery_receipts force row level security;

drop policy if exists "ndr service role all" on notification_delivery_receipts;

create policy "ndr service role all"
  on notification_delivery_receipts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER_PUSH_TOKENS (add service_role policy alongside existing owner policy)
-- ══════════════════════════════════════════════════════════════════════════════
alter table customer_push_tokens force row level security;

drop policy if exists "push tokens service role all" on customer_push_tokens;

create policy "push tokens service role all"
  on customer_push_tokens for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- SUPPORT SYSTEM TABLES
-- ══════════════════════════════════════════════════════════════════════════════
alter table support_faq_categories   force row level security;
alter table support_faqs             force row level security;
alter table support_tickets          force row level security;
alter table support_ticket_messages  force row level security;
alter table support_chat_sessions    force row level security;
alter table support_chat_messages    force row level security;

-- FAQ categories: public read (authenticated or not), staff manages
drop policy if exists "faq cat service role all"   on support_faq_categories;
drop policy if exists "faq cat public read"        on support_faq_categories;
drop policy if exists "faq cat staff manage"       on support_faq_categories;
drop policy if exists "faqs service role all"      on support_faqs;
drop policy if exists "faqs public read"           on support_faqs;
drop policy if exists "faqs staff manage"          on support_faqs;

create policy "faq cat service role all"
  on support_faq_categories for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "faq cat public read"
  on support_faq_categories for select
  using (true);

create policy "faq cat staff manage"
  on support_faq_categories for all
  to authenticated
  using (public.is_wallet_staff())
  with check (public.is_wallet_staff());

create policy "faqs service role all"
  on support_faqs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "faqs public read"
  on support_faqs for select
  using (published = true);

create policy "faqs staff manage"
  on support_faqs for all
  to authenticated
  using (public.is_wallet_staff())
  with check (public.is_wallet_staff());

-- Support tickets: service_role all, staff all, owners read/insert/update
drop policy if exists "tickets service role all"   on support_tickets;
drop policy if exists "tickets staff all"          on support_tickets;
drop policy if exists "tickets customer own"       on support_tickets;
drop policy if exists "tickets vendor own"         on support_tickets;
drop policy if exists "ticket msg service role all" on support_ticket_messages;
drop policy if exists "ticket msg staff read"       on support_ticket_messages;
drop policy if exists "ticket msg party read"       on support_ticket_messages;
drop policy if exists "ticket msg party insert"     on support_ticket_messages;

create policy "tickets service role all"
  on support_tickets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "tickets staff all"
  on support_tickets for all
  to authenticated
  using (public.is_wallet_staff())
  with check (public.is_wallet_staff());

create policy "tickets customer own"
  on support_tickets for all
  to authenticated
  using (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  )
  with check (
    public.is_customer_role()
    and customer_id = public.current_customer_id()
  );

create policy "tickets vendor own"
  on support_tickets for all
  to authenticated
  using (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  )
  with check (
    public.is_vendor_wallet_role()
    and vendor_organization_id = public.current_vendor_organization_id()
  );

create policy "ticket msg service role all"
  on support_ticket_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "ticket msg staff read"
  on support_ticket_messages for select
  to authenticated
  using (public.is_wallet_staff());

create policy "ticket msg party read"
  on support_ticket_messages for select
  to authenticated
  using (
    not is_internal
    and exists (
      select 1 from support_tickets t
      where t.id = ticket_id
        and (
          (public.is_customer_role()     and t.customer_id             = public.current_customer_id())
          or (public.is_vendor_wallet_role() and t.vendor_organization_id = public.current_vendor_organization_id())
        )
    )
  );

create policy "ticket msg party insert"
  on support_ticket_messages for insert
  to authenticated
  with check (
    not is_internal
    and exists (
      select 1 from support_tickets t
      where t.id = ticket_id
        and (
          (public.is_customer_role()     and t.customer_id             = public.current_customer_id()             and sender_actor_type = 'customer')
          or (public.is_vendor_wallet_role() and t.vendor_organization_id = public.current_vendor_organization_id() and sender_actor_type = 'vendor')
        )
    )
  );

-- Chat sessions + messages: service_role + staff + party read
drop policy if exists "chat sessions service role all" on support_chat_sessions;
drop policy if exists "chat sessions staff read"       on support_chat_sessions;
drop policy if exists "chat sessions party all"        on support_chat_sessions;
drop policy if exists "chat msg service role all"      on support_chat_messages;
drop policy if exists "chat msg staff read"            on support_chat_messages;
drop policy if exists "chat msg party all"             on support_chat_messages;

create policy "chat sessions service role all"
  on support_chat_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "chat sessions staff read"
  on support_chat_sessions for select
  to authenticated
  using (public.is_wallet_staff());

create policy "chat sessions party all"
  on support_chat_sessions for all
  to authenticated
  using (
    (public.is_customer_role()     and requester_actor_type = 'customer' and requester_actor_id = public.current_customer_id())
    or (public.is_vendor_wallet_role() and requester_actor_type = 'vendor'   and requester_actor_id = public.current_vendor_organization_id())
  )
  with check (
    (public.is_customer_role()     and requester_actor_type = 'customer' and requester_actor_id = public.current_customer_id())
    or (public.is_vendor_wallet_role() and requester_actor_type = 'vendor'   and requester_actor_id = public.current_vendor_organization_id())
  );

create policy "chat msg service role all"
  on support_chat_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "chat msg staff read"
  on support_chat_messages for select
  to authenticated
  using (public.is_wallet_staff());

create policy "chat msg party all"
  on support_chat_messages for all
  to authenticated
  using (
    exists (
      select 1 from support_chat_sessions s
      where s.id = session_id
        and (
          (public.is_customer_role()     and s.requester_actor_type = 'customer' and s.requester_actor_id = public.current_customer_id())
          or (public.is_vendor_wallet_role() and s.requester_actor_type = 'vendor'   and s.requester_actor_id = public.current_vendor_organization_id())
        )
    )
  )
  with check (
    exists (
      select 1 from support_chat_sessions s
      where s.id = session_id
        and (
          (public.is_customer_role()     and s.requester_actor_type = 'customer' and s.requester_actor_id = public.current_customer_id())
          or (public.is_vendor_wallet_role() and s.requester_actor_type = 'vendor'   and s.requester_actor_id = public.current_vendor_organization_id())
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- OPERATIONAL AGGREGATES — enable RLS (service_role + staff read only)
-- These are internal metrics tables with no direct user-facing access.
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.station_meter_read_rollups  enable row level security;
alter table public.station_meter_read_rollups  force  row level security;
alter table public.consumption_aggregates      enable row level security;
alter table public.consumption_aggregates      force  row level security;
alter table public.daily_meter_deltas          enable row level security;
alter table public.daily_meter_deltas          force  row level security;
alter table public.meter_consumption_aggregates enable row level security;
alter table public.meter_consumption_aggregates force  row level security;

drop policy if exists "station rollups service role all" on public.station_meter_read_rollups;
drop policy if exists "station rollups staff read"       on public.station_meter_read_rollups;
drop policy if exists "consumption agg service role all" on public.consumption_aggregates;
drop policy if exists "consumption agg staff read"       on public.consumption_aggregates;
drop policy if exists "daily delta service role all"     on public.daily_meter_deltas;
drop policy if exists "daily delta staff read"           on public.daily_meter_deltas;
drop policy if exists "meter agg service role all"       on public.meter_consumption_aggregates;
drop policy if exists "meter agg staff read"             on public.meter_consumption_aggregates;

create policy "station rollups service role all"
  on public.station_meter_read_rollups for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "station rollups staff read"
  on public.station_meter_read_rollups for select
  to authenticated
  using (public.is_wallet_staff());

create policy "consumption agg service role all"
  on public.consumption_aggregates for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "consumption agg staff read"
  on public.consumption_aggregates for select
  to authenticated
  using (public.is_wallet_staff());

create policy "daily delta service role all"
  on public.daily_meter_deltas for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "daily delta staff read"
  on public.daily_meter_deltas for select
  to authenticated
  using (public.is_wallet_staff());

create policy "meter agg service role all"
  on public.meter_consumption_aggregates for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "meter agg staff read"
  on public.meter_consumption_aggregates for select
  to authenticated
  using (public.is_wallet_staff());

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────
notify pgrst, 'reload schema';
