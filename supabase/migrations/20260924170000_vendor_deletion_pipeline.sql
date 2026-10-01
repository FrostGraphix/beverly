-- Atomically closes a vendor while preserving immutable financial history.
-- Authentication identities are returned for service-side revocation/removal.
create or replace function public.admin_soft_delete_vendor(
  p_vendor_id uuid,
  p_deleted_by uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor public.vendor_organizations%rowtype;
  v_auth_user_ids uuid[];
  v_vendor_user_ids uuid[];
begin
  if p_deleted_by is null then
    raise exception 'deleted_by is required';
  end if;

  select * into v_vendor
  from public.vendor_organizations
  where id = p_vendor_id
  for update;

  if not found or v_vendor.deleted_at is not null then
    raise exception 'vendor not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]),
         coalesce(array_agg(auth_user_id) filter (where auth_user_id is not null), '{}'::uuid[])
  into v_vendor_user_ids, v_auth_user_ids
  from public.vendor_users
  where vendor_organization_id = p_vendor_id;

  delete from public.vendor_mfa_sessions
  where vendor_user_id = any(v_vendor_user_ids);

  delete from public.vendor_mfa_recovery_codes
  where vendor_user_id = any(v_vendor_user_ids);

  delete from public.vendor_mfa_factors
  where vendor_user_id = any(v_vendor_user_ids);

  delete from public.vendor_password_change_attempts
  where auth_user_id = any(v_auth_user_ids);

  update public.vendor_users
  set status = 'disabled',
      mfa_enrolled = false,
      password_reset_required = false,
      password_session_id = null,
      vend_credential_hash = null,
      vend_credential_salt = null,
      vend_credential_set_at = null,
      updated_at = now()
  where vendor_organization_id = p_vendor_id;

  update public.wallets
  set status = 'closed', updated_at = now()
  where owner_type = 'vendor' and owner_id = p_vendor_id;

  update public.vendor_organizations
  set status = 'closed',
      deleted_at = now(),
      deleted_by = p_deleted_by,
      deletion_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where id = p_vendor_id;

  return jsonb_build_object(
    'id', p_vendor_id,
    'authUserIds', to_jsonb(v_auth_user_ids),
    'vendorUserCount', cardinality(v_vendor_user_ids)
  );
end;
$$;

revoke all on function public.admin_soft_delete_vendor(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_soft_delete_vendor(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
