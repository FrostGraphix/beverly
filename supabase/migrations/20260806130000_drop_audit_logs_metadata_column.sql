-- metadata was always byte-identical to detail (confirmed live) and nothing
-- anywhere reads it distinctly -- see 20260806120000's comment for the full
-- investigation. The deployed code (this same change set) no longer writes to
-- it. Drop it for good, same pattern as row_json's retirement.
alter table public.audit_logs drop column if exists metadata;
