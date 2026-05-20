-- Wallet access-control seed. The backend keeps this idempotent at runtime too,
-- but this migration makes the Supabase data model explicit and portable.

alter table public.roles
  add column if not exists role_key text,
  add column if not exists role_name text,
  add column if not exists label text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.permissions
  add column if not exists role_key text,
  add column if not exists route_hash text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists user_id text,
  add column if not exists user_name text,
  add column if not exists email text,
  add column if not exists role_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists roles_role_key_idx
  on public.roles(role_key);

create unique index if not exists permissions_role_route_idx
  on public.permissions(role_key, route_hash);

create unique index if not exists users_user_id_idx
  on public.users(user_id)
  where user_id is not null;

create unique index if not exists users_auth_user_id_idx
  on public.users(auth_user_id)
  where auth_user_id is not null;

insert into public.roles (name, role_key, role_name, label, description)
values
  ('admin', 'super-admin', 'Super Admin', 'Super Admin', 'Full wallet administration and access control.'),
  ('ops', 'operations-manager', 'Operations Manager', 'Operations Manager', 'Vendor, vending, dispute, fraud, and reconciliation operations.'),
  ('analyst', 'finance-checker', 'Finance Checker', 'Finance Checker', 'Funding, refunds, settlement, and reconciliation approval access.'),
  ('finance', 'account', 'Account Officer', 'Account Officer', 'Read-mostly finance and wallet operations access.')
on conflict (role_key) do update
set role_name = excluded.role_name,
    label = excluded.label,
    description = excluded.description,
    updated_at = now();

with permission_defaults(role_key, route_hash) as (
  values
    ('super-admin', 'wallet.dashboard.view'),
    ('super-admin', 'wallet.vendors.review'),
    ('super-admin', 'wallet.vendors.manage'),
    ('super-admin', 'wallet.funding.view'),
    ('super-admin', 'wallet.funding.approve'),
    ('super-admin', 'wallet.vending.monitor'),
    ('super-admin', 'wallet.refunds.manage'),
    ('super-admin', 'wallet.disputes.manage'),
    ('super-admin', 'wallet.settlement.view'),
    ('super-admin', 'wallet.reconciliation.run'),
    ('super-admin', 'wallet.fraud.review'),
    ('super-admin', 'wallet.privacy.review'),
    ('super-admin', 'wallet.audit.view'),
    ('super-admin', 'wallet.flags.manage'),
    ('super-admin', 'wallet.access.manage'),
    ('operations-manager', 'wallet.dashboard.view'),
    ('operations-manager', 'wallet.vendors.review'),
    ('operations-manager', 'wallet.vending.monitor'),
    ('operations-manager', 'wallet.disputes.manage'),
    ('operations-manager', 'wallet.settlement.view'),
    ('operations-manager', 'wallet.reconciliation.run'),
    ('operations-manager', 'wallet.fraud.review'),
    ('operations-manager', 'wallet.audit.view'),
    ('finance-checker', 'wallet.dashboard.view'),
    ('finance-checker', 'wallet.funding.view'),
    ('finance-checker', 'wallet.funding.approve'),
    ('finance-checker', 'wallet.refunds.manage'),
    ('finance-checker', 'wallet.settlement.view'),
    ('finance-checker', 'wallet.reconciliation.run'),
    ('finance-checker', 'wallet.audit.view'),
    ('account', 'wallet.dashboard.view'),
    ('account', 'wallet.funding.view'),
    ('account', 'wallet.vending.monitor'),
    ('account', 'wallet.settlement.view'),
    ('account', 'wallet.reconciliation.run')
)
insert into public.permissions (role_key, route_hash)
select role_key, route_hash from permission_defaults
on conflict (role_key, route_hash) do nothing;
