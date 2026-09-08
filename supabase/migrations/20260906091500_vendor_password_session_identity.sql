-- Bind a completed password replacement to the deliberately rotated session.
-- This removes timestamp ambiguity and immediately rejects old access tokens,
-- including tokens minted in the same second as the replacement.

alter table public.vendor_users
  add column if not exists password_session_id text;

comment on column public.vendor_users.password_session_id is
  'Supabase session_id allowed after the latest password replacement; prior access sessions are rejected by the API.';

notify pgrst, 'reload schema';
