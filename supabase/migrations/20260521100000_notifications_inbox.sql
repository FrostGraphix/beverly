-- Notifications inbox: one row per in-app notification per customer.
-- SMS and email are fire-and-forget (logged in audit_log); only in-app
-- notifications need a persistent inbox row.
--
-- Apply via Supabase SQL editor:
-- https://supabase.com/dashboard/project/qpoipyqgrjsjdvfqmxok/sql

create table if not exists public.notifications (
    id          uuid        default gen_random_uuid() primary key,
    customer_id uuid        not null references public.customers(id) on delete cascade,
    type        text        not null,  -- token_purchased | wallet_funded | kyc_update | dispute_update | low_balance | payment_failed | meter_order_update
    title       text        not null,
    body        text        not null,
    metadata    jsonb       not null default '{}',
    read        boolean     not null default false,
    created_at  timestamptz not null default now()
);

alter table public.notifications
    add column if not exists customer_id uuid references public.customers(id) on delete cascade,
    add column if not exists type text,
    add column if not exists body text,
    add column if not exists metadata jsonb not null default '{}';

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'user_id'
    ) then
        update public.notifications
        set customer_id = user_id
        where customer_id is null
          and user_id is not null;
    end if;
end $$;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'category'
    ) then
        update public.notifications
        set type = category
        where type is null
          and category is not null;
    end if;
end $$;

alter table public.notifications
    alter column type set default 'general';

update public.notifications
set type = 'general'
where type is null;

alter table public.notifications
    alter column type set not null;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'message'
    ) then
        update public.notifications
        set body = message
        where body is null
          and message is not null;
    end if;
end $$;

update public.notifications
set body = title
where body is null;

alter table public.notifications
    alter column body set not null;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'payload'
    ) then
        update public.notifications
        set metadata = payload
        where metadata = '{}'::jsonb
          and payload is not null;
    end if;
end $$;

create index if not exists notifications_customer_unread_idx
    on public.notifications(customer_id, created_at desc);

create index if not exists notifications_unread_flag_idx
    on public.notifications(customer_id, read)
    where read = false;

-- Ensure notification_preferences column exists on customers
-- (safe no-op if already present from a previous migration)
alter table public.customers
    add column if not exists notification_preferences jsonb;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
