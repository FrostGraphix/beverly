insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oem-logos', 'oem-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role manages oem logos" on storage.objects;
create policy "Service role manages oem logos"
on storage.objects
for all
to service_role
using (bucket_id = 'oem-logos')
with check (bucket_id = 'oem-logos');
