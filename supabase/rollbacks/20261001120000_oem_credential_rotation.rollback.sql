drop function if exists public.rotate_oem_installation_credentials(uuid, text, integer, text, integer, uuid);

notify pgrst, 'reload schema';
