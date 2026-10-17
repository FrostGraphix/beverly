# Verified remediation execution — 2026-10-17

## Outcome and limits

The measured production database reached **349,547,667 bytes**, below the requested 350,000,000-byte threshold. The initial October 17 measurement was 422,603,923 bytes. This is a point-in-time result, not a sustained-storage guarantee: less than 0.5 MB headroom remained, ingestion catch-up is not verified, and audit writes continue. No application records were deleted or historical financial transactions repaired by these maintenance operations.

## Selected maintenance method

The direct IPv6 database endpoint was unreachable from the current IPv4-only network. The authenticated Supabase pooler configuration returned `aws-1-eu-west-1.pooler.supabase.com` and `postgres.qpoipyqgrjsjdvfqmxok`; the documented session-mode port 5432 worked. This did not change application connection settings.

The previously proposed pg_repack route was not used. Its server extension is available but uninstalled; no client was available, and the installed Docker Desktop failed to start. No Docker factory reset or deletion was performed by this task. No PostgreSQL extension was installed.

PostgreSQL's native **REINDEX TABLE CONCURRENTLY** was selected instead. It rebuilds existing indexes while permitting ordinary inserts, updates and deletes. It does not remove business records, bypass audit immutability or change access policies. Routine non-FULL VACUUM ANALYZE was also tested and applied to readings and aggregates; it did not materially shrink their production allocation. No VACUUM FULL was run.

## Recovery and safety evidence

- Full compressed archive: 25,100,152 bytes, SHA-256 `db432398201e346388d68f09d57f20ae3f11791ffcf73787d66f35a1499d5620`.
- Actual local PostgreSQL restores verified the three meter tables and their selected indexes/unique constraints: 54,806 readings, 54,806 deltas, 92,604 aggregates at the backup snapshot.
- Additional wallet-audit restoration verified all 50,108 snapshot rows and selected indexes/primary key before index maintenance was extended to that table.
- Restoration does not establish full-system recovery. External Storage contents, global roles, managed extensions and omitted foreign keys/triggers/policies were not restored in this limited rehearsal.
- Server filesystem metrics reported approximately 7.60 GB available on `/data`, well above the temporary index-copy requirement. Maintenance preflight observed zero blocked sessions.
- Each operation used one maintenance connection, 32 MB maintenance memory, no parallel maintenance workers, one-second lock timeout and a 120-second statement limit. Routine vacuum used a 30-second limit and two-millisecond cost delay.
- A separate health connection checked blocking every two seconds. Only this task's maintenance session could be cancelled; no application sessions were terminated.
- Before/after comparisons verified exact row counts and ordered row-content digests, index definitions/validity, constraint definitions, triggers, policies and row-security/grant settings. Wallet-audit comparisons covered every row at or before its captured timestamp, allowing legitimate later append-only events.
- Baseline meter counts were 54,801 readings, 54,801 deltas and 92,593 aggregates on October 17, lower than the prior backup. That difference existed before maintenance; all operation-local fingerprints matched. Do not attribute overnight retention changes to these index operations.

| Table | Index bytes before | Index bytes after | Verified baseline rows |
| --- | ---: | ---: | ---: |
| daily_meter_readings | 36,593,664 | 8,519,680 | 54,801 |
| meter_consumption_aggregates | 30,826,496 | 9,764,864 | 92,593 |
| daily_meter_deltas | 20,398,080 | 4,825,088 | 54,801 |
| wallet_audit_log | 23,699,456 | 14,770,176 | 51,823 |

The four index rebuilds reclaimed 73,637,888 bytes of index allocation. Whole-database measurements also include unrelated live growth, so they do not equal this sum.

## Remaining release and operational gates

- Production gained customer-meter fixes while this task ran. Those source-branch changes were merged into the isolated remediation branch, preserving them. Final release CI must cover the latest merged revision.
- GitHub has no `STAGING_API_BASE` or `STAGING_STAFF_TOKEN` secrets. The opt-in API integration suite has not run. Unit tests, builds and typechecks must not be described as full live financial acceptance.
- The last two consumption runs reported `quota_paused` / `hard_stop`; latest retained station readings were October 2–5. This directly confirms an ingestion-freshness problem. A lower database measurement alone does not prove ingestion resumed.
- Catch-up must remain bounded and remeasure capacity between batches. Do not suppress needed readings or delete audit records merely to preserve a displayed sub-350 MB number.
- No 24-hour/seven-day observation window, complete archive-object restore audit, or resolution of every historical error signature has been established.

## Sources

- Direct PostgreSQL snapshots and private before/after evidence JSON generated by `tools/reclaim-meter-indexes.cjs` in the restricted backup directory.
- Supabase Management API project health, pooler configuration and metrics responses, October 17.
- [PostgreSQL 17 concurrent reindex behavior and failure handling](https://www.postgresql.org/docs/17/sql-reindex.html).
- [PostgreSQL 17 routine vacuum behavior and locking](https://www.postgresql.org/docs/17/sql-vacuum.html).
- [Supabase supported session pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [Supabase pg_repack requirements](https://supabase.com/docs/guides/database/extensions/pg_repack).
