-- Approve bank funding and credit its wallet in one database transaction.
create or replace function public.fn_approve_funding_request(
  p_funding_request_id uuid,
  p_wallet_id uuid,
  p_approved_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funding public.funding_requests%rowtype;
  v_wallet public.wallets%rowtype;
  v_entry public.wallet_ledger_entries%rowtype;
  v_owner_id uuid;
begin
  select * into v_funding
  from public.funding_requests
  where id = p_funding_request_id
  for update;

  if not found then
    raise exception 'funding request not found';
  end if;

  if v_funding.submitted_by = p_approved_by then
    raise exception 'self approval is not allowed';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id
  for update;

  if not found then
    raise exception 'wallet not found';
  end if;
  if v_wallet.status <> 'active' then
    raise exception 'wallet not active';
  end if;

  v_owner_id := case
    when v_funding.owner_type = 'customer' then v_funding.customer_id
    else v_funding.vendor_organization_id
  end;

  if v_wallet.owner_type <> v_funding.owner_type or v_wallet.owner_id <> v_owner_id then
    raise exception 'wallet owner mismatch';
  end if;

  if v_funding.status = 'approved' then
    select * into v_entry
    from public.wallet_ledger_entries
    where reference_type = 'funding_request'
      and reference_id = v_funding.id::text
      and entry_type = 'funding_credit'
    order by created_at asc
    limit 1;

    if not found then
      raise exception 'approved funding credit missing';
    end if;

    return jsonb_build_object(
      'funding', to_jsonb(v_funding),
      'ledgerEntry', to_jsonb(v_entry)
    );
  end if;

  if v_funding.status not in ('under_review', 'proof_uploaded') then
    raise exception 'invalid funding state: %', v_funding.status;
  end if;

  v_entry := public.fn_post_ledger_entry(
    p_wallet_id,
    'credit',
    v_funding.amount_minor,
    'funding_credit',
    'funding_request',
    v_funding.id::text,
    'funding.' || v_funding.id::text || '.credit',
    'Funding approved · ' || v_funding.channel,
    p_approved_by
  );

  update public.funding_requests
  set status = 'approved',
      wallet_id = p_wallet_id,
      approved_by = p_approved_by,
      approved_at = now(),
      updated_at = now()
  where id = v_funding.id
  returning * into v_funding;

  return jsonb_build_object(
    'funding', to_jsonb(v_funding),
    'ledgerEntry', to_jsonb(v_entry)
  );
end;
$$;

revoke all on function public.fn_approve_funding_request(uuid, uuid, uuid) from public;
grant execute on function public.fn_approve_funding_request(uuid, uuid, uuid) to service_role;
