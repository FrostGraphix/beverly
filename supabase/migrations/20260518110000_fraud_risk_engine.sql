-- Phase 5: Fraud & Risk Engine tables
-- fraud_assessments  — one per purchase attempt, stores total score + outcome
-- fraud_signals      — individual signal rows per assessment
-- customer_risk_baselines — rolling purchase stats used for amount-anomaly detection
-- step_up_challenges — OTP challenges issued when score triggers step-up auth

-- ── Fraud assessments ───────────────────────────────────────────────────────
create type fraud_action_enum as enum ('allow', 'step_up', 'block');

create table fraud_assessments (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers(id) on delete cascade,
  purchase_order_id     uuid,           -- null while purchase is still pending step-up
  meter_id              text not null,
  amount_minor          bigint not null,
  score                 int not null check (score between 0 and 100),
  action                fraud_action_enum not null,
  client_ip             text,
  user_agent            text,
  resolved              boolean not null default false,
  resolved_by_user_id   uuid,
  resolved_at           timestamptz,
  resolution_note       text,
  created_at            timestamptz not null default now()
);

create index fraud_assessments_customer_idx   on fraud_assessments (customer_id, created_at desc);
create index fraud_assessments_score_idx      on fraud_assessments (score desc) where not resolved;
create index fraud_assessments_po_idx         on fraud_assessments (purchase_order_id) where purchase_order_id is not null;

-- ── Fraud signals ────────────────────────────────────────────────────────────
create table fraud_signals (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references fraud_assessments(id) on delete cascade,
  signal_type     text not null,   -- 'velocity' | 'amount_anomaly' | 'meter_mismatch' | 'new_ip' | ...
  weight          int not null,
  detail          text,
  created_at      timestamptz not null default now()
);

create index fraud_signals_assessment_idx on fraud_signals (assessment_id);

-- ── Customer risk baselines ───────────────────────────────────────────────────
-- Recomputed daily by cron. Seed on first purchase if absent.
create table customer_risk_baselines (
  customer_id         uuid primary key references customers(id) on delete cascade,
  purchase_count      int not null default 0,
  avg_amount_minor    bigint not null default 0,
  stddev_amount_minor bigint not null default 0,  -- integer kobo, 0 = not enough data
  last_computed_at    timestamptz not null default now()
);

-- ── Step-up challenges ───────────────────────────────────────────────────────
-- Issued when fraud score triggers step-up auth.  Customer must verify OTP
-- then resubmit purchase with challenge_id to bypass step-up check.
create table step_up_challenges (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  otp_hash      text not null,
  attempts      int not null default 0,
  expires_at    timestamptz not null,
  used          boolean not null default false,
  created_at    timestamptz not null default now()
);

create index step_up_challenges_customer_idx on step_up_challenges (customer_id, expires_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- All tables written by service role only; customers have no direct read access.
alter table fraud_assessments        enable row level security;
alter table fraud_signals            enable row level security;
alter table customer_risk_baselines  enable row level security;
alter table step_up_challenges       enable row level security;
-- No permissive policies — service role bypasses RLS.

-- ── Customer-known IPs ───────────────────────────────────────────────────────
-- Tracks IPs seen for a customer; used for new-IP signal.
create table customer_known_ips (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  ip_hash       text not null,          -- SHA-256 of raw IP (no PII stored)
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (customer_id, ip_hash)
);

create index customer_known_ips_customer_idx on customer_known_ips (customer_id);
alter table customer_known_ips enable row level security;

-- ── Customer-known devices ────────────────────────────────────────────────────
-- Tracks user-agent hashes seen for a customer; used for new-device signal.
create table customer_known_devices (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  ua_hash       text not null,          -- SHA-256 of user-agent string
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (customer_id, ua_hash)
);

create index customer_known_devices_customer_idx on customer_known_devices (customer_id);
alter table customer_known_devices enable row level security;
