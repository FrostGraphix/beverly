-- Announcement data is private to recipients and service workflows.

alter table public.admin_announcements enable row level security;
alter table public.admin_announcements force row level security;
alter table public.admin_announcement_deliveries enable row level security;
alter table public.admin_announcement_deliveries force row level security;

drop policy if exists "service role manages announcements" on public.admin_announcements;
create policy "service role manages announcements"
  on public.admin_announcements for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages announcement deliveries" on public.admin_announcement_deliveries;
create policy "service role manages announcement deliveries"
  on public.admin_announcement_deliveries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "customers read own announcement deliveries" on public.admin_announcement_deliveries;
create policy "customers read own announcement deliveries"
  on public.admin_announcement_deliveries for select
  using (
    recipient_type = 'customer'
    and customer_id in (select id from public.customers where auth_user_id = auth.uid())
  );

drop policy if exists "vendors read own announcement deliveries" on public.admin_announcement_deliveries;
create policy "vendors read own announcement deliveries"
  on public.admin_announcement_deliveries for select
  using (
    recipient_type = 'vendor'
    and vendor_organization_id in (
      select vendor_organization_id from public.vendor_users where auth_user_id = auth.uid()
    )
  );
