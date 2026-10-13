# Data Governance Runbook

## Cadence

Run governance daily.

The dedicated Vercel cron runs it at midnight UTC.

Manual endpoint:

```powershell
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" "$env:PRODUCTION_TARGET_URL/api/cron/governance-daily"
```

## Retention

- Hot meter readings: 90 days
- API cache: reusable responses only, maximum 64 KiB per response, one-hour expiry,
  and a 16 MiB total JSON payload budget. The daily one-day cleanup is a fallback.
- Snapshots: 14 days
- Exports: 180 days
- Receipts: 365 days
- Imports: 365 days
- Write confirmations: 730 days
- Automation deliveries: 90 days
- Audit logs: keep forever

Export retention covers export job metadata and stored export artifacts. The source reports and consumption archives remain governed by their own retention policies.

## Environment

```env
DATA_GOVERNANCE_ENABLED=true
CONSUMPTION_HOT_RETENTION_DAYS=90
RAW_HOT_WINDOW_DAYS=90
CACHE_RETENTION_DAYS=1
SNAPSHOT_RETENTION_DAYS=14
EXPORT_RETENTION_DAYS=180
PRINT_RETENTION_DAYS=365
IMPORT_RETENTION_DAYS=365
WRITE_CONFIRMATION_RETENTION_DAYS=730
AUTOMATION_DELIVERY_RETENTION_DAYS=90
```

## Dry Run

```powershell
curl.exe -X POST "$env:PRODUCTION_TARGET_URL/api/local/governance/cleanup" `
  -H "Content-Type: application/json" `
  -d "{\"dryRun\":true}"
```

## Role Audit

```powershell
curl.exe -X POST "$env:PRODUCTION_TARGET_URL/api/local/governance/role-audit" `
  -H "Content-Type: application/json" `
  -d "{}"
```

## Backup Drill

Monthly:

1. Export Supabase database backup.
2. Restore into staging project.
3. Verify auth login.
4. Verify storage buckets.
5. Verify dashboard reads.
6. Verify snapshot reads.
7. Verify receipt download.
8. Record result in `data_governance_runs`.

## Storage pressure and safe cache maintenance

The daily governance job measures `pg_database_size` and sends one notification
per super admin per day once `DATABASE_QUOTA_WARN_PERCENT` of
`DATABASE_QUOTA_MB` is reached. Monitor the job result; a failed measurement
must not be interpreted as zero usage. These are decimal MB, matching the
consumption-sync quota check. At the current 500 MB budget, 70% is the alert
threshold. Recheck the actual plan limit in Supabase before changing it.

After deploying the bounded-cache migration and application writer, the old
`api_cache` may be cleared to return its heap, TOAST, and index space. Record
`pg_total_relation_size('public.api_cache')` and the database size before and
after. `TRUNCATE public.api_cache` discards only disposable cached responses;
upstream data will be fetched again. Expect a temporary increase in upstream
reads. Do not clear it while an old application deployment still writes
unbounded entries. Do not truncate meter readings, deltas, or aggregates:
they contain live source data. `pg_stat_user_tables.n_live_tup` can be stale;
use exact `count(*)` before treating any table as empty. Never use a broad
`VACUUM FULL` as a substitute for identifying the growing relation.

## Restore Acceptance

- Admin can sign in.
- Audit table is readable.
- Latest snapshots exist.
- Exports and receipts exist.
- Role audit has no critical findings.

