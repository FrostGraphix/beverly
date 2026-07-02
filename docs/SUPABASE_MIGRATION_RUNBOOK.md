# Supabase Migration Runbook

## Purpose

Move production metadata from SQLite into Supabase Postgres.

## Migrations

- `supabase/migrations/20260505124500_crm_operational_storage.sql`
- `supabase/migrations/20260505125000_storage_buckets.sql`

## Tables

- `roles`
- `users`
- `permissions`
- `audit_logs`
- `api_cache`
- `import_jobs`
- `export_jobs`
- `print_jobs`
- `write_confirmations`

## Runtime Switch

Use Supabase storage:

```env
SESSION_STORE_MODE=supabase
SUPABASE_AUTH_ENABLED=true
SUPABASE_STORAGE_ENABLED=true
API_CACHE_ENABLED=true
SNAPSHOT_STORE_ENABLED=true
DATA_GOVERNANCE_ENABLED=true
```

Keep local fallback:

```env
SESSION_STORE_MODE=memory
API_CACHE_ENABLED=false
SNAPSHOT_STORE_ENABLED=false
DATA_GOVERNANCE_ENABLED=false
```

## Apply

Run migrations in timestamp order.

Before pushing:

```powershell
npx supabase migration list --linked
npx supabase db lint --linked --level error
npx supabase db push --linked --dry-run
```

Stop when migration histories differ.
Never repair production history blindly.

Apply only from reviewed CI:

```powershell
npx supabase db push --linked
```

Then verify:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'roles',
    'users',
    'permissions',
    'audit_logs',
    'api_cache',
    'import_jobs',
    'export_jobs',
    'print_jobs',
    'write_confirmations'
  )
order by table_name;
```

Verify buckets:

```sql
select id, name, public, file_size_limit
from storage.buckets
where id in ('uploads', 'imports', 'exports', 'receipts')
order by id;
```

## Security

Every public table forces RLS.

No anon table policies exist.

Authenticated database writes are revoked.

Backend mutations use service role.

Authorization uses database identity mappings.

User metadata grants no permissions.

Frontend must not receive service role keys.

Verify RLS coverage:

```sql
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and (not c.relrowsecurity or not c.relforcerowsecurity);
```

Expected result: zero rows.

Verify browser privileges:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type <> 'SELECT';
```

Expected result: zero rows.

Test customer and vendor isolation.

Test every staff permission role.

Test internal messages stay hidden.

Test public views stay backend-only.

## Key Rotation

Rotate these in Supabase dashboard:

- service role key
- anon key
- publishable key
- secret key
- database password

Then update:

- local `.env`
- Vercel environment variables
- any CI secrets

Redeploy after rotation.

Run login smoke test.

Run storage report smoke test.

Run cached read fallback.

Run CSV export storage.

Run receipt storage.

Run upload storage.

Run cron refresh smoke:

```powershell
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" "$env:PRODUCTION_TARGET_URL/api/cron/refresh-hot"
```

Run governance smoke:

```powershell
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" "$env:PRODUCTION_TARGET_URL/api/cron/governance-daily"
```

Run build.
