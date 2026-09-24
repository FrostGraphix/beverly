begin;

do $$
begin
  if exists (select 1 from public.oem_canary_authorizations) then
    raise exception 'OEM canary authorizations exist; review them before rollback';
  end if;
end
$$;

drop function if exists public.claim_oem_canary_authorization(uuid, text, text, text, bigint, uuid, timestamptz);
drop table if exists public.oem_canary_authorizations;

commit;
