-- Malware scanning is a file-safety signal, not a KYC identity decision.
-- Preserve scan outcomes so staff can review unscanned evidence explicitly.

alter table public.kyc_documents
  add column if not exists security_scan_status text not null default 'pending'
    check (security_scan_status in ('pending', 'clean', 'unscanned')),
  add column if not exists security_scan_reason text;

update public.kyc_documents
set security_scan_status = 'unscanned',
    security_scan_reason = 'scan_status_not_recorded'
where security_scan_status = 'pending'
  and (uploaded_at is not null or review_request_id is not null);
