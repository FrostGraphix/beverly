-- Dispute evidence attachments: lets a customer attach a photo (e.g. meter
-- error code) or PDF when raising or following up on a dispute. Private
-- bucket — reads only ever happen via short-lived signed URLs issued by the
-- backend after verifying dispute ownership.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallet-dispute-evidence', 'wallet-dispute-evidence', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role manages dispute evidence" on storage.objects;
create policy "Service role manages dispute evidence"
on storage.objects
for all
to service_role
using (bucket_id = 'wallet-dispute-evidence')
with check (bucket_id = 'wallet-dispute-evidence');

alter table disputes
  add column if not exists evidence_paths jsonb not null default '[]'::jsonb;

comment on column disputes.evidence_paths is
  'JSON array of storage object paths in the wallet-dispute-evidence bucket. Read only via backend-issued signed URLs.';
