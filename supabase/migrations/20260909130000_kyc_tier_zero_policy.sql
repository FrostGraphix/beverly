-- Tier 0 stores basic profile data without approval.
-- Every tier elevation remains sequential and evidence-backed.

create or replace function public.save_customer_kyc_basic_info(
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_basic_info jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz := now();
begin
  if nullif(trim(p_basic_info ->> 'full_name'), '') is null
    or nullif(trim(p_basic_info ->> 'date_of_birth'), '') is null
    or nullif(trim(p_basic_info ->> 'address'), '') is null
    or nullif(trim(p_basic_info ->> 'state'), '') is null
    or nullif(trim(p_basic_info ->> 'lga'), '') is null then
    raise exception using errcode = '22023', message = 'kyc_basic_info_incomplete';
  end if;

  update public.customers
  set full_name = trim(p_basic_info ->> 'full_name'),
      kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
        'basic_info', p_basic_info || jsonb_build_object('completed_at', v_completed_at)
      ),
      updated_at = now()
  where id = p_customer_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'kyc_subject_not_found';
  end if;

  insert into public.wallet_audit_log (
    actor_user_id, actor_type, action, target_type, target_id, after_json
  ) values (
    p_actor_user_id, 'customer', 'kyc.tier0.basic_info_saved',
    'customer', p_customer_id::text,
    jsonb_build_object('basic_info_completed_at', v_completed_at)
  );

  return jsonb_build_object('completed_at', v_completed_at);
end;
$$;

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

  if p_subject_type = 'customer' and p_requested_tier = 1
    and not coalesce((select (kyc_data -> 'basic_info' ->> 'completed_at') is not null from public.customers where id = p_subject_id), false) then
    raise exception using errcode = '22023', message = 'kyc_basic_info_required';
  end if;

  v_expected_documents := jsonb_array_length(coalesce(p_submission -> 'document_ids', '[]'::jsonb));
  if v_expected_documents < 2 then
    raise exception using errcode = '22023', message = 'kyc_documents_required';
  end if;

  select * into v_request
  from public.kyc_review_requests
  where status = 'pending'
    and ((p_subject_type = 'customer' and customer_id = p_subject_id)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id))
  for update;

  if found then
    update public.kyc_review_requests
    set submission_json = p_submission,
        submitted_by = p_submitted_by,
        submitted_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.kyc_review_requests (
      subject_type, customer_id, vendor_organization_id, current_tier,
      requested_tier, submission_json, submitted_by
    ) values (
      p_subject_type,
      case when p_subject_type = 'customer' then p_subject_id end,
      case when p_subject_type = 'vendor' then p_subject_id end,
      v_current_tier, p_requested_tier, p_submission, p_submitted_by
    ) returning * into v_request;
    v_created := true;
  end if;

  update public.kyc_documents
  set review_request_id = v_request.id,
      updated_at = now()
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

  select
    count(*) filter (where doc_type in ('national_id', 'voters_card', 'passport', 'drivers_license')),
    count(*) filter (where doc_type = 'selfie')
  into v_identity_count, v_selfie_count
  from public.kyc_documents
  where review_request_id = v_request.id;
  if v_identity_count < 1 or v_selfie_count < 1 then
    raise exception using errcode = '22023', message = 'kyc_identity_and_selfie_required';
  end if;

  if p_subject_type = 'customer' then
    update public.customers
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ),
        updated_at = now()
    where id = p_subject_id;
  else
    update public.vendor_organizations
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ),
        updated_at = now()
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

revoke all on function public.save_customer_kyc_basic_info(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_kyc_evidence_review(text, uuid, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_customer_kyc_basic_info(uuid, uuid, jsonb) to service_role;
grant execute on function public.submit_kyc_evidence_review(text, uuid, integer, uuid, jsonb) to service_role;
