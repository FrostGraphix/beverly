-- Exact per-site purchase reporting for Beverly Wallet BI exports.

create index if not exists purchase_orders_station_actor_created_idx
  on public.purchase_orders (station_id, actor_type, actor_id, created_at desc);

create index if not exists purchase_orders_station_customer_created_idx
  on public.purchase_orders (station_id, customer_id, created_at desc)
  where customer_id is not null;

create or replace function public.wallet_report_purchase_breakdown(
  p_since timestamptz,
  p_until timestamptz,
  p_group_by text default 'site',
  p_audience text default 'all',
  p_site_id text default null,
  p_station_ids text[] default null
)
returns table (
  site_id text,
  group_type text,
  entity_id text,
  entity_name text,
  purchase_count bigint,
  delivered_count bigint,
  failed_count bigint,
  customer_count bigint,
  direct_purchase_count bigint,
  vendor_purchase_count bigint,
  revenue_minor bigint,
  energy_revenue_minor bigint,
  vat_minor bigint,
  units_kwh numeric,
  average_purchase_minor bigint,
  success_rate numeric,
  first_purchase_at timestamptz,
  last_purchase_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      upper(coalesce(nullif(po.station_id, ''), 'UNKNOWN')) as site_id,
      po.actor_type,
      po.actor_id::text as actor_id,
      coalesce(nullif(po.customer_id, ''),
        case when po.actor_type = 'customer' then po.actor_id::text end) as customer_id,
      po.customer_name,
      po.status,
      po.amount_minor,
      coalesce(po.energy_amount_minor, po.amount_minor) as energy_amount_minor,
      coalesce(po.vat_amount_minor, 0) as vat_amount_minor,
      coalesce(po.units_kwh, 0) as units_kwh,
      po.created_at
    from public.purchase_orders po
    where po.created_at >= p_since
      and po.created_at <= p_until
      and (p_audience = 'all' or po.actor_type = p_audience)
      and (p_site_id is null or upper(po.station_id) = upper(p_site_id))
      and (p_station_ids is null or upper(po.station_id) = any(p_station_ids))
      and (p_group_by <> 'vendor' or po.actor_type = 'vendor')
      and (p_group_by <> 'customer' or coalesce(nullif(po.customer_id, ''),
        case when po.actor_type = 'customer' then po.actor_id::text end) is not null)
  ), grouped as (
    select
      f.site_id,
      p_group_by as group_type,
      case
        when p_group_by = 'vendor' then f.actor_id
        when p_group_by = 'customer' then f.customer_id
        else f.site_id
      end as entity_id,
      max(f.customer_name) filter (where p_group_by = 'customer') as recorded_customer_name,
      count(*) as purchase_count,
      count(*) filter (where f.status = 'delivered') as delivered_count,
      count(*) filter (where f.status = 'failed') as failed_count,
      count(distinct f.customer_id) filter (where f.customer_id is not null) as customer_count,
      count(*) filter (where f.actor_type = 'customer') as direct_purchase_count,
      count(*) filter (where f.actor_type = 'vendor') as vendor_purchase_count,
      coalesce(sum(f.amount_minor) filter (where f.status = 'delivered'), 0)::bigint as revenue_minor,
      coalesce(sum(f.energy_amount_minor) filter (where f.status = 'delivered'), 0)::bigint as energy_revenue_minor,
      coalesce(sum(f.vat_amount_minor) filter (where f.status = 'delivered'), 0)::bigint as vat_minor,
      coalesce(sum(f.units_kwh) filter (where f.status = 'delivered'), 0) as units_kwh,
      min(f.created_at) as first_purchase_at,
      max(f.created_at) as last_purchase_at
    from filtered f
    group by
      f.site_id,
      case
        when p_group_by = 'vendor' then f.actor_id
        when p_group_by = 'customer' then f.customer_id
        else f.site_id
      end
  )
  select
    g.site_id,
    g.group_type,
    g.entity_id,
    case
      when g.group_type = 'vendor' then coalesce(vo.trading_name, vo.legal_name, g.entity_id)
      when g.group_type = 'customer' then coalesce(c.full_name, g.recorded_customer_name, g.entity_id)
      else g.site_id
    end as entity_name,
    g.purchase_count,
    g.delivered_count,
    g.failed_count,
    g.customer_count,
    g.direct_purchase_count,
    g.vendor_purchase_count,
    g.revenue_minor,
    g.energy_revenue_minor,
    g.vat_minor,
    g.units_kwh,
    case when g.delivered_count > 0
      then round(g.revenue_minor::numeric / g.delivered_count)::bigint else 0 end,
    case when (g.delivered_count + g.failed_count) > 0
      then round((g.delivered_count::numeric * 10000) /
        (g.delivered_count + g.failed_count)) / 100 else 0 end,
    g.first_purchase_at,
    g.last_purchase_at
  from grouped g
  left join public.vendor_organizations vo
    on g.group_type = 'vendor' and vo.id::text = g.entity_id
  left join public.customers c
    on g.group_type = 'customer' and c.id::text = g.entity_id
  order by g.revenue_minor desc, g.site_id, g.entity_id;
$$;

revoke all on function public.wallet_report_purchase_breakdown(
  timestamptz, timestamptz, text, text, text, text[]
) from public, anon, authenticated;

grant execute on function public.wallet_report_purchase_breakdown(
  timestamptz, timestamptz, text, text, text, text[]
) to service_role;
