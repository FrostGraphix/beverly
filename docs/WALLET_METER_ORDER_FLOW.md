# Wallet Meter Order Flow

## What this does

This flow lets three groups create meter orders.

1. Customer orders a meter.
2. Vendor orders a meter for a customer.
3. Wallet admin creates or sponsors a meter order.

The goal is simple.

Customers get meters faster.
Vendors can sponsor orders directly.
Admin can oversee everything.

## The three order paths

### 1. Customer self-service

Customer uses the customer wallet portal.

Flow:

1. Customer picks meter type.
2. Customer enters address and area.
3. System creates a pending order.
4. System opens Paystack payment.
5. Customer pays.
6. Payment is verified.
7. Order moves to `paid`.
8. Ops team can process installation.

Best for:

- direct customer orders
- self-service onboarding
- trackable payment flow

### 2. Vendor-sponsored order

Vendor uses vendor wallet portal.

Flow:

1. Vendor searches wallet customer.
2. Vendor picks meter type.
3. Vendor enters install details.
4. System debits vendor wallet instantly.
5. Order is created as `paid`.
6. Admin can now assign and dispatch.

Best for:

- sponsored customer onboarding
- field sales support
- vendor-managed acquisition

### 3. Admin-assisted order

Wallet admin uses admin portal.

Admin has two modes.

#### Staff assisted

Admin creates order as already paid.

Use this when:

- payment was handled offline
- ops is correcting records
- special approval already exists

#### Charge vendor wallet

Admin creates order for customer.
Vendor wallet gets charged.
Order still shows admin origin.

Use this when:

- admin is helping vendor ops
- vendor requested assisted creation
- central ops is running fulfillment

## Status flow

Main order lifecycle:

`pending_payment -> paid -> assigned -> dispatched -> installed`

Possible exit:

`paid/assigned/dispatched -> cancelled`

### Meaning of each status

#### `pending_payment`

Order exists.
Payment not completed yet.

#### `paid`

Payment confirmed.
Ready for ops assignment.

#### `assigned`

Technician or team is assigned.

#### `dispatched`

Team is on the move.
Meter delivery or install is active.

#### `installed`

Meter order completed.

#### `cancelled`

Order was stopped.
Reason should be stored.

## Who can do what

### Customer

- create own meter order
- pay for own order
- view own order list
- view own order detail
- verify payment

### Vendor

- search wallet customers
- create sponsored meter orders
- pay through vendor wallet
- view only vendor-created orders

### Wallet Admin

- create staff-assisted orders
- create vendor-sponsored orders
- view all orders
- filter and search all orders
- advance statuses
- cancel orders
- add technician name
- add notes
- see source breakdown

## Data model

Main table:

`meter_purchase_orders`

Important fields:

- `customer_id`
- `customer_name_snapshot`
- `meter_type`
- `property_address`
- `service_area`
- `contact_phone`
- `amount_minor`
- `payment_reference`
- `status`
- `source_channel`
- `created_by_actor_type`
- `created_by_actor_id`
- `vendor_organization_id`
- `wallet_id`
- `ledger_entry_id`
- `technician_name`
- `notes`

## Why these fields matter

### `source_channel`

Shows where the order came from.

Values:

- `customer_portal`
- `vendor_portal`
- `admin_portal`

This helps reporting.

### `created_by_actor_type`

Shows who triggered creation.

Values:

- `customer`
- `vendor_user`
- `staff`

This helps audit.

### `vendor_organization_id`

Links vendor-sponsored orders.

### `wallet_id`

Shows which wallet funded it.

### `ledger_entry_id`

Links the financial debit record.

### `customer_name_snapshot`

Keeps readable history.

Even if customer profile changes later.

## Financial logic

### Meter prices

Current logic:

- single phase = `5,000,000` kobo
- three phase = `7,500,000` kobo

That means:

- Single phase = NGN 50,000.00
- Three phase = NGN 75,000.00

### Customer payment path

Uses Paystack.

Order stays pending first.
Then payment verification marks it paid.

### Vendor payment path

Uses wallet ledger debit.

Checks:

1. vendor wallet exists
2. wallet can transact
3. wallet has enough balance

If debit fails:

- order creation is rolled back
- no orphan paid order remains

## Frontend pages

### Vendor portal

Pages:

- `/meter-orders`
- `/meter-orders/new`

Experience:

- list recent vendor orders
- create new customer-sponsored order

### Admin portal

Pages:

- `/meter-orders`
- `/meter-orders/new`

Experience:

- KPI summary
- filter by status
- search by address, area, phone, customer
- export CSV
- update status
- cancel orders
- create new orders

## Reporting value

This feature gives clear ops insight.

Useful metrics:

- total orders
- pending payment orders
- in-progress orders
- installed orders
- cancelled orders
- by source channel
- vendor-sponsored volume
- staff-assisted volume
- customer self-service volume

## Ops review checklist

Before live review:

1. Run migration.
2. Confirm admin routes work.
3. Confirm vendor routes work.
4. Confirm customer payment verify works.
5. Confirm vendor wallet debit posts ledger entry.
6. Confirm admin stats match records.
7. Confirm CSV export fields are correct.
8. Confirm permission gates are correct.

## Next smoke checklist

Use the newest READY Vercel deployment.
Do not hard-code old preview hostnames.

Current production commit:

- `f0eb5b5b` — `Allow operators to read live-write status (#9)`
- URL: `https://beverly-2a2bw36xr-danmusa-abdulsamads-projects.vercel.app`
- Alias: `https://beverly-git-main-danmusa-abdulsamads-projects.vercel.app`

Smoke these routes:

1. Admin: `/wallet-admin/meter-orders`
2. Admin: `/wallet-admin/meter-orders/new`
3. Vendor: `/wallet-vendor/meter-orders`
4. Vendor: `/wallet-vendor/meter-orders/new`
5. Customer: `/wallet-customer/meter-orders`
6. Customer: `/wallet-customer/meters`

Create-path checks:

1. Admin staff-assisted order creates `paid`.
2. Admin vendor-wallet order debits vendor wallet.
3. Vendor order debits vendor wallet.
4. Customer order opens Paystack.
5. Customer payment verification marks `paid`.
6. Admin status moves `paid -> assigned -> dispatched -> installed`.
7. Invalid status jumps fail with `invalid_status_transition`.
8. Repeated submit replays idempotently.

## Design notes

### UX goals

- low-friction creation
- clear accountability
- visible status progression
- strong audit trail
- same Beverly wallet visual language

### Good defaults

- customer search first
- meter type second
- review before create
- status badges always visible
- source always visible for admin

## Simple summary

Think of it this way.

Customer can order.
Vendor can sponsor.
Admin can control all flows.

Every order keeps:

- who created it
- who paid for it
- where it came from
- where it is now
- who is handling it

That makes finance, ops, and support much easier.
