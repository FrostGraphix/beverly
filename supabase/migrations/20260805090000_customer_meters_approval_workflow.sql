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
  add column if not exists rejection_reason text;

update public.customer_meters set status = 'approved' where status = 'pending';

create index if not exists customer_meters_status_idx
  on public.customer_meters(status);

notify pgrst, 'reload schema';
