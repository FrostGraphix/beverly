alter table public.users
    add column if not exists profile_picture_url text;
