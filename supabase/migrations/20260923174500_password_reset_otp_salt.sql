alter table public.password_reset_tokens
  add column if not exists otp_salt text;
