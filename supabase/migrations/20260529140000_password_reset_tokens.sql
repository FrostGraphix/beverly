-- Password-reset tokens shared across customer (email) and vendor users.
-- Raw token is NEVER stored — only the SHA-256 hex hash.
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

create index if not exists idx_prt_auth_user_id  on public.password_reset_tokens (auth_user_id);
create index if not exists idx_prt_token_hash    on public.password_reset_tokens (token_hash);
create index if not exists idx_prt_expires_at    on public.password_reset_tokens (expires_at);

-- Service-role only — no RLS needed (backend uses adminClient).
alter table public.password_reset_tokens enable row level security;
