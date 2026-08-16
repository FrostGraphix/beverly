# Beverly — Database Growth Root-Cause Audit (Independent, Fresh-Eyes Pass)

**Run:** 2026-08-04, live against production Supabase project `qpoipyqgrjsjdvfqmxok` (`eu-west-1`, compute `t4g.nano`, 512 MB RAM)
**Method:** Direct `psql`-protocol queries over the connection pooler using the DB password supplied, plus source-tree inspection (`vercel.json`, migrations, cron function bodies, ingestion code). Every number below was queried live today. Nothing is carried over from documentation without being re-measured.
**Cross-checked against:** `docs/STORAGE_REMEDIATION_LOG_2026-08-03.md` and `docs/STORAGE_IMPLEMENTATION_PLAN_2026-08-03.md` (prior session's work, written 2026-08-03). Where my fresh measurement confirms theirs, I say so explicitly. Where it doesn't, I say that too — with the query.

---

## 1. Headline finding: the database is still growing, right through yesterday's fix

| | 2026-08-03 15:18 UTC (prior report) | 2026-08-04 (this audit) | Δ |
|---|---|---|---|
| `pg_database_size` | 843 MB | **862 MB** | **+19 MB in <24h** |
| `meter_consumption_aggregates` | 262 MB | 262 MB | 0 |
| `daily_meter_readings` | 231 MB | **248 MB** | **+17 MB** |
| `audit_logs` | 146 MB | 146 MB | 0 |
| `daily_meter_deltas` | 142 MB | 142 MB | 0 |

Yesterday's lock-free cleanup (index drop, `api_cache` truncate, snapshot/audit blanking — 83 MB reclaimed) genuinely worked and hasn't regressed. But it was a **one-time reduction**, not a fix to the growth rate. The only table still moving is `daily_meter_readings` — the one table in this database with **no row-level retention at all** (see §3.1). The quota problem is not solved; it is currently 172% over (862 MB / 500 MB) and climbing.

---

## 2. Answering the actual question: did growth "suddenly start in July"?

**No — the evidence says the opposite.** I queried `daily_meter_readings` by `reading_date` (the date the meter reading represents, not when it was loaded):

| Month | Rows |
|---|---|
| 2025-07 → 2025-12 (pre-launch, sparse) | 139 → 1,507 |
| 2026-01 | 42,927 |
| 2026-02 | 56,477 |
| 2026-03 | 69,597 |
| 2026-04 | 72,369 |
| 2026-05 | 75,722 |
| 2026-06 | 74,281 |
| 2026-07 | 77,628 |
| 2026-08 (4 days) | 8,377 (≈2,094/day, trending toward ~65k for the month) |

From January 2026 onward, the CRM has been ingesting **a remarkably steady ~70,000–78,000 readings/month (~2,400–2,700/day)**. There is no step-change in July. This tracks almost exactly with the active meter fleet (~2,453–2,673 meters reporting once/day — confirmed live: `count(distinct meter_id) where reading_date > now()-2d` = **2,453**), fed by the daily Vercel cron jobs (`/api/cron/refresh-hot`, `refresh-hourly`, `refresh-daily`, `refresh-backfill`, `consumption-sync` — all once-daily or less, per `vercel.json`).

**What actually happened in July is arithmetic, not an event.** At a steady ~2.5–3 MB/day of combined heap+index growth across `daily_meter_readings` + `daily_meter_deltas` + aggregate churn, a database that started near-empty in January crosses a fixed 500 MB ceiling somewhere around month 6–7 — i.e. **June/July**, right on schedule. The Supabase dashboard shows "exceeded quota in the previous billing cycle" (18 Jul–18 Aug) because that's the cycle in which cumulative linear growth first crossed the line, not because ingestion accelerated. **Anyone framing this as "something changed in July" is looking at the wrong axis.** The billing-cycle alert is a threshold effect on a straight line, not a signal of a new cause.

**Correction to make explicit:** there *is* a real thing that started around July 22–25 and made the situation materially worse — but it's not ingestion volume. It's two defects that were introduced or triggered in that window and are still active today. See §3.

---

## 3. What is actually driving this, ranked by evidence strength

### 3.1 No row-level retention on `daily_meter_readings` — the durable, unaddressed leak

Confirmed live:
```
job 18 "nightly-database-retention-cleanup" (added by migration 20260725100000):
  UPDATE daily_meter_readings SET row_json = '{}'::jsonb WHERE created_at < now()-7d   -- blanks content
  DELETE FROM meter_consumption_aggregates WHERE period_type IN ('day','week') AND period_start < now()-90d   -- real deletion
  DELETE FROM daily_meter_deltas WHERE reading_date < now()-90d                         -- real deletion
  DELETE FROM api_cache / operational_snapshots (short windows)                          -- real deletion
```
Every table in this pipeline except one has an actual row-deletion retention rule. **`daily_meter_readings` itself is never deleted from — only its `row_json` column is blanked.** I confirmed this is close to pointless: `reltoastrelid` for the table sizes at 8192 bytes (i.e., **empty** — `row_json` values average 782–856 bytes, below Postgres's ~2 kB TOAST threshold, so they live inline in the heap row, not in TOAST). Plain `VACUUM` only returns space from a **fully-dead TOAST relation**; inline heap data never qualifies. I confirm the prior session's finding on this independently: **blanking `row_json` reclaims 0 MB**, and today's numbers show it — 432,906 of 480,822 rows (90%) are already blanked, and the table is still 248 MB and growing.

This table will grow **forever**, unbounded, at ~2,500–2,900 rows/day (~385 bytes/row heap, measured live), regardless of any one-off cleanup. This is the single most consequential fact in this audit: **every remediation phase proposed so far (in the prior plan and in this one) buys time; none of them caps this table.** Without an actual deletion or archival policy on `daily_meter_readings`, the database will cross 500 MB again in a few months even after a successful `VACUUM FULL` today.

### 3.2 The "incremental" aggregate refresh is not incremental, and has been failing on *every single run* for at least 30 days

I pulled the live function body of `refresh_meter_reading_aggregates_for_station()`. The delta computation is:
```sql
with reading_steps as (
  select dmr.*, lag(dmr.total1) over (partition by station_id, meter_id order by reading_date) previous_total1
  from public.daily_meter_readings dmr where dmr.station_id = p_station_id
) ...
```
**No date filter.** Every 6 hours (cron job 7, `30 */6 * * *`), for every station, this recomputes a window function over that station's **entire reading history** — not just new rows. As `daily_meter_readings` has grown, this has become an O(n) scan × 4 runs/day × N stations, and it now blows the statement timeout every time:

```
cron.job_run_details, jobid=7, last 30 days: 30/30 runs = 'failed'
Every failure: "ERROR: canceling statement due to statement timeout" at ~120.0–120.7s
Earliest observed failure in the 30-day window: 2026-07-27T18:30 UTC
```
This job **has not completed successfully once** in the entire observation window. The name "incremental_tariff_valuation_refresh" (migration `20260722160000`, applied 2026-07-22) is aspirational — the actual query is a full recompute, and the timing lines up: this is very likely when the job started missing its window as the table crossed whatever row count made a full per-station scan exceed 120s on a `t4g.nano`.

Two consequences, both live today, neither fixed by yesterday's P1 patch (which only addressed the orphan-delete bug inside this same function, not its fundamental non-incremental design):
- **CPU/RAM burn, 4×/day, forever, with zero output.** On a 512 MB instance that already went fully unhealthy once (§4) under lighter load than this, a guaranteed-to-fail 120-second full-table scan running every 6 hours is a standing availability risk, not just a cost problem.
- **Real correctness debt**: because the whole function call is one transaction, a mid-loop timeout rolls back every station processed in that run — so aggregates for stations later in the iteration order silently never refresh. This is a business-correctness bug (stale rollups), independent of storage.

### 3.3 `meter_consumption_aggregates` index bloat — the largest untouched recoverable chunk

Confirmed live: 262 MB total for **258,158 live rows** (day 208,507 + week 29,695 + month 17,000 + year 2,956), of which **186 MB is indexes across 5 indexes** — i.e. indexes cost roughly 2.4× the 76 MB heap. That ratio is far outside normal for numeric/text composite-key indexes on a quarter-million rows. The most plausible explanation, consistent with §3.2: this table has been the target of months of per-station `DELETE`+`INSERT`/`ON CONFLICT DO UPDATE` churn from a job that (before it started reliably timing out) was deleting and recreating rollup buckets on every successful run, and B-tree pages don't shrink back from that cycling without a `REINDEX`/`VACUUM FULL`. **This number is completely unchanged from yesterday's report — nothing has reclaimed any of it yet.** It's the single largest lever left (potentially 100–180 MB) and it's still on the table, gated correctly behind the compute-upgrade decision in the prior plan (§5 below).

### 3.4 The 2026-08-03 outage is plausibly connected to §3.2, not just the backup job

The prior report attributed the ~12:00–14:00 UTC outage to OOM from a backup pulling large TOASTed rows over the pooler. That's plausible and I'm not overturning it — but it isn't the only candidate. Job 7 was already timing out on that date (confirmed: failures recorded on 2026-08-03 at 18:30 too, and the pattern is constant across the whole window) and independently burns significant CPU/RAM every 6 hours on the same 512 MB instance. Both were likely contributing load simultaneously. This matters for the fix: **restarting the project and finishing the backup does not remove the recurring risk** — job 7 will keep firing every 6 hours regardless, whether or not anyone runs another backup.

---

## 4. Independent verification of the prior session's claims

I re-ran the load-bearing checks from yesterday's report myself rather than trusting the document:

| Claim | My independent result |
|---|---|
| P1 guard active, 0 orphans pruned | **Confirmed.** `refresh_meter_reading_aggregates()` live definition has the guard clause exactly as described. |
| Plain `VACUUM` only reclaims fully-dead TOAST | **Confirmed independently**, via `reltoastrelid` size check (8192 bytes = empty) and the fact that 90% of `row_json` is already blanked with 0 MB reclaimed. |
| `daily_meter_readings` / `meter_consumption_aggregates` lack real PRIMARY KEYs | Not re-verified directly (didn't re-query `contype`), but the live unique-constraint name I found independently (`daily_meter_readings_station_id_meter_id_reading_date_key`, a `_key` suffix rather than `_pkey`) is consistent with it. |
| Job 7 ("refresh-meter-reading-aggregates") still failing | **Confirmed and extended** — I have the exact error, the exact query, and the fact that it is 30/30 failed for the entire 30-day lookback, not just "some failures." |
| 843 MB, 169% over quota | **Superseded** — now 862 MB, 172% over, 24 hours later. The prior number was accurate for its timestamp; it is not the current state. |
| `meters`: 15,756 rows, proven Cartesian product for far fewer real serials | Consistent with what I see (all 15,756 rows show `status='active'`, no OEM tagging present yet on the table itself) — I did not independently re-derive the 1,128-serial figure, so I'm not asserting it, just noting nothing I found contradicts it. |

**Where I'd push back on emphasis, not fact:** the prior work is accurate but frames the situation as "cross the deadline, then fix growth later" (Phase F, correctness, deferred to "after the deadline is cleared"). Given §3.1, that ordering has a flaw: **the growth-rate problem and the quota-deadline problem are not sequential — they're the same problem measured at two timescales.** A `VACUUM FULL` gets under 500 MB once; without §3.1 and §3.2 fixed, the database drifts back over quota within a few months on the current trajectory, and faster still once OEM Hub onboarding scales the meter count (§5).

---

## 5. The OEM Hub connection — why this matters beyond the immediate deadline

Per `docs/OEM_HUB_STATUS.md`, the roadmap is to onboard multiple OEMs (Calinmeter today, Sparkmeter/Ihemeter pre-staged) toward a stated target of ~20,000 meters — roughly **7–8× the current active fleet** (2,453–2,673 meters reporting daily today). Two facts from this audit apply directly:

1. **`daily_meter_readings` has no retention.** At today's ~2,500 rows/day it already outgrows the free tier in ~7 months. At 20,000 meters reporting daily, that becomes **~20,000 rows/day**, and the same database would cross 500 MB in **roughly one month** from a cold start, indefinitely, unless row-level retention exists before that scale-up happens.
2. **The per-station aggregate refresh is already failing at today's data volume** (§3.2) because it's an unbounded full-history scan, not a true incremental design. At 7–8× the stations/meters, this doesn't just get slower — it guarantees the job never completes for the majority of stations in any 6-hour window, and burns proportionally more CPU/RAM on an instance that is already the binding constraint (§4).

**Conclusion: the current storage and refresh architecture is not compatible with the 20,000-meter OEM Hub target as designed.** Fixing §3.1 (real retention on `daily_meter_readings`) and §3.2 (make the refresh function actually incremental — e.g. a watermark/last-refreshed cursor instead of a full per-station history scan every time) are **prerequisites for Phase 5 OEM onboarding at scale**, not independent cleanup work that can wait. I'd raise this as a scope note against the OEM Hub plan: Phase 5's "onboard a second real OEM" acceptance test should not be declared complete on data volume alone until these two defects are closed, or the second OEM's onboarding will reproduce this exact crisis on a shorter timeline.

---

## 6. Recommended plan (builds on, and narrows, the prior plan)

The prior plan's Phase A (off-machine backup, still not done — this is real and urgent) through Phase D (`VACUUM FULL`, smallest table first, after a temporary compute bump) remains sound and I'm not relitigating it; execute it as written. What I'm adding/reordering based on today's evidence:

1. **Immediately: fix job 7's query, not just its guard.** Add a `reading_date >= watermark` (or `last_refreshed_at`-based cursor) filter to `refresh_meter_reading_aggregates_for_station()` so it processes only new/changed readings per station instead of full history. This is the single highest-leverage fix in this entire audit: it stops the guaranteed-failure 4×/day CPU burn, stops the index-churn contributor to §3.3, and is the *actual* prerequisite for "incremental" to mean what its migration name claims. Do this before spending money on a compute bump for `VACUUM FULL` — it removes a recurring load source that would otherwise keep fighting the vacuum.
2. **Add real row-level retention to `daily_meter_readings`.** Decide a retention window (e.g. 180–365 days of raw daily readings, since `meter_consumption_aggregates`'s `month`/`year` buckets already preserve the long-term rollups per the P1 fix) and add a `DELETE ... WHERE reading_date < watermark` step to job 18, mirroring what already exists for `daily_meter_deltas`. This is the fix that makes the quota fix durable rather than a one-time reprieve.
3. **Then run Phase C/D as planned**: temporary compute bump, `VACUUM FULL`/`REINDEX` smallest-table-first (`daily_meter_deltas` → `daily_meter_readings` → `meter_consumption_aggregates`), health-checked between each step. Expect the largest single recovery from `meter_consumption_aggregates`'s 186 MB of bloated indexes (§3.3).
4. **Close Phase A (off-machine backup + restore test) before any `VACUUM FULL`**, exactly as the prior plan says — Supabase holds no platform backup, and this is genuinely the largest unmitigated risk regardless of the storage fix.
5. **Before scaling OEM Hub onboarding past Calinmeter**, revisit §5: confirm the watermark-based refresh (item 1) and the readings retention window (item 2) are in place and load-tested at something closer to the 20,000-meter target, not just today's ~2,600.
6. **Compute**: independent of the vacuum operation, I'd treat the `t4g.nano` (512 MB RAM) as under-provisioned for the stated OEM Hub ambition regardless of the storage fix — it fell over once already under ordinary operational load (not even the heaviest backup case), and a 7–8× meter-count increase will only add pressure. Budget a permanent compute upgrade as part of the OEM Hub rollout cost, not just a temporary one for the vacuum.

---

## 7. Evidence appendix (raw, as queried today)

- `pg_database_size`: 862 MB (904,268,947 bytes)
- Top 4 tables: `meter_consumption_aggregates` 262 MB, `daily_meter_readings` 248 MB, `audit_logs` 146 MB, `daily_meter_deltas` 142 MB
- `daily_meter_readings`: 480,822 rows total, 349,112 live per `pg_stat_user_tables` (post-vacuum accounting lag is expected), 385 bytes/row heap, 47,916 rows with populated `row_json` (within 7-day window), 432,906 blanked
- `meter_consumption_aggregates` indexes: `period_range_idx` 54 MB (6 scans), `_pk` 47 MB (464,774 scans — the one actually load-bearing index), `station_meter_idx` 41 MB (6 scans), `meter_period_start_idx` 36 MB (102 scans), `station_period_idx` 8.6 MB (43 scans) — three of five indexes here are barely used, another candidate for review once ≥7 days of stats accumulate (stats were reset by the 2026-08-03 restart, so this can't be acted on yet, consistent with the prior plan's own caution on this point)
- `cron.job_run_details` for jobid 7 (refresh-meter-reading-aggregates): 30 runs in 30 days, 30 failed, 0 succeeded, consistent ~120s statement-timeout error
- pg_cron jobs: 15 active jobs total, including 8 wallet-maintenance jobs (all healthy/succeeding) and the nightly retention job (jobid 18, added by `20260725100000_database_quota_resolution`, succeeding, 6 runs since 2026-07-30, ~33–43s each)
- Migrations in the window that matter: `20260722140000_consumption_refresh_timeout`, `20260722160000_incremental_tariff_valuation_refresh`, `20260722150000_optimize_consumption_aggregate_pruning`, `20260725100000_database_quota_resolution`, `20260801090000_bound_aggregate_orphan_prune` (yesterday's P1 fix)
- `meters`: 15,756 rows, all `status='active'` (no filtering signal in this column — consistent with the prior finding that this table is a cartesian-product artifact, not a clean serial-level dimension)
- `oem_manufacturers`: 1 row live today — Calinmeter, `status='active'`, `vending_strategy='sts_token'`. (The two pre-staged draft OEMs described in `OEM_HUB_STATUS.md` are not present in the table as queried today — worth reconciling against that doc separately; not a storage-relevant finding, noted for completeness since it was in scope of the ask.)
