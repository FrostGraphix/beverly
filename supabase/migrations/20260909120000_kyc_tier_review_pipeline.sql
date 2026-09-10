-- Unified customer and vendor KYC tier review pipeline.
-- Tier changes are atomic, sequential, permissioned, and audit logged.

alter table public.vendor_organizations
  add column if not exists kyc_tier integer not null default 0,
  add column if not exists kyc_status text not null default 'unverified',
  add column if not exists kyc_data jsonb not null default '{}'::jsonb;

update public.vendor_organizations
set kyc_tier = greatest(kyc_tier, 1),
    kyc_status = 'verified'
where status in ('approved', 'active')
  and kyc_tier = 0;

alter table public.vendor_organizations
  drop constraint if exists vendor_organizations_kyc_tier_check,
  add constraint vendor_organizations_kyc_tier_check check (kyc_tier between 0 and 2),
  drop constraint if exists vendor_organizations_kyc_status_check,
  add constraint vendor_organizations_kyc_status_check
    check (kyc_status in ('unverified', 'pending', 'verified', 'rejected'));

alter table public.customers
  drop constraint if exists customers_kyc_tier_check,
  add constraint customers_kyc_tier_check check (kyc_tier between 0 and 2),
  drop constraint if exists customers_kyc_status_check,
  add constraint customers_kyc_status_check
    check (kyc_status in ('unverified', 'pending', 'verified', 'rejected'));

create table if not exists public.kyc_review_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('customer', 'vendor')),
  customer_id uuid references public.customers(id) on delete cascade,
  vendor_organization_id uuid references public.vendor_organizations(id) on delete cascade,
  current_tier integer not null check (current_tier between 0 and 1),
  requested_tier integer not null check (requested_tier between 1 and 2),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  submission_json jsonb not null default '{}'::jsonb,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kyc_review_owner_check check (
    (subject_type = 'customer' and customer_id is not null and vendor_organization_id is null)
    or
    (subject_type = 'vendor' and vendor_organization_id is not null and customer_id is null)
  ),
  constraint kyc_review_sequential_tier_check check (requested_tier = current_tier + 1)
);

create unique index if not exists kyc_review_one_pending_customer_idx
  on public.kyc_review_requests(customer_id)
  where status = 'pending' and customer_id is not null;
create unique index if not exists kyc_review_one_pending_vendor_idx
  on public.kyc_review_requests(vendor_organization_id)
  where status = 'pending' and vendor_organization_id is not null;
create index if not exists kyc_review_queue_idx
  on public.kyc_review_requests(status, submitted_at asc);

alter table public.kyc_review_requests enable row level security;
drop policy if exists "service role all kyc reviews" on public.kyc_review_requests;
create policy "service role all kyc reviews"
  on public.kyc_review_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.kyc_documents
  alter column customer_id drop not null,
  add column if not exists vendor_organization_id uuid references public.vendor_organizations(id) on delete cascade,
  add column if not exists review_request_id uuid references public.kyc_review_requests(id) on delete set null,
  add column if not exists uploaded_at timestamptz;

alter table public.kyc_documents
  drop constraint if exists kyc_documents_owner_check,
  add constraint kyc_documents_owner_check check (
    (customer_id is not null and vendor_organization_id is null)
    or
    (customer_id is null and vendor_organization_id is not null)
  );

create index if not exists kyc_doc_vendor_idx
  on public.kyc_documents(vendor_organization_id, created_at desc);
create index if not exists kyc_doc_review_idx
  on public.kyc_documents(review_request_id, created_at asc);

create or replace function public.submit_kyc_tier_review(
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

  select * into v_request
  from public.kyc_review_requests
  where status = 'pending'
    and ((p_subject_type = 'customer' and customer_id = p_subject_id)
      or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id))
  for update;

  if found then
    update public.kyc_review_requests
    set submission_json = p_submission,
        submitted_by = p_submitted_by,
        submitted_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.kyc_review_requests (
      subject_type, customer_id, vendor_organization_id, current_tier,
      requested_tier, submission_json, submitted_by
    ) values (
      p_subject_type,
      case when p_subject_type = 'customer' then p_subject_id end,
      case when p_subject_type = 'vendor' then p_subject_id end,
      v_current_tier, p_requested_tier, p_submission, p_submitted_by
    ) returning * into v_request;
    v_created := true;
  end if;

  if p_subject_type = 'customer' then
    update public.customers
    set full_name = case when p_requested_tier = 1 then nullif(trim(p_submission ->> 'full_name'), '') else full_name end,
        kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ),
        updated_at = now()
    where id = p_subject_id;
  else
    update public.vendor_organizations
    set kyc_status = 'pending',
        kyc_data = coalesce(kyc_data, '{}'::jsonb) || jsonb_build_object(
          'pending', p_submission || jsonb_build_object('requested_tier', p_requested_tier, 'submitted_at', now())
        ),
        updated_at = now()
    where id = p_subject_id;
  end if;

  if p_requested_tier = 2 then
    v_expected_documents := jsonb_array_length(coalesce(p_submission -> 'document_ids', '[]'::jsonb));
    if v_expected_documents < 2 then
      raise exception using errcode = '22023', message = 'kyc_documents_required';
    end if;
    update public.kyc_documents
    set review_request_id = v_request.id,
        updated_at = now()
    where id in (select value::uuid from jsonb_array_elements_text(p_submission -> 'document_ids'))
      and uploaded_at is not null
      and (review_request_id is null or review_request_id = v_request.id)
      and kyc_tier = 2
      and ((p_subject_type = 'customer' and customer_id = p_subject_id and vendor_organization_id is null)
        or (p_subject_type = 'vendor' and vendor_organization_id = p_subject_id and customer_id is null));
    get diagnostics v_document_count = row_count;
    if v_document_count <> v_expected_documents then
      raise exception using errcode = '22023', message = 'kyc_documents_invalid_or_already_used';
    end if;
    select
      count(*) filter (where doc_type in ('national_id', 'voters_card', 'passport', 'drivers_license')),
      count(*) filter (where doc_type = 'selfie')
    into v_identity_count, v_selfie_count
    from public.kyc_documents
    where review_request_id = v_request.id;
    if v_identity_count < 1 or v_selfie_count < 1 then
      raise exception using errcode = '22023', message = 'kyc_identity_and_selfie_required';
    end if;
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

      update public.wallets
      set daily_debit_cap_minor = case v_request.requested_tier when 1 then 5000000 when 2 then 20000000 end,
          monthly_debit_cap_minor = case v_request.requested_tier when 1 then 100000000 when 2 then 400000000 end,
          updated_at = now()
      where owner_type = 'customer' and owner_id = v_request.customer_id;
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
    end if;
  else
    if v_request.subject_type = 'customer' then
      update public.customers
      set kyc_status = 'rejected', updated_at = now()
      where id = v_request.customer_id;
    else
      update public.vendor_organizations
      set kyc_status = 'rejected', updated_at = now()
      where id = v_request.vendor_organization_id;
    end if;
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

revoke all on function public.submit_kyc_tier_review(text, uuid, integer, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.review_kyc_tier_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_kyc_tier_review(text, uuid, integer, uuid, jsonb) to service_role;
grant execute on function public.review_kyc_tier_request(uuid, uuid, text, text) to service_role;

insert into public.permissions (role_key, route_hash)
values
  ('operations-manager', 'wallet.kyc.view'),
  ('operations-manager', 'wallet.kyc.review'),
  ('finance-checker', 'wallet.kyc.view'),
  ('finance-checker', 'wallet.kyc.review'),
  ('account', 'wallet.kyc.view')
on conflict (role_key, route_hash) do nothing;

notify pgrst, 'reload schema';
