-- Station-targeted announcements and wallet-admin staff delivery.

alter table public.admin_announcements
    add column if not exists station_ids text[] not null default '{}';

alter table public.admin_announcements
    drop constraint if exists admin_announcements_audience_check;

alter table public.admin_announcements
    add constraint admin_announcements_audience_check
    check (audience in ('customers', 'vendors', 'staff', 'system'));

alter table public.admin_announcement_deliveries
    drop constraint if exists admin_announcement_deliveries_recipient_type_check;

alter table public.admin_announcement_deliveries
    add constraint admin_announcement_deliveries_recipient_type_check
    check (recipient_type in ('customer', 'vendor', 'staff'));

notify pgrst, 'reload schema';
