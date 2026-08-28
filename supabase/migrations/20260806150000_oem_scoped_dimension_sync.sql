-- Fixes the root cause behind the meters/customers/accounts duplication audit
-- (docs/DATABASE_GROWTH_ROOT_CAUSE_AUDIT_2026-08-04.md, F2/F3/F5): on 2026-04-14 a
-- one-off, uncommitted backfill derived all three tables from token_transactions
-- history instead of the real Calinmeter customer/account/meter endpoints, and set
-- upstream_id = NULL on every meters/accounts row it inserted. Because Postgres
-- treats NULLs as non-colliding, that silently bypassed the UNIQUE(upstream_id)
-- constraints these tables already had, producing up to 169 duplicate meters rows
-- per physical serial. No sync job has run since.
--
-- This migration does not delete or backfill any data (that is
-- backend/scripts/sync-oem-dimensions.cjs, run separately). It closes the schema
-- gap that let the bug happen and retrofits the same oem_id namespacing that
-- account_bindings/purchase_orders/meter_token_overrides already got in
-- 20260719140000_oem_manufacturers_foundation.sql -- meters/customers/accounts were
-- the one dimension-table group missed by that retrofit.

-- =============================================================================
-- 1. oem_id namespacing (meters/customers/accounts were missed by the original
--    cross-cutting retrofit in 20260719140000)
-- =============================================================================

alter table public.customers add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.customers set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.accounts add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.accounts set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.meters add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.meters set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

create index if not exists customers_oem_idx on public.customers(oem_id);
create index if not exists accounts_oem_idx on public.accounts(oem_id);
create index if not exists meters_oem_idx on public.meters(oem_id);

-- =============================================================================
-- 2. Tighten the identity constraint from UNIQUE(upstream_id) to
--    UNIQUE(oem_id, upstream_id). A second OEM (Sparkmeter/Ihemeter, per
--    docs/OEM_HUB_STATUS.md) reusing Calinmeter's ID numbering would otherwise
--    collide under the old bare-upstream_id constraint. NULL upstream_id values
--    still don't collide with each other (unchanged Postgres behavior) -- the real
--    fix against a repeat of this bug is that the new importer
--    (backend/scripts/sync-oem-dimensions.cjs) never writes a NULL upstream_id.
-- =============================================================================

alter table public.customers drop constraint if exists customers_upstream_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customers_oem_upstream_id_key' and conrelid = 'public.customers'::regclass) then
    alter table public.customers add constraint customers_oem_upstream_id_key unique (oem_id, upstream_id);
  end if;
end $$;

alter table public.accounts drop constraint if exists accounts_upstream_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_oem_upstream_id_key' and conrelid = 'public.accounts'::regclass) then
    alter table public.accounts add constraint accounts_oem_upstream_id_key unique (oem_id, upstream_id);
  end if;
end $$;

alter table public.meters drop constraint if exists meters_upstream_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meters_oem_upstream_id_key' and conrelid = 'public.meters'::regclass) then
    alter table public.meters add constraint meters_oem_upstream_id_key unique (oem_id, upstream_id);
  end if;
end $$;

-- =============================================================================
-- 3. RLS: drop the permissive `qual = true` policies (Phase F5 in the storage
--    plan) that let any authenticated user read every customer/account/meter
--    regardless of site. The correct `can_access_site(site_code)`-scoped policies
--    and the service_role ALL policies are untouched.
-- =============================================================================

drop policy if exists "authenticated_read_customers" on public.customers;
drop policy if exists "authenticated_read_accounts" on public.accounts;
drop policy if exists "authenticated_read_meters" on public.meters;

-- =============================================================================
-- 4. mv_customer_site_rollups had no refresh mechanism at all. It sits over
--    v_customer_360 (itself a live view over meters/customers/accounts), so it
--    needs to be refreshed after the dimension sync runs, not just once.
-- =============================================================================

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-customer-site-rollups';

select cron.schedule(
  'refresh-customer-site-rollups',
  '15 4 * * *',
  $$refresh materialized view public.mv_customer_site_rollups$$
);

notify pgrst, 'reload schema';
