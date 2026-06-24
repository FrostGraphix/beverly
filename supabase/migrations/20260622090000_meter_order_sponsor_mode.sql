alter table public.meter_purchase_orders
  add column if not exists sponsor_mode text not null default 'manual_paid';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meter_purchase_orders_sponsor_mode_check'
  ) then
    alter table public.meter_purchase_orders
      add constraint meter_purchase_orders_sponsor_mode_check
      check (sponsor_mode in ('manual_paid', 'vendor_wallet'));
  end if;
end $$;

update public.meter_purchase_orders
set sponsor_mode = 'vendor_wallet'
where wallet_id is not null
  and sponsor_mode = 'manual_paid';

create index if not exists meter_purchase_orders_sponsor_mode_idx
  on public.meter_purchase_orders (sponsor_mode, created_at desc);
