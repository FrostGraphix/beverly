-- Enforce Tier 2 address evidence at the database boundary. The application
-- validates this too, but privileged RPC callers must not be able to bypass it.
create or replace function public.submit_kyc_evidence_review(
  p_subject_type text,
  p_subject_id uuid,
  p_requested_tier integer,
  p_submitted_by uuid,
  p_submission jsonb default '{}'::jsonb
) returns public.kyc_review_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_tier integer;
  v_request public.kyc_review_requests;
  v_document_count integer := 0;
  v_expected_documents integer := 0;
  v_identity_count integer := 0;
  v_selfie_count integer := 0;
  v_address_count integer := 0;
  v_created boolean := false;
begin
  if p_subject_type = 'customer' then
    select kyc_tier into v_current_tier from public.customers where id = p_subject_id for update;
  elsif p_subject_type = 'vendor' then
    select kyc_tier into v_current_tier from public.vendor_organizations where id = p_subject_id for update;
  else
    raise exception using errcode = '22023', message = 'invalid_subject_type';
  end if;
  if v_current_tier is null then
    raise exception using errcode = 'P0002', message = 'kyc_subject_not_found';
  end if;
  if p_requested_tier <> v_current_tier + 1 or p_requested_tier not between 1 and 2 then
    raise exception using errcode = '22023', message = 'kyc_tier_must_be_sequential';
  end if;

  v_expected_documents := jsonb_array_length(coalesce(p_submission -> 'document_ids', '[]'::jsonb));
  if v_expected_documents < (case when p_requested_tier = 2 then 3 else 2 end) then
    raise exception using errcode = '22023', message = 'kyc_documents_required';
  end if;
  select * into v_request from public.kyc_review_requests
  where status = 'pending'
    and ((p_subject_type = 'customer' and customer_id = p_subject_id)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id))
  for update;
  if found then
    update public.kyc_review_requests
    set submission_json = p_submission, submitted_by = p_submitted_by, submitted_at = now(), updated_at = now()
    where id = v_request.id returning * into v_request;
  else
    insert into public.kyc_review_requests (
      subject_type, customer_id, vendor_organization_id, current_tier, requested_tier, submission_json, submitted_by
    ) values (
      p_subject_type,
      case when p_subject_type = 'customer' then p_subject_id end,
      case when p_subject_type = 'vendor' then p_subject_id end,
      v_current_tier, p_requested_tier, p_submission, p_submitted_by
    ) returning * into v_request;
    v_created := true;
  end if;

  update public.kyc_documents
  set review_request_id = v_request.id, updated_at = now()
  where id in (select value::uuid from jsonb_array_elements_text(p_submission -> 'document_ids'))
    and uploaded_at is not null
    and (review_request_id is null or review_request_id = v_request.id)
    and kyc_tier = p_requested_tier
    and ((p_subject_type = 'customer' and customer_id = p_subject_id and vendor_organization_id is null)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id and customer_id is null));
  get diagnostics v_document_count = row_count;
  if v_document_count <> v_expected_documents then
    raise exception using errcode = '22023', message = 'kyc_documents_invalid_or_already_used';
  end if;
  select count(*) filter (where doc_type in ('national_id', 'voters_card', 'passport', 'drivers_license')),
         count(*) filter (where doc_type = 'selfie'),
         count(*) filter (where doc_type in ('utility_bill', 'bank_statement'))
  into v_identity_count, v_selfie_count, v_address_count
  from public.kyc_documents where review_request_id = v_request.id;
  if v_identity_count < 1 or v_selfie_count < 1 then
    raise exception using errcode = '22023', message = 'kyc_identity_and_selfie_required';
  end if;
  if p_requested_tier = 2 and v_address_count < 1 then
    raise exception using errcode = '22023', message = 'kyc_address_evidence_required';
  end if;

  if p_subject_type = 'customer' then
    update public.customers
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ), updated_at = now()
    where id = p_subject_id;
  else
    update public.vendor_organizations
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ), updated_at = now()
    where id = p_subject_id;
  end if;
  if v_created then
    insert into public.wallet_audit_log (
      actor_user_id, actor_type, action, target_type, target_id, before_json, after_json
    ) values (
      p_submitted_by, p_subject_type, 'kyc.tier' || p_requested_tier::text || '.review_requested',
      p_subject_type, p_subject_id::text,
      jsonb_build_object('kyc_tier', v_current_tier),
      jsonb_build_object('requested_tier', p_requested_tier, 'review_request_id', v_request.id)
    );
  end if;
  return v_request;
end;
$$;

-- All purchase and vending debits reserve funds through this RPC. Enforce the
-- configured caps while the wallet row is locked so concurrent holds cannot
-- collectively pass a tier limit.
create or replace function public.fn_create_hold(
  p_wallet_id uuid,
  p_amount_minor bigint,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns public.wallet_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_holds%rowtype;
  v_balance bigint;
  v_holds bigint;
  v_daily_debits bigint;
  v_monthly_debits bigint;
  v_hold public.wallet_holds%rowtype;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'hold amount must be positive';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'hold idempotency key is required';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'hold expiry must be in the future';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then raise exception 'wallet not found'; end if;
  if v_wallet.status <> 'active' then raise exception 'wallet not active'; end if;

  select * into v_existing
  from public.wallet_holds
  where wallet_id = p_wallet_id and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_balance from public.wallet_ledger_entries where wallet_id = p_wallet_id;

  select coalesce(sum(amount_minor), 0)
  into v_holds from public.wallet_holds where wallet_id = p_wallet_id and status = 'active';

  if v_balance - v_holds < p_amount_minor then
    raise exception 'insufficient available balance for hold';
  end if;

  select coalesce(sum(amount_minor), 0)
  into v_daily_debits
  from public.wallet_ledger_entries
  where wallet_id = p_wallet_id and direction = 'debit' and created_at >= now() - interval '24 hours';

  select coalesce(sum(amount_minor), 0)
  into v_monthly_debits
  from public.wallet_ledger_entries
  where wallet_id = p_wallet_id and direction = 'debit' and created_at >= now() - interval '30 days';

  if v_wallet.daily_debit_cap_minor is not null
     and v_daily_debits + v_holds + p_amount_minor > v_wallet.daily_debit_cap_minor then
    raise exception 'daily debit cap exceeded';
  end if;
  if v_wallet.monthly_debit_cap_minor is not null
     and v_monthly_debits + v_holds + p_amount_minor > v_wallet.monthly_debit_cap_minor then
    raise exception 'monthly debit cap exceeded';
  end if;

  insert into public.wallet_holds (
    wallet_id, amount_minor, status, expires_at, reference_type,
    reference_id, idempotency_key, created_by
  ) values (
    p_wallet_id, p_amount_minor, 'active', p_expires_at, p_reference_type,
    p_reference_id, p_idempotency_key, p_created_by
  ) returning * into v_hold;

  return v_hold;
end;
$$;

revoke all on function public.fn_create_hold(uuid, bigint, text, text, text, timestamptz, uuid) from public;
grant execute on function public.fn_create_hold(uuid, bigint, text, text, text, timestamptz, uuid) to service_role;

-- Meter-order debits use the direct ledger RPC. Apply the same locked-wallet
-- cap rules there so no debit route can bypass the configured KYC policy.
create or replace function public.fn_post_ledger_entry(
  p_wallet_id uuid,
  p_direction text,
  p_amount_minor bigint,
  p_entry_type text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_memo text,
  p_created_by uuid
)
returns public.wallet_ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_ledger_entries%rowtype;
  v_balance bigint;
  v_holds bigint;
  v_daily_debits bigint;
  v_monthly_debits bigint;
  v_available bigint;
  v_after bigint;
  v_entry public.wallet_ledger_entries%rowtype;
begin
  if p_direction not in ('credit', 'debit') then raise exception 'invalid ledger direction'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'ledger amount must be positive'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'ledger idempotency key is required'; end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then raise exception 'wallet not found'; end if;
  if v_wallet.status <> 'active' then raise exception 'wallet not active'; end if;

  select * into v_existing
  from public.wallet_ledger_entries
  where wallet_id = p_wallet_id and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
  into v_balance from public.wallet_ledger_entries where wallet_id = p_wallet_id;

  select coalesce(sum(amount_minor), 0)
  into v_holds from public.wallet_holds where wallet_id = p_wallet_id and status = 'active';

  v_available := v_balance - v_holds;
  if p_direction = 'debit' and v_available < p_amount_minor then
    raise exception 'insufficient available balance';
  end if;

  if p_direction = 'debit' then
    select coalesce(sum(amount_minor), 0)
    into v_daily_debits
    from public.wallet_ledger_entries
    where wallet_id = p_wallet_id and direction = 'debit' and created_at >= now() - interval '24 hours';

    select coalesce(sum(amount_minor), 0)
    into v_monthly_debits
    from public.wallet_ledger_entries
    where wallet_id = p_wallet_id and direction = 'debit' and created_at >= now() - interval '30 days';

    if v_wallet.daily_debit_cap_minor is not null
       and v_daily_debits + v_holds + p_amount_minor > v_wallet.daily_debit_cap_minor then
      raise exception 'daily debit cap exceeded';
    end if;
    if v_wallet.monthly_debit_cap_minor is not null
       and v_monthly_debits + v_holds + p_amount_minor > v_wallet.monthly_debit_cap_minor then
      raise exception 'monthly debit cap exceeded';
    end if;
  end if;

  v_after := case when p_direction = 'credit' then v_balance + p_amount_minor else v_balance - p_amount_minor end;

  insert into public.wallet_ledger_entries (
    wallet_id, direction, amount_minor, balance_after_minor, entry_type,
    reference_type, reference_id, idempotency_key, memo, created_by
  ) values (
    p_wallet_id, p_direction, p_amount_minor, v_after, p_entry_type,
    p_reference_type, p_reference_id, p_idempotency_key, p_memo, p_created_by
  ) returning * into v_entry;

  update public.wallets set balance_minor = v_after, updated_at = now() where id = p_wallet_id;
  return v_entry;
end;
$$;

revoke all on function public.fn_post_ledger_entry(uuid, text, bigint, text, text, text, text, text, uuid) from public;
grant execute on function public.fn_post_ledger_entry(uuid, text, bigint, text, text, text, text, text, uuid) to service_role;
