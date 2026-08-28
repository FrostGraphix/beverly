-- Idempotent staff operational notifications.

alter table public.notifications
    add column if not exists dedupe_key text;

alter table public.notifications
    drop constraint if exists notifications_recipient_dedupe_key;

alter table public.notifications
    add constraint notifications_recipient_dedupe_key
    unique (recipient_type, recipient_id, dedupe_key);

create index if not exists notifications_staff_unread_idx
    on public.notifications(recipient_id, created_at desc)
    where recipient_type = 'staff' and read = false;

notify pgrst, 'reload schema';
