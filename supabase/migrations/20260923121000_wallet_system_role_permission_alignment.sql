-- System roles are code-reviewed policy. Custom roles remain database-managed.
with desired(role_key, route_hash) as (
  values
    ('super-admin', 'wallet.dashboard.view'),
    ('super-admin', 'wallet.vendors.review'),
    ('super-admin', 'wallet.vendors.manage'),
    ('super-admin', 'wallet.customers.view'),
    ('super-admin', 'wallet.meters.approve'),
    ('super-admin', 'wallet.kyc.view'),
    ('super-admin', 'wallet.kyc.review'),
    ('super-admin', 'wallet.funding.view'),
    ('super-admin', 'wallet.funding.approve'),
    ('super-admin', 'wallet.vendor_transfers.manage'),
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
    ('super-admin', 'wallet.reports.view'),
    ('super-admin', 'dev.console'),
    ('super-admin', 'wallet.consumption.view'),
    ('developer', 'dev.console'),
    ('operations-manager', 'wallet.dashboard.view'),
    ('operations-manager', 'wallet.vendors.review'),
    ('operations-manager', 'wallet.vending.monitor'),
    ('operations-manager', 'wallet.customers.view'),
    ('operations-manager', 'wallet.meters.approve'),
    ('operations-manager', 'wallet.kyc.view'),
    ('operations-manager', 'wallet.kyc.review'),
    ('operations-manager', 'wallet.disputes.manage'),
    ('operations-manager', 'wallet.support.manage'),
    ('operations-manager', 'wallet.announcements.manage'),
    ('operations-manager', 'wallet.settlement.view'),
    ('operations-manager', 'wallet.reconciliation.run'),
    ('operations-manager', 'wallet.fraud.review'),
    ('operations-manager', 'wallet.audit.view'),
    ('operations-manager', 'wallet.consumption.view'),
    ('operations-manager', 'wallet.reports.view'),
    ('finance-checker', 'wallet.dashboard.view'),
    ('finance-checker', 'wallet.funding.view'),
    ('finance-checker', 'wallet.funding.approve'),
    ('finance-checker', 'wallet.customers.view'),
    ('finance-checker', 'wallet.refunds.manage'),
    ('finance-checker', 'wallet.settlement.view'),
    ('finance-checker', 'wallet.reconciliation.run'),
    ('finance-checker', 'wallet.audit.view'),
    ('finance-checker', 'wallet.vat.manage'),
    ('finance-checker', 'wallet.vendor_transfers.manage'),
    ('finance-checker', 'wallet.consumption.view'),
    ('finance-checker', 'wallet.reports.view'),
    ('account', 'wallet.dashboard.view'),
    ('account', 'wallet.funding.view'),
    ('account', 'wallet.customers.view'),
    ('account', 'wallet.vending.monitor'),
    ('account', 'wallet.settlement.view'),
    ('account', 'wallet.reconciliation.run'),
    ('account', 'wallet.consumption.view'),
    ('account', 'wallet.reports.view')
), system_roles(role_key) as (
  values ('super-admin'), ('developer'), ('operations-manager'), ('finance-checker'), ('account')
)
delete from public.permissions p
using system_roles s
where p.role_key = s.role_key
  and not exists (
    select 1 from desired d
    where d.role_key = p.role_key and d.route_hash = p.route_hash
  );

insert into public.permissions(role_key, route_hash)
select * from (
  values
    ('super-admin', 'wallet.dashboard.view'), ('super-admin', 'wallet.vendors.review'), ('super-admin', 'wallet.vendors.manage'),
    ('super-admin', 'wallet.customers.view'), ('super-admin', 'wallet.meters.approve'), ('super-admin', 'wallet.kyc.view'),
    ('super-admin', 'wallet.kyc.review'), ('super-admin', 'wallet.funding.view'), ('super-admin', 'wallet.funding.approve'),
    ('super-admin', 'wallet.vendor_transfers.manage'), ('super-admin', 'wallet.vending.monitor'), ('super-admin', 'wallet.refunds.manage'),
    ('super-admin', 'wallet.disputes.manage'), ('super-admin', 'wallet.support.manage'), ('super-admin', 'wallet.announcements.manage'),
    ('super-admin', 'wallet.settlement.view'), ('super-admin', 'wallet.reconciliation.run'), ('super-admin', 'wallet.fraud.review'),
    ('super-admin', 'wallet.privacy.review'), ('super-admin', 'wallet.audit.view'), ('super-admin', 'wallet.flags.manage'),
    ('super-admin', 'wallet.vat.manage'), ('super-admin', 'wallet.access.manage'), ('super-admin', 'wallet.reports.view'),
    ('super-admin', 'dev.console'), ('super-admin', 'wallet.consumption.view'),
    ('developer', 'dev.console'),
    ('operations-manager', 'wallet.dashboard.view'), ('operations-manager', 'wallet.vendors.review'), ('operations-manager', 'wallet.vending.monitor'),
    ('operations-manager', 'wallet.customers.view'), ('operations-manager', 'wallet.meters.approve'), ('operations-manager', 'wallet.kyc.view'),
    ('operations-manager', 'wallet.kyc.review'), ('operations-manager', 'wallet.disputes.manage'), ('operations-manager', 'wallet.support.manage'),
    ('operations-manager', 'wallet.announcements.manage'), ('operations-manager', 'wallet.settlement.view'), ('operations-manager', 'wallet.reconciliation.run'),
    ('operations-manager', 'wallet.fraud.review'), ('operations-manager', 'wallet.audit.view'), ('operations-manager', 'wallet.consumption.view'),
    ('operations-manager', 'wallet.reports.view'),
    ('finance-checker', 'wallet.dashboard.view'), ('finance-checker', 'wallet.funding.view'), ('finance-checker', 'wallet.funding.approve'),
    ('finance-checker', 'wallet.customers.view'), ('finance-checker', 'wallet.refunds.manage'), ('finance-checker', 'wallet.settlement.view'),
    ('finance-checker', 'wallet.reconciliation.run'), ('finance-checker', 'wallet.audit.view'), ('finance-checker', 'wallet.vat.manage'),
    ('finance-checker', 'wallet.vendor_transfers.manage'), ('finance-checker', 'wallet.consumption.view'), ('finance-checker', 'wallet.reports.view'),
    ('account', 'wallet.dashboard.view'), ('account', 'wallet.funding.view'), ('account', 'wallet.customers.view'),
    ('account', 'wallet.vending.monitor'), ('account', 'wallet.settlement.view'), ('account', 'wallet.reconciliation.run'),
    ('account', 'wallet.consumption.view'), ('account', 'wallet.reports.view')
) as desired(role_key, route_hash)
on conflict (role_key, route_hash) do nothing;
