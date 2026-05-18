-- Phase 4: Meter purchase orders
-- Tracks customer requests to have a prepaid meter installed at their property.
-- Lifecycle: pending_payment → paid → assigned → dispatched → installed
--            or cancelled at any point by admin.

create type meter_type_enum as enum ('single_phase', 'three_phase');
create type meter_order_status_enum as enum (
  'pending_payment',
  'paid',
  'assigned',
  'dispatched',
  'installed',
  'cancelled'
);

create table meter_purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers(id) on delete restrict,
  meter_type        meter_type_enum not null,
  property_address  text not null,
  service_area      text not null,
  contact_phone     text not null,
  amount_minor      bigint not null check (amount_minor > 0),
  payment_reference text not null unique,
  status            meter_order_status_enum not null default 'pending_payment',
  technician_name   text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Index for customer order history
create index meter_purchase_orders_customer_idx on meter_purchase_orders (customer_id, created_at desc);
-- Index for admin fulfillment queue
create index meter_purchase_orders_status_idx on meter_purchase_orders (status, created_at asc);

-- Auto-update updated_at
create or replace function set_meter_order_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meter_purchase_orders_updated_at
  before update on meter_purchase_orders
  for each row execute function set_meter_order_updated_at();

-- RLS: customers can only see their own orders (read-only via service role for writes)
alter table meter_purchase_orders enable row level security;

create policy "customers_read_own_orders"
  on meter_purchase_orders for select
  using (
    customer_id in (
      select id from customers where user_id = auth.uid()
    )
  );

-- Staff (service role) bypasses RLS for all admin operations
-- No insert policy for customers — backend service role handles inserts
