-- Atomically rotate one installation credential envelope.

create or replace function public.rotate_oem_installation_credentials(
  p_oem_installation_id uuid,
  p_expected_encrypted_secret_bundle text,
  p_expected_encryption_key_version integer,
  p_new_encrypted_secret_bundle text,
  p_new_encryption_key_version integer,
  p_updated_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  affected_rows integer;
begin
  if p_oem_installation_id is null
    or p_updated_by is null
    or nullif(p_expected_encrypted_secret_bundle, '') is null
    or nullif(p_new_encrypted_secret_bundle, '') is null
    or p_expected_encryption_key_version < 1
    or p_new_encryption_key_version <= p_expected_encryption_key_version then
    raise exception 'invalid credential rotation';
  end if;

  update public.oem_installation_credentials
  set encrypted_secret_bundle = p_new_encrypted_secret_bundle,
      encryption_key_version = p_new_encryption_key_version,
      updated_by = p_updated_by,
      updated_at = now()
  where oem_installation_id = p_oem_installation_id
    and encrypted_secret_bundle = p_expected_encrypted_secret_bundle
    and encryption_key_version = p_expected_encryption_key_version;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end
$function$;

revoke all on function public.rotate_oem_installation_credentials(uuid, text, integer, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.rotate_oem_installation_credentials(uuid, text, integer, text, integer, uuid)
  to service_role;

notify pgrst, 'reload schema';
