-- Extend customer OTP challenges to cover account recovery and durable delivery metadata.

alter table public.customer_otp_challenges
  drop constraint if exists customer_otp_challenges_purpose_check;

alter table public.customer_otp_challenges
  add constraint customer_otp_challenges_purpose_check
  check (purpose in ('signup', 'login', 'recovery'));

alter table public.customer_otp_challenges
  add column if not exists consumed_at timestamptz,
  add column if not exists last_sent_at timestamptz not null default now(),
  add column if not exists send_count integer not null default 1 check (send_count >= 1),
  add column if not exists delivery_provider text,
  add column if not exists delivery_reference text;

create index if not exists customer_otp_challenges_active_idx
  on public.customer_otp_challenges (phone, purpose, created_at desc)
  where consumed_at is null;

notify pgrst, 'reload schema';
