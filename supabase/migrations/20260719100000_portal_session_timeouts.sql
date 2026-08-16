create table if not exists public.portal_sessions (
  session_key text primary key,
  auth_user_id uuid not null,
  actor_type text not null check (actor_type in ('staff', 'vendor_user', 'customer')),
  started_at timestamptz not null,
  last_active_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_sessions_expiry_idx
  on public.portal_sessions (absolute_expires_at);

alter table public.portal_sessions enable row level security;

revoke all on table public.portal_sessions from anon, authenticated;
grant select, insert, update, delete on table public.portal_sessions to service_role;

drop policy if exists "portal sessions service role" on public.portal_sessions;
create policy "portal sessions service role" on public.portal_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.touch_portal_session(
  p_session_key text,
  p_auth_user_id uuid,
  p_actor_type text,
  p_started_at timestamptz,
  p_idle_seconds integer,
  p_absolute_seconds integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_session public.portal_sessions%rowtype;
begin
  if p_session_key is null or p_session_key = ''
     or p_auth_user_id is null
     or p_actor_type not in ('staff', 'vendor_user', 'customer')
     or p_started_at is null
     or p_idle_seconds <= 0
     or p_absolute_seconds <= 0 then
    return 'invalid_session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_key, 0));

  select * into v_session
  from public.portal_sessions
  where session_key = p_session_key
  for update;

  if not found then
    if v_now >= p_started_at + make_interval(secs => p_absolute_seconds) then
      return 'session_absolute_timeout';
    end if;
    if v_now >= p_started_at + make_interval(secs => p_idle_seconds) then
      return 'session_idle_timeout';
    end if;

    insert into public.portal_sessions (
      session_key,
      auth_user_id,
      actor_type,
      started_at,
      last_active_at,
      absolute_expires_at
    ) values (
      p_session_key,
      p_auth_user_id,
      p_actor_type,
      p_started_at,
      v_now,
      p_started_at + make_interval(secs => p_absolute_seconds)
    );
    return 'active';
  end if;

  if v_session.auth_user_id <> p_auth_user_id or v_session.actor_type <> p_actor_type then
    return 'invalid_session';
  end if;
  if v_session.revoked_at is not null then
    return 'session_revoked';
  end if;
  if v_now >= least(
    v_session.absolute_expires_at,
    v_session.started_at + make_interval(secs => p_absolute_seconds)
  ) then
    return 'session_absolute_timeout';
  end if;
  if v_now >= v_session.last_active_at + make_interval(secs => p_idle_seconds) then
    return 'session_idle_timeout';
  end if;

  if v_now >= v_session.last_active_at + interval '60 seconds' then
    update public.portal_sessions
    set last_active_at = v_now,
        updated_at = v_now
    where session_key = p_session_key;
  end if;

  return 'active';
end;
$$;

revoke all on function public.touch_portal_session(text, uuid, text, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.touch_portal_session(text, uuid, text, timestamptz, integer, integer) to service_role;

notify pgrst, 'reload schema';
