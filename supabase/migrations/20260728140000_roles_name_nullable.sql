-- Custom access roles: allow public.roles.name to be NULL.
--
-- Background
-- ----------
-- public.roles.name is a legacy CRM column typed as the enum `app_role`
-- (created outside this repo — it appears in no migration here, which is why
-- earlier migrations compare it with `name::text` rather than directly).
--
-- Custom roles are identified by role_key ('custom-<slug>'); their display name
-- lives in role_name/label. There is no valid app_role member for a custom role,
-- so writing `name` at all is impossible for them — and while the column is
-- NOT NULL, inserting a custom role fails outright (22P02 invalid enum input, or
-- 23502 once the application stops sending the column).
--
-- Why nullable rather than a type change
-- --------------------------------------
-- Converting the column to text would alter a type the legacy CRM may still
-- compare against, and is not losslessly reversible. Dropping NOT NULL keeps the
-- enum and every existing value intact: system roles keep their legacy names
-- ('admin', 'ops', 'analyst', 'finance'), custom roles simply carry NULL.
-- Reverting is `set not null` again once any custom roles are removed.
--
-- Idempotent: re-running is a no-op, and it is safe on a database built purely
-- from this repo's migrations, where `name` is already nullable text.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roles'
      and column_name = 'name'
      and is_nullable = 'NO'
  ) then
    alter table public.roles alter column name drop not null;
  end if;
end $$;

comment on column public.roles.name is
  'Legacy CRM role name (enum app_role on legacy databases). NULL for custom roles — use role_key for identity and role_name/label for display.';
