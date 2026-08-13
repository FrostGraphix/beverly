-- Immutable customer-meter linking lifecycle history.
-- The customer_meters row represents the current association/request while this
-- table preserves every submitted, approved, rejected, and unlinked decision.

create table if not exists public.customer_meter_link_history (
  id uuid primary key default gen_random_uuid(),
  customer_meter_id uuid references public.customer_meters(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  meter_id text not null,
  station_id text,
  event_type text not null
    check (event_type in ('submitted', 'approved', 'rejected', 'unlinked')),
  previous_status text
    check (previous_status is null or previous_status in ('pending', 'approved', 'rejected')),
  new_status text
    check (new_status is null or new_status in ('pending', 'approved', 'rejected')),
  reason text,
  note text,
  actor_user_id uuid,
  actor_type text not null default 'system'
    check (actor_type in ('customer', 'staff', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists customer_meter_link_history_customer_created_idx
  on public.customer_meter_link_history(customer_id, created_at desc);

create index if not exists customer_meter_link_history_meter_created_idx
  on public.customer_meter_link_history(meter_id, created_at desc);

create index if not exists customer_meter_link_history_station_event_idx
  on public.customer_meter_link_history(station_id, event_type, created_at desc);

alter table public.customer_meter_link_history enable row level security;
alter table public.customer_meter_link_history force row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.customer_meter_link_history from authenticated;
grant select on public.customer_meter_link_history to authenticated;
grant all on public.customer_meter_link_history to service_role;

create or replace function private.record_customer_meter_link_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  history_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.customer_meter_link_history (
      customer_meter_id, customer_id, meter_id, station_id, event_type,
      previous_status, new_status, actor_type, created_at
    ) values (
      new.id, new.customer_id, new.meter_id, new.station_id, 'submitted',
      null, new.status, 'customer', coalesce(new.created_at, now())
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    history_event := case
      when new.status = 'pending' then 'submitted'
      when new.status = 'approved' then 'approved'
      else 'rejected'
    end;
    insert into public.customer_meter_link_history (
      customer_meter_id, customer_id, meter_id, station_id, event_type,
      previous_status, new_status, reason, note, actor_user_id, actor_type, created_at
    ) values (
      new.id, new.customer_id, new.meter_id, new.station_id, history_event,
      old.status, new.status, new.rejection_reason, new.review_note,
      new.reviewed_by, case when new.status = 'pending' then 'customer' else 'staff' end,
      coalesce(new.reviewed_at, now())
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.customer_meter_link_history (
      customer_meter_id, customer_id, meter_id, station_id, event_type,
      previous_status, new_status, actor_user_id, actor_type, created_at
    ) values (
      old.id, old.customer_id, old.meter_id, old.station_id, 'unlinked',
      old.status, null, old.reviewed_by, 'system', now()
    );
    return old;
  end if;

  return null;
end;
$$;

revoke all on function private.record_customer_meter_link_history() from public, anon, authenticated;
grant execute on function private.record_customer_meter_link_history() to service_role;

-- Backfill the request and its latest decision for associations that predate
-- lifecycle history. The migration runs once, so these inserts stay unique.
insert into public.customer_meter_link_history (
  customer_meter_id, customer_id, meter_id, station_id, event_type,
  previous_status, new_status, actor_type, created_at
)
select id, customer_id, meter_id, station_id, 'submitted', null, 'pending', 'customer', created_at
from public.customer_meters;

insert into public.customer_meter_link_history (
  customer_meter_id, customer_id, meter_id, station_id, event_type,
  previous_status, new_status, reason, note, actor_user_id, actor_type, created_at
)
select
  cm.id, cm.customer_id, cm.meter_id, cm.station_id, cm.status,
  'pending', cm.status, cm.rejection_reason, cm.review_note, cm.reviewed_by, 'staff',
  coalesce(cm.reviewed_at, cm.updated_at, cm.created_at)
from public.customer_meters cm
where cm.status in ('approved', 'rejected')
  and not exists (
    select 1
    from public.wallet_audit_log wal
    where wal.target_id = cm.id::text
      and wal.action = 'customer_meter.' || cm.status
  );

-- Recover every prior approval and rejection from the append-only audit log.
-- This preserves decisions that were overwritten before lifecycle history existed.
insert into public.customer_meter_link_history (
  customer_meter_id, customer_id, meter_id, station_id, event_type,
  previous_status, new_status, reason, note, actor_user_id, actor_type, created_at
)
select
  cm.id,
  coalesce(nullif(wal.after->>'customerId', '')::uuid, cm.customer_id),
  coalesce(nullif(wal.after->>'meterId', ''), cm.meter_id),
  cm.station_id,
  case when wal.action = 'customer_meter.approve' then 'approved' else 'rejected' end,
  'pending',
  case when wal.action = 'customer_meter.approve' then 'approved' else 'rejected' end,
  nullif(wal.after->>'reason', ''),
  nullif(wal.after->>'note', ''),
  wal.actor_user_id,
  'staff',
  wal.created_at
from public.wallet_audit_log wal
left join public.customer_meters cm on cm.id::text = wal.target_id
where wal.action in ('customer_meter.approve', 'customer_meter.reject')
  and coalesce(nullif(wal.after->>'customerId', ''), cm.customer_id::text) is not null
  and coalesce(nullif(wal.after->>'meterId', ''), cm.meter_id) is not null;

drop trigger if exists customer_meter_link_history_capture on public.customer_meters;
create trigger customer_meter_link_history_capture
  after insert or update of status or delete on public.customer_meters
  for each row execute function private.record_customer_meter_link_history();

notify pgrst, 'reload schema';
