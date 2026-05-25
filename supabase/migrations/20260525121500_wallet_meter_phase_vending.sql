-- Carry meter phase through customer linking, vending, receipts, and ops review.
-- Existing rows remain readable; new rows should always write meter_type.

alter table if exists public.customer_meters
  add column if not exists meter_type text;

alter table if exists public.account_bindings
  add column if not exists meter_type text;

alter table if exists public.purchase_orders
  add column if not exists meter_type text;

do $$
declare
  customer_meters_reg regclass := to_regclass('public.customer_meters');
  account_bindings_reg regclass := to_regclass('public.account_bindings');
  purchase_orders_reg regclass := to_regclass('public.purchase_orders');
begin
  if customer_meters_reg is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'customer_meters_meter_type_check'
         and conrelid = customer_meters_reg
     ) then
    alter table public.customer_meters
      add constraint customer_meters_meter_type_check
      check (meter_type is null or meter_type in ('single_phase', 'three_phase'));
  end if;

  if account_bindings_reg is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'account_bindings_meter_type_check'
         and conrelid = account_bindings_reg
     ) then
    alter table public.account_bindings
      add constraint account_bindings_meter_type_check
      check (meter_type is null or meter_type in ('single_phase', 'three_phase'));
  end if;

  if purchase_orders_reg is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'purchase_orders_meter_type_check'
         and conrelid = purchase_orders_reg
     ) then
    alter table public.purchase_orders
      add constraint purchase_orders_meter_type_check
      check (meter_type is null or meter_type in ('single_phase', 'three_phase'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.customer_meters') is not null
     and to_regclass('public.account_bindings') is not null then
    update public.customer_meters cm
    set meter_type = ab.meter_type
    from public.account_bindings ab
    where cm.meter_type is null
      and ab.meter_type is not null
      and ab.meter_id = cm.meter_id;
  end if;

  if to_regclass('public.customer_meters') is not null
     and to_regclass('public.purchase_orders') is not null then
    update public.purchase_orders po
    set meter_type = cm.meter_type
    from public.customer_meters cm
    where po.meter_type is null
      and cm.meter_type is not null
      and cm.customer_id = po.customer_id
      and cm.meter_id = po.meter_id;
  end if;

  if to_regclass('public.account_bindings') is not null
     and to_regclass('public.purchase_orders') is not null then
    update public.purchase_orders po
    set meter_type = ab.meter_type
    from public.account_bindings ab
    where po.meter_type is null
      and ab.meter_type is not null
      and ab.meter_id = po.meter_id;
  end if;
end $$;

do $$
begin
  if to_regclass('public.customer_meters') is not null then
    create index if not exists customer_meters_meter_type_idx
      on public.customer_meters(meter_type);
  end if;

  if to_regclass('public.account_bindings') is not null then
    create index if not exists account_bindings_meter_type_idx
      on public.account_bindings(meter_type);
  end if;

  if to_regclass('public.purchase_orders') is not null then
    create index if not exists purchase_orders_meter_type_created_idx
      on public.purchase_orders(meter_type, created_at desc);
  end if;
end $$;

notify pgrst, 'reload schema';
