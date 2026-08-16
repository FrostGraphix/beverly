-- Complete database authorization baseline.
-- The backend owns mutations. Authenticated database access is read-only.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalized_role_key(u.role_key)
  from public.users u
  where u.auth_user_id = (select auth.uid())
     or lower(u.user_id) = lower((select auth.uid())::text)
  limit 1
$$;

create or replace function private.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    left join public.permissions p
      on public.normalized_role_key(p.role_key) = public.normalized_role_key(u.role_key)
    where (
      u.auth_user_id = (select auth.uid())
      or lower(u.user_id) = lower((select auth.uid())::text)
    )
      and (
        public.normalized_role_key(u.role_key) = 'super-admin'
        or p.route_hash in ('*', permission_key)
      )
  )
$$;

create or replace function private.current_vendor_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select vu.vendor_organization_id
  from public.vendor_users vu
  where vu.auth_user_id = (select auth.uid())
    and vu.status = 'active'
  limit 1
$$;

create or replace function private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.customers c
  where c.auth_user_id = (select auth.uid())
     or lower(c.user_id) = lower((select auth.uid())::text)
  limit 1
$$;

revoke all on function private.current_staff_role() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.current_vendor_organization_id() from public, anon;
revoke all on function private.current_customer_id() from public, anon;
grant execute on function private.current_staff_role() to authenticated, service_role;
grant execute on function private.has_permission(text) to authenticated, service_role;
grant execute on function private.current_vendor_organization_id() to authenticated, service_role;
grant execute on function private.current_customer_id() to authenticated, service_role;

-- Compatibility helpers now trust database mappings, never user metadata.
create or replace function public.current_role_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_staff_role(),
    (
      select case vu.role
        when 'vendor_manager' then 'vendor_manager'
        else 'vendor_user'
      end
      from public.vendor_users vu
      where vu.auth_user_id = (select auth.uid())
        and vu.status = 'active'
      limit 1
    ),
    case when private.current_customer_id() is not null then 'customer' end,
    ''
  )
$$;

create or replace function public.current_user_id_text()
returns text
language sql
stable
as $$
  select lower(coalesce((select auth.uid())::text, ''))
$$;

create or replace function public.current_station_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select upper(coalesce((
    select u.station_id
    from public.users u
    where u.auth_user_id = (select auth.uid())
       or lower(u.user_id) = lower((select auth.uid())::text)
    limit 1
  ), ''))
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select private.current_staff_role() = 'super-admin'
$$;

create or replace function public.has_route_permission(route text)
returns boolean
language sql
stable
as $$
  select private.has_permission(route)
$$;

create or replace function public.current_vendor_organization_id()
returns uuid
language sql
stable
as $$
  select private.current_vendor_organization_id()
$$;

create or replace function public.is_wallet_staff()
returns boolean
language sql
stable
as $$
  select private.current_staff_role() is not null
$$;

create or replace function public.is_vendor_wallet_role()
returns boolean
language sql
stable
as $$
  select private.current_vendor_organization_id() is not null
$$;

-- Every exposed table gets RLS, including tables added after older hardening.
do $$
declare
  table_row record;
begin
  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_row.schemaname,
      table_row.tablename
    );
    execute format(
      'alter table %I.%I force row level security',
      table_row.schemaname,
      table_row.tablename
    );
  end loop;
end
$$;

-- Browser clients may only select rows allowed by RLS.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Views are security-definer by default. Keep them backend-only.
do $$
declare
  view_row record;
begin
  for view_row in
    select schemaname, viewname
    from pg_views
    where schemaname = 'public'
  loop
    execute format(
      'revoke all on %I.%I from anon, authenticated',
      view_row.schemaname,
      view_row.viewname
    );
    execute format(
      'grant select on %I.%I to service_role',
      view_row.schemaname,
      view_row.viewname
    );
  end loop;
end
$$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public grant select on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Public RPCs default to backend-only.
revoke execute on all functions in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.normalized_role_key(text) to authenticated;
grant execute on function public.current_role_key() to authenticated;
grant execute on function public.current_user_id_text() to authenticated;
grant execute on function public.current_station_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_route_permission(text) to authenticated;
grant execute on function public.current_vendor_organization_id() to authenticated;
grant execute on function public.is_wallet_staff() to authenticated;
grant execute on function public.is_vendor_wallet_role() to authenticated;

-- Keep database grants aligned with the admin permission catalog.
insert into public.permissions (role_key, route_hash)
values
  ('super-admin', 'wallet.dashboard.view'),
  ('super-admin', 'wallet.vendors.review'),
  ('super-admin', 'wallet.vendors.manage'),
  ('super-admin', 'wallet.customers.view'),
  ('super-admin', 'wallet.funding.view'),
  ('super-admin', 'wallet.funding.approve'),
  ('super-admin', 'wallet.vending.monitor'),
  ('super-admin', 'wallet.refunds.manage'),
  ('super-admin', 'wallet.disputes.manage'),
  ('super-admin', 'wallet.support.manage'),
  ('super-admin', 'wallet.announcements.manage'),
  ('super-admin', 'wallet.settlement.view'),
  ('super-admin', 'wallet.reconciliation.run'),
  ('super-admin', 'wallet.fraud.review'),
  ('super-admin', 'wallet.privacy.review'),
  ('super-admin', 'wallet.audit.view'),
  ('super-admin', 'wallet.flags.manage'),
  ('super-admin', 'wallet.vat.manage'),
  ('super-admin', 'wallet.access.manage'),
  ('super-admin', 'dev.console'),
  ('super-admin', 'wallet.consumption.view'),
  ('operations-manager', 'wallet.dashboard.view'),
  ('operations-manager', 'wallet.vendors.review'),
  ('operations-manager', 'wallet.customers.view'),
  ('operations-manager', 'wallet.vending.monitor'),
  ('operations-manager', 'wallet.disputes.manage'),
  ('operations-manager', 'wallet.support.manage'),
  ('operations-manager', 'wallet.announcements.manage'),
  ('operations-manager', 'wallet.settlement.view'),
  ('operations-manager', 'wallet.reconciliation.run'),
  ('operations-manager', 'wallet.fraud.review'),
  ('operations-manager', 'wallet.audit.view'),
  ('operations-manager', 'wallet.consumption.view'),
  ('finance-checker', 'wallet.dashboard.view'),
  ('finance-checker', 'wallet.funding.view'),
  ('finance-checker', 'wallet.funding.approve'),
  ('finance-checker', 'wallet.refunds.manage'),
  ('finance-checker', 'wallet.settlement.view'),
  ('finance-checker', 'wallet.reconciliation.run'),
  ('finance-checker', 'wallet.audit.view'),
  ('finance-checker', 'wallet.vat.manage'),
  ('account', 'wallet.dashboard.view'),
  ('account', 'wallet.funding.view'),
  ('account', 'wallet.customers.view'),
  ('account', 'wallet.vending.monitor'),
  ('account', 'wallet.settlement.view'),
  ('account', 'wallet.reconciliation.run')
on conflict (role_key, route_hash) do nothing;

-- Remove broad metadata-era reads.
drop policy if exists "Roles readable by authenticated users" on public.roles;
drop policy if exists "Permissions readable by authenticated users" on public.permissions;
drop policy if exists "Users readable by self or super admins" on public.users;
drop policy if exists "Operational snapshots readable by authenticated users" on public.operational_snapshots;
drop policy if exists "Audit logs readable by elevated roles" on public.audit_logs;
drop policy if exists "API cache readable by elevated roles" on public.api_cache;
drop policy if exists "Import jobs readable by permitted roles" on public.import_jobs;
drop policy if exists "Export jobs readable by permitted roles" on public.export_jobs;
drop policy if exists "Print jobs readable by permitted roles" on public.print_jobs;
drop policy if exists "Write confirmations readable by elevated roles" on public.write_confirmations;
drop policy if exists "Daily meter readings readable by station scope" on public.daily_meter_readings;
drop policy if exists "Account bindings readable by permitted roles" on public.account_bindings;
drop policy if exists "Automation deliveries readable by elevated roles" on public.automation_deliveries;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname = any (array[
        'Access managers read roles', 'Access managers read permissions', 'Staff read own profile',
        'Dashboard readers read snapshots', 'Auditors read audit logs', 'Developers read API cache',
        'Developers read import jobs', 'Dashboard readers read export jobs', 'Vending staff read print jobs',
        'Auditors read write confirmations', 'Consumption staff read scoped meters',
        'Vending staff read account bindings', 'Developers read automation deliveries',
        'Vendor reviewers read organizations', 'Funding staff read vendor wallets', 'Funding staff read ledger',
        'Vending staff read holds', 'Funding staff read requests', 'Funding staff read proofs',
        'Vending staff read purchases', 'Vending staff read deliveries', 'Auditors read wallet events',
        'Vendor reviewers read onboarding', 'Vendor reviewers read documents', 'Funding approvers read approvals',
        'Reconciliation staff read runs', 'Fraud reviewers read risk events', 'Customers read own profile',
        'Vendors read own user records', 'Customers read own meters', 'Customers read own notifications',
        'Actors read own wallets', 'Actors read own ledger', 'Actors read own purchase orders',
        'Actors read own receipts', 'Actors read own payments', 'Vendors read own funding requests',
        'Actors read own meter orders', 'Actors read own disputes', 'Actors read own dispute messages',
        'Actors read own support tickets', 'Actors read own support messages', 'Actors read own chat sessions',
        'Actors read own chat messages', 'Authenticated users read published FAQs',
        'Authenticated users read published FAQ entries', 'Customers read own export requests',
        'Customers read own deletion requests', 'Vendors read own settlements'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end
$$;

create policy "Access managers read roles"
  on public.roles for select to authenticated
  using ((select private.has_permission('wallet.access.manage')));

create policy "Access managers read permissions"
  on public.permissions for select to authenticated
  using ((select private.has_permission('wallet.access.manage')));

create policy "Staff read own profile"
  on public.users for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or lower(user_id) = lower((select auth.uid())::text)
    or (select private.has_permission('wallet.access.manage'))
  );

create policy "Dashboard readers read snapshots"
  on public.operational_snapshots for select to authenticated
  using ((select private.has_permission('wallet.dashboard.view')));

create policy "Auditors read audit logs"
  on public.audit_logs for select to authenticated
  using ((select private.has_permission('wallet.audit.view')));

create policy "Developers read API cache"
  on public.api_cache for select to authenticated
  using ((select private.has_permission('dev.console')));

create policy "Developers read import jobs"
  on public.import_jobs for select to authenticated
  using ((select private.has_permission('dev.console')));

create policy "Dashboard readers read export jobs"
  on public.export_jobs for select to authenticated
  using ((select private.has_permission('wallet.dashboard.view')));

create policy "Vending staff read print jobs"
  on public.print_jobs for select to authenticated
  using ((select private.has_permission('wallet.vending.monitor')));

create policy "Auditors read write confirmations"
  on public.write_confirmations for select to authenticated
  using ((select private.has_permission('wallet.audit.view')));

create policy "Consumption staff read scoped meters"
  on public.daily_meter_readings for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or (
        (select public.current_station_id()) <> ''
        and upper(station_id) = (select public.current_station_id())
      )
    )
  );

create policy "Vending staff read account bindings"
  on public.account_bindings for select to authenticated
  using ((select private.has_permission('wallet.vending.monitor')));

create policy "Developers read automation deliveries"
  on public.automation_deliveries for select to authenticated
  using ((select private.has_permission('dev.console')));

-- Replace broad staff wallet reads with explicit permissions.
drop policy if exists "wallet staff reads vendor orgs" on public.vendor_organizations;
drop policy if exists "wallet staff reads wallets" on public.vendor_wallets;
drop policy if exists "wallet staff reads ledger" on public.wallet_ledger_entries;
drop policy if exists "wallet staff reads holds" on public.wallet_holds;
drop policy if exists "wallet staff reads funding" on public.wallet_funding_requests;
drop policy if exists "wallet staff reads proofs" on public.wallet_funding_proofs;
drop policy if exists "wallet staff reads purchases" on public.wallet_purchase_orders;
drop policy if exists "wallet staff reads deliveries" on public.wallet_purchase_deliveries;
drop policy if exists "wallet staff reads audit" on public.wallet_audit_events;
drop policy if exists "wallet staff reads onboarding" on public.vendor_onboarding_submissions;
drop policy if exists "wallet staff reads vendor documents" on public.vendor_documents;
drop policy if exists "wallet staff reads approvals" on public.wallet_approval_requests;
drop policy if exists "wallet staff reads reconciliation" on public.wallet_reconciliation_runs;
drop policy if exists "wallet staff reads risk events" on public.wallet_risk_events;

create policy "Vendor reviewers read organizations"
  on public.vendor_organizations for select to authenticated
  using ((select private.has_permission('wallet.vendors.review')));

create policy "Funding staff read vendor wallets"
  on public.vendor_wallets for select to authenticated
  using ((select private.has_permission('wallet.funding.view')));

create policy "Funding staff read ledger"
  on public.wallet_ledger_entries for select to authenticated
  using ((select private.has_permission('wallet.funding.view')));

create policy "Vending staff read holds"
  on public.wallet_holds for select to authenticated
  using ((select private.has_permission('wallet.vending.monitor')));

create policy "Funding staff read requests"
  on public.wallet_funding_requests for select to authenticated
  using ((select private.has_permission('wallet.funding.view')));

create policy "Funding staff read proofs"
  on public.wallet_funding_proofs for select to authenticated
  using (
    (select private.has_permission('wallet.funding.view'))
    or exists (
      select 1
      from public.wallet_funding_requests request
      where request.id = wallet_funding_proofs.funding_request_id
        and request.organization_id = (select private.current_vendor_organization_id())
    )
  );

create policy "Vending staff read purchases"
  on public.wallet_purchase_orders for select to authenticated
  using ((select private.has_permission('wallet.vending.monitor')));

create policy "Vending staff read deliveries"
  on public.wallet_purchase_deliveries for select to authenticated
  using (
    (select private.has_permission('wallet.vending.monitor'))
    or exists (
      select 1
      from public.wallet_purchase_orders orders
      where orders.id = wallet_purchase_deliveries.purchase_order_id
        and orders.organization_id = (select private.current_vendor_organization_id())
    )
  );

create policy "Auditors read wallet events"
  on public.wallet_audit_events for select to authenticated
  using ((select private.has_permission('wallet.audit.view')));

create policy "Vendor reviewers read onboarding"
  on public.vendor_onboarding_submissions for select to authenticated
  using ((select private.has_permission('wallet.vendors.review')));

create policy "Vendor reviewers read documents"
  on public.vendor_documents for select to authenticated
  using ((select private.has_permission('wallet.vendors.review')));

create policy "Funding approvers read approvals"
  on public.wallet_approval_requests for select to authenticated
  using ((select private.has_permission('wallet.funding.approve')));

create policy "Reconciliation staff read runs"
  on public.wallet_reconciliation_runs for select to authenticated
  using ((select private.has_permission('wallet.reconciliation.run')));

create policy "Fraud reviewers read risk events"
  on public.wallet_risk_events for select to authenticated
  using ((select private.has_permission('wallet.fraud.review')));

-- Actor-owned read models.
drop policy if exists "customers_read_own_orders" on public.meter_purchase_orders;

create policy "Customers read own profile"
  on public.customers for select to authenticated
  using (id = (select private.current_customer_id()));

create policy "Vendors read own user records"
  on public.vendor_users for select to authenticated
  using (vendor_organization_id = (select private.current_vendor_organization_id()));

create policy "Customers read own meters"
  on public.customer_meters for select to authenticated
  using (customer_id = (select private.current_customer_id()));

create policy "Customers read own notifications"
  on public.notifications for select to authenticated
  using (customer_id = (select private.current_customer_id()));

create policy "Actors read own wallets"
  on public.wallets for select to authenticated
  using (
    (owner_type = 'customer' and owner_id = (select private.current_customer_id()))
    or (
      owner_type = 'vendor'
      and owner_id = (select private.current_vendor_organization_id())
    )
    or (select private.has_permission('wallet.funding.view'))
  );

create policy "Actors read own ledger"
  on public.wallet_ledger_entries for select to authenticated
  using (
    exists (
      select 1
      from public.wallets wallet
      where wallet.id = wallet_ledger_entries.wallet_id
        and (
          (wallet.owner_type = 'customer' and wallet.owner_id = (select private.current_customer_id()))
          or (
            wallet.owner_type = 'vendor'
            and wallet.owner_id = (select private.current_vendor_organization_id())
          )
        )
    )
    or (select private.has_permission('wallet.funding.view'))
  );

create policy "Actors read own purchase orders"
  on public.purchase_orders for select to authenticated
  using (
    (actor_type = 'customer' and actor_id = (select private.current_customer_id()))
    or (
      actor_type = 'vendor'
      and actor_id = (select private.current_vendor_organization_id())
    )
    or (select private.has_permission('wallet.vending.monitor'))
  );

create policy "Actors read own receipts"
  on public.receipts for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_orders purchase
      where purchase.id = receipts.purchase_order_id
        and (
          (purchase.actor_type = 'customer' and purchase.actor_id = (select private.current_customer_id()))
          or (
            purchase.actor_type = 'vendor'
            and purchase.actor_id = (select private.current_vendor_organization_id())
          )
        )
    )
    or (select private.has_permission('wallet.vending.monitor'))
  );

create policy "Actors read own payments"
  on public.payment_transactions for select to authenticated
  using (
    (actor_type = 'customer' and actor_id = (select private.current_customer_id()))
    or (
      actor_type = 'vendor'
      and actor_id = (select private.current_vendor_organization_id())
    )
    or (select private.has_permission('wallet.funding.view'))
  );

create policy "Vendors read own funding requests"
  on public.funding_requests for select to authenticated
  using (
    vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.funding.view'))
  );

create policy "Actors read own meter orders"
  on public.meter_purchase_orders for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.vendors.review'))
  );

create policy "Actors read own disputes"
  on public.disputes for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.disputes.manage'))
  );

create policy "Actors read own dispute messages"
  on public.dispute_messages for select to authenticated
  using (
    exists (
      select 1
      from public.disputes dispute
      where dispute.id = dispute_messages.dispute_id
        and (
          dispute.customer_id = (select private.current_customer_id())
          or dispute.vendor_organization_id = (select private.current_vendor_organization_id())
        )
    )
    or (select private.has_permission('wallet.disputes.manage'))
  );

create policy "Actors read own support tickets"
  on public.support_tickets for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.support.manage'))
  );

create policy "Actors read own support messages"
  on public.support_ticket_messages for select to authenticated
  using (
    (
      not is_internal
      and exists (
        select 1
        from public.support_tickets ticket
        where ticket.id = support_ticket_messages.ticket_id
          and (
            ticket.customer_id = (select private.current_customer_id())
            or ticket.vendor_organization_id = (select private.current_vendor_organization_id())
          )
      )
    )
    or (select private.has_permission('wallet.support.manage'))
  );

create policy "Actors read own chat sessions"
  on public.support_chat_sessions for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.support.manage'))
  );

create policy "Actors read own chat messages"
  on public.support_chat_messages for select to authenticated
  using (
    exists (
      select 1
      from public.support_chat_sessions session
      where session.id = support_chat_messages.session_id
        and (
          session.customer_id = (select private.current_customer_id())
          or session.vendor_organization_id = (select private.current_vendor_organization_id())
        )
    )
    or (select private.has_permission('wallet.support.manage'))
  );

create policy "Authenticated users read published FAQs"
  on public.support_faq_categories for select to authenticated
  using (true);

create policy "Authenticated users read published FAQ entries"
  on public.support_faqs for select to authenticated
  using (published);

create policy "Customers read own export requests"
  on public.data_export_requests for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or (select private.has_permission('wallet.privacy.review'))
  );

create policy "Customers read own deletion requests"
  on public.account_deletion_requests for select to authenticated
  using (
    customer_id = (select private.current_customer_id())
    or (select private.has_permission('wallet.privacy.review'))
  );

create policy "Vendors read own settlements"
  on public.settlement_batches for select to authenticated
  using (
    vendor_organization_id = (select private.current_vendor_organization_id())
    or (select private.has_permission('wallet.settlement.view'))
  );

notify pgrst, 'reload schema';
