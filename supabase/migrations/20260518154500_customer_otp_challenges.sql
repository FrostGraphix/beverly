-- Stores short-lived customer OTP challenges for signup, login, and Verify-backed SMS flows.
create table if not exists public.customer_otp_challenges (
    id uuid primary key default gen_random_uuid(),
    phone text not null,
    otp_hash text not null,
    purpose text not null check (purpose in ('signup', 'login')),
    metadata jsonb not null default '{}'::jsonb,
    attempts integer not null default 0 check (attempts >= 0),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists customer_otp_challenges_phone_created_idx
    on public.customer_otp_challenges (phone, created_at desc);

create index if not exists customer_otp_challenges_expires_idx
    on public.customer_otp_challenges (expires_at);

alter table public.customer_otp_challenges enable row level security;

drop policy if exists "wallet service role manages customer otp challenges"
    on public.customer_otp_challenges;

create policy "wallet service role manages customer otp challenges"
    on public.customer_otp_challenges
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
