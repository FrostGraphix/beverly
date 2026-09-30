-- Configurable KYC tier limits. This is the canonical monetary policy source.
-- Limits are daily wallet debit caps in kobo. Tier 2 may be uncapped.

create table if not exists public.kyc_tier_settings (
  singleton boolean primary key default true check (singleton),
  tier0_daily_limit_minor bigint not null check (tier0_daily_limit_minor > 0),
  tier1_daily_limit_minor bigint not null check (tier1_daily_limit_minor > tier0_daily_limit_minor),
  tier2_daily_limit_minor bigint check (tier2_daily_limit_minor is null or tier2_daily_limit_minor > tier1_daily_limit_minor),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  change_reason text not null default 'Initial policy'
);

insert into public.kyc_tier_settings (
  singleton, tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
) values (true, 20000000, 70000000, null)
on conflict (singleton) do nothing;

alter table public.kyc_tier_settings enable row level security;
drop policy if exists "service role manages kyc tier settings" on public.kyc_tier_settings;
create policy "service role manages kyc tier settings"
  on public.kyc_tier_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.kyc_tier_policy_history (
  id uuid primary key default gen_random_uuid(),
  settings_version integer not null check (settings_version > 0),
  actor_user_id uuid,
  reason text not null,
  before_json jsonb not null,
  after_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists kyc_tier_policy_history_created_at_idx
  on public.kyc_tier_policy_history(created_at desc);

alter table public.kyc_tier_policy_history enable row level security;
drop policy if exists "service role reads kyc tier policy history" on public.kyc_tier_policy_history;
create policy "service role reads kyc tier policy history"
  on public.kyc_tier_policy_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.fn_record_kyc_tier_policy_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kyc_tier_policy_history (
    settings_version, actor_user_id, reason, before_json, after_json
  ) values (
    new.version, new.updated_by, new.change_reason,
    jsonb_build_object(
      'tier0DailyLimitMinor', old.tier0_daily_limit_minor,
      'tier1DailyLimitMinor', old.tier1_daily_limit_minor,
      'tier2DailyLimitMinor', old.tier2_daily_limit_minor,
      'version', old.version,
      'updatedAt', old.updated_at
    ),
    jsonb_build_object(
      'tier0DailyLimitMinor', new.tier0_daily_limit_minor,
      'tier1DailyLimitMinor', new.tier1_daily_limit_minor,
      'tier2DailyLimitMinor', new.tier2_daily_limit_minor,
      'version', new.version,
      'updatedAt', new.updated_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_record_kyc_tier_policy_history on public.kyc_tier_settings;
create trigger trg_record_kyc_tier_policy_history
after update of tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
on public.kyc_tier_settings
for each row execute function public.fn_record_kyc_tier_policy_history();

alter table public.wallets
  add column if not exists kyc_policy_managed boolean not null default false;

-- Tier 2 may be uncapped. This legacy display field must represent that state
-- consistently with the wallet enforcement field.
alter table public.vendor_organizations
  alter column daily_limit_minor drop not null;

-- Do not reinterpret historic, staff-managed limits. They remain visible as
-- explicit exceptions. New wallets and approved tier changes opt in here.
create or replace function public.fn_apply_kyc_wallet_policy(
  p_owner_type text,
  p_owner_id uuid,
  p_tier integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.kyc_tier_settings;
  v_daily_limit bigint;
begin
  if p_owner_type not in ('customer', 'vendor') or p_tier not between 0 and 2 then
    raise exception using errcode = '22023', message = 'invalid_kyc_policy_target';
  end if;

  select * into v_policy from public.kyc_tier_settings where singleton = true for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'kyc_policy_not_configured';
  end if;

  v_daily_limit := case p_tier
    when 0 then v_policy.tier0_daily_limit_minor
    when 1 then v_policy.tier1_daily_limit_minor
    else v_policy.tier2_daily_limit_minor
  end;

  update public.wallets
  set daily_debit_cap_minor = v_daily_limit,
      monthly_debit_cap_minor = null,
      kyc_policy_managed = true,
      updated_at = now()
  where owner_type = p_owner_type and owner_id = p_owner_id;

  if p_owner_type = 'vendor' then
    update public.vendor_organizations
    set daily_limit_minor = v_daily_limit,
        updated_at = now()
    where id = p_owner_id;
  end if;
end;
$$;

create or replace function public.fn_reconcile_kyc_policy_wallets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallets w
  set daily_debit_cap_minor = case c.kyc_tier
        when 0 then new.tier0_daily_limit_minor
        when 1 then new.tier1_daily_limit_minor
        else new.tier2_daily_limit_minor
      end,
      monthly_debit_cap_minor = null,
      updated_at = now()
  from public.customers c
  where w.owner_type = 'customer'
    and w.owner_id = c.id
    and w.kyc_policy_managed;

  update public.wallets w
  set daily_debit_cap_minor = case v.kyc_tier
        when 0 then new.tier0_daily_limit_minor
        when 1 then new.tier1_daily_limit_minor
        else new.tier2_daily_limit_minor
      end,
      monthly_debit_cap_minor = null,
      updated_at = now()
  from public.vendor_organizations v
  where w.owner_type = 'vendor'
    and w.owner_id = v.id
    and w.kyc_policy_managed;

  update public.vendor_organizations v
  set daily_limit_minor = case v.kyc_tier
        when 0 then new.tier0_daily_limit_minor
        when 1 then new.tier1_daily_limit_minor
        else new.tier2_daily_limit_minor
      end,
      updated_at = now()
  where exists (
    select 1 from public.wallets w
    where w.owner_type = 'vendor' and w.owner_id = v.id and w.kyc_policy_managed
  );

  return new;
end;
$$;

drop trigger if exists trg_reconcile_kyc_policy_wallets on public.kyc_tier_settings;
create trigger trg_reconcile_kyc_policy_wallets
after update of tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor
on public.kyc_tier_settings
for each row execute function public.fn_reconcile_kyc_policy_wallets();

-- Tier 0 is the registered-account tier. It must never force duplicate address
-- collection before a user asks for a higher limit. Tier 1 begins evidence.
create or replace function public.submit_kyc_evidence_review(
  p_subject_type text,
  p_subject_id uuid,
  p_requested_tier integer,
  p_submitted_by uuid,
  p_submission jsonb default '{}'::jsonb
) returns public.kyc_review_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_tier integer;
  v_request public.kyc_review_requests;
  v_document_count integer := 0;
  v_expected_documents integer := 0;
  v_identity_count integer := 0;
  v_selfie_count integer := 0;
  v_created boolean := false;
begin
  if p_subject_type = 'customer' then
    select kyc_tier into v_current_tier from public.customers where id = p_subject_id for update;
  elsif p_subject_type = 'vendor' then
    select kyc_tier into v_current_tier from public.vendor_organizations where id = p_subject_id for update;
  else
    raise exception using errcode = '22023', message = 'invalid_subject_type';
  end if;
  if v_current_tier is null then
    raise exception using errcode = 'P0002', message = 'kyc_subject_not_found';
  end if;
  if p_requested_tier <> v_current_tier + 1 or p_requested_tier not between 1 and 2 then
    raise exception using errcode = '22023', message = 'kyc_tier_must_be_sequential';
  end if;

  v_expected_documents := jsonb_array_length(coalesce(p_submission -> 'document_ids', '[]'::jsonb));
  if v_expected_documents < 2 then
    raise exception using errcode = '22023', message = 'kyc_documents_required';
  end if;
  select * into v_request from public.kyc_review_requests
  where status = 'pending'
    and ((p_subject_type = 'customer' and customer_id = p_subject_id)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id))
  for update;
  if found then
    update public.kyc_review_requests
    set submission_json = p_submission, submitted_by = p_submitted_by, submitted_at = now(), updated_at = now()
    where id = v_request.id returning * into v_request;
  else
    insert into public.kyc_review_requests (
      subject_type, customer_id, vendor_organization_id, current_tier, requested_tier, submission_json, submitted_by
    ) values (
      p_subject_type,
      case when p_subject_type = 'customer' then p_subject_id end,
      case when p_subject_type = 'vendor' then p_subject_id end,
      v_current_tier, p_requested_tier, p_submission, p_submitted_by
    ) returning * into v_request;
    v_created := true;
  end if;

  update public.kyc_documents
  set review_request_id = v_request.id, updated_at = now()
  where id in (select value::uuid from jsonb_array_elements_text(p_submission -> 'document_ids'))
    and uploaded_at is not null
    and (review_request_id is null or review_request_id = v_request.id)
    and kyc_tier = p_requested_tier
    and ((p_subject_type = 'customer' and customer_id = p_subject_id and vendor_organization_id is null)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id and customer_id is null));
  get diagnostics v_document_count = row_count;
  if v_document_count <> v_expected_documents then
    raise exception using errcode = '22023', message = 'kyc_documents_invalid_or_already_used';
  end if;
  select count(*) filter (where doc_type in ('national_id', 'voters_card', 'passport', 'drivers_license')),
         count(*) filter (where doc_type = 'selfie')
  into v_identity_count, v_selfie_count
  from public.kyc_documents where review_request_id = v_request.id;
  if v_identity_count < 1 or v_selfie_count < 1 then
    raise exception using errcode = '22023', message = 'kyc_identity_and_selfie_required';
  end if;

  if p_subject_type = 'customer' then
    update public.customers
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ), updated_at = now()
    where id = p_subject_id;
  else
    update public.vendor_organizations
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ), updated_at = now()
    where id = p_subject_id;
  end if;
  if v_created then
    insert into public.wallet_audit_log (
      actor_user_id, actor_type, action, target_type, target_id, before_json, after_json
    ) values (
      p_submitted_by, p_subject_type, 'kyc.tier' || p_requested_tier::text || '.review_requested',
      p_subject_type, p_subject_id::text,
      jsonb_build_object('kyc_tier', v_current_tier),
      jsonb_build_object('requested_tier', p_requested_tier, 'review_request_id', v_request.id)
    );
  end if;
  return v_request;
end;
$$;

-- The prior review function embedded obsolete caps and only updated customers.
-- Replacing it keeps decisions atomic while applying the active policy equally.
create or replace function public.review_kyc_tier_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_note text
) returns public.kyc_review_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.kyc_review_requests;
  v_live_tier integer;
  v_target_id text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_kyc_decision';
  end if;
  if length(trim(coalesce(p_note, ''))) < 4 then
    raise exception using errcode = '22023', message = 'review_note_required';
  end if;

  select * into v_request from public.kyc_review_requests
  where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'kyc_review_not_found';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'kyc_review_already_decided';
  end if;

  if v_request.subject_type = 'customer' then
    select kyc_tier into v_live_tier from public.customers where id = v_request.customer_id for update;
    v_target_id := v_request.customer_id::text;
  else
    select kyc_tier into v_live_tier from public.vendor_organizations where id = v_request.vendor_organization_id for update;
    v_target_id := v_request.vendor_organization_id::text;
  end if;
  if v_live_tier is distinct from v_request.current_tier then
    raise exception using errcode = '40001', message = 'kyc_tier_changed_since_submission';
  end if;

  if p_decision = 'approved' then
    if v_request.subject_type = 'customer' then
      update public.customers
      set kyc_tier = v_request.requested_tier,
          kyc_status = 'verified',
          kyc_data = (coalesce(kyc_data, '{}'::jsonb) - 'pending') || jsonb_build_object(
            'tier' || v_request.requested_tier::text,
            v_request.submission_json || jsonb_build_object('verified_at', now(), 'reviewed_by', p_reviewer_id)
          ),
          updated_at = now()
      where id = v_request.customer_id;
      perform public.fn_apply_kyc_wallet_policy('customer', v_request.customer_id, v_request.requested_tier);
    else
      update public.vendor_organizations
      set kyc_tier = v_request.requested_tier,
          kyc_status = 'verified',
          kyc_data = (coalesce(kyc_data, '{}'::jsonb) - 'pending') || jsonb_build_object(
            'tier' || v_request.requested_tier::text,
            v_request.submission_json || jsonb_build_object('verified_at', now(), 'reviewed_by', p_reviewer_id)
          ),
          approved_at = coalesce(approved_at, now()),
          approved_by = coalesce(approved_by, p_reviewer_id),
          updated_at = now()
      where id = v_request.vendor_organization_id;
      perform public.fn_apply_kyc_wallet_policy('vendor', v_request.vendor_organization_id, v_request.requested_tier);
    end if;
  elsif v_request.subject_type = 'customer' then
    update public.customers set kyc_status = 'rejected', updated_at = now() where id = v_request.customer_id;
  else
    update public.vendor_organizations set kyc_status = 'rejected', updated_at = now() where id = v_request.vendor_organization_id;
  end if;

  update public.kyc_documents
  set status = case when p_decision = 'approved' then 'approved' else 'rejected' end,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      rejection_note = case when p_decision = 'rejected' then trim(p_note) else null end,
      updated_at = now()
  where review_request_id = p_request_id;

  update public.kyc_review_requests
  set status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      reviewer_note = trim(p_note),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.wallet_audit_log (
    actor_user_id, actor_type, action, target_type, target_id, before_json, after_json
  ) values (
    p_reviewer_id, 'staff', 'kyc.review.' || p_decision,
    v_request.subject_type, v_target_id,
    jsonb_build_object('kyc_tier', v_request.current_tier, 'kyc_status', 'pending'),
    jsonb_build_object('kyc_tier', case when p_decision = 'approved' then v_request.requested_tier else v_request.current_tier end,
      'kyc_status', case when p_decision = 'approved' then 'verified' else 'rejected' end,
      'review_request_id', v_request.id, 'reviewer_note', trim(p_note))
  );
  return v_request;
end;
$$;

alter table public.vendor_organizations alter column daily_limit_minor drop default;

insert into public.permissions (role_key, route_hash)
values ('super-admin', 'wallet.kyc.settings.manage')
on conflict (role_key, route_hash) do nothing;

revoke all on function public.fn_apply_kyc_wallet_policy(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_apply_kyc_wallet_policy(text, uuid, integer) to service_role;
revoke all on function public.fn_reconcile_kyc_policy_wallets() from public, anon, authenticated;

notify pgrst, 'reload schema';
