alter table if exists public.vendor_applications
  drop constraint if exists vendor_applications_status_check;

alter table if exists public.vendor_applications
  add constraint vendor_applications_status_check
  check (status in ('submitted', 'contacted', 'converted', 'rejected'));

create index if not exists vendor_applications_review_queue_idx
  on public.vendor_applications(status, created_at asc);

notify pgrst, 'reload schema';
