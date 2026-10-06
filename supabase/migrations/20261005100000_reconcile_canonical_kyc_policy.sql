-- Reconcile an obsolete document-policy setting with the canonical KYC tier
-- settings introduced in 20260929100000_configurable_kyc_tier_policy.sql.
--
-- `kyc_tier_settings` is the only monetary KYC policy source. The legacy
-- `system_settings.kyc_policy` record was never part of the canonical API and
-- must not become a second, silently divergent configuration path.

delete from public.system_settings
where key = 'kyc_policy';
-- Apply the current canonical limits immediately to accounts that explicitly
-- opted into policy-managed caps. Staff-defined exception caps remain intact.
with active_policy as (
  select tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
  from public.kyc_tier_settings
  where singleton = true
)
update public.wallets w
set daily_debit_cap_minor = case c.kyc_tier
      when 0 then p.tier0_daily_limit_minor
      when 1 then p.tier1_daily_limit_minor
      else p.tier2_daily_limit_minor
    end,
    monthly_debit_cap_minor = null,
    updated_at = now()
from public.customers c
cross join active_policy p
where w.owner_type = 'customer'
  and w.owner_id = c.id
  and w.kyc_policy_managed;
with active_policy as (
  select tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
  from public.kyc_tier_settings
  where singleton = true
)
update public.wallets w
set daily_debit_cap_minor = case v.kyc_tier
      when 0 then p.tier0_daily_limit_minor
      when 1 then p.tier1_daily_limit_minor
      else p.tier2_daily_limit_minor
    end,
    monthly_debit_cap_minor = null,
    updated_at = now()
from public.vendor_organizations v
cross join active_policy p
where w.owner_type = 'vendor'
  and w.owner_id = v.id
  and w.kyc_policy_managed;
with active_policy as (
  select tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
  from public.kyc_tier_settings
  where singleton = true
)
update public.vendor_organizations v
set daily_limit_minor = case v.kyc_tier
      when 0 then p.tier0_daily_limit_minor
      when 1 then p.tier1_daily_limit_minor
      else p.tier2_daily_limit_minor
    end,
    updated_at = now()
from public.wallets w
cross join active_policy p
where w.owner_type = 'vendor'
  and w.owner_id = v.id
  and w.kyc_policy_managed;
