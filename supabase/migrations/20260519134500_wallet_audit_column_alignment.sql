-- Align older wallet_audit_log deployments with the backend audit writer.

alter table public.wallet_audit_log
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists ip text,
  add column if not exists user_agent text,
  add column if not exists correlation_id text;

update public.wallet_audit_log
set before = before_json
where before is null
  and before_json is not null;

update public.wallet_audit_log
set after = after_json
where after is null
  and after_json is not null;

update public.wallet_audit_log
set metadata = metadata_json
where metadata = '{}'::jsonb
  and metadata_json is not null;
