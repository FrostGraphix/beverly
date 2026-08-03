# Beverly — Storage Remediation: Execution Log & Discoveries

**Period:** 2026-07-29 → 2026-08-03
**Database:** Supabase Free Plan, project ref `qpoipyqgrjsjdvfqmxok`, `eu-west-1`, **compute `t4g.nano`**
**Status:** P1 complete and verified. P2 lock-free subset complete. `VACUUM FULL` deferred.

Every figure here was measured from a primary source at the stated time. Nothing is
estimated unless labelled **[EST]**. Where a prediction was wrong, both the prediction
and the measurement are recorded.

---

## 1. Executed and verified

### P1 — Bound the aggregate orphan prune ✅

**Migration:** `supabase/migrations/20260801090000_bound_aggregate_orphan_prune.sql`
**Applied:** 2026-08-02 21:22 UTC · recorded in `supabase_migrations.schema_migrations`
**Commit:** `bcc4bbc1`

`refresh_meter_reading_aggregates_for_station()` and its wrapper delete any aggregate
bucket with no backing delta. Since `20260725100000` prunes `daily_meter_deltas` to 90
days — while explicitly intending to preserve rollups ("Monthly and yearly rollups
remain 100% intact") — every month/year bucket older than the delta window was orphaned
by construction and destroyed on the next successful refresh.

| Measurement | Value |
|---|---|
| Per-station delete, unguarded | 9,274 month + 445 year = **₦21,380,551.50** |
| Per-station delete, guarded | **0 rows** |
| Wrapper delete, unguarded | 10 month + 4 year = ₦0.00 |
| Delta window | 2026-05-03 → 2026-07-29 |
| `current_date - 90 days` | 2026-05-03 — boundary aligns exactly |

**Verification (GATE P1):** ran `refresh_meter_reading_aggregates_for_station('MUSHA')`
— the exact call that would previously have destroyed the rollups.

```
returned  : pruned_aggs = 0        <-- the destructive path, now inert
month+year: 19,685 -> 19,956
month NGN : 43,632,937.50 -> 43,668,753.00
verdict   : PASS, no rollup loss
```

Rollups *gained* coverage because the refresh created month/year buckets that were
missing. Confirmed still intact after P2: guard on 2/2 functions, 19,956 rows,
₦43,668,753.00.

**Method note.** Both function bodies were captured verbatim from `pg_proc.prosrc` and
the migration was **generated mechanically**, not transcribed. The generator asserts
each anchor is unique, then round-trips the edit back to the original and asserts
equality — output was `per-station body otherwise identical: true` / `wrapper body
otherwise identical: true`. It was then compiled against the live database inside a
transaction that rolled back before commit.

**Deliberately not changed:** the wrapper's `statement_timeout`. That is the job 7 root
cause and belongs to P5; fixing it here would make job 7 start succeeding before the
rest of the refresh contract exists.

**Rollback material:** `tmp/p1/*.prosrc.sql` (original bodies), `tmp/p1/gate-before.json`,
`tmp/p1/gate-after.json`. Tool: `tools/gate-p1.cjs` (read-only, sets
`default_transaction_read_only`).

### P2 — Lock-free reclamation ✅

All four steps ran with a PostgREST health check before and after. Health returned 200
throughout; no exclusive locks were taken.

| Step | Action | DB after | Reclaimed |
|---|---|---|---|
| — | start | 926 MB | — |
| 2.1 | `DROP INDEX meter_consumption_agg_meter_period_idx` | 890 MB | **36 MB** |
| 2.2 | `TRUNCATE api_cache` (336 rows → 0) | 885 MB | **5 MB** |
| 2.3 | `DELETE cron.job_run_details` >7d (9,329 rows) + `VACUUM` | 885 MB | 0 |
| 2.4 | `operational_snapshots.payload_json = '{}'` + `VACUUM` | **840 MB** | **45 MB** |
| 2.5 | `audit_logs` detail/metadata >7d = `'{}'` + `VACUUM` | 843 MB | **0** |

**Net: 926 MB → 843 MB (83 MB), no locks.**

Step 2.1 is reversible — the index definition is recorded in §3.3.

---

## 2. Discoveries that change the plan

### 2.1 Plain `VACUUM` can truncate TOAST — but only when the column is blanked *entirely*

This is the most operationally useful finding, and it cuts both ways.

| Table | Rows blanked | TOAST before → after | DB reclaimed |
|---|---|---|---|
| `operational_snapshots` | **100%** (4,239 of 4,239) | 53 MB → **8.5 MB** | **45 MB** |
| `audit_logs` | **68%** (14,427 of 26,951) | 116 MB → **116 MB** | **0 MB** |

A plain `VACUUM` truncates dead space only at the **end** of the relation file. Blanking
every row makes the whole TOAST dead and truncatable. Blanking a subset leaves dead
chunks interleaved with live ones, so nothing can be returned — the space becomes
*reusable* but stays allocated.

**Rule for future work:** partial blanking prevents growth; only whole-column blanking
reclaims without `VACUUM FULL`.

I predicted 20–90 MB for the `audit_logs` step and explicitly declined to commit to a
figure. The measurement was 0. Recorded so the reasoning is not repeated as fact.

### 2.2 `NOT NULL` on the columns the prior plan wanted to set to `NULL`

```
operational_snapshots.payload_json   jsonb NOT NULL default '{}'
audit_logs.metadata                  jsonb NOT NULL default '{}'
audit_logs.detail                    jsonb NULLABLE default '{}'
```

The prior plan's step 2.4 specified `SET payload_json = NULL`. That fails with
`23502 violates not-null constraint`. Encountered live; the statement was atomic so
nothing changed. Correct value is `'{}'::jsonb`.

### 2.3 The pooler is degraded; PostgREST is ~12× faster

Identical rows (`api_cache`, 50 rows, 5.11 MB), measured 2026-08-02:

| Transport | Time | Rate |
|---|---|---|
| Pooler `aws-1-eu-west-1.pooler.supabase.com` | 48.7 s | ~100 KB/s |
| PostgREST | 4.0 s | ~1300 KB/s |

Synthetic transfer with no TOAST and no JSONB isolates it as transport, not query shape:
1 MB / 19.8 s, 5 MB / 54.9 s, 20 MB / 158.5 s → **52–129 KB/s**. On 2026-07-30 the same
tool sustained ~370 KB/s through the pooler, so it has degraded 3–4×.

**Consequence:** all bulk export moved to PostgREST. `pg` is retained only for catalog
and DDL reads PostgREST cannot serve.

### 2.4 `ctid` keyset pagination is worse than `OFFSET`

```
EXPLAIN  select ... from api_cache where ctid > '(0,0)'::tid order by ctid limit 5000
  Limit
    ->  Sort  (Sort Key: ctid)
          ->  Seq Scan on api_cache  (Filter: (ctid > '(0,0)'::tid))
```

There is no index on `ctid`, so every page is a full sequential scan **plus a sort**.
`OFFSET` is O(n²); `ctid` keyset is O(n²) with an added sort. Both were used in earlier
versions of the backup tool and both are wrong.

### 2.5 The two largest tables have no PRIMARY KEY

Measured across all 130 public tables: **119 single-column PK, 9 composite PK, 2 with no
PK at all.** The two without are the largest in the database:

| Table | Rows | Constraint actually present |
|---|---|---|
| `daily_meter_readings` | 477,994 | UNIQUE `(station_id, meter_id, reading_date)` |
| `meter_consumption_aggregates` | 260,587 | UNIQUE `(station_id, meter_id, period_type, period_start)` |

Their `*_pk`-named constraints are `contype='u'`, not `'p'`. Any tool that assumes a PK
exists — pagination, replication, CDC, ORM tooling — will mishandle these two.

### 2.6 Token PINs in `audit_logs` are accumulating, not static

| Date | `detail` | `metadata` |
|---|---|---|
| 2026-07-30 | 92 | 92 |
| 2026-08-03 (before P2.5) | **260** | **260** |
| 2026-08-03 (after P2.5) | 54 | 54 |

Roughly +56/day. The 54 remaining are inside the 7-day window and will age out, but
**the write path keeps producing them.** Periodic cleanup is not a fix; this needs the
write-side change in P6.

### 2.7 `audit_logs` payload growth rate

| Bucket | Rows | Payload |
|---|---|---|
| Older than 7 days | 14,408 | 87 MB |
| Within 7 days | 12,543 | 41 MB |
| Newest 500 (all the dev console shows) | 500 | **824 kB** |

By action: `download` 16,780 rows / **77 MB**, `create` 8,115 / 39 MB,
`remote_command` 1,846 / 12 MB.

~41 MB per 7 days ≈ **5.9 MB/day**, from a table whose UI surface needs under 1 MB.

---

## 3. Incident — project outage 2026-08-03 ~12:00–14:00 UTC

### What happened

During a full backup over the pooler, the project became unreachable. All services
returned HTTP 522 (Cloudflare cannot reach origin), including a one-row select and
`/auth/v1/health`. The CRM login failed with `timeout of 90000ms exceeded` on
`/user/login`.

Dashboard at the time:

```
STATUS          Unhealthy
Database        Unhealthy
PostgREST       Unhealthy
Auth            Unhealthy
Storage         Unhealthy
Realtime        Healthy      <- separate infrastructure
Edge Functions  Healthy      <- separate infrastructure
COMPUTE         NANO (t4g.nano)
CPU 9%   Disk 16%   RAM 59%
```

`status.supabase.com` showed **all services operational**, eu-west-1 included, with no
active incident. So this was project-specific, not a platform event.

### Cause

**Most likely: memory exhaustion on a 512 MB instance.** `t4g.nano` has 0.5 GB RAM. The
backup was pulling multi-megabyte pages in a loop, and server-side `to_jsonb()` on
TOASTed rows allocates heavily to decompress and re-encode. Low CPU with dead
Postgres-dependent services and healthy independent ones is consistent with an OOM kill
rather than sustained overload.

Not proven from outside — the Database Report logs would confirm or refute it.

### Contributing factor found and fixed

A `node -e` probe (PID 7744) was left holding a pooler session from 12:01. Killed.
Releasing it did **not** restore service, so it was not the primary cause.

### Resolution

Project restart from the dashboard. Confirmed healthy afterwards: REST 200 in 1.8 s,
Auth 200 in 0.7 s.

### Standing rule

**Treat this instance as 512 MB of RAM, because it is.** Any bulk operation — backup,
archive, migration, backfill — must be throttled, small-paged, and health-checked
between steps. This constraint was absent from every prior plan and invalidates
assumptions in all of them.

---

## 4. Backups

| Artifact | Contents | Status |
|---|---|---|
| `tmp/backups/2026-07-30T12-15-04-665Z` | 77 files, 132 tables, 1,017,756 rows, 1.3 GB | **verified PASS** |
| `Desktop/beverly-backup-2026-07-30-verified.tar.gz` | the above, compressed 11:1 | **117.7 MB**, listing verified |
| `tmp/backups-p2/2026-08-03T14-29-59-231Z` | `operational_snapshots` pre-blank | verified PASS, 4,256 rows |
| `tmp/backups-p2/2026-08-03T14-50-26-349Z` | `audit_logs` pre-blank | verified PASS, 26,961 rows / 763 MB / 514 s |

**Supabase's own dashboard reports "LAST BACKUP: No backups".** There is no platform
recovery point. Everything above is on a single disk (C:); this machine has no second
drive and no network share. **Getting a copy off-machine is outstanding and is the
largest unmitigated risk.**

---

## 5. Plan status

Against `DATABASE_AUDIT_VERIFICATION_AND_BUILD_PLAN_2026-07-30.md` (since deleted from
the tree by a `git reset --hard origin/main`; content preserved in conversation).

| Phase | Status | Note |
|---|---|---|
| P0 Backup | **Partial** | Exports verified. **Restore test never performed** — a verified export is not a verified restore. |
| P1 Orphan prune | **Complete** | Applied, gated, verified |
| P2 Storage | **Partial** | Lock-free steps done (83 MB). Steps 2.6–2.8 (`VACUUM FULL`) deferred — see §6 |
| P3 Token backfill | Not started | Upstream returns 100% of history; the old `recover-token-transactions.cjs` is obsolete |
| P4 Rebuild dimensions | Not started | `meters` is a proven Cartesian product: 15,756 rows for 1,128 serials |
| P5 Refresh contract | Not started | Job 7 still failing at 120 s; wrapper lacks the timeout override |
| P6 Security | Not started | Token PINs still being written (§2.6); RLS `USING (true)` unaddressed |
| P7 Signal capture | Not started | 27 of 34 OEM fields still discarded |
| P8 Registry cold start | Not started | `primeStationRegistry()` still never called |

**Deviations from the plan, and why:**

1. **Step order within P2** — index drop moved first, per the plan's own note that it
   must precede any rebuild.
2. **Step 2.4 corrected** — `NULL` → `'{}'::jsonb` (§2.2).
3. **Step 2.5 added** — `audit_logs`, not in the original P2. Reclaimed 0 MB but removed
   206 token PINs.
4. **Steps 2.6–2.8 deferred** — `VACUUM FULL` on a 512 MB instance that has already
   fallen over once today.
5. **Transport changed** — PostgREST replaces the pooler for bulk reads (§2.3).

---

## 6. Remaining path to quota compliance

**Current: 843 MB against a 500 MB limit (169%). Grace ends 2026-08-20 — 17 days.**

The remaining ~343 MB is bloat inside three tables and, on present evidence, only
`VACUUM FULL` returns it:

| Table | Total | Est. reclaim **[EST]** |
|---|---|---|
| `meter_consumption_aggregates` | 298 MB | ~169 MB |
| `daily_meter_deltas` | 142 MB | ~86 MB |
| `daily_meter_readings` | 213 MB | ~46 MB |

**The obstacle is the instance, not the lock.** Rewriting a 298 MB table on 512 MB of
RAM is the same class of operation that took the project down this morning.

Options, in increasing order of risk:

1. **Blank-and-vacuum where a whole column can go.** §2.1 shows this works when the
   column is emptied entirely. Candidate: `daily_meter_readings.row_json` — 49,998
   populated rows on a 7-day rolling window. Blanking *all* of it should truncate the
   TOAST cleanly. No lock, no `VACUUM FULL`.
2. **`VACUUM FULL` smallest-first as a canary** — `daily_meter_deltas` (142 MB) before
   `meter_consumption_aggregates` (298 MB), with a health check and an abort rule.
3. **Temporarily upgrade compute** to Micro or Small for the duration of the vacuum,
   then downgrade. Costs a few dollars and removes the OOM risk entirely. Given the
   morning's outage, this is the option I would argue for.

**Retention alone will not close the gap**: `audit_logs` grows 5.9 MB/day and readings
grow ~2,500 rows/day, so deferring past 2026-08-20 makes the position worse, not stable.

---

## 7. Long-term, revised by these findings

1. **The 512 MB instance is the binding architectural constraint**, not the 500 MB
   storage quota. It caps bulk operations, migrations, and any archive or backfill
   design. Every prior capacity model in this project ignored it.
2. **Write-side fixes, not scheduled cleanup.** Token PINs and audit payloads are
   produced faster than retention removes them (§2.6, §2.7). P6 is a correctness and
   security item, not housekeeping.
3. **Whole-column blanking is a real lock-free tool** (§2.1) and should be preferred
   over `VACUUM FULL` wherever a column can be emptied entirely.
4. **Add primary keys to the two large tables** (§2.5). Their absence will break
   replication, CDC, and any future archival tooling.
5. **PostgREST is the reliable bulk transport** while the pooler is degraded (§2.3).
6. **Off-machine backup is unresolved** and is the single largest risk carried today.

---

## 8. Artifacts

| Path | Purpose |
|---|---|
| `supabase/migrations/20260801090000_bound_aggregate_orphan_prune.sql` | P1 fix (applied) |
| `tools/gate-p1.cjs` | P1 gate, read-only, before/after comparison |
| `tools/backup-database.cjs` | REST-transport verified backup |
| `tmp/p1/*.prosrc.sql` | Original function bodies — P1 rollback |
| `tmp/p1/gate-{before,after}.json` | P1 evidence |
| `tmp/p2/table-keys.json` | PK / UNIQUE map for all 130 tables |

Commits: `bcc4bbc1` (P1), `af208231` (backup tool), `d6cb1eec` (REST rewrite).
