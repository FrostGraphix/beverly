-- The legacy roles.name column uses this enum.
-- Commit the value before seeding the role.
alter type public.app_role add value if not exists 'operations-officer';
