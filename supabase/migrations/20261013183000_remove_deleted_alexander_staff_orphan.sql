-- Reconcile the reported staff profile left behind after its Auth identity was deleted.
-- The guard preserves the profile if either legacy identity column still maps to Auth.
delete from public.users as staff
where lower(trim(staff.email)) = 'o.alexander@acoblighting.com'
  and not exists (
    select 1
    from auth.users as identity
    where identity.id::text = staff.auth_user_id::text
       or identity.id::text = staff.user_id::text
  );
