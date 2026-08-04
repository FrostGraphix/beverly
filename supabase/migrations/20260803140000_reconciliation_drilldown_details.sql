-- Reconciliation drill-down: store the specific orphaned transaction
-- references behind a mismatch, so admins can see exactly which payments
-- are unmatched instead of only the aggregate delta.
alter table reconciliation_runs
  add column if not exists mismatched_references jsonb;

comment on column reconciliation_runs.mismatched_references is
  'JSON { db_only: string[], gateway_only: string[] } of gateway_reference values present on only one side of the reconciliation. Null when not computed (status=ok with no gateway data, or failed run).';
