-- Funding requests are wallet-owner records, not vendor-only records. Existing
-- vendor rows keep their identity while customers gain the same reviewed bank
-- transfer pipeline and immutable ledger credit.
alter table public.funding_requests
  alter column vendor_organization_id drop not null,
  add column if not exists customer_id uuid references public.customers(id) on delete cascade,
  add column if not exists owner_type text;

update public.funding_requests
set owner_type = 'vendor'
where owner_type is null;

alter table public.funding_requests
  alter column owner_type set default 'vendor',
  alter column owner_type set not null,
  drop constraint if exists funding_requests_owner_type_check,
  drop constraint if exists funding_requests_exactly_one_owner_check,
  add constraint funding_requests_owner_type_check check (owner_type in ('vendor', 'customer')),
  add constraint funding_requests_exactly_one_owner_check check (
    (owner_type = 'vendor' and vendor_organization_id is not null and customer_id is null)
    or (owner_type = 'customer' and customer_id is not null and vendor_organization_id is null)
  );

drop index if exists public.funding_requests_vendor_proof_hash_idx;
create unique index if not exists funding_requests_vendor_proof_hash_idx
  on public.funding_requests(vendor_organization_id, proof_hash)
  where owner_type = 'vendor' and proof_hash is not null;
create unique index if not exists funding_requests_customer_proof_hash_idx
  on public.funding_requests(customer_id, proof_hash)
  where owner_type = 'customer' and proof_hash is not null;
