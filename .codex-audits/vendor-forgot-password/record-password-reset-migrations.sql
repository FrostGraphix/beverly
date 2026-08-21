insert into supabase_migrations.schema_migrations (version, name)
values
    ('20260529140000', 'password_reset_tokens'),
    ('20260821170000', 'password_reset_delivery_repair'),
    ('20260821171000', 'wallet_security_event_delivery_columns')
on conflict (version) do nothing;
