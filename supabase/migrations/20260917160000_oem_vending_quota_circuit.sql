begin;
create table if not exists public.oem_vending_circuits (
  oem_key text primary key,
  status text not null default 'ready' check (status in ('ready', 'blocked')),
  reason_code text,
  public_message text not null default '',
  blocked_until timestamptz not null default now(),
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint oem_vending_circuits_key_check check (btrim(oem_key) <> '')
);
create index if not exists oem_vending_circuits_status_idx
  on public.oem_vending_circuits (status, blocked_until);
alter table public.oem_vending_circuits enable row level security;
drop policy if exists "service role manages oem vending circuits"
  on public.oem_vending_circuits;
create policy "service role manages oem vending circuits"
  on public.oem_vending_circuits for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
revoke all on table public.oem_vending_circuits from anon, authenticated;
grant all on table public.oem_vending_circuits to service_role;
create or replace function public.claim_oem_vending_probe(
  p_oem_key text,
  p_now timestamptz,
  p_probe_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  circuit_status text;
  circuit_blocked_until timestamptz;
  claimed_rows integer;
begin
  select status, blocked_until
    into circuit_status, circuit_blocked_until
    from public.oem_vending_circuits
   where oem_key = lower(btrim(p_oem_key));

  if not found or circuit_status = 'ready' then
    return true;
  end if;

  if circuit_blocked_until > p_now then
    return false;
  end if;

  update public.oem_vending_circuits
     set blocked_until = p_probe_until,
         updated_at = p_now
   where oem_key = lower(btrim(p_oem_key))
     and status = 'blocked'
     and blocked_until <= p_now;
  get diagnostics claimed_rows = row_count;
  return claimed_rows = 1;
end;
$$;
revoke all on function public.claim_oem_vending_probe(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_oem_vending_probe(text, timestamptz, timestamptz) to service_role;
comment on table public.oem_vending_circuits is
  'Durable OEM vending safety circuit. Quota failures suppress repeated wallet holds until the next probe window.';
commit;
