-- Durable Resend delivery state for wallet announcements.

alter table public.admin_announcements
    add column if not exists request_key text,
    add column if not exists email_recipient_count integer not null default 0,
    add column if not exists email_sent_count integer not null default 0,
    add column if not exists email_failed_count integer not null default 0,
    add column if not exists delivery_status text not null default 'unknown';

alter table public.admin_announcement_deliveries
    add column if not exists email text,
    add column if not exists email_message_id text,
    add column if not exists email_status text not null default 'untracked',
    add column if not exists email_delivered_at timestamptz,
    add column if not exists email_failed_at timestamptz;

alter table public.admin_announcements
    drop constraint if exists admin_announcements_delivery_status_chk;

alter table public.admin_announcements
    add constraint admin_announcements_delivery_status_chk
    check (delivery_status in ('unknown', 'sending', 'sent', 'partial', 'failed'));

create unique index if not exists admin_announcements_request_key_uidx
    on public.admin_announcements(request_key)
    where request_key is not null;

create unique index if not exists admin_announcement_delivery_recipient_uidx
    on public.admin_announcement_deliveries(announcement_id, recipient_type, recipient_id);

create index if not exists admin_announcement_delivery_email_message_idx
    on public.admin_announcement_deliveries(email_message_id)
    where email_message_id is not null;

notify pgrst, 'reload schema';
