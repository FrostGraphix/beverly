-- Preserve the actual vending operator on every purchase and receipt.

alter table if exists public.purchase_orders
  add column if not exists vended_by text;

create index if not exists purchase_orders_created_by_created_idx
  on public.purchase_orders (created_by, created_at desc)
  where created_by is not null;

update public.purchase_orders po
set vended_by = concat_ws(
  ' — ',
  (select vu.full_name from public.vendor_users vu
    where vu.auth_user_id = po.created_by or vu.id = po.created_by limit 1),
  (select coalesce(vo.trading_name, vo.legal_name) from public.vendor_organizations vo
    where vo.id = po.actor_id limit 1)
) || case when coalesce(
  po.station_id,
  (select vo.station_id from public.vendor_organizations vo where vo.id = po.actor_id limit 1)
) is not null then ' (' || coalesce(
  po.station_id,
  (select vo.station_id from public.vendor_organizations vo where vo.id = po.actor_id limit 1)
) || ')' else '' end
where po.actor_type = 'vendor'
  and nullif(po.vended_by, '') is null;

update public.purchase_orders po
set vended_by = 'Customer Self-Vend — ' || coalesce(c.full_name, po.customer_name, po.actor_id::text)
from public.customers c
where po.actor_type = 'customer'
  and c.id = po.actor_id
  and nullif(po.vended_by, '') is null;

notify pgrst, 'reload schema';
