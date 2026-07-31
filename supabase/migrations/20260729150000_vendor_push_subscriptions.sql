create table if not exists public.vendor_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    vendor_organization_id uuid not null references public.vendor_organizations(id) on delete cascade,
    vendor_user_id uuid not null references public.vendor_users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists vendor_push_subscriptions_org_idx
    on public.vendor_push_subscriptions(vendor_organization_id);

alter table public.vendor_push_subscriptions enable row level security;

revoke all on table public.vendor_push_subscriptions from anon, authenticated;
notify pgrst, 'reload schema';
