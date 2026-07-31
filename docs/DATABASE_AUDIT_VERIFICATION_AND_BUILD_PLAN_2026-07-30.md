# Beverly — Independent Verification Audit & End-to-End Build Plan

**Date:** 2026-07-30
**Audits under verification:** `docs/DATABASE_ARCHITECTURE_AUDIT_AND_PLAN_2026-07-29.md`, `docs/DURABLE_OBJECTS_PROTOTYPE_SPEC.md`, and a third-party live-API report (`audit_findings.md` / `tmp/live-api-audit-report.json`)
**Status:** Verification complete. No production writes were made. Implementation plan is executable as written.

---

## 0. Provenance

Every number in this document was measured from a primary source between **2026-07-30 13:01–14:50 UTC**. Nothing is carried over from the audits under review unless independently re-measured.

| Source | Method |
|---|---|
| Live Postgres | Pooler session, `default_transaction_read_only = on`, `pg_*` catalogs, `count(*)`, `EXPLAIN (ANALYZE, BUFFERS)` |
| Calin OEM API | `http://8.208.16.168:9310`, bearer auth, **read endpoints only** (probe client hard-blocks any path not matching `/(read\|readMore\|readMonthly\|readLineChart\|readPanelGroup)$`) |
| Migration history | `supabase/migrations/*.sql`, `supabase_migrations.schema_migrations` |
| Job behaviour | `cron.job.command`, `cron.job_run_details` |
| Function bodies | `pg_proc.prosrc`, `pg_proc.proconfig` |
| Bloat | `pg_stats.avg_width` model with an in-table control |
| Cloudflare limits | `developers.cloudflare.com` product docs (not the plans marketing page) |
| Application behaviour | Direct source reading; test suite and build executed |

Modelled values are labelled **[M]** with the model and its control stated.

**Headline measurements**
- `pg_database_size` = 943,303,827 B = **899.6 MiB** (quota 500 MB; grace ends 2026-08-20)
- PostgreSQL 17.6, project ref `qpoipyqgrjsjdvfqmxok`
- 130 tables, 230 RLS policies, 57 functions, 12 views (3 materialized), 15 cron jobs

---

## 1. Evidence register

### 1.1 Unrecoverable-loss defect — found by no prior audit

**Root cause: two migrations implement contradictory retention policies.**

| Migration | Action |
|---|---|
| `20260717130000_consumption_refresh_prune_orphans.sql:115` | Adds a per-period delete inside `refresh_meter_reading_aggregates_for_station`: remove any aggregate bucket with no backing delta |
| `20260722150000_optimize_consumption_aggregate_pruning.sql` | Rewrites it to a range predicate — faster, identical destructive semantics |
| `20260725100000_database_quota_resolution.sql` | Deletes `daily_meter_deltas` older than 90 days, explicitly preserving month/year rollups: *"Monthly and yearly rollups remain 100% intact for long-term trends"* |

`daily_meter_deltas` now spans **2026-05-01 → 2026-07-29 only**. Running the live function's own predicate against live data:

| Period type | Total rows | Orphaned — would be deleted |
|---|---|---|
| `month` | 16,729 | **9,273 (55%)** |
| `year` | 2,956 | **444 (15%)** |

**Value at risk: ₦21,380,551.50 and 61,995.0 kWh.**

These rows survive **only because cron job 7 has failed since 2026-07-14**. Any successful refresh — scheduled, admin-triggered, or the old plan's Phase 4 — destroys them.

**The loss is unrecoverable.** `/api/tariff/read` returns **7 rows, current state only, no time series**. Beverly's `tariff_rate_history` is a single snapshot (all 7 rows share `observed_at = 2026-07-22 10:32:38`, with `effective_from` back-filled from upstream `updateDate`). Historical tariff prices exist nowhere — not upstream, not in Beverly, not in any backup.

### 1.2 `meters` is a Cartesian product — mathematically proven

| Measurement | Value |
|---|---|
| Rows | 15,756 |
| Distinct `meter_sn` | **1,128** |
| Meters where `rows = distinct_accounts × distinct_customers` | **1,128 of 1,128 — zero exceptions** |
| Duplicate counts observed | 169, 64, 49, 36, 25, 16, 9, 4, 1 — **every one a perfect square** |
| `upstream_id` populated (this column carries `UNIQUE`) | **0 of 15,756** |
| `upstream_meter_id` populated | **15,756 of 15,756** |
| `site_id` populated | **0 of 15,756** |

The April 2026 import cross-joined meters × accounts × customers. A `UNIQUE (upstream_id)` constraint exists and was defeated because the import wrote the natural key into `upstream_meter_id` instead, and Postgres permits unlimited NULLs in a unique index.

**Dedup blast radius — measured, and empty:**

| Referencing column | Rows | Non-null FK values |
|---|---|---|
| `meter_events.meter_id` | 0 | 0 |
| `remote_tasks.meter_id` | 0 | 0 |
| `token_transactions.meter_id` | 5,511 | **0** |

Nothing references `meters.id`. The table can be rebuilt safely.

### 1.3 Dimension gaps — verified against upstream

| Entity | Upstream (authoritative) | Beverly | Missing |
|---|---|---|---|
| Deployed meters (`/api/account/read`) | **2,514** | 1,125 present | **1,389 (55.2%)** |
| Customers (`/api/customer/read`) | **2,562** | 1,129 | **1,433 (55.9%)** |
| Token records (`/api/token/creditTokenRecord/read`) | **17,352** (17,356 on recheck) | 5,511 | **11,841 (68.2%)** |
| Daily readings (`/api/DailyDataMeter/read`) | **468,752** | 465,993 | **2,759 (0.59%)** |
| Reporting meters absent from upstream accounts | — | — | **0** |
| Dimension meters absent from upstream registry | — | — | **0** |

`/api/meter/read` returns 7,668, but **4,729 sit on placeholder station `0001`** — undeployed stock. `/api/account/read` (2,514) is the authoritative deployed set and independently reproduces the original audit's 1,387 figure (measured: 1,389; the 2 difference is accounts that have never reported).

`/api/station/read` returns **9 stations**: `0001`, `admin`, `BONDU` (created 2026-07-17), `KADUNA` (2026-05-11), and the 5 production stations. `list_consumption_station_ids()` correctly returns exactly the 5.

### 1.4 The token recovery is unnecessary

`/api/token/creditTokenRecord/read` returns the complete vending history in 4 paginated calls: **17,352 records, 17,352 distinct `receiptId` (100% unique)**, each carrying `receiptId`, `stationId`, `meterId`, `customerId`, `customerName`, `tariffId`, `totalPaid`, `totalUnit`, `token`.

| Metric | Upstream, measured | Original audit's dashboard baseline | Delta |
|---|---|---|---|
| Records | 17,352 | 17,338 | +14 |
| Money | **₦62,380,516.50** | ₦62,349,916.50 | +₦30,600 |
| Units | **176,664.3 kWh** | 176,577.6 kWh | +86.7 kWh |

The delta is one partial day of vending — **the baseline is verified**. Consequences:

- **May 2026 is not a gap.** Upstream holds **3,541 records / ₦11,623,325** for May.
- **The 2.5% residual needs no upstream re-fetch** — a direct backfill reaches 100%.
- **The timezone question is moot** under a stable key.
- **The "22 unresolved stations" are 22 records upstream labels station `0001`** — correctly-identified junk at source, not a dimension defect.

**Timezone, measured against real UTC captured either side of each call:**

| Feed | Max `createDate` | Real UTC | Offset |
|---|---|---|---|
| `/api/token/creditTokenRecord/read` | `2026-07-30 13:39:21` | `13:35:23` | **+4 min (clock skew — is UTC)** |
| `/api/DailyDataMeter/read` | `2026-07-30 14:38:51` | `13:35:22` | **+63 min (not UTC)** |

The original author's "createDate is UTC, offset 0" is **correct** for the token feed. The two upstream subsystems do not share a clock — a fact no audit noted, and a hazard for mapping `createDate` to `upstream_at`.

### 1.5 Flag polarity is correct — the real hazard is the no-data sentinel

Across 10,000–20,000 live readings:

| | n | drawing energy (`usage1>0`) | `remain1 = 0` | no-data (`total1 = -1`) |
|---|---|---|---|---|
| `relayOpen = true` | 5,664 | 70.8% | **0** | **0** |
| `relayOpen = false` | 4,336 | 6.8% | 1,905 | 1,678 |

**Not one meter with credit remaining ever reports `relayOpen = false`.** Polarity is inverted exactly as documented; `conditionActive()` is correct; **the alarm design is not inverted.**

**The actual false-alarm mode:** five flags — `magneticInterference`, `coverOpen`, `source2Activated`, `currentReverse`, `currentUnbalance` — read `false` on **exactly the same 3,538 of 20,000 rows**, precisely the `total1 = -1` no-data sentinels. **17.7% of readings.** A bitmask with no no-data state fires five concurrent critical tamper alarms on one reading in six. Neither prior audit mentions this.

Two `conditionActive()` implementations exist and **disagree**: `backend/src/services/abnormal-alarm-service.js:22` has a numeric branch (`typeof value === "number" → value > 0`) that `src/services/consumption-aggregator.mjs:72` lacks.

### 1.6 Bloat — measured, with a validating control

Model: index = `ItemId(4) + IndexTuple(8) + MAXALIGN(sum(pg_stats.avg_width))` at 90% fill; heap = `avg(pg_column_size(row)) + 28` at 95% fill.

**Control:** `meter_consumption_agg_station_period_idx` measures **8.4 MB actual vs 8.0 MB modelled = 1.05×** — same table, same row count. The model does not systematically over-predict.

**Stated model limitation:** `daily_meter_readings_station_date_idx` measures 4.4 MB vs 13.8 MB modelled (−9.4 MB). Btree deduplication compresses very low-cardinality keys below the model. Negative reclaims are excluded from all totals below.

`meter_consumption_aggregates` (271,089 live rows, avg row 109.5 B):

| Index | Key width | Actual | Modelled | Bloat |
|---|---|---|---|---|
| `..._period_range_idx` | 26 B | 53.6 MB | 12.6 MB | 4.24× |
| `..._pk` | 26 B | 47.1 MB | 12.6 MB | 3.72× |
| `..._station_meter_idx` | 26 B | 41.3 MB | 12.6 MB | 3.27× |
| `..._meter_period_idx` | 20 B | 36.0 MB | 10.3 MB | 3.48× |
| `..._meter_period_start_idx` | 20 B | 36.0 MB | 10.3 MB | 3.48× |
| `..._station_period_idx` (control) | 14 B | 8.4 MB | 8.0 MB | **1.05×** |

| Table | Heap reclaim | Index reclaim | Total |
|---|---|---|---|
| `meter_consumption_aggregates` | 38.6 MB | 156.0 MB | **194.6 MB** |
| `daily_meter_deltas` | 38.6 MB | 47.7 MB | **86.3 MB** |
| `daily_meter_readings` | 34.7 MB | 11.4 MB | **46.1 MB** |
| | | | **327 MB** |

Mechanism: `n_dead_tup = 0` with 9 autovacuums on 2026-07-30. This is **not** dead tuples — it is free space at the file high-water mark from full-rebuild delete/insert churn. Only `VACUUM FULL` / `REINDEX` returns it to the OS.

### 1.7 Other verified facts

| Fact | Evidence |
|---|---|
| DB growth | Over a measured 24-minute window, growth was 73,728 B (9 pages). **No rate is asserted** — a two-point comparison across differently-taken measurements would be extrapolation. |
| Job 7 | **62 successes** (last 2026-07-14 00:30, max 118 s), 218 failures at exactly 120.1 s, first failure 2026-05-21. Root cause: `refresh_meter_reading_aggregates` has `proconfig = {search_path=public}` — **no timeout override**; the DB default is `statement_timeout = 120000`. The 600 s setting exists only on the inner per-station function. That all 62 successes are <120 s and all 218 failures are exactly 120.1 s is conclusive. |
| Job 3 | `cleanup_app_retention_daily` failed **70 of 107 runs** on `invalid input value for enum public.remote_task_status: "success"`. Self-resolved 2026-06-23. |
| RLS | `authenticated` (`rolbypassrls = false`) reads **all 1,129 customers, 15,756 meters, 1,128 accounts, 6 sites**. Money tables correctly return 0. `anon` has no table grants. **16 tables have RLS enabled with zero policies.** Of 1,129 customers, 1 has an email and 1 has a phone. |
| Plaintext token PINs | `operational_snapshots` 87, `api_cache` 2, **`audit_logs.detail` 92, `audit_logs.metadata` 92**. All 17,352 upstream records carry a plaintext `token`. `token_transactions.raw_payload` currently holds **0**. |
| 34 OEM fields | `/api/DailyDataMeter/read` returns exactly **34**; the 935 stored payloads carry 35 keys (34 + Beverly's `rawDuplicateIndex`). `daily_meter_readings` persists exactly **7**. |
| `meterType` | **Not** a DailyDataMeter field. It exists on `/api/account/read` and the token feed, and is `0` for all 2,514 accounts. |
| `createId` | `"System"` on DailyDataMeter, but the **vendor identity** on token records (e.g. `"TUNGA_VENDOR 1"`). |
| `row_json` | **49,998 rows populated** (rolling 7-day window per cron job 18), 415,995 blank — not "0 remain". |
| Tariff defect | ``Collabo` `` — upstream **₦400**, Beverly **₦430**. `account_tariff_history` covers 2,489 of 2,514 accounts. |
| Registry | `primeStationRegistry()` is **never called** — only defined, exported, and named in a comment at `refresh-targets.js:66`. Four sync call sites read `SEED_STATIONS` on every cold start, including the poll/backfill fan-out at `refresh-targets.js:71`. |
| Tests & build | 7/7 relevant suites pass; `vite build` exit 0 in 16.5 s. |
| Refresh route | `/api/local/consumption/refresh-aggregates` (`api/reference.js:2503`) has **no authorization check in the handler** and is called as an automatic fallback from `consumption-service.mjs:504`. |
| Cloudflare | DO rows read = **5M/day, not 50M**. Indexed writes bill ≥1 extra row each. Subrequests **50/request**, 6 concurrent connections. R2 Class A **1M ops/month**. DO CPU 30 s (not the Workers 10 ms). |
| Money capacity | `token_transactions` measured **1,119 B/row all-in** (227 B logical, 601 B heap, 9 indexes). Purchase fan-out = **5 rows** ≈ 4.4–8.2 kB. The audit assumes 250 B — understated 20–33×. |

---

## 2. Corrections to the audits under review

### 2.1 `DATABASE_ARCHITECTURE_AUDIT_AND_PLAN_2026-07-29.md`

**Verified:** ingestion is flat (not the growth driver); the refresh function is unbounded; the two indexes are byte-identical and the `create index if not exists` name-matching mechanism is confirmed in the 17 July migration; §6A's reference-data finding; the July index origin dates; the dashboard reconciliation baseline; flag polarity; the 34 fields; §10A.1's self-correction about the wallet test (`refreshedStations === 6` at line 116); `createDate` is UTC.

**Wrong:**

| Claim | Correction |
|---|---|
| Job 7 "has never succeeded" | 62 successes; last 2026-07-14; first failure 2026-05-21 — before the July indexes |
| `meter_consumption_aggregates` 552,391 rows | **271,089** |
| `daily_meter_deltas` 463,086 rows | **219,280** |
| `api_cache` 1,383 rows | **403** |
| Aggregates index 211 MB | **222.4 MB** |
| Trigger at `consumption-service.mjs:485` → `reference.js:2491` | **`:504` → `:2503`** |
| "No code anywhere writes these tables" | True for `meters`/`accounts`/`sites`; **false for `customers`** — INSERT at `customer-auth.ts:434,719` plus UPDATE/DELETE across `backend/wallet/`, the directory never searched |
| Dedup "on `receiptId`… identity independent of the timestamp" | The final dedup at `recover-token-transactions.cjs:174` is `distinct on (meter_sn, transaction_ts, amount)`; `receiptId` dedup applies only inside the `shape_b` CTE |
| `row_json`: "0 rows remain" | **49,998 populated**, by design (7-day rolling window) |
| Phase 1.4 recovers ~100 MB | **55 MB** |
| Phase 1.7 recovers ~90 MB | **0 MB** — zero rows qualify; job 18 already does this nightly |
| §4.2 lists `meterType` as a DailyDataMeter field | Not present in the 34 |
| §4.2: `createId`/`updateId` "constant `System`" | True for DailyDataMeter; the token feed carries vendor identity |
| §6.1 "Vending records exist nowhere else" | They exist upstream, complete and uniquely keyed |
| §11.0.2 DO adoption arithmetic | Reads 5M/day not 50M; writes ≥40,300/day not 20,300 |
| §8.5 money budget 113 MB / 24 months | ≈990 MB–1.88 GB/year. **Project A breaches 500 MB in year 1, not year 5** |
| §33 TRUNCATE+rebuild "safe" | Not value-reproducible; no tariff history exists anywhere |

**Unverifiable with read-only access:** the recovery tool's dry-run outputs (16,901 / 11,754 / ₦32,250,686.50) — rendered moot by §1.4.

**Internal contradictions:** §14 and Phase R.1 carry the superseded 6,193 / ₦15.98M figures; §14 says "defer DO" while §11.0.2 says adopt; two sections are numbered §6.4; §12 still schedules Phases 7–8 that §11.0.2 declares removed; the header cites the organization id (`sfrndpkrxqfigpzbrynb`) rather than the project ref.

### 2.2 Third-party live-API report (`audit_findings.md`)

**Correct and independently reproduced:** 34 field count; polarity direction; 2,562 upstream customers vs 1,129 stored = 1,433 missing; 7,668 upstream meters; DailyDataMeter ~468,750; `list_consumption_station_ids()` → 5; `primeStationRegistry()` never called; index drops ≈77 MB.

**Unique contribution:** `/api/station/read` returning **9 stations** — an endpoint not otherwise called, confirming BONDU/KADUNA as commissioned fixtures.

**Wrong:**

| Claim | Correction |
|---|---|
| Token records "16,828 receipts" | Live total **17,352**. `16,828` appears verbatim at `tools/recover-token-transactions.cjs:21`. Their own JSON records `oem_token_read_shape_b.sample_item: null` — the figure was taken from a code comment, not the API |
| Money/kWh reconciliation | Not attempted, despite "cross-table reconciliation" as stated methodology |
| Endorses the Phase R recovery tool | The live endpoint returns 100% of the data |
| "5,511 rows (17,265 candidates)" | 16,901 was candidates; 17,265 is the post-insert total |
| "15,756 rows… includes historical test & unassigned records" | The 93% Cartesian duplication is undetected; the cause is asserted, not measured |
| Polarity "PROVEN" from one row | Their sample meter `47005312476` has `remain1: 0`, `usage1: "0"`, all V/I zero, and last vended 2026-07-09 — it is disconnected for non-payment, not "healthy, operating". By their own rule (`false` = ACTIVE ALARM) the meter they call healthy has an active relay alarm |
| "100% of healthy meters would register alarms" | Inverts the real hazard: 17.7% of readings are no-data rows where five tamper flags read false |
| Action item 3 names `..._meter_period_start_idx` for dropping | That index has 162 scans/26 h; the unused twin (`idx_scan = 0`) is `..._meter_period_idx`. Outcome is harmless since definitions are identical, but usage was never checked |
| PostgREST "audited" | One count header; no RLS testing |

Three of their probes returned `null` payloads in their own JSON while the prose states confident field-level findings for each.

---

## 3. Implementation plan

Ordered by **irreversibility first**, then deadline pressure. Each phase has a gate that must pass before the next begins.

### P0 — Backup (blocking, ~2 h)

No PITR on the free plan.

```bash
node tools/backup-database.cjs
```

That tool uses keyset pagination on `ctid` (verified at line 88) and is sound. Additionally export what later phases could destroy:

```sql
\copy (select * from public.meter_consumption_aggregates where period_type in ('month','year')) to 'agg_month_year.csv' csv header
\copy (select * from public.tariff_rate_history) to 'tariff_rates.csv' csv header
\copy (select * from public.daily_meter_readings where row_json is not null and row_json::text <> '{}') to 'row_json_survivors.csv' csv header
\copy (select * from public.daily_meter_raw_duplicates) to 'raw_duplicates.csv' csv header
```

**GATE P0:** restore into a throwaway project; row counts match on all 130 tables; exports contain 19,685 / 7 / 49,998 / 935 rows.

---

### P1 — Stop the unrecoverable deletion (30 min) — DO THIS FIRST

```sql
-- supabase/migrations/20260731090000_bound_aggregate_orphan_prune.sql
--
-- The delta table is pruned to 90 days by cron job 18. The orphan prune must
-- therefore only act inside that window. Outside it, absence of a delta proves
-- nothing, and deleting the bucket destroys valued history that no source can
-- regenerate (upstream /api/tariff/read carries current state only, no history).
--
-- Measured exposure without this guard: 9,273 month rows + 444 year rows,
-- holding NGN 21,380,551.50 and 61,995.0 kWh.

create or replace function public.refresh_meter_reading_aggregates_for_station(p_station_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
-- ... body unchanged through the per-period upsert ...
    delete from public.meter_consumption_aggregates mca
    where mca.station_id  = p_station_id
      and mca.period_type = v_period
      and mca.period_start >= (current_date - interval '90 days')   -- ADDED GUARD
      and not exists (
        select 1
        from public.daily_meter_deltas dmd
        where dmd.station_id = mca.station_id
          and dmd.meter_id   = mca.meter_id
          and dmd.reading_date >= mca.period_start
          and dmd.reading_date <  case v_period
                when 'day'   then mca.period_start + 1
                when 'week'  then mca.period_start + 7
                when 'month' then (mca.period_start + interval '1 month')::date
                else              (mca.period_start + interval '1 year')::date
              end);
$$;
```

Apply the same guard to the final delete in the `refresh_meter_reading_aggregates()` wrapper.

**GATE P1** — run before and after; values must be identical:

```sql
select count(*) from public.meter_consumption_aggregates where period_type in ('month','year');
-- expect 19,685
select round(sum(tariff_value_ngn),2) from public.meter_consumption_aggregates where period_type='month';
```

Then trigger one station refresh manually and re-run both. If they hold, the defect is closed.

---

### P2 — Storage: reach quota compliance (one maintenance window, ~3 h)

No business data is deleted, and the one unproven index drop is not required.

| Step | Action | Effect | Running total |
|---|---|---|---|
| — | start | | **899.6 MB** |
| 2.1 | `DROP INDEX meter_consumption_agg_meter_period_idx` — `idx_scan = 0`, byte-identical twin retained | −36.0 | 863.6 |
| 2.2 | `TRUNCATE public.api_cache` | −17.1 | 846.5 |
| 2.3 | `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'` + `VACUUM FULL` | −2.8 | 843.7 |
| 2.4 | `UPDATE operational_snapshots SET payload_json = NULL` + `VACUUM FULL` | −42.3 | 801.4 |
| 2.5 | `UPDATE audit_logs SET detail = NULL, metadata = NULL WHERE created_at < now() - interval '7 days'` + `VACUUM FULL` | −55.0 | 746.4 |
| 2.6 | `VACUUM FULL` + `REINDEX TABLE public.meter_consumption_aggregates` | −168.9 **[M]** | 577.5 |
| 2.7 | `VACUUM FULL` + `REINDEX TABLE public.daily_meter_deltas` | −86.3 **[M]** | 491.2 |
| 2.8 | `VACUUM FULL` + `REINDEX TABLE public.daily_meter_readings` | −46.1 **[M]** | **445.1 MB** |

**Result: 445 MB — under quota with 55 MB headroom**, 25 days before the 2026-08-20 grace expiry.

Perform 2.1 **before** 2.6 so the dropped index is not rebuilt. `VACUUM FULL` takes an ACCESS EXCLUSIVE lock; steps 2.6–2.8 rewrite ~430 MB.

**GATE P2:** `pg_database_size` < 500 MB, measured twice one hour apart, with a Consumption page view in between.

---

### P3 — Replace Phase R with an API backfill (~4 h)

Delete `tools/recover-token-transactions.cjs` and Phase R. Replace with a direct backfill.

```js
// tools/backfill-token-transactions.cjs — READ upstream, INSERT locally.
//
// Source: POST /api/token/creditTokenRecord/read {pageNumber, pageSize:5000, Lang:'en'}
// Measured 2026-07-30: 17,352 records across 4 pages, 17,352 distinct receiptId.
// Keying on receiptId makes the operation idempotent by construction and removes
// the timestamp from the identity entirely.
//
// Field mapping:
//   meter_sn                = meterId
//   transaction_ts          = createDate AT TIME ZONE 'UTC'   // verified: +4 min skew, not a zone
//   amount                  = totalPaid
//   kwh                     = totalUnit
//   tariff_rate             = tariffId
//   upstream_transaction_id = receiptId
//   site_code               = lower(stationId)                // FK -> sites(code)
//   site_id                 = sites.name
//   source                  = 'upstream-api'
//   raw_payload             = record MINUS the `token` field  // MANDATORY
//
// Skip stationId='0001' (22 records, upstream-labelled placeholder). Report, do not insert.
```

Add the idempotency key:

```sql
create unique index concurrently if not exists token_transactions_upstream_txn_uidx
  on public.token_transactions (upstream_transaction_id)
  where upstream_transaction_id is not null;
```

**Never persist the `token` field.** All 17,352 upstream records carry a plaintext STS PIN; `token_transactions.raw_payload` currently holds zero.

**GATE P3:**

```sql
select count(*) from public.token_transactions;                                   -- expect 17,330
select count(*) from public.token_transactions where raw_payload::text ~ '"token"'; -- expect 0
```

`sum(amount)` must reconcile to upstream `sum(totalPaid)` less the 22 `0001` records. This gate also releases the old GATE R block on payload deletion — P2 no longer depends on it.

---

### P4 — Rebuild the dimensions (~1 day)

Order follows FK direction: customers → accounts → meters.

**4.1 Customers** — insert-only, 1,433 new from `/api/customer/read`. `customers.id` is referenced by 19 tables, several `ON DELETE CASCADE`: **never delete, only insert and update.** Match existing rows on `upstream_customer_id`. Do not touch `kyc_tier`, `kyc_status`, `auth_user_id`, `status`, or `profile_picture_url` — those are wallet-owned (`customer-auth.ts:434,719`, `customer-kyc.ts:64,147`, `admin.ts:2169`).

**4.2 Accounts** — upsert 2,514 from `/api/account/read` on `upstream_account_id`.

**4.3 Meters** — rebuild, not dedup. There is no basis in the data for choosing among the Cartesian rows; the authoritative 1:1 binding is `/api/account/read`.

```sql
begin;
  -- Safe: measured zero references to meters.id
  --   meter_events 0 rows, remote_tasks 0 rows, token_transactions.meter_id 0 non-null
  delete from public.meters;

  -- Re-insert 2,514 rows from /api/account/read, populating the key the
  -- original import missed:
  --   upstream_id  = meterId          <-- activates the existing UNIQUE (upstream_id)
  --   meter_sn     = meterId
  --   site_code    = lower(stationId), site_id = sites.name
  --   customer_id  = customers.id resolved via upstream_customer_id
  --   tariff_id    = tariffId
  --   meter_type   = meterType
commit;

create unique index concurrently meters_meter_sn_uidx on public.meters (meter_sn);
```

**GATE P4:**

```sql
select count(*), count(distinct meter_sn) from public.meters;          -- expect 2514, 2514
select count(*) from public.meters where upstream_id is null;          -- expect 0
select count(*) from (
  select distinct meter_id from public.daily_meter_readings
   where reading_date >= current_date - 30) r
 where not exists (select 1 from public.meters m where m.meter_sn = r.meter_id);  -- expect 0
```

**4.4** Write the missing persistence step. `refresh-targets.js` already polls `/api/meter/read`, `/api/account/read` and `/api/customer/read`, and the responses already land in `api_cache`; only the upsert is missing. This is the entirety of §6A.5 — one service, one upsert path per entity.

**4.5** Correct ``Collabo` `` to **₦400** and resolve the 25 accounts lacking an `account_tariff_history` mapping.

---

### P5 — Refresh contract and job 7 (~3 days)

1. `alter function public.refresh_meter_reading_aggregates() set statement_timeout = '600s';` — the wrapper currently inherits the 120 s database default.
2. Add `source_watermark` columns; make both refresh functions incremental (process only rows ingested since the watermark).
3. Gate `/api/local/consumption/refresh-aggregates` (`api/reference.js:2503`) behind an admin check, and remove or gate the automatic fallback at `consumption-service.mjs:504`.

**GATE P5:** refresh completes in <10 s; `pg_database_size` unchanged after 10 consecutive runs; month/year aggregate count still 19,685.

---

### P6 — Security (~2 days)

1. **RLS.** Replace `USING (true)` for the `authenticated` role on `customers`, `meters`, `accounts` with an owner predicate. Any logged-in user currently reads all 1,129 customers, 15,756 meters and 1,128 accounts. The money tables are already correct — use them as the pattern.
2. Review the **16 RLS-enabled, zero-policy tables**; document service-role-only intent or add the missing policy.
3. Stop writing audit payloads for `remote_command` (1,827 rows, 12 MB) as well as `download`/`create`. Reduce the retention window to zero for any response containing a `token`.
4. Rotate the database password — declined 2026-07-30 per §7.1.8; note it has since been shared into two AI sessions.

---

### P7 — Signal capture (~1 week)

Add the 27 discarded fields **with a no-data state**:

```
flags bit 15 = NO_DATA   -- set when total1 = -1; bits 0-11 undefined when set
```

17.7% of live readings are `total1 = -1`. Route all derivation through `conditionActive()` — and **reconcile the two divergent implementations first**.

**GATE P7:** replay 20,000 live readings; events produced from the 3,538 no-data rows = **0**; a meter with `relayOpen = false` and `remain1 > 0` does produce a disconnect event.

---

### P8 — Registry cold start (~1 h)

Call `primeStationRegistry()` at every serverless entry point, or convert the four sync call sites to async. Until then a newly onboarded station is silently excluded from poll/backfill fan-out on every cold start, and §10A's "no redeploy" claim is false.

---

## 4. What remains unverified

| Item | Why | How to settle |
|---|---|---|
| Dropping `..._station_meter_idx` (41.3 MB) | The planner selects it in all four tested shapes at cost `0.42..23.55`, identical to the unique index. Postgres does scan this table backward (demonstrated), so a substitute is plausible — but untested | `BEGIN; DROP INDEX meter_consumption_agg_station_meter_idx; EXPLAIN ANALYZE <the 6 real query shapes>; ROLLBACK;` — commits nothing, needs write authorization. **P2 reaches 445 MB without it** |
| **[M]** reclaim in steps 2.6–2.8 (301 MB of the 327) | Modelled from `pg_stats`, validated by a 1.05× in-table control | Measure `pg_database_size` after each step; stop early if the target is met |
| Shape A `currency: MMK` | `/readMore` returns `{"payments":[]}`; cannot be re-tested | Moot — the authoritative feed has no `currency` field and `totalPaid` sums to ₦62,380,516.50, matching the operator dashboard |
| Wallet money projection | Four of five row widths derive from 5–6 production rows | Re-measure after ~1,000 real purchases. The conclusion holds at the 4.4 kB/purchase packed floor |
| DailyDataMeter `createDate` at +63 min | Measured twice; cause not established | Resolve before mapping it to `upstream_at` in P7 |

---

## 5. Do not do

| Action | Origin | Why |
|---|---|---|
| Backdate tariff rates to 2025-01-01 | Third-party report, item 1 | Upstream has no tariff history. RESIDENTIAL/COMMERCIAL/PUBLIC/PRODUCTIVE were created upstream 2025-11-10; backdating asserts prices ~10 months before they existed and **fabricates revenue in a money table**. It also does not prevent the deletion, which is tariff-independent |
| Unschedule cron job 18 | Third-party report, item 4 | Job 18 is the retention job holding storage down; removing it worsens the quota problem. The ratchet is the unbounded refresh, not the prune |
| Add only a date bound to the refresh insert | Third-party report, item 4 | Does not touch the orphan delete. The ₦21,380,551.50 is destroyed regardless. P1 is the correct fix |
| Run `recover-token-transactions.cjs --commit` | Original audit, Phase R | Reconstructs 97.5% of data the API returns at 100%; its dedup does not key on `receiptId` despite the claim; it would import ~11,754 plaintext token PINs into a permanent money table |
| `TRUNCATE` + rebuild the aggregates | Original audit, Phases 3–4 | Money values before 2025-11-07 are not reproducible from any source |
| Retire `daily_meter_deltas` before P5 | Original audit, Phase 3.2 | It is the aggregate rebuild's only source; retiring it first orphans 100% of aggregates |
| Phase 1.7 (delete agg/delta >90 days) | Original audit | Targets **zero rows**; cron job 18 already does this nightly |
| Adopt Durable Objects on the §11.0.2 arithmetic | Original audit | Reads are 5M/day not 50M; indexed writes bill ≥1 extra row (≥40,300/day, not 20,300); fan-out is capped at 50 subrequests / 6 concurrent connections, so "extrapolate to 100 stations" is unavailable on the free plan |

---

## 6. Verdict

The original audit's **findings** largely survive independent verification: §6A, the polarity inversion, the 34 fields, the July index origins, the unbounded refresh, and the dashboard reconciliation baseline are all confirmed from primary sources. What does not survive is the arithmetic, the phase ordering, and one premise — the token recovery anchoring Phase R was never necessary.

Two defects that no prior audit found dominate the risk:

1. **₦21,380,551.50 of consumption history is one successful refresh away from permanent deletion**, and no source can regenerate it.
2. **`meters` is a proven Cartesian product** — 15,756 rows for 1,128 serials — breaking every join to it by up to 169×.

Both are addressed in P1 and P4, and both fixes are provably safe: P1 changes one predicate; P4 rebuilds a table with measured zero inbound references.

Quota compliance is reachable at **445 MB** without deleting business data and without the one index drop that remains unproven.
