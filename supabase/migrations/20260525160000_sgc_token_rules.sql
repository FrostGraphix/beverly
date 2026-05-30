-- SGC-level STS token-format (S1/S2) rules.
-- STS standard is uniform within a Supply Group Code, so one rule classifies a
-- whole group of meters. Resolution order in the app:
--   per-meter override  ->  SGC rule  ->  phase-derived fallback

create table if not exists public.sgc_token_rules (
  sgc        text primary key,
  is_s2      boolean not null,
  note       text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists sgc_token_rules_updated_idx
  on public.sgc_token_rules (updated_at desc);

-- Access is mediated by the CRM proxy (service role); no public client policies.
alter table public.sgc_token_rules enable row level security;

notify pgrst, 'reload schema';
