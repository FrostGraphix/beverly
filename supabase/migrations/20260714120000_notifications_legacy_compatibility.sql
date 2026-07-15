-- Canonical notifications use body. Older deployments also retain message.
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'message'
    ) then
        update public.notifications
        set message = coalesce(message, body, title, '')
        where message is null;

        alter table public.notifications
            alter column message drop not null;
    end if;
end $$;

notify pgrst, 'reload schema';
