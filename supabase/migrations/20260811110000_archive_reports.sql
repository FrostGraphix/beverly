-- Cold-storage archive index for raw meter readings.
--
-- Phase 1 removed dead indexes; Phase 2 will shorten the raw-readings retention window
-- so daily_meter_readings stops being the table that outgrows the free tier. This table
-- is what makes that safe: before a month of raw readings ages out of the hot window it
-- is exported to Supabase Storage as one gzipped CSV per (station, month), and a row is
-- written here describing that object. Storage is a SEPARATE free-tier quota (1 GB) from
-- the Postgres 500 MB limit, so archived history costs nothing against the constraint we
-- are actually fighting.
--
-- PARTITION GRAIN: (station_id, calendar month). This deliberately differs from
-- SparkMeter, whose pre-generated reports are per (site, DAY) -- verified live from their
-- /reports/list: filenames are {org}_{service_area}_{site}_{YYYYMMDD}_daily_report.csv.
-- They need day grain because Nova meters report on a 15-minute heartbeat (96 readings/
-- meter/day), which makes one site-day 7.06 MB and a site-month ~219 MB. Beverly ingests
-- ONE odometer reading per meter per day, so a station-month here is roughly
-- (meters in station) x 30 rows -- on the order of 1 MB raw, ~100 KB gzipped. Day-grain
-- files would be a few KB each and multiply object count ~30x for no benefit. Month grain
-- keeps a customer-history restore to a single small object, which is the property that
-- actually matters (a month-wide, all-station file would be ~70 MB at 20k meters).
--
-- This table is an INDEX, not a lock: it records what was archived, never what may be
-- deleted. Retention deletion stays entirely with pg_cron job 18. The archiver runs well
-- ahead of the deletion boundary (a closed month plus a grace period), so the two never
-- race -- an archive failure simply means a month is not yet archived, never that data is
-- deleted without a copy.

create table if not exists public.archive_reports (
  id              uuid primary key default gen_random_uuid(),
  station_id      text        not null,
  report_type     text        not null default 'readings',
  granularity     text        not null default 'monthly',
  -- period_start is always the first day of the covered month; period_end the last.
  -- covers_from/covers_to are the ACTUAL min/max reading_date present in the export,
  -- which can be narrower than the month (a station that came online mid-month).
  period_start    date        not null,
  period_end      date        not null,
  covers_from     date,
  covers_to       date,
  bucket          text        not null,
  object_path     text        not null,
  row_count       integer     not null default 0,
  byte_size       bigint      not null default 0,
  content_sha256  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint archive_reports_type_check
    check (report_type in ('readings')),
  constraint archive_reports_granularity_check
    check (granularity in ('monthly')),
  -- Re-running the archiver for an already-exported month must update in place rather
  -- than duplicate. This is the upsert conflict target the service relies on.
  constraint archive_reports_partition_key
    unique (station_id, report_type, granularity, period_start)
);

-- The reports list is browsed newest-first and filtered by station; the summary
-- endpoint aggregates over the same shape.
create index if not exists archive_reports_period_idx
  on public.archive_reports (period_start desc, station_id);

comment on table public.archive_reports is
  'Index of raw-reading months exported to Supabase Storage. One row per (station, month). Written by backend/src/services/reading-archive-service.js; read by the Archive Reports page.';

alter table public.archive_reports enable row level security;

-- Reads go through the API layer, which already gates by role. Any signed-in user that
-- reaches those routes may see the catalogue; the objects themselves are in a private
-- bucket and only reachable via short-lived signed URLs minted server-side.
drop policy if exists archive_reports_read on public.archive_reports;
create policy archive_reports_read
  on public.archive_reports
  for select
  to authenticated
  using (true);

-- Writes are service-role only (the archiver). service_role bypasses RLS, so no policy
-- is granted to any other role -- the absence is the control.

-- ── Storage bucket ──────────────────────────────────────────────────────────────
-- Declared here rather than left to runtime creation, matching the convention in
-- 20260505125000_storage_buckets.sql. reading-archive-service.js still calls
-- ensureStorageBuckets() defensively, but the bucket and its storage.objects policy
-- are provisioned by migration so a fresh environment is correct before any code runs.
--
-- Private (public = false): archives are only reachable through short-lived signed URLs
-- minted server-side by createSignedStorageUrl(). 50 MB matches the other buckets and is
-- far above the ~1 MB a station-month gzips to.
insert into storage.buckets (id, name, public, file_size_limit)
values ('archives', 'archives', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Service role manages archives" on storage.objects;
create policy "Service role manages archives"
on storage.objects
for all
to service_role
using (bucket_id = 'archives')
with check (bucket_id = 'archives');

-- Keep updated_at honest on re-archive.
create or replace function public.set_archive_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_archive_reports_updated_at on public.archive_reports;
create trigger set_archive_reports_updated_at
  before update on public.archive_reports
  for each row execute function public.set_archive_reports_updated_at();
