-- Vendor MFA approvals follow the Supabase login session rather than one short-lived
-- access token. The stored value remains a one-way hash; no session identifier or
-- access token is persisted in plaintext. Existing token-bound grants naturally
-- require one new verification after deployment.
comment on column public.vendor_mfa_sessions.token_hash is
  'SHA-256 hash of the stable Supabase session identity, with legacy access-token hash compatibility during rollout.';
