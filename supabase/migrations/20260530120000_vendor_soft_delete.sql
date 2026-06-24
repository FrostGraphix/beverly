alter table public.vendor_organizations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deletion_reason text;

create index if not exists vendor_organizations_not_deleted_idx
  on public.vendor_organizations(status, created_at desc)
  where deleted_at is null;
