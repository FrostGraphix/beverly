-- Make automatic meter-order refunds visible within the canonical refunds flow.

alter table public.refund_requests
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_id uuid;

update public.refund_requests
set source_type = case when dispute_id is not null then 'dispute' else 'manual' end
where source_type = 'manual';

alter table public.refund_requests
  drop constraint if exists refund_requests_source_type_check;

alter table public.refund_requests
  add constraint refund_requests_source_type_check
  check (source_type in ('manual', 'dispute', 'meter_order_rejection'));

create unique index if not exists refund_requests_source_idx
  on public.refund_requests (source_type, source_id);

create index if not exists refund_requests_meter_rejection_idx
  on public.refund_requests (created_at desc)
  where source_type = 'meter_order_rejection';

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

    insert into public.refund_requests (
      wallet_id,
      amount_minor,
      approved_amount_minor,
      reason,
      status,
      approved_by_user_id,
      ledger_entry_id,
      processed_at,
      source_type,
      source_id
    ) values (
      v_refund_wallet_id,
      v_order.amount_minor,
      v_order.amount_minor,
      'Meter order rejected · ' || trim(p_reason),
      'approved',
      p_rejected_by_user_id,
      v_entry.id,
      clock_timestamp(),
      'meter_order_rejection',
      v_order.id
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

insert into public.refund_requests (
  wallet_id,
  amount_minor,
  approved_amount_minor,
  reason,
  status,
  approved_by_user_id,
  ledger_entry_id,
  processed_at,
  created_at,
  source_type,
  source_id
)
select
  ledger.wallet_id,
  orders.amount_minor,
  orders.amount_minor,
  'Meter order rejected · ' || coalesce(nullif(trim(orders.rejection_reason), ''), 'No rejection reason recorded'),
  'approved',
  orders.rejected_by,
  ledger.id,
  coalesce(orders.rejected_at, ledger.created_at),
  coalesce(orders.rejected_at, ledger.created_at),
  'meter_order_rejection',
  orders.id
from public.meter_purchase_orders orders
join public.wallet_ledger_entries ledger
  on ledger.id = orders.rejection_refund_entry_id
where orders.status = 'rejected'
  and orders.rejection_refund_entry_id is not null
on conflict (source_type, source_id) do nothing;

notify pgrst, 'reload schema';
