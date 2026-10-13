-- Reconcile existing customer and vendor wallets to canonical KYC tier policy.
-- Ensures all registered and approved wallets are tracked by policy triggers.

do $$
declare
  v_policy public.kyc_tier_settings;
begin
  select * into v_policy from public.kyc_tier_settings where singleton = true;
  if not found then
    return;
  end if;

  -- Reconcile existing customer wallets
  update public.wallets w
  set daily_debit_cap_minor = case coalesce(c.kyc_tier, 0)
        when 0 then v_policy.tier0_daily_limit_minor
        when 1 then v_policy.tier1_daily_limit_minor
        else v_policy.tier2_daily_limit_minor
      end,
      monthly_debit_cap_minor = null,
      kyc_policy_managed = true,
      updated_at = now()
  from public.customers c
  where w.owner_type = 'customer'
    and w.owner_id = c.id
    and not w.kyc_policy_managed;

  -- Reconcile existing vendor wallets
  update public.wallets w
  set daily_debit_cap_minor = case coalesce(v.kyc_tier, 0)
        when 0 then v_policy.tier0_daily_limit_minor
        when 1 then v_policy.tier1_daily_limit_minor
        else v_policy.tier2_daily_limit_minor
      end,
      monthly_debit_cap_minor = null,
      kyc_policy_managed = true,
      updated_at = now()
  from public.vendor_organizations v
  where w.owner_type = 'vendor'
    and w.owner_id = v.id
    and not w.kyc_policy_managed;

  -- Sync vendor organization legacy display limit
  update public.vendor_organizations v
  set daily_limit_minor = case coalesce(v.kyc_tier, 0)
        when 0 then v_policy.tier0_daily_limit_minor
        when 1 then v_policy.tier1_daily_limit_minor
        else v_policy.tier2_daily_limit_minor
      end,
      updated_at = now()
  where exists (
    select 1 from public.wallets w
    where w.owner_type = 'vendor' and w.owner_id = v.id and w.kyc_policy_managed
  );
end;
$$;
-- Ensure super-admin has wallet.kyc.settings.manage permission
insert into public.permissions (role_key, route_hash)
values ('super-admin', 'wallet.kyc.settings.manage')
on conflict (role_key, route_hash) do nothing;
notify pgrst, 'reload schema';
