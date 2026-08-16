alter table public.meter_purchase_orders
  add column if not exists source_channel text not null default 'customer_portal',
  add column if not exists created_by_actor_type text not null default 'customer',
  add column if not exists created_by_actor_id uuid,
  add column if not exists vendor_organization_id uuid references public.vendor_organizations(id) on delete set null,
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null,
  add column if not exists ledger_entry_id uuid references public.wallet_ledger_entries(id) on delete set null,
  add column if not exists customer_name_snapshot text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meter_purchase_orders_source_channel_check'
  ) then
    alter table public.meter_purchase_orders
      add constraint meter_purchase_orders_source_channel_check
      check (source_channel in ('customer_portal', 'vendor_portal', 'admin_portal'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'meter_purchase_orders_created_by_actor_type_check'
  ) then
    alter table public.meter_purchase_orders
      add constraint meter_purchase_orders_created_by_actor_type_check
      check (created_by_actor_type in ('customer', 'vendor_user', 'staff'));
  end if;
end $$;

update public.meter_purchase_orders mpo
set customer_name_snapshot = c.full_name
from public.customers c
where mpo.customer_id = c.id
  and mpo.customer_name_snapshot is null;

create index if not exists meter_purchase_orders_vendor_idx
  on public.meter_purchase_orders (vendor_organization_id, created_at desc);

create index if not exists meter_purchase_orders_source_idx
  on public.meter_purchase_orders (source_channel, created_at desc);
