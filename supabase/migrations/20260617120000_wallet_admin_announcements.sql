-- Wallet admin announcements and mixed recipient notification delivery.

create table if not exists public.admin_announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text not null,
    audience text not null check (audience in ('customers', 'vendors', 'system')),
    target_mode text not null default 'selected' check (target_mode in ('selected', 'all')),
    channel text not null default 'in_app',
    created_by_staff_id uuid,
    recipient_count integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.notifications
    alter column customer_id drop not null,
    add column if not exists recipient_type text not null default 'customer',
    add column if not exists recipient_id uuid,
    add column if not exists vendor_organization_id uuid references public.vendor_organizations(id) on delete cascade,
    add column if not exists announcement_id uuid references public.admin_announcements(id) on delete set null;

update public.notifications
set recipient_type = coalesce(recipient_type, 'customer'),
    recipient_id = coalesce(recipient_id, customer_id)
where recipient_id is null
  and customer_id is not null;

alter table public.notifications
    add constraint notifications_recipient_type_chk
    check (recipient_type in ('customer', 'vendor'));

create table if not exists public.admin_announcement_deliveries (
    id uuid primary key default gen_random_uuid(),
    announcement_id uuid not null references public.admin_announcements(id) on delete cascade,
    recipient_type text not null check (recipient_type in ('customer', 'vendor')),
    recipient_id uuid not null,
    customer_id uuid references public.customers(id) on delete cascade,
    vendor_organization_id uuid references public.vendor_organizations(id) on delete cascade,
    notification_id uuid references public.notifications(id) on delete set null,
    status text not null default 'delivered',
    created_at timestamptz not null default now()
);

create index if not exists admin_announcements_created_at_idx
    on public.admin_announcements(created_at desc);

create index if not exists admin_announcement_deliveries_announcement_idx
    on public.admin_announcement_deliveries(announcement_id, created_at desc);

create index if not exists notifications_recipient_idx
    on public.notifications(recipient_type, recipient_id, created_at desc);

create index if not exists notifications_vendor_unread_idx
    on public.notifications(vendor_organization_id, read, created_at desc)
    where recipient_type = 'vendor';

notify pgrst, 'reload schema';
