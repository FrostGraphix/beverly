-- The legacy roles.name column still uses the app_role enum. Add the value in
-- its own committed migration before the catalog alignment inserts the role.
alter type public.app_role add value if not exists 'developer';
