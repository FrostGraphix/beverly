-- Notifications pipeline — Phase 4
--
-- notification_delivery_receipts: one row per channel per notification attempt
-- customer_push_tokens: FCM device tokens registered by customers

-- ── Delivery receipts ─────────────────────────────────────────────────────────
create table notification_delivery_receipts (
    id               uuid        primary key default gen_random_uuid(),
    notification_id  uuid        not null references notifications(id) on delete cascade,
    channel          text        not null check (channel in ('sms', 'email', 'push')),
    -- For push: stores the specific device token so we track per-device
    push_token       text,
    -- Outcome
    status           text        not null check (status in ('queued', 'delivered', 'failed')),
    provider_ref     text,       -- Twilio SID | Postmark MessageID | FCM message ID
    error_message    text,
    attempt          integer     not null default 1,
    delivered_at     timestamptz,
    created_at       timestamptz not null default now()
);

-- One delivery record per (notification, channel, push_token) combo
create unique index idx_notif_receipt_unique
    on notification_delivery_receipts (notification_id, channel, coalesce(push_token, ''));

create index idx_notif_receipt_notif   on notification_delivery_receipts (notification_id);
create index idx_notif_receipt_failed  on notification_delivery_receipts (status, created_at desc)
    where status = 'failed';

alter table notification_delivery_receipts enable row level security;
-- Service role only — no customer policy needed

-- ── Customer push tokens ──────────────────────────────────────────────────────
create table customer_push_tokens (
    id           uuid        primary key default gen_random_uuid(),
    customer_id  uuid        not null references customers(id) on delete cascade,
    token        text        not null unique,
    platform     text        not null check (platform in ('ios', 'android', 'web')),
    active       boolean     not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create or replace function set_push_token_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_push_token_updated_at
    before update on customer_push_tokens
    for each row execute function set_push_token_updated_at();

create index idx_push_token_customer on customer_push_tokens (customer_id) where active;

alter table customer_push_tokens enable row level security;

-- Customers can manage their own tokens
create policy push_token_owner on customer_push_tokens
    using (auth.uid() in (select auth_user_id from customers where id = customer_id));
