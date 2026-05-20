-- Runtime tables used by the wallet vendor funding and vending API.
-- Kept idempotent because some environments have partial wallet migrations applied.

create table if not exists public.account_bindings (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  meter_id text not null,
  tariff_id text,
  ct_ratio text,
  station_id text,
  remark text,
  source text not null default 'supabase',
  status text not null default 'active',
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, meter_id)
);

create index if not exists account_bindings_meter_id_idx
  on public.account_bindings(meter_id);

create index if not exists account_bindings_station_updated_at_idx
  on public.account_bindings(station_id, updated_at desc);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('vendor', 'customer')),
  actor_id uuid not null,
  wallet_id uuid references public.wallets(id),
  customer_id text,
  customer_name text,
  meter_id text not null,
  station_id text,
  tariff_id text,
  amount_minor bigint not null check (amount_minor > 0),
  units_kwh numeric,
  purchase_mode text not null check (purchase_mode in ('wallet', 'direct_pay', 'remote_send')),
  payment_transaction_id uuid,
  hold_id uuid references public.wallet_holds(id),
  token text,
  remote_task_id text,
  receipt_id uuid,
  status text not null default 'created'
    check (status in ('created', 'hold_active', 'dispatching', 'delivered', 'delivery_pending_review', 'failed', 'reversed')),
  delivery_state text,
  idempotency_key text not null unique,
  failure_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_actor_created_idx
  on public.purchase_orders(actor_type, actor_id, created_at desc);

create index if not exists purchase_orders_meter_created_idx
  on public.purchase_orders(meter_id, created_at desc);

create index if not exists purchase_orders_status_created_idx
  on public.purchase_orders(status, created_at desc);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  receipt_number text not null unique,
  payload jsonb not null default '{}'::jsonb,
  print_name text,
  created_at timestamptz not null default now()
);

create index if not exists receipts_purchase_order_idx
  on public.receipts(purchase_order_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_receipt_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_receipt_id_fkey
      foreign key (receipt_id) references public.receipts(id)
      deferrable initially deferred;
  end if;
end $$;

drop trigger if exists purchase_orders_updated_at on public.purchase_orders;
create trigger purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.fn_set_updated_at();

drop trigger if exists account_bindings_updated_at on public.account_bindings;
create trigger account_bindings_updated_at
  before update on public.account_bindings
  for each row execute function public.fn_set_updated_at();

alter table public.account_bindings enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.receipts enable row level security;

drop policy if exists "service role manages account bindings" on public.account_bindings;
create policy "service role manages account bindings"
  on public.account_bindings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages purchase orders" on public.purchase_orders;
create policy "service role manages purchase orders"
  on public.purchase_orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages receipts" on public.receipts;
create policy "service role manages receipts"
  on public.receipts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.wallets (owner_type, owner_id, daily_debit_cap_minor)
select 'vendor', vo.id, coalesce(vo.daily_limit_minor, 1000000000)
from public.vendor_organizations vo
where not exists (
  select 1
  from public.wallets w
  where w.owner_type = 'vendor'
    and w.owner_id = vo.id
);

notify pgrst, 'reload schema';
