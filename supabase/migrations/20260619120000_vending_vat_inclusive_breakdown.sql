-- Store VAT-inclusive vending breakdowns.
-- amount_minor remains the gross customer/vendor payment.

alter table if exists public.purchase_orders
  add column if not exists energy_amount_minor bigint,
  add column if not exists vat_amount_minor bigint,
  add column if not exists vat_rate_basis_points integer;

do $$
begin
  if to_regclass('public.purchase_orders') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'purchase_orders_vat_amount_nonnegative'
        and conrelid = 'public.purchase_orders'::regclass
    ) then
      alter table public.purchase_orders
        add constraint purchase_orders_vat_amount_nonnegative
        check (vat_amount_minor is null or vat_amount_minor >= 0) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'purchase_orders_energy_amount_positive'
        and conrelid = 'public.purchase_orders'::regclass
    ) then
      alter table public.purchase_orders
        add constraint purchase_orders_energy_amount_positive
        check (energy_amount_minor is null or energy_amount_minor > 0) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'purchase_orders_vat_rate_range'
        and conrelid = 'public.purchase_orders'::regclass
    ) then
      alter table public.purchase_orders
        add constraint purchase_orders_vat_rate_range
        check (vat_rate_basis_points is null or vat_rate_basis_points between 0 and 10000) not valid;
    end if;
  end if;
end $$;

update public.purchase_orders
set
  vat_rate_basis_points = coalesce(vat_rate_basis_points, 750),
  energy_amount_minor = coalesce(energy_amount_minor, round((amount_minor::numeric * 10000) / 10750)::bigint),
  vat_amount_minor = coalesce(vat_amount_minor, amount_minor - round((amount_minor::numeric * 10000) / 10750)::bigint)
where amount_minor is not null
  and (energy_amount_minor is null or vat_amount_minor is null or vat_rate_basis_points is null);

create index if not exists purchase_orders_vat_created_idx
  on public.purchase_orders(created_at desc)
  where vat_amount_minor is not null;

notify pgrst, 'reload schema';
