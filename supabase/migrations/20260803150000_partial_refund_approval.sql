-- Partial refund support: allow an approver to credit less than the
-- originally requested amount (e.g. energy portion only, retaining the
-- non-refundable gateway fee) while keeping the maker-checker guarantees.
-- Backward compatible: existing 2-arg callers get the full requested amount.
create or replace function public.fn_approve_refund_request(
  p_refund_request_id uuid,
  p_approved_by_user_id uuid,
  p_amount_minor bigint default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests%rowtype;
  v_entry public.wallet_ledger_entries%rowtype;
  v_credit_amount bigint;
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

  v_credit_amount := coalesce(p_amount_minor, v_request.amount_minor);
  if v_credit_amount <= 0 or v_credit_amount > v_request.amount_minor then
    raise exception 'partial refund amount must be greater than zero and cannot exceed the requested amount';
  end if;

  v_entry := public.fn_post_ledger_entry(
    v_request.wallet_id,
    'credit',
    v_credit_amount,
    'refund_credit',
    'refund_request',
    p_refund_request_id::text,
    'refund_' || p_refund_request_id::text,
    'Refund: ' || v_request.reason
      || case when v_credit_amount < v_request.amount_minor then ' (partial)' else '' end,
    p_approved_by_user_id
  );

  update public.refund_requests
  set status = 'approved',
      approved_by_user_id = p_approved_by_user_id,
      approved_amount_minor = v_credit_amount,
      ledger_entry_id = v_entry.id,
      processed_at = now()
  where id = p_refund_request_id
  returning * into v_request;

  return v_request;
end;
$$;

alter table refund_requests
  add column if not exists approved_amount_minor bigint;

comment on column refund_requests.approved_amount_minor is
  'Amount actually credited on approval; may be less than amount_minor for a partial refund. Null until approved.';

revoke all on function public.fn_approve_refund_request(uuid, uuid, bigint) from public;
grant execute on function public.fn_approve_refund_request(uuid, uuid, bigint) to service_role;
