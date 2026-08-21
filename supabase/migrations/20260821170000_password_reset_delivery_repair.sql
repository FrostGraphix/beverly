-- Repairs password-reset storage on environments that skipped the original
-- password_reset_tokens migration.
create table if not exists public.password_reset_tokens (
    id              uuid primary key default gen_random_uuid(),
    auth_user_id    uuid not null,
    token_hash      text not null unique,
    email           text not null,
    user_type       text not null check (user_type in ('customer', 'vendor_user')),
    expires_at      timestamptz not null,
    used_at         timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_prt_auth_user_id on public.password_reset_tokens (auth_user_id);
create index if not exists idx_prt_token_hash on public.password_reset_tokens (token_hash);
create index if not exists idx_prt_expires_at on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;
alter table public.password_reset_tokens force row level security;

drop policy if exists "prt service role all" on public.password_reset_tokens;
create policy "prt service role all"
    on public.password_reset_tokens for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
