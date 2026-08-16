-- Meter onboarding approval workflow.
--
-- Previously a linked meter (customer_meters row) was instantly vend-able with
-- zero ownership verification. This adds a review status so a wallet admin
-- must approve a customer's meter link before purchases against it are allowed.
-- Existing rows are backfilled as 'approved' so already-onboarded meters keep
-- working without requiring a retroactive review pass.

alter table public.customer_meters
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists rejection_reason text;

update public.customer_meters set status = 'approved' where status = 'pending';

create index if not exists customer_meters_status_idx
  on public.customer_meters(status);

-- A physical meter may have multiple disputed/pending claims, but only one
-- customer can own an approved link. This database constraint closes races
-- between concurrent staff reviews as well as direct service-role writes.
create unique index if not exists customer_meters_one_approved_owner_idx
  on public.customer_meters(meter_id)
  where status = 'approved';

alter table public.customer_meters enable row level security;
alter table public.customer_meters force row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.customer_meters from authenticated;
grant select on public.customer_meters to authenticated;
grant all on public.customer_meters to service_role;

notify pgrst, 'reload schema';
