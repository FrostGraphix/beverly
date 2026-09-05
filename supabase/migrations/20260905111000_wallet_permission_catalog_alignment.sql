-- Align persisted system-role grants with the runtime permission catalog.
insert into public.roles (name, role_key, role_name, label, description)
values ('developer', 'developer', 'Developer', 'Developer', 'Developer tooling access without operational money controls.')
on conflict (role_key) do update set
  role_name = excluded.role_name,
  label = excluded.label,
  description = excluded.description;

delete from public.permissions
where role_key = 'developer'
  and route_hash = 'wallet.vendor_transfers.manage';

insert into public.permissions (role_key, route_hash)
values
  ('developer', 'dev.console'),
  ('operations-manager', 'wallet.reports.view'),
  ('finance-checker', 'wallet.reports.view'),
  ('finance-checker', 'wallet.vendor_transfers.manage'),
  ('finance-checker', 'wallet.consumption.view'),
  ('account', 'wallet.reports.view'),
  ('account', 'wallet.consumption.view')
on conflict (role_key, route_hash) do nothing;
