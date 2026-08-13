-- Keep successful-but-undelivered payments replayable.

create or replace function public.fn_claim_payment_fulfillment(
  p_payment_transaction_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions%rowtype;
begin
  select * into v_tx
  from public.payment_transactions
  where id = p_payment_transaction_id
  for update;

  if not found then
    raise exception 'payment transaction not found';
  end if;
  if v_tx.status in ('succeeded', 'success')
     and coalesce(v_tx.metadata ->> 'fulfillment_completed_at', '') <> '' then
    return false;
  end if;
  if v_tx.fulfillment_claimed_at is not null
     and v_tx.fulfillment_claimed_at > pg_catalog.now() - interval '10 minutes' then
    return false;
  end if;

  update public.payment_transactions
  set fulfillment_claimed_at = pg_catalog.now(),
      fulfillment_lease_token = p_lease_token,
      fulfillment_attempts = coalesce(fulfillment_attempts, 0) + 1,
      fulfillment_last_error = null,
      updated_at = pg_catalog.now()
  where id = p_payment_transaction_id;
  return true;
end;
$$;

create or replace function public.fn_release_payment_fulfillment(
  p_payment_transaction_id uuid,
  p_lease_token uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_transactions
  set fulfillment_claimed_at = null,
      fulfillment_lease_token = null,
      fulfillment_last_error = pg_catalog.left(p_error, 500),
      fulfillment_next_retry_at = case
        when p_error is null then null
        else pg_catalog.now() + interval '5 minutes'
      end,
      updated_at = pg_catalog.now()
  where id = p_payment_transaction_id
    and fulfillment_lease_token = p_lease_token;
end;
$$;

revoke all on function public.fn_claim_payment_fulfillment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_release_payment_fulfillment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_claim_payment_fulfillment(uuid, uuid) to service_role;
grant execute on function public.fn_release_payment_fulfillment(uuid, uuid, text) to service_role;
