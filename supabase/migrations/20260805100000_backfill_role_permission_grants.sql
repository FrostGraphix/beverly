-- Backfill permissions table for role-grant changes made alongside the
-- customer-meter approval workflow (see admin-access-constants.ts):
--   - new permission wallet.meters.approve, granted to operations-manager
--   - finance-checker now also granted wallet.customers.view
--
-- ensureAccessDefaults() upserts these on server boot, but a database
-- restored purely from migrations should be correct without requiring a
-- boot first (same rationale as 20260804090000_fix_missing_role_permissions.sql).

insert into public.permissions (role_key, route_hash)
values
  ('super-admin',        'wallet.meters.approve'),
  ('operations-manager', 'wallet.meters.approve'),
  ('finance-checker',    'wallet.customers.view')
on conflict (role_key, route_hash) do nothing;
