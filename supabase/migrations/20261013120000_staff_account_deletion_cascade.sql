-- Access/profile rows cascade with a deleted auth identity. Audit rows remain:
-- wallet_audit_log intentionally has no foreign keys to auth.users.
begin;
alter table public.users drop constraint if exists users_auth_user_id_fkey;
alter table public.users add constraint users_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade;
alter table public.oem_actor_installation_access drop constraint if exists oem_actor_installation_access_auth_user_id_fkey;
alter table public.oem_actor_installation_access add constraint oem_actor_installation_access_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade;
alter table public.oem_tenant_memberships drop constraint if exists oem_tenant_memberships_auth_user_id_fkey;
alter table public.oem_tenant_memberships add constraint oem_tenant_memberships_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade;
-- Preserve completed financial-operational records, but remove a deleted staff
-- identity from their historical actor fields.
alter table public.meter_purchase_orders drop constraint if exists meter_purchase_orders_cancelled_by_fkey;
alter table public.meter_purchase_orders add constraint meter_purchase_orders_cancelled_by_fkey foreign key (cancelled_by) references auth.users(id) on delete set null;
alter table public.meter_purchase_orders drop constraint if exists meter_purchase_orders_rejected_by_fkey;
alter table public.meter_purchase_orders add constraint meter_purchase_orders_rejected_by_fkey foreign key (rejected_by) references auth.users(id) on delete set null;
commit;
