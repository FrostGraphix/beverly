# Verified remediation execution — 2026-10-17

## Outcome and limits

The measured production database reached **340,077,715 bytes**, below the requested 350,000,000-byte threshold. A subsequent live read at database time 2026-10-17T10:08:20.888Z measured **340,176,019 bytes**. The initial October 17 measurement was 422,603,923 bytes. This is a point-in-time result, not a sustained-storage guarantee: approximately 9.82 MB headroom remained at the subsequent read, ingestion catch-up is not verified, and audit writes continue. No application records were deleted or historical financial transactions repaired by these maintenance operations.

## Selected maintenance method

The direct IPv6 database endpoint was unreachable from the current IPv4-only network. The authenticated Supabase pooler configuration returned `aws-1-eu-west-1.pooler.supabase.com` and `postgres.qpoipyqgrjsjdvfqmxok`; the documented session-mode port 5432 worked. This did not change application connection settings.

The previously proposed pg_repack route was not used. Its server extension is available but uninstalled; no client was available, and the installed Docker Desktop failed to start. No Docker factory reset or deletion was performed by this task. No PostgreSQL extension was installed.

PostgreSQL's native **REINDEX TABLE CONCURRENTLY** was selected instead. It rebuilds existing indexes while permitting ordinary inserts, updates and deletes. It does not remove business records, bypass audit immutability or change access policies. Routine non-FULL VACUUM ANALYZE was also tested and applied to readings and aggregates; it did not materially shrink their production allocation. No VACUUM FULL was run.

## Recovery and safety evidence

- Full compressed archive: 25,100,152 bytes, SHA-256 `db432398201e346388d68f09d57f20ae3f11791ffcf73787d66f35a1499d5620`.
- Actual local PostgreSQL restores verified the three meter tables and their selected indexes/unique constraints: 54,806 readings, 54,806 deltas, 92,604 aggregates at the backup snapshot.
- Additional wallet-audit restoration verified all 50,108 snapshot rows and selected indexes/primary key before index maintenance was extended to that table.
- Additional API-audit restoration verified all 165,028 snapshot rows and its selected index before extending concurrent reindexing to `audit_logs`.
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
| audit_logs | 11,624,448 | 9,011,200 | 165,937 |

The five index rebuilds reclaimed 76,251,136 bytes of index allocation. Ordinary vacuum of `daily_meter_deltas` additionally reclaimed 6,856,704 bytes of empty trailing pages, reducing its total relation size from 23,707,648 to 16,850,944 bytes. Its 54,801 rows and schema fingerprints matched before/after. Whole-database measurements also include unrelated live growth, so they do not equal the gross 83,107,840-byte relation-space saving.

## Growth, logging and egress follow-up

An authenticated Supabase Management API log aggregate covered exactly 2026-10-17T09:10:58.6274096Z through 09:20:58.6274096Z. It grouped by source and normalized request path, limited to 25 groups. Examples: 24 `vendor_users`, 18 `notifications`, 17 `touch_portal_session`, and 15 `/auth/v1/user` gateway entries. The last group reported 7,212 content-length bytes. These are observed log entries and response header sizes, **not billed egress**, total ingestion bytes, unique user actions, or a monthly attribution. Missing lengths and overlapping service logs prevent that inference.

Source inspection confirmed all three portal notification shells used unconditional intervals while mounted (admin 30 seconds; vendor/customer 60 seconds), with no hidden-page or in-flight guard. The remediation introduces one shared visible/online polling helper. Hidden/offline tabs skip background reads, visibility/online transitions refresh immediately, slow scheduled reads cannot overlap, and unmount removes timer/listeners. Existing notification push/count events, authenticated API handling, foreground intervals, and financial/security logging are unchanged. This avoids optional requests at their source; the resulting production byte savings remain unmeasured until release.

Read-only PostgreSQL observations additionally established:

- `consumption_aggregates` had 209,814 cumulative update events. `pg_stat_database.stats_reset` returned null, so this is **not a daily growth rate**.
- The live `refresh_consumption_aggregates()` definition unconditionally updates totals and `last_refreshed_at` on each conflict in its three scope branches. Change-only updates are a candidate, not yet applied: timestamp semantics and all consumers must be reviewed first. Do not change the separate delta refresh timestamps blindly; those identify affected aggregate buckets.
- During the rolling 24-hour audit query, `audit_logs` contained 1,247 `download` action rows. A later resource breakdown returned 1,241 for `/api/cron/wallet-maintenance` and six other cron paths. The enum label alone does **not** mean users downloaded files or generated equivalent external egress. These operational records were retained.
- Wallet audit actions included purchase previews, purchases, remote-send outcomes and login events. High counts alone do not establish duplication or justify deleting security/payment evidence.

Regression coverage exercises hidden startup/ticks, visible resume, offline suppression, reconnect, overlap prevention, failure recovery and teardown. The three portal typechecks and final CI must cover the new revision before release. Remaining chat/dashboard polling, aggregate refresh optimization and post-release traffic comparison are not claimed complete.

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
