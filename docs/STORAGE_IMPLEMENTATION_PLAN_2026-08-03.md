# Beverly — Storage Implementation Plan

**Written:** 2026-08-03 15:30 UTC
**Supersedes:** all prior storage plans in this project
**Deadline:** 2026-08-20 — **17 days** — after which requests return HTTP 402

Every number below was measured from a primary source at the time stated. Estimates are
labelled **[EST]** with the basis given. Where an earlier plan was wrong, the correction
and its evidence are recorded rather than silently dropped.

---

## 1. Measured current state

**2026-08-03 15:18 UTC**

| | |
|---|---|
| `pg_database_size` | **843 MB / 842 MiB** |
| Quota | 500 MB → **169% over** |
| Compute | **`t4g.nano` — 2 burstable vCPU, 512 MB RAM** |
| Platform backups | **None** (Supabase dashboard: "LAST BACKUP: No backups") |

### Table sizes

| Table | Total | Heap | Indexes | **TOAST** | Rows |
|---|---|---|---|---|---|
| `meter_consumption_aggregates` | 262 MB | 76 MB | 186 MB | 8 kB | 260,587 |
| `daily_meter_readings` | 231 MB | 163 MB | 68 MB | **8 kB** | 477,994 |
| `audit_logs` | 146 MB | 25 MB | 5.5 MB | **116 MB** | 26,982 |
| `daily_meter_deltas` | 142 MB | 73 MB | 69 MB | 8 kB | 210,936 |
| `operational_snapshots` | 8.5 MB | 6.9 MB | 0.9 MB | 0.7 MB | 4,239 |

Schemas: `public` 820 MB · `pg_toast` 120 MB · `pg_catalog` 17 MB · `cron` 3.9 MB ·
`auth` 2.0 MB · `storage` 0.4 MB.

### Already done

| Item | Evidence |
|---|---|
| **P1 orphan-prune guard** | `guard=true` on both functions; migration `20260801090000` recorded; GATE PASS with `pruned_aggs=0`; ₦21,380,551.50 protected |
| **P2 lock-free** | 926 → 843 MB. Index drop 36 MB, `api_cache` 5 MB, snapshots 45 MB, cron prune 0, audit blank 0 |
| **`row_json` read path** | `consumption-store.js` no longer selects `row_json`; build green, 6 suites pass; commit `b8f65de4` |

---

## 2. The controlling discovery: what plain `VACUUM` can and cannot reclaim

Three experiments, all executed on this database today.

| Table | Column blanked | Storage location | Result |
|---|---|---|---|
| `operational_snapshots` | **100%** (4,239/4,239) | TOAST, 53 MB | **53 MB → 8.5 MB, 45 MB reclaimed** |
| `audit_logs` | **68%** (14,427/26,982) | TOAST, 116 MB | **116 MB → 116 MB, 0 reclaimed** |
| `daily_meter_readings` | *not attempted* | **inline heap** (values 782–856 B, below the ~2 kB TOAST threshold; `reltoastrelid` size = 8192 B) | **would reclaim 0** |

**Plain `VACUUM` returns space to the OS only when BOTH hold:**

1. the data lives in a **TOAST relation**, and
2. that TOAST becomes **entirely** dead — every row blanked.

Partial blanking leaves dead chunks interleaved with live ones, and `VACUUM` truncates
only at the end of a relation. Inline heap data never qualifies at all.

**This corrects two errors.** The earlier log stated the rule as "blanked entirely",
omitting the TOAST condition — which would have led straight into a `row_json` operation
reclaiming nothing. And the prior plan's step 2.4 specified `SET payload_json = NULL`,
which fails with `23502`: `operational_snapshots.payload_json` and `audit_logs.metadata`
are both `NOT NULL DEFAULT '{}'::jsonb`.

---

## 3. Constraints that bound every option

| Constraint | Evidence |
|---|---|
| **512 MB RAM instance** | `t4g.nano`. Went **Unhealthy** (Database, PostgREST, Auth, Storage) under backup load 2026-08-03 ~12:00–14:00 UTC while `status.supabase.com` showed all services operational. Restored by dashboard restart. |
| **Pooler degraded** | 52–129 KB/s synthetic, no TOAST. PostgREST ~1300 KB/s on identical rows — **12×**. All bulk reads must use REST. |
| **Index-usage stats are void** | The restart reset `pg_stat_user_indexes`. Nearly every index reads `idx_scan = 0`. **No index may be dropped on this evidence** until ≥7 days of stats accumulate. |
| **Two largest tables have no PK** | `daily_meter_readings` and `meter_consumption_aggregates` — their `*_pk` constraints are `contype='u'`. Breaks replication, CDC, and pagination tooling. |
| **Job 7 still failing** | 3 failures in 24 h, statement timeout. The wrapper lacks the `600s` override the inner function has. |
| **Growth continues** | `audit_logs` ~5.9 MB/day; readings ~2,500 rows/day. Deferring worsens the position. |

---

## 4. What is reachable, and what is not

### Remaining lock-free headroom: ~116 MB

Only one candidate satisfies both conditions in §2:

**`audit_logs` — blank the remaining 12,561 populated rows** so the 116 MB TOAST becomes
entirely dead and truncates.

- Reclaim: **~116 MB [EST — basis: the `operational_snapshots` result, where a fully-dead 53 MB TOAST truncated to 8.5 MB]**
- Cost: the last 7 days of audit payloads. The dev console (`storage-adapter.js:198`)
  reads the newest ≤500 rows — **819 kB** — and derives `method`/`outcome` from
  `detail`/`metadata`; those fields would fall back to defaults. The compliance report
  (`report-service.js:736`) selects scalars only and is unaffected.
- Also removes the remaining **54 plaintext token PINs**.
- Requires: export first (the 2026-08-03 `audit_logs` export already exists, verified PASS).

**Projected: 843 → ~727 MB. Still 45% over quota.**

### Everything else is heap bloat, and only `VACUUM FULL` returns it

| Table | Heap | Bytes/row | Comment |
|---|---|---|---|
| `meter_consumption_aggregates` | 76 MB | 306 | 186 MB of indexes on top |
| `daily_meter_readings` | 163 MB | **357** | ~90–100 B of live scalar data **[EST]** |
| `daily_meter_deltas` | 73 MB | 346 | |

`daily_meter_readings` at 357 bytes/row for seven scalar columns plus a 24-byte header is
roughly 3.5× its live size. **[EST]** The prior plan modelled ~327 MB total recoverable
across the three tables; that model is untested here and I am not adopting its figures.

**Reaching under 500 MB requires `VACUUM FULL` (or `REINDEX`) on at least one large
table. There is no lock-free path to compliance.**

---

## 5. Plan

### Phase A — Off-machine backup *(blocking, ~30 min, no DB load)*

Still outstanding and the largest unmitigated risk. Supabase holds no recovery point.

| Step | Action | Gate |
|---|---|---|
| A1 | Move `Desktop/beverly-backup-2026-07-30-verified.tar.gz` (117.7 MB, verified, 11:1) to cloud storage or external media | File present off-machine |
| A2 | Same for `tmp/backups-p2/*` (snapshots + audit pre-blank exports) | — |
| A3 | **Restore test** into a throwaway Supabase project; compare row counts | Counts match on all 130 tables |

**A3 has never been performed.** A verified export is not a verified restore, and P0 in
every prior plan has been claimed complete without it.

### Phase B — Last lock-free reclaim *(~15 min)*

| Step | Action | Expected |
|---|---|---|
| B1 | Confirm the 2026-08-03 `audit_logs` export is intact (`--verify`) | PASS |
| B2 | `UPDATE audit_logs SET detail='{}', metadata='{}'` — **all rows** | 12,561 updated |
| B3 | `VACUUM public.audit_logs` | TOAST 116 MB → single-digit MB |
| B4 | Measure | **~727 MB [EST]** |

Health check before and after each step. Abort if REST latency exceeds 5 s.

**Decision required before B2:** this destroys the last 7 days of audit payloads. If any
obligation requires reconstructing downloaded report contents, B2 must not run.

### Phase C — Compute decision *(blocking Phase D)*

`VACUUM FULL` on `meter_consumption_aggregates` rewrites 262 MB on a 512 MB-RAM instance
that already fell over today under lighter load.

| Option | Cost | Risk |
|---|---|---|
| **C1 — temporarily upgrade to Micro/Small, vacuum, downgrade** | a few dollars, prorated | **Low.** Removes the OOM risk from the operation that actually reclaims the space |
| C2 — `VACUUM FULL` on nano, smallest table first | free | **High.** Same class of operation that caused the outage |
| C3 — do not vacuum | free | **Breaches quota on 2026-08-20.** HTTP 402 on all requests = vending outage |

**Recommendation: C1.** After today's incident I would not gamble the production database
to avoid a small prorated charge. C3 is not viable — growth alone rules it out.

### Phase D — `VACUUM FULL`, smallest first *(after C)*

| Step | Table | Size | Gate |
|---|---|---|---|
| D1 | `daily_meter_deltas` | 142 MB | Health 200; measure actual reclaim |
| D2 | `daily_meter_readings` | 231 MB | Only if D1 healthy |
| D3 | `meter_consumption_aggregates` | 262 MB | Only if D2 healthy |

Abort rule: if any step leaves the project Unhealthy, stop and restart before continuing.
Measure after each — do not trust the model.

**Target: under 500 MB.**

### Phase E — Stop the regrowth *(the part that makes it durable)*

| Step | Action | Why |
|---|---|---|
| E1 | `alter function refresh_meter_reading_aggregates() set statement_timeout='600s'` | Job 7's wrapper inherits the 120 s default; the inner function already has the override |
| E2 | Watermark-based incremental refresh on both functions | Currently unbounded — a full rebuild on every call |
| E3 | Gate `/api/local/consumption/refresh-aggregates` behind an admin check | No authorization in the handler; called as an automatic fallback |
| E4 | Stop writing audit payloads for `download` / `create` / `remote_command` | 5.9 MB/day; token PINs grew 92 → 260 in three days. **Retention cannot outrun the write path.** |
| E5 | `ALTER TABLE daily_meter_readings DROP COLUMN row_json` | Last reader removed in `b8f65de4`. Reclaims nothing directly, but stops ~840 B/row of new writes |

E4 is the one that matters most long-term: every prior plan treated payload volume as a
cleanup problem when it is a write-path defect.

### Phase F — Correctness *(after the deadline is cleared)*

| Step | Action |
|---|---|
| F1 | Add PRIMARY KEYs to `daily_meter_readings` and `meter_consumption_aggregates` |
| F2 | Rebuild `meters` — proven Cartesian product, 15,756 rows for 1,128 serials |
| F3 | Write the missing dimension persistence (`meters`/`accounts`/`customers` last written 2026-04-14) |
| F4 | Backfill `token_transactions` from upstream — returns 100% of history, uniquely keyed on `receiptId` |
| F5 | RLS: replace `USING (true)` on `customers`, `meters`, `accounts` |
| F6 | Re-evaluate index drops **after ≥7 days of `idx_scan` accumulation** |

---

## 6. Explicitly not doing

| Action | Why |
|---|---|
| Blank `daily_meter_readings.row_json` for space | **Reclaims 0 MB.** Inline heap, not TOAST (§2) |
| Drop any index on current stats | `idx_scan` reset by this morning's restart — the evidence is void |
| `TRUNCATE` + rebuild aggregates | Month/year values are not reproducible: `/api/tariff/read` has no time series and `tariff_rate_history` is a single snapshot |
| Retire `daily_meter_deltas` before E2 | It is the aggregate rebuild's only source |
| Run `recover-token-transactions.cjs --commit` | Upstream returns 100% of the history; the tool reconstructs 97.5% and would import plaintext token PINs into a money table |
| Re-enable job 7 before E2 | It would run an unbounded rebuild |
| Any bulk read over the pooler | 52–129 KB/s; caused today's outage |

---

## 7. Open decisions

1. **Phase B2** — destroying the last 7 days of audit payloads. Compliance question, not technical.
2. **Phase C** — pay for a temporary compute upgrade, or vacuum on nano. **I recommend paying.**
3. **Off-machine backup destination** — no second drive or network share exists on this machine.

---

## 8. Honest assessment

The deadline is reachable but not by lock-free means alone. Phase B is the last free
~116 MB and still leaves the database 45% over. Everything beyond that is heap bloat
behind `VACUUM FULL`, and the instance that must run it is the one that failed under
load today.

The single highest-value action is **Phase A3** — an actual restore test. Every plan in
this project, mine included, has claimed backup coverage without ever proving a restore,
against a platform that states plainly it holds no backups of its own.
