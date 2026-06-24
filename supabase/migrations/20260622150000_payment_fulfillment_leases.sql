-- Payment webhook deduplication and fulfillment leases.

alter table public.payment_webhooks
  add column if not exists gateway_event_id text,
  add column if not exists payload_digest text,
  add column if not exists verified_at timestamptz;

create unique index if not exists payment_webhooks_gateway_event_uidx
  on public.payment_webhooks(gateway, gateway_event_id)
  where gateway_event_id is not null;

create unique index if not exists payment_webhooks_gateway_digest_uidx
  on public.payment_webhooks(gateway, payload_digest)
  where payload_digest is not null;

alter table public.payment_transactions
  add column if not exists fulfillment_claimed_at timestamptz,
  add column if not exists fulfillment_lease_token uuid,
  add column if not exists fulfillment_attempts integer not null default 0,
  add column if not exists fulfillment_last_error text,
  add column if not exists fulfillment_next_retry_at timestamptz;

create or replace function public.fn_claim_payment_fulfillment(
  p_payment_transaction_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
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
  if v_tx.completed_at is not null then
    return false;
  end if;
  if v_tx.fulfillment_claimed_at is not null
     and v_tx.fulfillment_claimed_at > now() - interval '10 minutes' then
    return false;
  end if;

  update public.payment_transactions
  set fulfillment_claimed_at = now(),
      fulfillment_lease_token = p_lease_token,
      fulfillment_attempts = coalesce(fulfillment_attempts, 0) + 1,
      fulfillment_last_error = null,
      updated_at = now()
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
set search_path = public
as $$
begin
  update public.payment_transactions
  set fulfillment_claimed_at = null,
      fulfillment_lease_token = null,
      fulfillment_last_error = left(p_error, 500),
      fulfillment_next_retry_at = case
        when p_error is null then null
        else now() + interval '5 minutes'
      end,
      updated_at = now()
  where id = p_payment_transaction_id
    and fulfillment_lease_token = p_lease_token;
end;
$$;

revoke all on function public.fn_claim_payment_fulfillment(uuid, uuid) from public;
revoke all on function public.fn_release_payment_fulfillment(uuid, uuid, text) from public;
grant execute on function public.fn_claim_payment_fulfillment(uuid, uuid) to service_role;
grant execute on function public.fn_release_payment_fulfillment(uuid, uuid, text) to service_role;
