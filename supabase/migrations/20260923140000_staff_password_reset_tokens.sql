alter table public.password_reset_tokens drop constraint if exists password_reset_tokens_user_type_check;
alter table public.password_reset_tokens
  add constraint password_reset_tokens_user_type_check
  check (user_type in ('customer', 'vendor_user', 'staff'));
