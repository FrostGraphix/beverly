# Data Governance Runbook

## Cadence

Run governance daily.

The hourly cron runs it at midnight UTC.

Manual endpoint:

```powershell
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" "$env:PRODUCTION_TARGET_URL/api/cron/governance-daily"
```

## Retention

- API cache: 7 days
- Snapshots: 90 days
- Exports: 180 days
- Receipts: 365 days
- Imports: 365 days
- Write confirmations: 730 days
- Automation deliveries: 90 days
- Audit logs: keep forever

## Environment

```env
DATA_GOVERNANCE_ENABLED=true
CACHE_RETENTION_DAYS=7
SNAPSHOT_RETENTION_DAYS=90
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

## Restore Acceptance

- Admin can sign in.
- Audit table is readable.
- Latest snapshots exist.
- Exports and receipts exist.
- Role audit has no critical findings.

