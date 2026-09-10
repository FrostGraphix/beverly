-- Preserve legacy Tier 1 access while aligning its Tier 0 profile marker.
update public.customers
set kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
      'basic_info',
      coalesce(kyc_data -> 'tier1', '{}'::jsonb)
        || jsonb_build_object(
          'full_name', full_name,
          'completed_at', coalesce(kyc_data -> 'tier1' ->> 'verified_at', updated_at::text)
        )
    ),
    updated_at = now()
where kyc_tier >= 1
  and (kyc_data -> 'basic_info' ->> 'completed_at') is null;

-- Tier 2 adds address evidence to the identity and selfie requirements.
create or replace function public.submit_kyc_enhanced_review(
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
  v_request public.kyc_review_requests;
begin
  if p_requested_tier <> 2 then
    raise exception using errcode = '22023', message = 'enhanced_review_requires_tier_2';
  end if;

  if not exists (
    select 1
    from public.kyc_documents d
    where d.id in (
      select value::uuid
      from jsonb_array_elements_text(coalesce(p_submission -> 'document_ids', '[]'::jsonb))
    )
      and d.kyc_tier = 2
      and d.uploaded_at is not null
      and d.doc_type in ('utility_bill', 'bank_statement')
      and ((p_subject_type = 'customer' and d.customer_id = p_subject_id and d.vendor_organization_id is null)
        or (p_subject_type = 'vendor' and d.vendor_organization_id = p_subject_id and d.customer_id is null))
  ) then
    raise exception using errcode = '22023', message = 'kyc_address_document_required';
  end if;

  v_request := public.submit_kyc_evidence_review(
    p_subject_type,
    p_subject_id,
    p_requested_tier,
    p_submitted_by,
    p_submission
  );
  return v_request;
end;
$$;

revoke all on function public.submit_kyc_enhanced_review(text, uuid, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_kyc_enhanced_review(text, uuid, integer, uuid, jsonb) to service_role;
