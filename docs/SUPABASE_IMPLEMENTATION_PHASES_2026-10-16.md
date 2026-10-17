# Data-preserving remediation execution

Branch: `codex/supabase-safe-remediation`, based on verified production commit `28b0d5f0`.
The final audit in `SUPABASE_FINAL_AUDIT_2026-10-16.md` is the baseline, not a claim that every historical issue remains current.

## October 17 status update

The October 16 prerequisites below are historical. See `SUPABASE_EXECUTION_2026-10-17.md` for the executed recovery, concurrent index rebuilds, ordinary vacuum and before/after evidence. The five restored table subsets passed their checks; full-system recovery remains unverified. Production allocation reached 340,077,715 bytes and a later read measured 340,176,019 bytes. No application rows were deleted by this task's reclamation operations. Phase 4's point-in-time allocation target is achieved, but catch-up and sustained capacity are not verified.

Shared notification polling now skips hidden/offline tabs, prevents overlapping scheduled requests, resumes on visibility/connectivity changes and cleans up on unmount. Admin, customer and vendor shell typechecks plus behavioral regression tests passed locally. The 5a4d7254 revision was pushed to PR 185; hosted builds and production release still require verification. Financial/security audits and authorization checks were not disabled. No monthly egress or ingestion saving is inferred from a ten-minute request sample.

## Phase 1 — shared retry correctness (implemented locally)

- `captureHold` recognizes both live PostgreSQL error strings and older variants. No new debit, retry, or database function change.
- `createReceipt` re-reads only the requested order after SQLSTATE 23505. Returns the existing immutable receipt without overwriting historical values. Unrelated collisions and failed reads still fail.
- Existing database uniqueness remains the authority. No new receipt table or duplicate store.

## Phase 2 — proof-signing request reduction (implemented locally)

- Existing `attachProofUrls` callers already filter funding rows by owner/admin scope before signing.
- Replace per-row calls with the installed Supabase SDK's `createSignedUrls`, up to 100 unique paths per batch.
- Map responses by path, preserve row order, null missing/failed links, retain 1,800-second expiry. No cross-request caching, authorization changes, new endpoints or database writes.
- This reduces signing HTTP request counts in this code path. No measured production egress/storage savings are claimed.
- SDK evidence: installed `@supabase/storage-js@2.105.4/src/packages/StorageFileApi.ts`, `createSignedUrls` request and response types.

## Validation

- Final phase 1/2 suite: 86 backend test files, 560 tests passed under Node 22.23.3; TypeScript check passed.
- Full six-component build completed with exit code 0 using explicit Node 22 and Corepack JS entrypoint (avoids Windows Corepack shim selecting Node 24): backend, CRM, admin, vendor, customer and landing. Existing bundle/import warnings remain; no build errors.
- Hosted CI at `33bbd290ec90afe29e5bc9c3526ceb3d8e7391a7` passed backend tests, all three frontend typechecks, frontend builds, acceptance checks, and Production Hardening build/contracts. E2E API integrity was skipped, not passed. These checks do not establish live PostgreSQL concurrency or browser acceptance.
- Draft PR https://github.com/FrostGraphix/beverly/pull/185 targets the current production source branch, preserving seven deployed staff/signup commits absent from main. Vercel preview passed. Production promotion and post-release measurements remain pending.

## Phase 3 — recovery and storage prerequisites (in progress)

Current API returned no platform backups and PITR disabled; July export is insufficient. Native PostgreSQL 17.7 tools are available despite Docker being unavailable. The user explicitly authorized export despite additional egress risk after the dashboard showed 6.12/5 GB. No paid upgrade was made.

A single compressed full-database export completed into the existing local `tmp/backups` area, in a newly restricted directory. It used a shared read-only repeatable-read snapshot, one dump process, and successful periodic health probes. Snapshot evidence reports PostgreSQL 17.6 and 419,474,579 database bytes at server timestamp `2026-10-16T16:20:10.425Z`. The local directory timestamp differs; clocks are not assumed synchronized. Archive size: 25,100,152 bytes. SHA-256: `db432398201e346388d68f09d57f20ae3f11791ffcf73787d66f35a1499d5620`. Archive and private credentials remain local, outside this commit.

An isolated password-protected local PostgreSQL instance on 127.0.0.1:55437 successfully restored `daily_meter_readings`, `daily_meter_deltas`, and `meter_consumption_aggregates`, including their selected indexes and unique constraints, in one transaction. Archive SHA-256 matched. Exact restored counts matched the shared production snapshot: 54,806 readings, 54,806 deltas and 92,604 aggregates. Foreign keys, policies, triggers, managed extensions, global roles and external Storage object contents are not covered by these checks. Full-system recovery remains unverified.

| Relation | Production allocation | Restored allocation | Matched rows |
| --- | ---: | ---: | ---: |
| daily_meter_readings | 78,561,280 | 19,013,632 | 54,806 |
| daily_meter_deltas | 39,280,640 | 12,828,672 | 54,806 |
| meter_consumption_aggregates | 64,094,208 | 17,416,192 | 92,604 |

Allocations are bytes. The fresh-copy difference supports physical reclamation as a promising data-preserving approach, not a guaranteed production saving. Local PostgreSQL differs in patch version and environment; production writes continue. Latest SQL at `2026-10-16T16:29:05.023Z` still measured 419,474,579 database bytes and zero blocked sessions. Statistics reported zero live rows despite exact backup counts, confirming those estimates cannot establish actual row counts or bloat.

Physical reclamation remains gated. Supabase documents that full-table pg_repack needs approximately twice the target table/index size as free disk space: https://supabase.com/docs/guides/database/extensions/pg_repack . Local free disk does not establish remote disk headroom. PostgreSQL documents that table-filtered restores omit dependent objects: https://www.postgresql.org/docs/17/app-pgrestore.html . No table purge or compaction has run.

Authenticated Management API metrics reported `/data` capacity 8,350,298,112 bytes and available 7,604,224,000 bytes; root available 2,438,205,440 bytes. This exceeds twice the largest target allocation at measurement time. Source endpoint: `GET /v1/projects/qpoipyqgrjsjdvfqmxok/analytics/endpoints/metrics`; documentation: https://supabase.com/docs/reference/api/v1-scrape-project-metrics . Disk headroom must be rechecked immediately before maintenance.

The server offers pg_repack 1.5.2 but it is not installed. No pg_repack client was found on PATH; WSL lists only Docker Desktop, whose engine was previously unavailable. The native alternative, VACUUM FULL, preserves rows but takes an exclusive table lock. Maintenance mode/availability tradeoff requires confirmation before proceeding; no lock-taking production rewrite has been attempted. See https://supabase.com/docs/guides/platform/database-size .

Verify current worker identity, ingestion configuration, archive objects/checksums and restoration, quota billing scope and remaining errors. Trace high-volume balance/auth calls before optimizing; never cache debit-authorization balances or weaken revocation checks.

## Phase 4 — reclaim allocation without deleting business records (gated)

Revalidate actual reclaimable space and maintenance prerequisites. Compact eligible relations one at a time only after backup/restore, disk and lock gates. No retention purge, audit deletion, historical-charge repair or bulk export is authorized by this implementation artifact. Target remains measured allocation below 350,000,000 bytes after ingestion catch-up, not an estimated outcome.

## Phase 5 — release and sustained verification (pending)

Review exact diff and production/main divergence. Release only tested changes; preserve production-only staff/signup fixes. Verify funding history/proof access/receipt retries and financial invariants without live test charges. Record actual builds, CI, deployment, before/after allocation and traffic. Continue bounded observation; do not label pending work complete.
