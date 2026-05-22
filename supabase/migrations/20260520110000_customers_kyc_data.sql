-- Add kyc_data JSONB column to customers table.
-- Stores supplementary KYC profile data per tier:
--   tier1: { date_of_birth, address, state, lga, verified_at }
--   tier2: { nin_last4, nin_name, verified_at }
--
-- NOTE: Apply this via the Supabase SQL editor at:
-- https://supabase.com/dashboard/project/qpoipyqgrjsjdvfqmxok/sql
-- Or via: supabase db push

alter table public.customers
  add column if not exists kyc_data jsonb;

-- Reload PostgREST schema cache so the new column is immediately available.
notify pgrst, 'reload schema';
