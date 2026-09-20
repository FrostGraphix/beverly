-- Align vendor creation with the canonical admin lifecycle.

begin;
alter table public.vendor_organizations
  drop constraint if exists vendor_organizations_status_check;
update public.vendor_organizations
set status = 'pending'
where status = 'pending_review';
alter table public.vendor_organizations
  alter column status set default 'pending';
alter table public.vendor_organizations
  add constraint vendor_organizations_status_check
  check (status in ('pending', 'approved', 'suspended', 'frozen', 'closed', 'rejected'))
  not valid;
alter table public.vendor_organizations
  validate constraint vendor_organizations_status_check;
notify pgrst, 'reload schema';
commit;
