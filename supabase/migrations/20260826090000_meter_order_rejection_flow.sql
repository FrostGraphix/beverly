alter table public.meter_purchase_orders
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists rejection_reason text,
  add column if not exists rejection_refund_entry_id uuid references public.wallet_ledger_entries(id),
  add column if not exists rejection_refund_destination text;

alter table public.meter_purchase_orders
  drop constraint if exists meter_purchase_orders_rejection_refund_destination_check;

alter table public.meter_purchase_orders
  add constraint meter_purchase_orders_rejection_refund_destination_check
  check (rejection_refund_destination is null or rejection_refund_destination in ('none', 'vendor_wallet', 'customer_wallet'));

create or replace function public.fn_reject_meter_order(
  p_order_id uuid,
  p_rejected_by_user_id uuid,
  p_reason text
) returns public.meter_purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.meter_purchase_orders;
  v_refund_wallet_id uuid;
  v_refund_destination text := 'none';
  v_entry public.wallet_ledger_entries;
begin
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_order
  from public.meter_purchase_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('pending_payment', 'paid') then
    raise exception 'order_already_processed';
  end if;

  if v_order.status = 'paid' then
    if v_order.sponsor_mode = 'vendor_wallet' then
      v_refund_wallet_id := v_order.wallet_id;
      v_refund_destination := 'vendor_wallet';
    else
      select id into v_refund_wallet_id
      from public.wallets
      where owner_type = 'customer'
        and owner_id = v_order.customer_id;
      v_refund_destination := 'customer_wallet';
    end if;

    if v_refund_wallet_id is null then raise exception 'refund_wallet_missing'; end if;

    v_entry := public.fn_post_ledger_entry(
      v_refund_wallet_id,
      'credit',
      v_order.amount_minor,
      case when v_refund_destination = 'vendor_wallet' then 'reversal_credit' else 'refund_credit' end,
      'meter_order',
      v_order.id::text,
      'meter_order:reject:' || v_order.id::text,
      'Rejected meter order refund · ' || coalesce(v_order.customer_name_snapshot, v_order.customer_id::text),
      p_rejected_by_user_id
    );
  end if;

  update public.meter_purchase_orders
  set status = 'rejected',
      rejected_at = clock_timestamp(),
      rejected_by = p_rejected_by_user_id,
      rejection_reason = trim(p_reason),
      rejection_refund_entry_id = v_entry.id,
      rejection_refund_destination = v_refund_destination,
      updated_at = clock_timestamp()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.fn_reject_meter_order(uuid, uuid, text) from public;
grant execute on function public.fn_reject_meter_order(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
