-- Remove the superseded review-submission entry point.
drop function if exists public.submit_kyc_tier_review(text, uuid, integer, uuid, jsonb);

-- Reassert least privilege for active KYC entry points.
revoke all on function public.submit_kyc_evidence_review(text, uuid, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_kyc_evidence_review(text, uuid, integer, uuid, jsonb)
  to service_role;

revoke all on function public.submit_kyc_enhanced_review(text, uuid, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_kyc_enhanced_review(text, uuid, integer, uuid, jsonb)
  to service_role;

revoke all on function public.review_kyc_tier_request(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_kyc_tier_request(uuid, uuid, text, text)
  to service_role;
