-- KYC evidence contains sensitive identity data.
-- Default review access follows the documented Operations role boundary.

delete from public.permissions
where route_hash in ('wallet.kyc.view', 'wallet.kyc.review')
  and role_key in ('finance-checker', 'account');

insert into public.permissions (role_key, route_hash)
values
  ('operations-manager', 'wallet.kyc.view'),
  ('operations-manager', 'wallet.kyc.review')
on conflict (role_key, route_hash) do nothing;

notify pgrst, 'reload schema';
