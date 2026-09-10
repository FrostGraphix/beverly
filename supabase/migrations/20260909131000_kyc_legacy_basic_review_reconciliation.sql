-- Reclassify legacy, evidence-free Tier 1 submissions as Tier 0 basics.
-- Evidence-backed Tier 1 requests remain untouched.

with legacy_pending as (
  select r.id, r.customer_id, r.submission_json, r.submitted_at
  from public.kyc_review_requests r
  where r.subject_type = 'customer'
    and r.current_tier = 0
    and r.requested_tier = 1
    and r.status = 'pending'
    and not exists (
      select 1 from public.kyc_documents d where d.review_request_id = r.id
    )
), updated_customers as (
  update public.customers c
  set full_name = coalesce(nullif(trim(l.submission_json ->> 'full_name'), ''), c.full_name),
      kyc_status = 'unverified',
      kyc_data = (coalesce(c.kyc_data, '{}'::jsonb) - 'pending') || jsonb_build_object(
        'basic_info', l.submission_json || jsonb_build_object('completed_at', l.submitted_at)
      ),
      updated_at = now()
  from legacy_pending l
  where c.id = l.customer_id
  returning c.id
)
update public.kyc_review_requests r
set status = 'withdrawn',
    reviewer_note = 'Reclassified as approval-free Tier 0 basic information.',
    updated_at = now()
where r.id in (select id from legacy_pending);
