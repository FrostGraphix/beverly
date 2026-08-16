-- Migration: Fix missing role permissions (drift between code constants and SQL seed)
--
-- Context:
--   admin-access-constants.ts DEFAULT_ROLE_PERMISSIONS grants wallet.consumption.view to
--   both finance-checker (line 41) and account (line 45). The SQL migration that seeded
--   the permissions table (20260702150000_full_rls_permissions.sql) omitted these two rows.
--
--   ensureAccessDefaults() in admin.ts upserts all constant-defined permissions on first
--   server boot, so live servers are correct after at least one boot. However, a fresh
--   database restored purely from migrations (e.g. staging reset, DR drill) will lack
--   these permissions until the wallet server runs once.
--
--   This migration closes the gap so the DB state is correct from migration-time alone.

insert into public.permissions (role_key, route_hash)
values
  ('finance-checker', 'wallet.consumption.view'),
  ('account',         'wallet.consumption.view')
on conflict (role_key, route_hash) do nothing;
