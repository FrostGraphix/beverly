-- Phase 3: KYC document storage
--
-- kyc_documents: metadata row per uploaded document
-- Supabase storage bucket: wallet-kyc-documents (private, service-role managed)

-- ── KYC Documents table ────────────────────────────────────────────────────────
create table if not exists kyc_documents (
    id             uuid    primary key default gen_random_uuid(),
    customer_id    uuid    not null,
    -- Document identity
    doc_type       text    not null
                   check (doc_type in (
                       'national_id', 'voters_card', 'passport', 'drivers_license',
                       'utility_bill', 'bank_statement', 'selfie', 'signature'
                   )),
    kyc_tier       integer not null check (kyc_tier in (1, 2)),
    -- Storage
    storage_path   text    not null,   -- supabase storage key (bucket-relative)
    mime_type      text    not null,
    size_bytes     bigint  not null check (size_bytes > 0),
    -- Review lifecycle
    status         text    not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'expired')),
    reviewed_by    uuid,
    reviewed_at    timestamptz,
    rejection_note text,
    -- Expiry — some docs expire (passports, licences)
    doc_expires_at date,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create or replace function set_kyc_doc_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_kyc_doc_updated_at
    before update on kyc_documents
    for each row execute function set_kyc_doc_updated_at();

create index idx_kyc_doc_customer on kyc_documents (customer_id, created_at desc);
create index idx_kyc_doc_status   on kyc_documents (status) where status in ('pending', 'rejected');
create index idx_kyc_doc_type     on kyc_documents (doc_type, kyc_tier);

alter table kyc_documents enable row level security;

-- Customers can read their own documents; staff reads via service role.
create policy kyc_doc_owner_read on kyc_documents
    for select using (
        auth.uid() in (
            select auth_user_id from customers where id = customer_id
        )
    );

-- ── Supabase Storage bucket ────────────────────────────────────────────────────
-- Private bucket — no public reads. Service role handles all uploads/downloads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'wallet-kyc-documents',
    'wallet-kyc-documents',
    false,
    10485760,   -- 10 MB per file
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
