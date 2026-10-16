-- A deleted meter cannot be referenced by its new unlink-history event.
-- Existing history references are cleared by the ON DELETE SET NULL foreign key.
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
      null, old.customer_id, old.meter_id, old.station_id, 'unlinked',
      old.status, null, old.reviewed_by, 'system', now()
    );
    return old;
  end if;

  return null;
end;
$$;

notify pgrst, 'reload schema';
