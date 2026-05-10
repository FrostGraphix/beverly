# Supabase Integration Analysis

## Current State

- The app is Vue 2.
- Vercel serves the SPA.
- Vercel functions serve `/api`.
- SQLite stores operational metadata.
- Live API remains source-of-truth.
- Local samples support offline mode.
- Writes stay guarded.

## Current Local Tables

- `users`
- `roles`
- `permissions`
- `audit_logs`
- `api_cache`
- `import_jobs`
- `export_jobs`
- `print_jobs`
- `write_confirmations`

## Best Supabase Uses

### Auth

Supabase Auth can replace local-only login.

Benefits:

- real password checks
- email-based identity
- refreshable sessions
- audit-friendly user ids
- future role metadata
- safer production access

### Storage

Supabase Storage can hold user files.

Best buckets:

- `uploads`
- `imports`
- `exports`
- `receipts`

Benefits:

- durable file storage
- signed download URLs
- import history linkage
- receipt archiving
- Vercel-safe persistence

### Postgres

Supabase Postgres should replace production SQLite.

Best first tables:

- `audit_logs`
- `api_cache`
- `write_confirmations`
- `import_jobs`
- `export_jobs`
- `print_jobs`

Benefits:

- persistent cache
- persistent audit logs
- faster repeated reads
- cross-deployment continuity
- better operations reporting
- safer compliance trail

### Cache

The current `api_cache` maps cleanly.

Recommended cache key:

- method
- path
- request body hash
- query string
- user scope

Benefits:

- faster table screens
- fewer upstream calls
- outage fallback
- lower live API pressure

### Realtime

Realtime can help dashboards later.

Best candidates:

- import job status
- export job status
- write confirmation status
- operational notifications

### Edge Functions

Use later.

Best candidates:

- receipt generation
- scheduled cache warmups
- contract drift checks
- daily audit summaries

## Project Alignment

Supabase fits this project well.

It should not replace everything.

Live meter APIs remain primary.

Supabase should power:

- identity
- storage
- cache
- audit
- job history
- file history
- reporting support

## Recommended Order

1. Enable Auth.
2. Enable Storage.
3. Add Postgres migrations.
4. Add storage adapter.
5. Migrate audit tables.
6. Migrate cache table.
7. Add signed URLs.
8. Add role metadata.
9. Add dashboard cache warming.
10. Add realtime jobs.

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_ENABLED=true`
- `SUPABASE_STORAGE_ENABLED=true`
- `SESSION_STORE_MODE=supabase`

## Added Now

- Supabase Auth login path.
- Supabase Storage report path.
- Storage bucket helper.
- Admin user helper.
- Supabase Postgres migrations.
- Supabase storage adapter.
- SQLite fallback path.
- API cache opt-in.
- Operational snapshots.
- Export file persistence.
- Receipt HTML persistence.
- Upload artifact persistence.
- Env documentation.
