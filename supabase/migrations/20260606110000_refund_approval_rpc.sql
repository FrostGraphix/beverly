create or replace function public.fn_approve_refund_request(
  p_refund_request_id uuid,
  p_approved_by_user_id uuid
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests%rowtype;
  v_entry public.wallet_ledger_entries%rowtype;
begin
  select * into v_request
  from public.refund_requests
  where id = p_refund_request_id
  for update;

  if not found then
    raise exception 'refund request not found';
  end if;

  if v_request.status = 'approved' then
    if v_request.ledger_entry_id is not null then
      return v_request;
    end if;
    raise exception 'refund approval missing ledger entry';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'refund is not pending';
  end if;

  if v_request.requested_by_user_id = p_approved_by_user_id then
    raise exception 'approver must be different from requester (maker-checker)';
  end if;

  v_entry := public.fn_post_ledger_entry(
    v_request.wallet_id,
    'credit',
    v_request.amount_minor,
    'refund_credit',
    'refund_request',
    p_refund_request_id::text,
    'refund_' || p_refund_request_id::text,
    'Refund: ' || v_request.reason,
    p_approved_by_user_id
  );

  update public.refund_requests
  set status = 'approved',
      approved_by_user_id = p_approved_by_user_id,
      ledger_entry_id = v_entry.id,
      processed_at = now()
  where id = p_refund_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.fn_approve_refund_request(uuid, uuid) from public;
grant execute on function public.fn_approve_refund_request(uuid, uuid) to service_role;
