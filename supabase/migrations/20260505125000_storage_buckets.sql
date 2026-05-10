insert into storage.buckets (id, name, public, file_size_limit)
values
  ('uploads', 'uploads', false, 52428800),
  ('imports', 'imports', false, 52428800),
  ('exports', 'exports', false, 52428800),
  ('receipts', 'receipts', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Service role manages uploads" on storage.objects;
create policy "Service role manages uploads"
on storage.objects
for all
to service_role
using (bucket_id = 'uploads')
with check (bucket_id = 'uploads');

drop policy if exists "Service role manages imports" on storage.objects;
create policy "Service role manages imports"
on storage.objects
for all
to service_role
using (bucket_id = 'imports')
with check (bucket_id = 'imports');

drop policy if exists "Service role manages exports" on storage.objects;
create policy "Service role manages exports"
on storage.objects
for all
to service_role
using (bucket_id = 'exports')
with check (bucket_id = 'exports');

drop policy if exists "Service role manages receipts" on storage.objects;
create policy "Service role manages receipts"
on storage.objects
for all
to service_role
using (bucket_id = 'receipts')
with check (bucket_id = 'receipts');
