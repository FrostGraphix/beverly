-- Phase 7: data governance and VAT control.
-- Rollback: delete pending VAT rows, disable the worker schedule, then drop the
-- new columns/functions/table only after confirming no production reader uses them.

alter table public.payment_webhooks
  add column if not exists payload_encrypted text,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists retention_purged_at timestamptz;

create index if not exists payment_webhooks_retention_idx
  on public.payment_webhooks(expires_at)
  where retention_purged_at is null;

create table if not exists public.vat_policies (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'NG',
  label text not null,
  rate_basis_points integer not null check (rate_basis_points >= 0 and rate_basis_points <= 10000),
  effective_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  submitted_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or approved_at is not null)
);

create unique index if not exists vat_policies_approved_effective_uidx
  on public.vat_policies(jurisdiction, effective_at)
  where status = 'approved';

insert into public.vat_policies (
  jurisdiction,
  label,
  rate_basis_points,
  effective_at,
  status,
  approved_at
)
select
  'NG',
  'Nigeria VAT 7.5%',
  750,
  '2026-01-01 00:00:00+00'::timestamptz,
  'approved',
  now()
where not exists (
  select 1 from public.vat_policies
  where jurisdiction = 'NG' and status = 'approved'
);

alter table public.vat_policies enable row level security;

drop policy if exists "wallet service role all vat policies" on public.vat_policies;
create policy "wallet service role all vat policies"
  on public.vat_policies for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.purge_expired_payment_webhooks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.payment_webhooks
     set raw_payload = '{}'::jsonb,
         payload_encrypted = null,
         retention_purged_at = now()
   where expires_at <= now()
     and retention_purged_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;
