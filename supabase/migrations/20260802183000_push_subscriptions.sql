create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    actor_type text not null check (actor_type in ('customer', 'vendor', 'staff')),
    actor_id uuid not null,
    portal text not null check (portal in ('customer', 'vendor', 'admin', 'crm')),
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_actor_idx
    on public.push_subscriptions(actor_type, actor_id, portal);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.notifications
    drop constraint if exists notifications_recipient_type_chk;

alter table public.notifications
    add constraint notifications_recipient_type_chk
    check (recipient_type in ('customer', 'vendor', 'staff'));

notify pgrst, 'reload schema';
