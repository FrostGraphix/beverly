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
```

Keep local fallback:

```env
SESSION_STORE_MODE=memory
API_CACHE_ENABLED=false
SNAPSHOT_STORE_ENABLED=false
```

## Apply

Use Supabase SQL editor first.

Run migrations in timestamp order.

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

RLS is enabled.

No anon table policies exist.

Backend uses service role only.

Frontend must not receive service role keys.

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

Run build.
