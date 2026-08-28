alter table public.meter_purchase_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists reversal_ledger_entry_id uuid references public.wallet_ledger_entries(id);

create or replace function public.fn_cancel_vendor_meter_order(
  p_order_id uuid,
  p_vendor_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns public.meter_purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.meter_purchase_orders;
  v_reversal public.wallet_ledger_entries;
begin
  select * into v_order
  from public.meter_purchase_orders
  where id = p_order_id
    and vendor_organization_id = p_vendor_organization_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'cancelled' then return v_order; end if;
  if v_order.status <> 'paid' then raise exception 'order_approved'; end if;
  if v_order.sponsor_mode <> 'vendor_wallet' or v_order.wallet_id is null then
    raise exception 'not_vendor_sponsored';
  end if;
  if clock_timestamp() > v_order.created_at + interval '6 hours' then
    raise exception 'window_expired';
  end if;

  v_reversal := public.fn_post_ledger_entry(
    v_order.wallet_id,
    'credit',
    v_order.amount_minor,
    'reversal_credit',
    'meter_order',
    v_order.id::text,
    'meter_order:cancel:' || v_order.id::text,
    'Meter order cancellation · ' || coalesce(v_order.customer_name_snapshot, v_order.customer_id::text),
    p_actor_user_id
  );

  update public.meter_purchase_orders
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by = p_actor_user_id,
      cancellation_reason = nullif(trim(p_reason), ''),
      reversal_ledger_entry_id = v_reversal.id,
      updated_at = clock_timestamp()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.fn_cancel_vendor_meter_order(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_cancel_vendor_meter_order(uuid, uuid, uuid, text) to service_role;
