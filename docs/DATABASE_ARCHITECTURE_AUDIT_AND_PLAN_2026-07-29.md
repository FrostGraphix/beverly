# Beverly — Database Storage Audit & Long-Term Architecture Plan

**Date:** 2026-07-29, revised 2026-07-30
**Database:** Supabase Free Plan, `aws-1-eu-west-1`, PostgreSQL (project `sfrndpkrxqfigpzbrynb`)
**Status:** Findings final. Token recovery tool built and dry-run verified. Nothing written to production yet.

---

## 0. Provenance

Every figure was read from the live database or the repository. Nothing is estimated unless labelled **[MODEL]**.

| Source | Method |
|---|---|
| Sizes | `pg_total_relation_size`, `pg_relation_size`, `pg_indexes_size`, `reltoastrelid` |
| Row counts | `count(*)` — **never** `n_live_tup` (see §1.4) |
| Index usage | `pg_stat_user_indexes` — **window-limited** (see §1.4) |
| Index definitions | `pg_indexes.indexdef`, `pg_constraint` |
| Job history | `cron.job`, `cron.job_run_details` |
| FK graph | `pg_constraint` where `contype='f'` |
| Function bodies | `pg_proc.prosrc` |
| Payload contents | `jsonb_each_text`, `jsonb_array_elements` sampling |
| Read paths | Direct source reading of `api/`, `backend/`, `src/`, `apps/` |
| Change timeline | `supabase_migrations.schema_migrations`, `git log`, `git log -S` |

Measurements: 2026-07-29 ~09:00, 14:08, 16:19 UTC; 2026-07-30 07:48 UTC.

---

## 1. Current state

### 1.1 Headline

| Metric | Value |
|---|---|
| `pg_database_size` | **878 MB** |
| Supabase dashboard | **0.936 GB (187% of 0.5 GB)** |
| Grace period ends | **20 Aug 2026** — then HTTP 402 on all requests |
| Storage bucket | 17 objects, **400 KB of 1 GB** |
| Egress | 0.485 GB of 5 GB (10%) |

### 1.2 Schema scale

| Object | Count |
|---|---|
| Tables (`public`) | **130** |
| RLS enabled | **130 (100%)** |
| RLS policies | **230** |
| Functions | **57** |
| Views | 12 (3 materialized) |
| `pg_cron` jobs | **15** |

### 1.3 Size distribution

| Table | Total | Heap | Indexes | TOAST | Rows |
|---|---|---|---|---|---|
| `meter_consumption_aggregates` | **287 MB** | 76 MB | **211 MB** | — | 552,391 |
| `daily_meter_readings` | **213 MB** | 152 MB | 61 MB | — | 463,245 |
| `daily_meter_deltas` | **137 MB** | 73 MB | 64 MB | — | 463,086 |
| `audit_logs` | **128 MB** | 17 MB | 2.7 MB | **107 MB** | 19,395 |
| `operational_snapshots` | **46 MB** | 3.9 MB | 0.7 MB | **42 MB** | 3,574 |
| `api_cache` | **16 MB** | 0.9 MB | 0.8 MB | **15 MB** | 1,383 |
| `meters` | 6.7 MB | 4.2 MB | 2.5 MB | — | 15,756 |
| `token_transactions` | 6.0 MB | 3.3 MB | 2.8 MB | — | 5,511 |
| `cron.job_run_details` | 2.6 MB | — | — | — | 11,806 |

Everything else in `public` totals under 8 MB.

### 1.4 Measurement caveats

**`n_live_tup` is unusable.** Server restarted 2026-07-29 11:17:32 UTC; statistics reset. All row counts use `count(*)`.

**`idx_scan` is window-limited.** Counters *decreased* between measurements (`..._pk` 2,349,037 → 700,028), proving a reset. Any "0 scans" conclusion is weak evidence; §3.1 replaces it with structural proof.

### 1.5 Business scale

| Entity | Count |
|---|---|
| `meters` | 15,756 |
| Meters reporting readings | **2,511** |
| `customers` | 1,129 |
| `accounts` | 1,128 |
| `sites` | 6 (TUNGA, UMAISHA, OGUFA, KYAKALE, MUSHA, +1) |
| `profiles` / `auth.users` | 17 / 17 |
| `vendor_organizations` | 6 |
| `roles` / `permissions` | 7 / 69 |

### 1.6 Wallet has not carried production volume

`wallet_ledger_entries` **14** · `wallets` 6 · `purchase_orders` 6 · `receipts` 6 · `wallet_holds` 6 · `payment_transactions` 5 · `meter_purchase_orders` **0** · `vendor_wallets` **0** · `customer_meters` **0**

**No wallet capacity projection can come from wallet tables.** §8 uses `token_transactions` as the only real-volume proxy.

### 1.7 The fraud and alarm engines are empty

| Table | Purpose | Rows |
|---|---|---|
| `meter_events` | Meter alarms (14 cols, typed `event_type` enum) | **0** |
| `theft_signals` | Theft scoring (18 cols, `signal_types` array, severity, score) | **1** |
| `fraud_assessments` | Transaction-side fraud scoring | **0** |
| `fraud_signals` | Fraud signal detail | **0** |
| `gateway_health_incidents` | GPRS gateway health | 574 |

`meter_events` and `theft_signals` are correctly designed and **empty because their input signals are discarded at ingest** — see §4.

---

## 2. What changed — the growth is not from the meter API

### 2.1 Ingestion is flat

| Month | Readings | Distinct meters |
|---|---|---|
| 2026-02 | 56,371 | 2,122 |
| 2026-03 | 69,451 | 2,398 |
| 2026-04 | 72,219 | 2,419 |
| 2026-05 | 75,566 | 2,473 |
| 2026-06 | 74,224 | 2,482 |
| 2026-07 | 69,649 | 2,511 |

Flat since March; meter count +5% in five months.

### 2.2 The change window is 12–22 July 2026

**a) Three indexes added in three days.**

| Index | Definition | Origin | Size |
|---|---|---|---|
| `..._pk` | UNIQUE (station_id, meter_id, period_type, period_start) | 21 May | 46 MB |
| `..._station_period_idx` | (station_id, period_type, period_start DESC) | 21 May | 7.5 MB |
| `..._meter_period_idx` | (meter_id, period_type, period_start DESC) | 21 May | 35 MB |
| `..._meter_period_start_idx` | (meter_id, period_type, period_start DESC) | **17 Jul** | 35 MB |
| `..._station_meter_idx` | (station_id, meter_id, period_type, period_start DESC) | **17 Jul** | 40 MB |
| `..._period_range_idx` | (period_type, period_start, station_id, meter_id) | **19 Jul** | 47 MB |

**122 MB added 17–19 July.**

**b) Audit logging with full payloads began 12 July.** First row `2026-07-12 18:01:51`. 19,395 rows, **115 MB of payload** in 17 days.

**c) 22 July** added `tariff_value_ngn`, `priced_kwh`, `unpriced_kwh` columns and nine wallet cron jobs at 3–10 min cadence.

**d) 25 July** added a nightly prune that now fights the rebuild (§2.4).

### 2.3 The amplification mechanism

The rebuild trigger is **not new** — `git log -S` places it at 2026-06-29/30:

- `src/services/consumption-service.mjs:485` → posts to `/api/local/consumption/refresh-aggregates`
- `api/reference.js:2491` → invokes the refresh RPC
- `backend/src/services/consumption-store.js:692–703` → falls back to the **full-table** RPC

`refresh_meter_reading_aggregates_for_station` filters on `where dmr.station_id = p_station_id` with **no date bound** — a window function over every reading ever recorded.

**Before 17 July:** ~240k rows × 2 indexes ≈ 50 MB per rebuild.
**After 19 July:** ~550k rows × 6 indexes ≈ **211 MB per rebuild.** Same code, ~4× cost.

Measured burst, 2026-07-29, **no cron job in the window** — it was a page view:

| Minute (UTC) | Rows |
|---|---|
| 13:51 | 77,920 |
| 13:52 | 69,518 |
| 13:53 | 155,839 |
| 13:54 | 133,150 |
| 13:56 | 115,944 |

### 2.4 The daily ratchet

03:00 prune to 90 days → any page view restores all 380 days. `daily_meter_deltas` holds **241,388 rows older than 90 days** hours after being pruned. File allocation ratchets to each peak.

### 2.5 Job 7 has never succeeded

`refresh-meter-reading-aggregates` fails at **exactly 120.1 s** (statement timeout) on every sampled run back to 07-26. `cron.job_run_details`: 11,806 rows since 2026-04-11, never pruned.

### 2.6 Attribution

**~310 MB of 878 MB post-dates 12 July**: 122 MB indexes, 128 MB audit, 46 MB snapshots, 16 MB cache. None from the meter API.

---

## 3. Content analysis — what is in the bloat

### 3.1 Indexes: 47 MB useful, 75 MB provably redundant

```
..._meter_period_idx        btree (meter_id, period_type, period_start DESC)
..._meter_period_start_idx  btree (meter_id, period_type, period_start DESC)
```
**Byte-identical.** The 17 July migration recreated a 21 May index under a new name. **35 MB.**

```
..._pk                UNIQUE btree (station_id, meter_id, period_type, period_start)
..._station_meter_idx        btree (station_id, meter_id, period_type, period_start DESC)
```
Same columns and order; differs only by `DESC`, which Postgres serves by scanning the PK backwards. **40 MB.**

`..._period_range_idx` (47 MB) leads on `(period_type, period_start)` — distinct, 264,959 tuple reads in 3 h. **Keep.**
`..._station_period_idx` — 22.1 M tuple reads in 3 h. **Keep.**

### 3.2 `audit_logs` — 107 MB of duplicated response bodies

`detail` on a `download` row contains the entire upstream response. Measured:

| `action` | Rows | Payload |
|---|---|---|
| `download` | 10,342 | **70 MB** |
| `create` | 7,037 | 33 MB |
| `remote_command` | 1,827 | 12 MB |

- **Stored twice** — `detail` and `metadata` carry the same keys across 17,000–19,500 rows each
- `errors` key: 496 rows averaging **65 kB** ≈ 32 MB
- Largest rows **392 kB** (`/api/reports/transactions`)

**Useful (~200 B/row):** `action`, `resource`, `actor_user_id`, `ip_address`, `user_agent`, `status_code`, `outcome`, `method`, `created_at`, `reference`, `url`, `event`.

### 3.3 `operational_snapshots` — 42 MB never read

`readSnapshot` (`snapshot-service.js:101`) selects `summary_json` only. `payload_json` is read by **no code path**. `token-record` snapshots: 301 rows holding 31 MB (103 kB each).

**Security:** payloads contain **plaintext STS token PINs** (`"token": "0988 6468 8284 0410 4538"`). A token is a bearer credential for electricity.

### 3.4 `api_cache` — useful, one endpoint is the problem

| Path | Rows | Size |
|---|---|---|
| `/api/token/creditTokenRecord/readMore` | 70 | **10.1 MB** |
| `/api/RemoteMeterTask/GetTokenTask` | 578 | 1.9 MB |
| `/api/DailyDataMeter/read` | 1 | 711 kB |
| `/api/dashboard/readLineChart` | 429 | 206 kB |
| everything else | ~300 | < 700 kB |

Cache is doing its job. One endpoint is 63% of it. **Keep the cache; cap entry size at ~64 kB.**

### 3.5 The common thread

All four store the same thing — full upstream token-record responses — in four places. **~234 MB of the 312 MB is one habit.**

---

## 4. The 27 discarded fields — and the empty alarm engine

### 4.1 What the OEM actually sends

Sampled from `daily_meter_raw_duplicates` (935 surviving payloads — see §4.3):

```json
{"power":0,"remark":"System","status":null,"total1":5,"total2":0,
 "usage1":"0","usage2":null,"meterId":"47005345161","remain1":0,"remain2":0,
 "currentA":0,"currentB":0,"currentC":0,"voltageA":0,"voltageB":0,"voltageC":0,
 "coverOpen":true,"gatewayId":"E4-38-19-FF-FE-19-F2-BD","relayOpen":false,
 "stationId":"TUNGA","batteryLow":true,"createDate":"2026-05-17 15:32:43",
 "customerId":"47005345161","updateDate":"2026-05-17 19:32:42",
 "currentDate":"2026-05-17","customerName":"NUHU NAYAWO",
 "currentReverse":true,"intervalDemand":0,"currentUnbalance":true,
 "source2Activated":true,"terminalCoverOpen":true,"magneticInterference":true}
```

**34 fields. Beverly preserves 7.**

### 4.2 Full field inventory and disposition

Preserved today: `stationId`, `meterId`, `customerId`, `customerName`, `currentDate`, `total1`, `remain1`.

| Field | Type | Meaning | New home | Feeds |
|---|---|---|---|---|
| `magneticInterference` | bool | Magnet tamper attack | `flags` bit 0 | `meter_events`, `theft_signals` |
| `terminalCoverOpen` | bool | Terminal cover tamper | `flags` bit 1 | `meter_events`, `theft_signals` |
| `coverOpen` | bool | Meter cover tamper | `flags` bit 2 | `meter_events`, `theft_signals` |
| `currentReverse` | bool | Reverse current — theft | `flags` bit 3 | `theft_signals` |
| `currentUnbalance` | bool | Phase imbalance — bypass | `flags` bit 4 | `theft_signals` |
| `batteryLow` | bool | Meter battery failure | `flags` bit 5 | `meter_events` |
| `relayOpen` | bool | Disconnect state | `flags` bit 6 | `meter_events`, billing |
| `source2Activated` | bool | Secondary source active | `flags` bit 7 | `meter_events` |
| `status` | text/null | Meter status word | `flags` bits 8–11 | `meter_events` |
| `voltageA/B/C` | num | Per-phase voltage | `voltage_a/b/c` int2 (×10) | Quality, outage |
| `currentA/B/C` | num | Per-phase current | `current_a/b/c` int2 (×10) | Load, imbalance |
| `power` | num | Instantaneous power | `power_w` int4 | Load profile |
| `intervalDemand` | num | Interval demand | `demand_w` int4 | Peak analysis |
| `total2` | num | Register 2 cumulative | `total2_wh` int8 | Multi-tariff |
| `remain2` | num | Register 2 remaining | `remain2_wh` int4 | Multi-tariff |
| `usage1`, `usage2` | num | Per-register usage | Derived from deltas | — |
| `gatewayId` | text | GPRS gateway MAC | `gateway_key` int2 → dim | `gateway_health_incidents` |
| `createDate`, `updateDate` | ts | Upstream timestamps | `upstream_at` timestamptz | Latency monitoring |
| `createId`, `updateId` | text | Upstream actor | Dropped (constant `"System"`) | — |
| `remark` | text | Free text | Dropped unless non-constant | — |
| `meterType` | int | Meter model | On `meters` dimension | OEM Hub |

**Flag polarity:** these booleans are **inverted** — `true` means healthy. All derivation must go through the existing `conditionActive()` helper, never a raw truth test. This is a documented project-wide gotcha and the single most likely source of a wrong alarm.

### 4.3 The surviving evidence, and what was lost

- `daily_meter_readings.row_json`: **0 rows remain.** The last 49,998 were blanked by the nightly cron at **2026-07-29 03:07**, during this audit. The 25 July migration destroyed the rest.
- `daily_meter_raw_duplicates`: **935 rows still intact** — now the only surviving sample of the raw feed. **Export before any further cleanup runs.**

### 4.4 Why the alarm engine is empty

`meter_events` (0 rows) and `theft_signals` (1 row) are fully designed — typed event enum, severity, score, `signal_types` array, `source_window`, `site_code`. They are empty because **the fields that would populate them never reach a column.** Fixing §4.2 is what turns them on.

### 4.5 Corrected row design

The earlier narrow-row design (~80 B) silently discarded all 27 fields. Corrected:

| Column | Type | Bytes |
|---|---|---|
| `meter_key` | int4 | 4 |
| `reading_date` | date | 4 |
| `total_wh` | int8 | 8 |
| `remain_wh` | int4 | 4 |
| `total2_wh` / `remain2_wh` | int8 / int4 | 12 |
| `flags` | int4 bitmask (12 booleans + status) | 4 |
| `voltage_a/b/c` | int2 × 3 | 6 |
| `current_a/b/c` | int2 × 3 | 6 |
| `power_w` / `demand_w` | int4 × 2 | 8 |
| `gateway_key` | int2 | 2 |
| `upstream_at` | timestamptz | 8 |
| Tuple overhead + alignment | | ~24 |
| **Total incl. index** | | **~110 B** |

**vs 420 B measured today — 3.8× better, and nothing is discarded.**

### 4.6 Derivation pipeline

```
OEM adapter
  → raw payload to R2 (content-hashed, pre-parse)
  → typed columns in meter_readings          [all 34 fields]
  → meter_state (latest per meter)           [current status screens]
  → meter_events   on flag transition        [alarms: tamper, battery, relay, source2]
  → theft_signals  on scored window          [currentReverse + currentUnbalance + cover events]
  → gateway_health_incidents from gateway_key
  → meter_month_agg (watermark-incremental)  [consumption]
```

Alarms fire on **transitions**, not on every reading — otherwise 20,000 meters × 365 days generates 7.3 M events/year. A flag that stays active writes one open event and closes it when it clears.

---

## 5. Verified safety analysis

| Change | Read path checked | Verdict |
|---|---|---|
| Drop 2 duplicate indexes | `pg_indexes.indexdef` | **Safe** — structural proof (§3.1) |
| Strip `operational_snapshots.payload_json` | `snapshot-service.js:101` | **Safe** — never selected |
| Strip old `audit_logs.detail`/`metadata` | `report-service.js:736`, `storage-adapter.js:198` | **Safe after §6 extraction** |
| Retire `daily_meter_deltas` | Repo-wide search | **Safe but coupled** — 736,756 internal PK scans in 3 h; refresh must stop maintaining it first |
| Drop `row_json` | `consumption-store.js:353` | **Already broken** — see below |

**`row_json` regression:** in non-compact mode the store selects `row_json` and filters out empty rows. With all 463,245 rows now blank, callers not passing `compact:true` (`api/reference.js:2995`, `:4599`) get zero rows and fall through to `proxyLive`. The historical read path currently serves from the upstream API instead of the local store.

**Audit-strip qualification:** the dev console derives `method`/`outcome` from `detail_json || detail || metadata`. With a 500-row newest-first cap and 1,000–3,200 rows/day, a 7-day payload window is never reached in practice.

---

## 6. Token transaction recovery — BUILT AND VERIFIED

### 6.1 The finding

`token_transactions` stopped ingesting on **2026-04-10** (5,511 rows, source `upstream`). But the upstream responses kept flowing into `audit_logs`, `operational_snapshots`, and `api_cache` — which are all scheduled for deletion by the storage work.

**Vending records for 3½ months exist nowhere else.**

### 6.2 Tool

`tools/recover-token-transactions.cjs` — dry-run by default, `--commit` to write.

Extracts from four sources (`audit_logs.detail`, `audit_logs.metadata`, `operational_snapshots.payload_json`, `api_cache.response_json`), deduplicates on the table's existing natural key `(meter_sn, transaction_ts, amount)`, resolves station from `meters` then falls back to the latest reading, and inserts with `ON CONFLICT DO NOTHING` under `source='recovered'` so the whole operation reverses with one delete.

### 6.3 CORRECTED 2026-07-30 — the first pass recovered less than half

The initial tool used only **Shape A** (`payments` arrays) and deferred **Shape B**
(`payload_json->data->data`) on the grounds that its `createDate` was naive and
could not be reconciled without knowing the upstream timezone.

**Both parts of that were wrong.**

1. **Shape A is a rolling window, not history.** Each `/creditTokenRecord/readMore`
   call returns ~3,300 records covering a recent period, re-polled every 15 minutes.
   719,849 payment elements deduplicate to only ~7,200 distinct transactions —
   roughly 100/day.
2. **Shape B is the full paginated history**, keyed by a stable `receiptId`,
   carrying station, tariff, customer and token on every row.
3. **`createDate` is UTC, not naive local.** Measured against overlapping records:
   offset **0 minutes** for 4,969 of ~5,000 matches against existing
   `token_transactions`, and for 650,265 comparisons against Shape A's explicit-Z
   timestamps.

The tool now uses **Shape B as primary** (dedup on `receiptId`, which makes identity
independent of the timestamp entirely) with Shape A as a supplement for anything
Shape B misses.

**This was caught because the operator checked the recovery against the live
dashboard and said the transaction count looked too low.** It was.

### 6.3.1 Corrected dry-run results (2026-07-30 10:09 UTC)

```
candidates (deduplicated) : 16,901      distinct meters : 1,536
date range                : 2025-11-07 .. 2026-07-29
total amount              : ₦61,059,216.50
total kWh                 : 172,911.60
carrying a token PIN      : 15,875
unresolved station        : 22
NEW rows to insert        : 11,754
```

| Month | Transactions | Amount |
|---|---|---|
| 2026-04 | 2,056 | ₦6,075,040.00 |
| **2026-05** | **3,540** | **₦11,623,290.00** |
| 2026-06 | 2,996 | ₦6,953,146.00 |
| 2026-07 | 3,162 | ₦7,599,210.50 |
| **Total** | **11,754** | **₦32,250,686.50** |

**The May 2026 gap is closed** — it was an artefact of Shape A's rolling window,
not a genuine hole.

### 6.3.2 Reconciliation against the live dashboard

| Metric | Dashboard | Recovered candidates | Coverage |
|---|---|---|---|
| Purchase times | 17,338 | 16,901 | **97.5%** |
| Purchase money | ₦62,349,916.50 | ₦61,059,216.50 | **97.9%** |
| Purchase units | 176,577.6 kWh | 172,911.6 kWh | **97.9%** |

After insert, `token_transactions` goes **5,511 → 17,265**, within 0.4% of the
upstream's own count. The residual ~2.5% is transactions that were never captured
in any logged response; closing it requires an upstream re-fetch.

### 6.4 Superseded first-pass results (2026-07-30 07:48 UTC)

```
candidates (deduplicated) : 7,200
distinct meters           : 1,298
date range                : 2026-03-29 .. 2026-07-29
total amount              : ₦19,307,476.50
total kWh                 : 54,182.40
unresolved station        : 7
NEW rows to insert        : 6,193
```

| Month | Transactions | Amount |
|---|---|---|
| 2026-04 | 1,763 | ₦5,216,640.00 |
| **2026-05** | **0** | **— (gap remains)** |
| 2026-06 | 1,288 | ₦3,200,616.00 |
| 2026-07 | 3,142 | ₦7,560,110.50 |
| **Total** | **6,193** | **₦15,977,366.50** |

**Recovery more than doubles `token_transactions` (5,511 → 11,704).**

### 6.4 Deliberate scope limits

- **Shape B not inserted.** 491 snapshots holding **105,637 token records** use naive timestamps (`"2026-07-26 17:19:48"`, no zone) that cannot be reconciled against Shape A's ISO-8601 without knowing the upstream timezone. Guessing risks double-counting revenue. Exported to `tmp/token-recovery-shapeB-*.ndjson` for review. **These records carry the `token` PIN and `receiptId` that Shape A lacks.**
- **May 2026 remains empty.** No source covers it. Needs an upstream re-fetch.
- **7 meters unresolved** — no station mapping in `meters` or readings. Listed in `tmp/token-recovery-unresolved-*.json`.
- **Currency is `MMK`** in the OEM payload, not NGN. Amounts are treated as NGN to match existing rows. Flagged as an upstream data-quality issue.

### 6.5 Status

**Dry run verified. Nothing written.** Commit is gated behind the backup in §7, per instruction.

---

## 6A. CRITICAL — the reference-data pipelines were never built

Found 2026-07-30 during re-audit. **Not a storage problem, and more serious than one.**

### 6A.1 Measured

| Table | Rows | Last write | Stale for |
|---|---|---|---|
| `meters` | 15,756 | **2026-04-14** | 3.5 months |
| `accounts` | 1,128 | **2026-04-14** | 3.5 months |
| `sites` | 6 | **2026-04-14** | 3.5 months |
| `token_transactions` | 5,511 | **2026-04-13** | 3.5 months |
| `meter_daily_reads` | 4,448 | **2026-04-13** | 3.5 months |
| `customers` | 1,129 | **2026-05-20** | 2.3 months |
| `daily_meter_readings` | 465,993 | **2026-07-30** | current |

Only the telemetry pipeline is running. Every reference/dimension pipeline stopped in mid-April 2026.

### 6A.2 The consequence

```
meters actively reporting (last 30 days)   : 2,512
of those present in the `meters` table     : 1,125
MISSING from the meters table              : 1,387  (55%)
```

**More than half of Beverly's live meters have no row in the meter dimension** — therefore no customer link, no account link, no site link. Any feature joining readings → meters → customers is silently wrong for those meters.

Sample of missing meters, all with hundreds of readings each:

| meter_id | station | readings |
|---|---|---|
| 47005368809 | KYAKALE | 355 |
| 47005367579 | KYAKALE | 285 |
| 47005369062 | KYAKALE | 285 |
| 47005367124 | TUNGA | 271 |
| 47005332136 | MUSHA | 270 |

### 6A.3 Root cause — not a broken pipeline, an absent one

A repository-wide search for any write to these tables (`upsert`, `insert`, `POST /meters`, `from('meters')`) across `backend/` returns **no matches**.

`refresh-targets.js` *does* define hourly poll targets for `/api/meter/read`, `/api/account/read`, `/api/customer/read`. Those calls run and their responses land in `api_cache` — confirmed, `/api/account/read` holds 7 cached entries totalling 250 kB. **But nothing ever persists them into the dimension tables.**

The tables were populated once by a one-off import on 2026-04-14 and have never been maintained. The ingestion half of the reference pipeline was never written.

### 6A.4 Why this matters to the rest of the plan

- **The `meter_key` surrogate in §9.5 and the DO prototype depend on `meters` being complete.** It is 55% incomplete. This must be fixed before any migration keyed on it.
- **It explains the 22 unresolved stations** in the token recovery — those meters are simply absent from the dimension.
- **Capacity models using `customers` (1,129) are understated.** Reporting meters (2,512) is the reliable figure; it comes from telemetry, which is current.
- This is a **correctness** defect in production today, independent of quota.

### 6A.5 Fix

Write the missing persistence step: for each `/api/meter/read`, `/api/account/read`, `/api/customer/read` poll, upsert into the dimension tables on the upstream identifier. Then a one-time reconciliation pass to import the 1,387 missing meters.

**Priority: week 1, alongside the quota work.** It is small (one service, one upsert path per entity) and it unblocks everything downstream.

---

## 7. Backup — before anything begins

The free plan has **no PITR and no retained backups**. Every phase below assumes a verified restore exists first.

### 7.1 Pre-migration backup (blocking)

| # | Action | Verification |
|---|---|---|
| 7.1.1 | Full logical dump (`supabase db dump` / `pg_dump -Fc`), schema + data | Dump completes, size recorded |
| 7.1.2 | Separate dump of roles, RLS policies, functions, cron schedule | 230 policies + 57 functions present |
| 7.1.3 | Export `storage.objects` (17 objects, 400 KB) | Object count matches |
| 7.1.4 | **Restore into a throwaway Supabase project** | **Row counts match on all 130 tables** |
| 7.1.5 | Export `daily_meter_raw_duplicates` (935 rows — last raw sample) | File exists, 935 rows |
| 7.1.6 | Export `audit_logs`, `operational_snapshots`, `api_cache` payloads in full | Byte size matches TOAST size |
| 7.1.7 | Encrypt (`age` or GPG), then distribute per §7.2 | Decrypt test passes |
| 7.1.8 | ~~Rotate the database password~~ — **declined by the operator 2026-07-30**, risk accepted and acknowledged. Not a blocker; recorded here so the decision is not silently lost. | n/a |

**GATE B: 7.1.4 must pass. No phase proceeds without a proven restore, and 7.1.5–7.1.6 must complete before any payload deletion.**

### 7.2 3-2-1 distribution

| Copy | Destination | Retention |
|---|---|---|
| 1 | Local / on-prem encrypted | Indefinite for pre-migration |
| 2 | **Cloudflare R2** `dr/` prefix | 12 weekly + all pre-migration |
| 3 | **SharePoint (Graph)** encrypted, write-only | 12 weekly |

### 7.3 Ongoing cadence

- **Weekly** full encrypted dump → R2 + SharePoint, automated (GitHub Actions is free for this)
- **Daily** incremental export of money tables only (`wallet_ledger_entries`, `payment_transactions`, `purchase_orders`, `receipts`, `token_transactions`) — small, and the data you cannot reconstruct
- **Monthly** restore drill with **measured RTO**, recorded

### 7.4 What backups do not solve

A weekly dump gives a **7-day RPO**; a daily money export gives 24 hours. Neither is PITR. For a system moving real money the worst realistic outcome is unrecoverable ledger loss — which is a plan-tier decision, not a backup-strategy decision.

---

## 8. Capacity model for 20,000 meters

### 8.1 Readings

At the §4.5 corrected width of ~110 B (all 34 fields retained):

| Hot window | Rows | Size |
|---|---|---|
| 35 days | 700,000 | 77 MB |
| 60 days | 1.20 M | 132 MB |
| 90 days | 1.80 M | 198 MB |
| 365 days | 7.30 M | **803 MB — exceeds quota** |

**Design point: 35–60 day hot window.**

### 8.2 Transaction volume — from real data

Peak month March 2026: **2,357 transactions across 880 distinct meters**.

- Monthly-active meter ratio: **880 / 2,511 = 35.0%**
- Transactions per active meter per month: **2.68**

**At 20,000 meters** [MODEL — linear extrapolation of measured ratios]:
- Monthly active: 7,000 · Transactions/month: **18,760** · Per year: **~225,000**
- At ~250 B all-in: **~56 MB/year of ledger**

*Caveat: `token_transactions` ingestion stopped 2026-04-10 and the §6 recovery restores April/June/July but not May. Re-run this model after recovery commits.*

### 8.3 Alarm and theft-signal volume

Events fire on **transition**, not per reading [MODEL]:
- Tamper/battery/relay transitions: ~0.5 events/meter/month → 10,000/month at 20,000 meters
- At ~150 B: **18 MB/year**, retained 12 months hot, then archived
- `theft_signals`: scored windows, ~1 row per flagged meter-week → well under 5 MB/year

### 8.4 Budget — Project B (telemetry)

| Tier | Content | Size |
|---|---|---|
| Hot readings | 2 monthly partitions (~60 d) @ 110 B | 132 MB |
| `meter_events` | 12 months | 18 MB |
| `theft_signals` | 24 months | 5 MB |
| Warm aggregates | meter-month × 3 yr | 45 MB |
| Station rollups | station-day × 3 yr | 10 MB |
| Ops / dev / health | no payloads | 20 MB |
| Dimensions | sites, meters, oem, gateway | 8 MB |
| **Total** | | **238 MB** |
| Headroom | | **262 MB (52%)** |

### 8.5 Budget — Project A (core)

| Tier | Content | Size |
|---|---|---|
| Identity | customers, accounts, sites, profiles, auth | 25 MB |
| Meters | meters + bindings + tariff history | 20 MB |
| Money (24 months) | ledger, payments, POs, receipts, holds | 113 MB |
| Vendors / settlement / disputes | | 15 MB |
| Notifications (90 d) | | 10 MB |
| Audit (scalars, 90 d) | | 12 MB |
| OEM config | | 2 MB |
| **Total** | | **197 MB** |
| Headroom | | **303 MB (61%)** |

**Both fit the free tier at 20,000 meters with >50% headroom.**

### 8.6 Where it breaks

- Ledger growth is linear and cannot be aggressively archived. **Project A crosses 500 MB around year 5** at projected volume without rollup.
- If wallet adoption exceeds the historical 35% / 2.68 pattern by >2×, year 3.
- R2's 10 GB free tier holds **7–10 years** of compressed archive [MODEL].
- **No PITR at any scale on the free plan.**

---

## 9. Target architecture

### 9.1 Governing rule

> **Postgres holds state and money. It does not hold history.**

### 9.2 Tiers

| Tier | Content | Home | Retention |
|---|---|---|---|
| 0 — State | meters, customers, stations, OEM config, `meter_state` | Project A | Forever |
| 1 — Hot facts | `meter_readings`, monthly partitions | Project B | 2 partitions |
| 2 — Signals | `meter_events`, `theft_signals` | Project B | 12–24 months |
| 3 — Warm aggregates | meter-month, station-day | Project B | 3 years |
| 4 — Money | ledger, payments, tokens | Project A | 24 months, then rollup |
| 5 — Cold | raw payloads, old readings, old ledger, audit payloads | **R2** | Forever |
| 6 — Ephemeral | API cache, snapshots | In-process LRU / R2 | Minutes–hours |
| 7 — DR | encrypted dumps | **R2 + SharePoint** | Weekly, 12 retained |

### 9.3 Partitioning

`meter_readings` range-partitioned monthly. Rotation is `DETACH` → export to R2 → `DROP`: instant, no dead tuples, no `VACUUM FULL`, no bloat cycle. **Must exist before OEM #2 onboards.**

### 9.4 `meter_state`

One row per meter: latest `total_wh`, `remain_wh`, current `flags`, last-seen, gateway. Every status screen across all four applications reads only this — 20,000 rows, fixed forever. Today those screens scan `daily_meter_readings`.

### 9.5 Multi-OEM

```
meters
  meter_key      int4    ← internal surrogate, used in EVERY fact table
  oem_id         int2    → oem_manufacturers
  oem_native_id  text    ← the OEM's identifier, quarantined HERE
  meter_type     int2
  station_id     int2
  customer_id    int4
```

At 20,000 meters and 7.3 M annual readings, int4 keys versus repeated text identifiers is worth **~350 MB/year** in fact tables and indexes [MODEL].

Each adapter normalizes its native payload — Calin's `DailyDataMeter/read`, others differ — into the canonical 34-field shape. Adding an OEM = write an adapter, insert one `oem_manufacturers` row, map stations. **No schema change.**

### 9.6 The refresh contract

> **No scheduled or user-triggered job's cost may scale with total history.**

Every aggregate carries a `source_watermark`; refreshes process only rows ingested since it. Full rebuilds are manual, rate-limited, admin-only. **Paired rule:** index budget ≤ 1:1 against heap; no index without a named query.

---

## 10. Two-project split

### 10.1 Feasibility — confirmed

The FK graph shows the large telemetry tables have **zero foreign keys**: `daily_meter_readings`, `daily_meter_deltas`, `meter_consumption_aggregates`, `daily_meter_raw_duplicates`, `operational_snapshots`, `api_cache`.

The money/identity graph is densely connected by contrast (`meter_purchase_orders → wallets, customers, wallet_ledger_entries, vendor_organizations`; `customers → auth.users, sites`; `meters → customers, accounts, sites`).

**The cut line falls exactly where the FKs stop.**

### 10.2 Allocation

**Project A — `beverly-core`:** `auth.*` · customers, accounts, sites, profiles, users, roles, permissions · meters, customer_meters, account_bindings, account_tariff_history · wallets, vendor_wallets, wallet_ledger_entries, wallet_holds, wallet_idempotency_requests · purchase_orders, meter_purchase_orders, receipts, payment_transactions, payment_webhooks · funding/refund/dispute tables · settlement_batches, wallet_reconciliation_runs · vendor_* · MFA + portal_sessions · notifications, announcements · support_* · **oem_\*** · audit_logs (scalars), wallet_audit_* · fraud_assessments, fraud_signals, customer_risk_baselines, customer_known_* · vat_policies, tariff_rate_history · **token_transactions**

**Project B — `beverly-telemetry`:** meter_readings (partitioned) · **meter_events, theft_signals** · meter_consumption_aggregates, consumption_aggregates · meter_daily_reads, station_meter_read_rollups · site_consumption_facts, collections_priority_facts, runtime_health_facts · operational_snapshots, api_cache · gateway_health_* · dev_* · import/export/print jobs

### 10.3 The FKs that must be handled

`consumption_aggregates → oem_manufacturers`; `meter_events → sites, meters`; `meter_daily_reads → sites`; `site_consumption_facts`, `collections_priority_facts`, `runtime_health_facts → sites`.

**Resolution:** Project B carries read-only replicated dimensions — `sites_dim`, `meters_dim`, `oem_dim`, `gateway_dim` — synced nightly from A (6 sites, 15,756 meters, 1 OEM). FKs in B are dropped and replaced by a nightly orphan check.

### 10.4 Application changes

Two Supabase clients (`coreClient`, `telemetryClient`); a table→client routing map in `backend/src/services/storage-adapter.js`; Consumption paths in all three portals + CRM repointed; wallet backend talks only to `coreClient`.

### 10.5 Trade-offs

**Gains:** a telemetry incident cannot 402 vending; the money project stays small and is the only one that would need Pro; rebuild blast radius contained.

**Costs:** two projects to migrate, monitor and back up; no cross-project joins; two RLS policy sets; **free projects pause after 7 days idle** — the telemetry project needs a keep-warm job.

---

## 10A. Station registry — IMPLEMENTED 2026-07-30

### 10A.1 The constraint

The live station estate was a literal repeated across **13 JavaScript modules**. Onboarding a sixth station meant editing every copy and shipping a release; any module missed left that station silently absent from analytics, refreshes, gateway inference, or the UI.

**Correction to an earlier draft of this document:** it claimed a test in `backend/wallet/src/services/__tests__/consumption-station-estate.test.ts` asserted a sixth station would not refresh. That was wrong — read out of context. The wallet service was **already correct**: it discovers via `list_consumption_station_ids()`, and its test asserts a sixth station *is* refreshed (`refreshedStations === 6`). The line misread was the fallback case, where discovery fails and the seed list is used deliberately. The wallet side needed no change.

### 10A.2 The database was already right

- `public.consumption_stations` — registry table (`station_id`, `is_active`, `label`, `note`)
- `public.list_consumption_station_ids()` — unions stations with readings, with aggregates, or registered; filters by `is_active`, defaulting to active unless the id looks like a fixture (all-numeric, `%TEST%`, `%SMOKE%`)

Live contents confirm deliberate curation: `0001` (*"placeholder id in OEM feed"*), `KADUNA` (*"vendor onboarding fixture — no meter data"*), `SMOKE-STATION`, `TEST_STATION` all `is_active = false`.

**No SQL view or function in the live database contains a station literal** (`prosrc`/`viewdef` scan). The literals in three July migrations were superseded. The database layer required no change.

### 10A.3 What was implemented

| Layer | Change |
|---|---|
| **New** `backend/src/services/station-registry.js` | Cache over the RPC. `getStations()` async, `getStationsSync()` for sync paths, `SEED_STATIONS` as a degradation floor only |
| **New** `src/services/station-registry.mjs` | Browser equivalent, fed by the API endpoint |
| **New** `GET /api/system/stations` | Serves the estate to browser bundles |
| `consumption-store.js` | 5 constants removed; also fixed a dangling `CANONICAL_STATIONS` reference that would have thrown |
| `refresh-targets.js` | Poll/backfill fan-outs use the discovered estate |
| `gateway-health-service.js` | Inference baseline from the registry |
| `tariff-snapshot-service.js` | Snapshot scope from the registry |
| `api/reference.js` | Station scope from the registry |
| `consumption-service.mjs` | `LIVE_STATIONS` deprecated; `liveStations()` / `resolveStations()` added |
| `table-mapper.mjs` | Name inference from the registry |
| `StationConsumptionPage.vue` | Dropdown seeded, refreshed on mount |
| `AbnormalAlarmPage.vue` | Station filter seeded, refreshed on mount |

**Degradation model:** discovery failure falls back to last-known, then to seed — never to an empty estate.

### 10A.4 Verification

```
station estate test suite     16/16 passed
CRM production build          succeeded
backend modules load          OK
discovered estate             KYAKALE, MUSHA, OGUFA, TUNGA, UMAISHA
isKnown('0001')               false   (junk still excluded)
backfill targets              5, matching the estate

onboarding proof (rolled back):
  insert BONDU -> RPC returns BONDU,KYAKALE,MUSHA,OGUFA,TUNGA,UMAISHA
  delete BONDU -> RPC returns KYAKALE,MUSHA,OGUFA,TUNGA,UMAISHA
```

**Onboarding a station is now one row in `consumption_stations`** — or nothing at all, since a station with readings is discovered automatically. No redeploy.

### 10A.5 Deliberately unchanged

- `backend/src/services/oem-station-fallback.js` — the OEM Hub's canonical Calin list is intentionally a **superset** (includes `BONDU`, `KADUNA`: commissioned, no meters yet). Different tier, documented, correct.
- `api/reference.js:3452` — a vending-preview fixture, not an estate list.

---

## 11. Cloudflare

### 11.0 Free-plan limits (verified from cloudflare.com/plans)

| Component | Free | Relevance to Beverly |
|---|---|---|
| **R2 storage** | **10 GB, zero egress** | Archive + DR — **adopt** |
| Workers requests | 100,000/day | Ingest adapters — ample |
| Workers KV | 1 GB, 100k reads/day, **1,000 writes/day** | Config only — see §11.5 |
| **DO SQL stored data** | **5 GB** | 10× Supabase's 500 MB |
| DO SQL rows read | 50M/day | Ample |
| **DO SQL rows written** | **100,000/day** | **The binding constraint** |
| DO requests / duration | 100k/day · 13,000 GB-s/day | Ample |

### 11.0.1 The write ceiling changes the DO recommendation

Measured and projected write volume:

| Workload | Writes/day |
|---|---|
| Today: readings + state + aggregates @ 2,511 meters | ~7,500 |
| At 20,000 meters: readings 20k + `meter_state` 20k + meter-month upserts 20k + events ~300 | **~60,000** |
| **One full aggregate rebuild (measured 2026-07-29)** | **552,371** |

Two conclusions:

1. **A single rebuild burst is 5.5× the entire daily free write budget.** Durable Objects are not viable until Phase 4 (watermark-incremental refresh) removes full rebuilds. Hard dependency, not a preference.
2. **Backfill is severely constrained.** 463,245 rows today ≈ 5 days at the free write rate; 7.3M rows at 20,000 meters ≈ **73 days**. One-time and throttleable, but it is a real migration cost.

At steady state, 20,000 meters uses ~60% of the free write budget — workable, not comfortable.

### 11.0.2 SUPERSEDED 2026-07-30 — DO adopted, on corrected arithmetic

The analysis below sized Durable Objects as a **like-for-like port of the Postgres
design**, carrying its aggregate tables across. That was the error, and it produced
a ~60,000 writes/day figure that made DO look marginal.

**DO-native, there is no aggregate table.** Each station DO holds its own SQLite with
an index on `(meter_key, reading_date)`; a monthly total is a local `SUM` over a few
hundred rows on the same machine. Nothing is pre-aggregated, so nothing needs
maintaining:

| Writes/day @ 20,000 meters | Postgres-style port | DO-native |
|---|---|---|
| Reading rows | 20,000 | 20,000 |
| `meter_state` upserts | 20,000 | **0** — indexed query |
| meter-month aggregates | 20,000 | **0** — computed on read |
| Event transitions | ~300 | ~300 |
| **vs 100k/day cap** | ~60,300 (60%) | **~20,300 (20%)** |

Storage, all 34 fields at ~80 B/row in SQLite [MODEL]:

| Retention @ 20,000 meters | Size | Of 5 GB |
|---|---|---|
| 1 year | 584 MB | 12% |
| 3 years | 1.75 GB | 35% |
| 5 years | 2.9 GB | 58% |

**Multi-year hot retention — which the operator requires — is affordable only on DO.**
Supabase's 500 MB cannot hold 365 days at 20,000 meters (803 MB), let alone three years.

**Decision: adopt DO for the telemetry tier**, subject to the prototype in
`docs/DURABLE_OBJECTS_PROTOTYPE_SPEC.md`. The single unmeasured risk is
cross-station fan-out for the all-stations dashboard; that is what the prototype tests.

**Two phases are removed as a result:**
- The two-Supabase-project split (§10) — the DO tier *is* the telemetry project
- Monthly partitioning (§9.3) — each station DO is already a shard

**Hard blocker:** while full rebuilds exist, one accidental trigger writes 552,371 rows
— 5.5× the entire daily free write budget. Incremental refresh must ship first.

### 11.0.3 Superseded recommendation (retained for the record)

**Keep the two-Supabase-project plan (§10). Do not move telemetry to Durable Objects yet.**

The reasoning, plainly:

| | Supabase Project B | Cloudflare DO |
|---|---|---|
| Storage cap | 500 MB | 5 GB |
| Write cap | none | 100k/day |
| Telemetry need @ 20k meters, 60-day window | **238 MB — fits** | fits |
| Read-path rewrite | none | consumption paths + fan-out |
| Backfill | hours | ~73 days |

**DO buys retention depth, not survival.** Project B already fits at 20,000 meters with a 60-day hot window. DO would let you hold 3–5 years hot instead — genuinely valuable, but it is an optimisation, and it costs a write ceiling, a read-path rewrite, and a long migration.

**Adopt now:** R2 (archive + DR), Workers (OEM ingest adapters), KV (config only).
**Revisit DO** after Phase 4, if multi-year hot retention becomes a requirement.

### 11.1 R2 — why

| Option | Free tier | Verdict |
|---|---|---|
| **Cloudflare R2** | **10 GB, zero egress** | **Selected** — can serve app reads |
| Supabase Storage | 1 GB | Secondary, recent tail, same region |
| Backblaze B2 | 10 GB | Viable alternative |
| Azure Blob (Cool) | 5 GB / 12 months | Not free long-term |
| SharePoint / Graph | With M365 | **DR only** (§11.4) |

### 11.2 Layout

```
beverly-archive/
  raw/{oem}/{station}/{yyyy}/{mm}/{dd}/{sha256}.json.gz
  normalized/readings/{station}/{yyyy-mm}.parquet
  events/{station}/{yyyy-mm}.parquet
  ledger/{yyyy-mm}.parquet
  audit/{yyyy-mm}.ndjson.gz
  dr/{yyyy-mm-dd}-full.dump.age
```

`raw/` is written **before parsing**, content-hashed. It is the replay source and audit trail, and it is what makes every downstream table safe to prune — exactly the protection missing on 25 July.

### 11.3 Latency reality

Postgres 10–50 ms; R2 0.5–3 s. **No money data is ever cold.** Aggregates stay hot for 3 years, so monthly/yearly consumption stays instant even when raw readings are archived. Only per-day, per-meter raw values older than the hot window pay the cold penalty — forensic work, not daily use.

### 11.4 SharePoint — DR only

Rejected as archive tier: no range reads, unpredictable Graph throttling, silently-expiring client secrets, version history multiplying stored volume, latency unsuitable for app reads. **Accepted for weekly encrypted write-only dumps.** Requires Azure AD app registration, `Files.ReadWrite.All`, chunked upload for >4 MB, certificate auth preferred, explicit version-retention limits. **Data residency must be confirmed** against Nigerian KYC and payment data before use.

---

## 12. Implementation plan

### Phase B — Backup (blocking)
Per §7.1. **GATE B: verified restore + raw-payload exports complete.**

### Phase R — Token recovery (immediately after Phase B)
| # | Action |
|---|---|
| R.1 | `node tools/recover-token-transactions.cjs --commit` → 6,193 rows, ₦15.98M |
| R.2 | Reconcile recovered totals against upstream reports |
| R.3 | Resolve the 7 unmapped meters |
| R.4 | Decide on Shape B (105,637 records with token PINs) — timezone must be established first |
| R.5 | Investigate the May 2026 gap and the 2026-04-10 ingestion stoppage |

**GATE R: `token_transactions` reconciled. Only then may audit/snapshot payloads be deleted.**

### Phase 1 — Emergency reclamation (no locks, ~2–3 h)
| # | Action | Recovers |
|---|---|---|
| 1.1 | Drop `..._meter_period_idx` (exact duplicate) | 35 MB |
| 1.2 | Drop `..._station_meter_idx` (PK-redundant) | 40 MB |
| 1.3 | Null `operational_snapshots.payload_json` | 42 MB |
| 1.4 | Null `audit_logs.detail`/`metadata` > 7 days | ~100 MB |
| 1.5 | Truncate `api_cache`; cap entries at 64 kB | 16 MB |
| 1.6 | Prune `cron.job_run_details`; schedule retention | 2 MB |
| 1.7 | Delete aggregate/delta rows > 90 days | ~90 MB |

**GATE 1: < 500 MB, measured twice 1 h apart.**

### Phase 2 — Stop the ratchet (~1 day)
2.1 Fix `consumption-store.js:353` to reconstruct from scalars · 2.2 Verify `reference.js:2995`/`:4599` serve from store · 2.3 Gate the refresh route behind admin action · 2.4 Unschedule job 7 · 2.5 Stop writing audit payloads for `download`/`create` · 2.6 Stop writing `token-record` snapshot payloads · 2.7 Stop writing `row_json`

**GATE 2: size flat across 48 h including a Consumption page view.**

### Phase 3 — Reclaim (one maintenance window)
3.1 Drop `row_json` column · 3.2 Retire `daily_meter_deltas` (rename → 7 days → drop; repoint 3 files) · 3.3 `VACUUM FULL` + `REINDEX` on `daily_meter_readings` · 3.4 Re-evaluate `daily_meter_readings_pkey` on 7 days of fresh stats

**GATE 3: ~250 MB; all four applications smoke-tested.**

### Phase 4 — Incremental refresh (~3–5 days)
Watermark columns · rewrite both refresh functions · re-enable bounded on-demand refresh · re-schedule job 7.
**GATE 4: refresh < 10 s; size unchanged after 10 runs.**

### Phase 5 — Signal capture (~1 week) — **NEW**
| # | Action |
|---|---|
| 5.1 | Add the §4.5 typed columns to the readings table |
| 5.2 | Extend the OEM adapter to populate all 34 fields, via `conditionActive()` for flag polarity |
| 5.3 | Build `meter_state` |
| 5.4 | Transition-based `meter_events` derivation |
| 5.5 | `theft_signals` scoring from reverse-current + unbalance + cover events |
| 5.6 | Wire `gateway_key` into `gateway_health_incidents` |
| 5.7 | Surface alarms in Admin (Fraud, Vending) and Vendor portals |

**GATE 5: `meter_events` populating; a known-tampered meter produces a signal; no false alarms from polarity inversion.**

### Phase 6 — R2 archive (~1 week)
Bucket + credentials · `raw/` written pre-parse · nightly archive job · `/api/archive/readings` route · **round-trip verification** · weekly DR dump.
**GATE 6: round-trip passes on real data. No partition dropped before this.**

### Phase 7 — Schema redesign & partitioning (~2 weeks)
`meter_key` surrogate · `meter_readings_v2` partitioned · backfill · repoint status screens to `meter_state` · per-meter-month aggregates replace per-meter-day · cut over · automate `DETACH`→export→`DROP`.
**GATE 7: all 94 portal views + 32 CRM components smoke-tested.**

### Phase 8 — Project split (~1–2 weeks)
Provision `beverly-telemetry` · dimension tables + nightly sync · migrate §10.2 tables · `telemetryClient` + routing · repoint Consumption paths · port RLS · keep-warm job · nightly orphan check.
**GATE 8: both projects < 250 MB; full regression.**

### Phase S — Station registry ✅ COMPLETE (2026-07-30)
Delivered ahead of the storage work; see §10A. Onboarding a station is now a single registry row with no redeploy, verified end to end.

### Phase 9 — Governance (ongoing)
Weekly size report, alert at 350 MB/project · per-table MB budgets in-repo · index review gate · refresh contract in code review · quarterly `idx_scan` review over a full window · monthly restore drill.

---

## 13. Open decisions

1. **Shape B insertion (105,637 records).** Blocked on establishing the upstream timezone. Carries token PINs and receipt IDs that Shape A lacks.
2. **May 2026 gap.** No source covers it; needs upstream re-fetch.
3. **`token_transactions` stopped 2026-04-10.** Intentional cutover or broken pipeline — **not yet investigated**. Affects §8.2.
4. **Token PINs in plaintext** across `operational_snapshots` and `api_cache`. Security decision independent of storage.
5. **Audit payload retention.** Stripping destroys forensic detail permanently. Compliance call.
6. **Flag polarity.** All §4.2 booleans are inverted (`true` = healthy). Must route through `conditionActive()`. Highest false-alarm risk in Phase 5.
7. **Currency `MMK`** in OEM payloads vs NGN in Beverly. Upstream data-quality issue.
8. **SharePoint data residency** vs Nigerian KYC/payment data.
9. **PITR.** Unavailable on free plan at any scale.

### What this audit did not do
Execute any production change · test any migration · investigate the ingestion stoppage · review the 230 RLS policies individually · establish a full-window `idx_scan` baseline.

---

## 14. Summary

| | |
|---|---|
| **Cause** | A release cluster 12–22 July 2026, not the meter API. ~310 MB of 878 MB post-dates 12 July. |
| **Mechanism** | Pre-existing full-rebuild trigger (30 June), amplified ~4× by three July indexes, ratcheted by a 25 July nightly prune. |
| **Hidden loss** | 6,193 vending transactions worth **₦15,977,366.50** exist only in log tables scheduled for deletion. Recovery tool built and verified. |
| **Hidden capability** | 27 of 34 OEM fields discarded at ingest. `meter_events` and `theft_signals` are empty for that reason alone. |
| **Delivered** | Station registry (§10A) — the estate is discovered, not hardcoded. Onboarding is one row, no redeploy. Verified end to end. |
| **Cloudflare** | R2 + Workers + KV: adopt. Durable Objects: defer — the 100k/day SQL write cap is 5.5× under a single measured rebuild, and Project B already fits at 20,000 meters. |
| **Immediate recovery** | ~250 MB after Phases 1–3; 75 MB rests on structural proof independent of statistics. |
| **Long-term** | Both projects fit the free tier at 20,000 meters with >50% headroom, given partitioning, R2, and the refresh contract. |
| **Hard limits** | Project A ledger crosses 500 MB ~year 5. No PITR on free at any scale. |
