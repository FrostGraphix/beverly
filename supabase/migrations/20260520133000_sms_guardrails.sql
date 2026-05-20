alter type public.wallet_security_event_type add value if not exists 'sms_allowed';
alter type public.wallet_security_event_type add value if not exists 'sms_blocked';

create index if not exists wallet_audit_log_action_target_created_idx
  on public.wallet_audit_log(action, target_id, created_at desc);
