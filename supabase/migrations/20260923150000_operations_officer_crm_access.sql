-- Add the reviewed Operations Officer system role.
insert into public.roles (name, role_key, role_name, label, description)
values (
  'operations-officer',
  'operations-officer',
  'Operations Officer',
  'Operations Officer',
  'Daily wallet operations with restricted Beverly CRM access.'
)
on conflict (role_key) do update set
  role_name = excluded.role_name,
  label = excluded.label,
  description = excluded.description;

insert into public.permissions (role_key, route_hash)
values
  ('operations-officer', 'wallet.dashboard.view'),
  ('operations-officer', 'wallet.vending.monitor'),
  ('operations-officer', 'wallet.customers.view'),
  ('operations-officer', 'wallet.meters.approve'),
  ('operations-officer', 'wallet.disputes.manage'),
  ('operations-officer', 'wallet.support.manage'),
  ('operations-officer', 'wallet.consumption.view'),
  ('operations-officer', 'wallet.reports.view')
on conflict (role_key, route_hash) do nothing;
