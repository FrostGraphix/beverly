-- Staff users receive operational notifications through the shared inbox.
alter table public.notifications
    drop constraint if exists notifications_recipient_type_chk;

alter table public.notifications
    add constraint notifications_recipient_type_chk
    check (recipient_type in ('customer', 'vendor', 'admin'));

create index if not exists notifications_admin_unread_idx
    on public.notifications(recipient_id, read, created_at desc)
    where recipient_type = 'admin';

notify pgrst, 'reload schema';
