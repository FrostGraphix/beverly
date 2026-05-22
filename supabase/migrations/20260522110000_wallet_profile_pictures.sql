alter table public.vendor_users
    add column if not exists profile_picture_url text;

alter table public.customers
    add column if not exists profile_picture_url text;
