# Durable Objects Prototype — Specification

**Date:** 2026-07-30
**Status:** Specification. Not built.
**Purpose:** Decide, on measured evidence, whether the Beverly telemetry tier should move to Cloudflare Durable Objects.

---

## 1. Why this prototype exists

The storage crisis has one structural cause: **Postgres is holding an aggregate table that is rebuilt rather than maintained.** `meter_consumption_aggregates` is 298 MB — 76 MB of data under 211 MB of indexes — and a single page view rewrote all 552,391 rows in five minutes.

The DO-native design does not have that table. Each station's readings live in a SQLite database colocated with the compute that queries it, so "consumption for meter X in March" is a local `SUM` over a few hundred indexed rows. There is nothing to pre-aggregate and therefore nothing to rebuild.

If that holds, it delivers what Supabase's free tier cannot: **multi-year hot retention**.

**This prototype exists to test one thing that could invalidate it** — cross-station fan-out. Everything else about the design is arithmetic; this is the part that needs measuring.

---

## 2. The decision this must produce

> Can a station-sharded SQLite tier serve Beverly's actual Consumption queries — including the all-stations dashboard — fast enough to replace the Postgres aggregate tables?

**Go** → proceed to full backfill and cutover (weeks 3–5).
**No-go** → keep telemetry in a second Supabase project with a 60-day hot window, and accept that multi-year hot retention needs a paid tier.

---

## 3. Measured inputs

All figures live-measured 2026-07-29/30. Nothing estimated unless marked [MODEL].

| Fact | Value |
|---|---|
| Reporting meters | 2,512 |
| Stations | 5 live (`TUNGA`, `UMAISHA`, `OGUFA`, `KYAKALE`, `MUSHA`) |
| Meters per station | TUNGA 610, UMAISHA 726, OGUFA 539, KYAKALE 319, MUSHA 317 |
| Total readings | 465,993 |
| Readings/day | ~2,507 (one per reporting meter) |
| History span | 2025-07-12 → present (~13 months) |
| Current Postgres cost | 420 bytes/row |
| Fields available per reading | **34** (7 currently persisted) |

### Cloudflare free-tier limits (verified from cloudflare.com/plans)

| Component | Free |
|---|---|
| DO SQL stored data | **5 GB** |
| DO SQL rows written | **100,000/day** |
| DO SQL rows read | 50M/day |
| DO requests | 100,000/day |
| DO duration | 13,000 GB-s/day |

### Budget check

**Writes** — DO-native, with no pre-aggregation:

| Source | Today (2,512 meters) | @ 20,000 meters |
|---|---|---|
| Reading rows | 2,512 | 20,000 |
| `meter_state` | 0 (indexed query) | 0 |
| Aggregates | 0 (computed on read) | 0 |
| Event transitions | ~40 [MODEL] | ~300 [MODEL] |
| **Total vs 100k cap** | **~2,552 (2.5%)** | **~20,300 (20%)** |

**Storage** — all 34 fields, ~80 bytes/row in SQLite [MODEL: Postgres measures 110 B for the same columns; SQLite omits the 24-byte tuple header and packs integers variably]:

| Retention @ 20,000 meters | Size | Of 5 GB |
|---|---|---|
| 1 year | 584 MB | 12% |
| 3 years | 1.75 GB | 35% |
| 5 years | 2.9 GB | 58% |

**Backfill** — 465,993 rows at a self-imposed 60% write rate ≈ **8 days**. One-time.

---

## 4. Architecture

### 4.1 Sharding

One Durable Object per station, addressed by station code:

```
env.STATIONS.idFromName("TUNGA")   → SQLite holding TUNGA's readings only
env.STATIONS.idFromName("UMAISHA") → …
```

Objects are created on first access — no provisioning. **This is why the station registry work (completed 2026-07-30) was a prerequisite:** the Worker resolves the estate from `list_consumption_station_ids()`, so onboarding a station creates its DO with no redeploy.

### 4.2 SQLite schema — all 34 OEM fields

```sql
CREATE TABLE readings (
  meter_key    INTEGER NOT NULL,   -- surrogate; text serial lives in meters_dim
  reading_date INTEGER NOT NULL,   -- days since epoch
  total_wh     INTEGER NOT NULL,   -- watt-hours; avoids float drift
  remain_wh    INTEGER,
  total2_wh    INTEGER,
  remain2_wh   INTEGER,
  flags        INTEGER NOT NULL DEFAULT 0,   -- bit-packed, see 4.3
  voltage_a    INTEGER, voltage_b INTEGER, voltage_c INTEGER,  -- ×10
  current_a    INTEGER, current_b INTEGER, current_c INTEGER,  -- ×10
  power_w      INTEGER,
  demand_w     INTEGER,
  gateway_key  INTEGER,
  upstream_at  INTEGER,            -- epoch seconds
  PRIMARY KEY (meter_key, reading_date)
) WITHOUT ROWID;

CREATE INDEX readings_date ON readings(reading_date);
CREATE INDEX readings_flags ON readings(flags) WHERE flags != 0;

CREATE TABLE meters_dim (
  meter_key INTEGER PRIMARY KEY,
  meter_sn  TEXT NOT NULL UNIQUE,
  customer_ref TEXT,
  gateway_id TEXT
);

CREATE TABLE events (           -- transitions only, never per-reading
  meter_key INTEGER NOT NULL,
  flag_bit  INTEGER NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  PRIMARY KEY (meter_key, flag_bit, opened_at)
);

CREATE TABLE watermark (k TEXT PRIMARY KEY, v INTEGER);
```

`WITHOUT ROWID` on `readings` matters: the composite PK becomes the storage layout, eliminating a duplicate index. That is roughly a 30% saving on the largest table.

### 4.3 Flag bits

**Polarity is inverted — `true` means healthy.** Every derivation must go through `conditionActive()`; a raw truth test produces exactly-wrong alarms. This is the single highest-risk detail in the whole build.

| Bit | Field | Signal |
|---|---|---|
| 0 | `magneticInterference` | Magnet tamper |
| 1 | `terminalCoverOpen` | Terminal tamper |
| 2 | `coverOpen` | Cover tamper |
| 3 | `currentReverse` | Reverse current — theft |
| 4 | `currentUnbalance` | Phase imbalance — bypass |
| 5 | `batteryLow` | Battery failure |
| 6 | `relayOpen` | Disconnected |
| 7 | `source2Activated` | Secondary source |
| 8–11 | `status` | Meter status word |

### 4.4 Worker routing

```
GET /consumption?station=TUNGA&from&to   → one DO, local SQL
GET /consumption?station=ALL&from&to     → fan-out to N DOs, merge
GET /meter/:sn/state                     → one DO, indexed lookup
POST /ingest (cron)                      → per-station, batched
```

The all-stations path is the unknown.

---

## 5. What to build

**Scope: one Worker, one DO class, one station's real data.** Nothing else.

| # | Task |
|---|---|
| 1 | Worker + `StationDO` class, SQLite backend, schema migration on first touch |
| 2 | Backfill script: TUNGA's ~610 meters × 13 months (~180,000 rows) from Postgres |
| 3 | Port the three real query shapes (§6) |
| 4 | Extend backfill to all 5 stations for the fan-out test |
| 5 | Measure (§6), write results into this file |

**Explicitly out of scope:** auth, RLS, portal integration, ingest cron, event derivation, R2 archive, production traffic. Those follow a go decision.

---

## 6. What to measure

Queries taken from the real read paths in `backend/src/services/consumption-store.js` and `src/services/consumption-service.mjs`.

| # | Query | Target |
|---|---|---|
| Q1 | One station, 30 days, daily deltas per meter | < 100 ms |
| Q2 | One station, 13 months, monthly totals | < 200 ms |
| Q3 | **All 5 stations, 30 days, station comparison** | **< 500 ms** |
| Q4 | Single meter, full history | < 50 ms |
| Q5 | Latest reading for every meter in a station (`meter_state`) | < 100 ms |
| Q6 | Meters with an active tamper flag, 7 days | < 100 ms |

Also record: bytes stored per 1,000 rows (validates the 80 B/row model); rows written during backfill vs the 100k/day cap; cold-start latency on an idle DO.

**Q3 is the decision.** If all-stations fan-out is comfortably under 500 ms at 5 stations, extrapolate to 100 and decide whether a rollup DO is needed.

---

## 7. Go / no-go criteria

**Go — all must hold:**
- Q1–Q6 meet targets
- Storage ≤ 100 bytes/row measured
- Backfill completes without exceeding the write cap
- Q3 at 5 stations projects acceptably to 100 [MODEL], or a rollup DO closes the gap

**No-go — any one:**
- Q3 > 1 s at 5 stations (fan-out does not scale)
- Storage > 150 bytes/row (multi-year no longer fits 5 GB)
- Steady-state writes > 50,000/day at 20,000 meters (no headroom)
- Cold-start latency materially hurts the user experience

---

## 8. Prerequisites

| Prerequisite | Status |
|---|---|
| Station registry (estate discovered, not hardcoded) | ✅ Complete 2026-07-30 |
| Verified backup | 🔄 In progress — Gate B |
| Token recovery committed | ⛔ Blocked on Gate B |
| **Incremental refresh shipped** | ⛔ **Hard blocker** |
| 34-field capture in Postgres | ⛔ Should precede backfill |

**On the hard blocker:** while full rebuilds still exist, any accidental trigger writes 552,371 rows — **5.5× the entire daily free write budget**. The prototype can be built before this, but no backfill or production traffic may run until rebuilds are gone.

**On field capture:** backfilling before the 34 fields are persisted means backfilling twice. Do §5 task 1 in parallel with field capture; do task 2 after.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Fan-out doesn't scale past ~20 stations | Rollup DO with pre-computed cross-station totals; measure in this prototype |
| Free write cap breached by an unforeseen path | Ship incremental refresh first; alert at 50k/day |
| Flag polarity inverted in derivation | Route everything through `conditionActive()`; assert against known-tampered meters |
| Backfill exceeds cap and stalls | Throttle to 60k/day; it is resumable via watermark |
| No RLS in DO | Worker enforces authorization; DO is never publicly addressable |
| Cloudflare free-tier terms change | Postgres remains system of record for money; telemetry is reconstructible from R2 |
| Split-brain during cutover | Dual-write for two weeks; compare daily; Postgres stays authoritative until parity |

---

## 10. What this replaces

A go decision removes two planned phases:

- **Two-Supabase-project split** — unnecessary; the DO tier *is* the telemetry project
- **Monthly partitioning** — unnecessary; each station DO is already a shard, retention is per-object

And it removes `meter_consumption_aggregates` (298 MB) and `daily_meter_deltas` (142 MB) from Postgres permanently — the two tables at the centre of the current crisis.

---

## 11. Timeline

| Week | Work |
|---|---|
| 1 | Clear the deadline: backup → recovery → indexes → incremental refresh → truncate |
| 2 | 34-field capture + R2 raw archive |
| 3 | Prototype tasks 1–3 (single station) |
| 4 | Prototype tasks 4–5 (fan-out) → **go/no-go** |
| 5 | If go: full backfill + dual-write cutover |

---

## 12. Results

*To be completed by the prototype. Do not fill speculatively.*

| Metric | Target | Measured | Verdict |
|---|---|---|---|
| Q1 | < 100 ms | — | — |
| Q2 | < 200 ms | — | — |
| **Q3** | **< 500 ms** | — | — |
| Q4 | < 50 ms | — | — |
| Q5 | < 100 ms | — | — |
| Q6 | < 100 ms | — | — |
| Bytes/row | ≤ 100 | — | — |
| Backfill writes/day | < 60,000 | — | — |
| Cold start | < 200 ms | — | — |

**Decision:** _pending_
