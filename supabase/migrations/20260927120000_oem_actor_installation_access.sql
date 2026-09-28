-- Explicit service-managed authority. Staff roles never imply tenant ownership.
begin;

create table if not exists public.oem_actor_installation_access (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, oem_installation_id)
);

alter table public.oem_actor_installation_access enable row level security;
alter table public.oem_actor_installation_access force row level security;
drop policy if exists "service role manages installation access" on public.oem_actor_installation_access;
create policy "service role manages installation access"
  on public.oem_actor_installation_access for all to service_role
  using (true) with check (true);
revoke all on public.oem_actor_installation_access from public, anon, authenticated;
grant select, insert, update, delete on public.oem_actor_installation_access to service_role;

-- Deliberately no grants seeded. Verify actor ownership before provisioning.
notify pgrst, 'reload schema';
commit;
