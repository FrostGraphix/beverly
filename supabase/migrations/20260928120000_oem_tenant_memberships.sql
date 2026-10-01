-- Explicit tenant membership. Staff roles and installation grants never imply it.
begin;
create table if not exists public.oem_tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, auth_user_id)
);
alter table public.oem_tenant_memberships enable row level security;
alter table public.oem_tenant_memberships force row level security;
drop policy if exists "service role manages tenant memberships" on public.oem_tenant_memberships;
create policy "service role manages tenant memberships" on public.oem_tenant_memberships
  for all to service_role using (true) with check (true);
revoke all on public.oem_tenant_memberships from public, anon, authenticated;
grant select, insert, update, delete on public.oem_tenant_memberships to service_role;
notify pgrst, 'reload schema';
commit;
