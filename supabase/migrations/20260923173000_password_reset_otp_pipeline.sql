alter table public.password_reset_tokens
  add column if not exists token_kind text not null default 'legacy_reset',
  add column if not exists attempts integer not null default 0;

alter table public.password_reset_tokens
  drop constraint if exists password_reset_tokens_token_kind_check;

alter table public.password_reset_tokens
  add constraint password_reset_tokens_token_kind_check
  check (token_kind in ('legacy_reset', 'otp', 'reset_grant'));

alter table public.password_reset_tokens
  drop constraint if exists password_reset_tokens_attempts_check;

alter table public.password_reset_tokens
  add constraint password_reset_tokens_attempts_check
  check (attempts between 0 and 5);

create index if not exists idx_prt_active_otp
  on public.password_reset_tokens (lower(email), user_type, created_at desc)
  where token_kind = 'otp' and used_at is null;
