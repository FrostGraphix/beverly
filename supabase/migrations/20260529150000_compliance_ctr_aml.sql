-- Phase 3: Compliance — CTR, AML screening, sanctions list
--
-- currency_transaction_reports: auto-generated for every ledger entry ≥ ₦5 000 000
-- aml_screening_results:        outcome of sanctions/AML check per entity
-- sanctions_list_entries:       staff-maintained list; name + partial BVN/NIN

-- ── Sequence for CTR references ────────────────────────────────────────────────
create sequence if not exists ctr_reference_seq start 1;

-- ── Currency Transaction Reports ───────────────────────────────────────────────
create table if not exists currency_transaction_reports (
    id                      uuid        primary key default gen_random_uuid(),
    reference               text        not null unique,  -- CTR-YYYYMMDD-NNNNN
    ledger_entry_id         uuid,                         -- originating ledger entry
    wallet_id               uuid        not null,
    customer_id             uuid,
    vendor_organization_id  uuid,
    amount_minor            bigint      not null check (amount_minor > 0),
    currency                text        not null default 'NGN',
    entry_type              text        not null,
    direction               text        not null check (direction in ('credit', 'debit')),
    -- Lifecycle
    status                  text        not null default 'draft'
                                        check (status in ('draft', 'filed', 'acknowledged', 'rejected')),
    filing_reference        text,       -- CBN/EFCC receipt reference
    filed_at                timestamptz,
    filed_by_user_id        uuid,
    -- Report metadata
    reporter_institution    text        not null default 'Beverly Wallet',
    notes                   text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create or replace function set_ctr_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_ctr_updated_at
    before update on currency_transaction_reports
    for each row execute function set_ctr_updated_at();

create index idx_ctr_wallet_id   on currency_transaction_reports (wallet_id, created_at desc);
create index idx_ctr_status      on currency_transaction_reports (status, created_at desc);
create index idx_ctr_customer_id on currency_transaction_reports (customer_id) where customer_id is not null;
create index idx_ctr_filed_at    on currency_transaction_reports (filed_at)    where filed_at   is not null;

alter table currency_transaction_reports enable row level security;
-- No policies — service role only; staff access via admin API

-- ── AML Screening Results ──────────────────────────────────────────────────────
create table if not exists aml_screening_results (
    id                   uuid    primary key default gen_random_uuid(),
    -- Screened entity
    entity_type          text    not null check (entity_type in ('customer', 'vendor_organization', 'vendor_user')),
    entity_id            uuid    not null,
    entity_name          text    not null,
    -- Match outcome
    match_score          integer not null check (match_score between 0 and 100),
    matched_entries      jsonb   not null default '[]',
    -- Disposition
    status               text    not null default 'clear'
                                 check (status in ('clear', 'flagged', 'blocked', 'whitelisted', 'under_review')),
    reviewed_by_user_id  uuid,
    reviewed_at          timestamptz,
    review_note          text,
    -- Context
    trigger_event        text,   -- 'registration' | 'kyc_upgrade' | 'manual_review' | 'periodic_refresh'
    created_at           timestamptz not null default now()
);

create index idx_aml_entity  on aml_screening_results (entity_type, entity_id, created_at desc);
create index idx_aml_status  on aml_screening_results (status, created_at desc);
create index idx_aml_active  on aml_screening_results (status)
    where status in ('flagged', 'blocked', 'under_review');

alter table aml_screening_results enable row level security;

-- ── Sanctions List ─────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

create table if not exists sanctions_list_entries (
    id               uuid    primary key default gen_random_uuid(),
    full_name        text    not null,
    aliases          text[]  not null default '{}',
    bvn_partial      text,   -- last 4 digits for partial match
    nin_partial      text,
    nationality      text,
    source           text    not null,
                     -- 'EFCC' | 'INTERPOL' | 'OFAC' | 'CBN' | 'internal'
    list_date        date,
    active           boolean not null default true,
    added_by_user_id uuid,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index idx_sanctions_name   on sanctions_list_entries
    using gin (to_tsvector('simple', full_name));
create index idx_sanctions_trgm   on sanctions_list_entries
    using gin (full_name gin_trgm_ops);
create index idx_sanctions_active on sanctions_list_entries (active) where active;

alter table sanctions_list_entries enable row level security;
