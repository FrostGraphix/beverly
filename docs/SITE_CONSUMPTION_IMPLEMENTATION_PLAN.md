# Beverly EIH — Site Consumption Intelligence v3.0
## Verified Implementation Plan (API-Grounded)

---

## Critical API Facts (Live-Verified)

| Finding | Impact on Design |
|---------|-----------------|
| `DailyDataMeter` stores **1 row per meter per day** | We can derive daily consumption via `Δtotal1` |
| `dateRange` filter **requires `stationId`** — returns 0 without it | All-sites view = 5 parallel station queries |
| `total1` is a **cumulative odometer** (175.38 kWh confirmed) | Period consumption = `total1[end] - total1[start-1]` |
| `usage1` is always `"0"` (string) — **unreliable, do not use** | Use `Δtotal1` for all consumption math |
| Token records (`creditTokenRecord`) = **financial ground truth** | Revenue/recharge comes only from here |
| 248,097 rows ÷ 2,420 accounts = **~102 days** of history now | Grows ~2,420 rows/day as the system scales |

---

## Calculation Engine — Verified Formulas

### Formula 1: Daily Consumption per Meter
```
Given: rows sorted by currentDate ASC for one meter

dailyConsumption[n] = MAX(0, total1[n] - total1[n-1])

Reason for MAX(0,...):
  - Meter replacement resets total1 to 0 → raw delta goes negative
  - Credit reload does NOT affect total1 (total1 is energy, not credit)
  - Negative delta = meter reset event, consumption = 0 for that day
```

### Formula 2: Period Consumption per Meter (Scalable)
```
BOUNDARY FETCH PATTERN — O(2 rows) not O(days × meters):

periodConsumption = total1[period_end] - total1[period_start - 1]

Implementation:
  1. Fetch the row closest to (period_start - 1 day) as baseline
  2. Fetch the row closest to period_end as final
  3. Subtract baseline.total1 from final.total1

For daily view: must fetch all rows (no shortcut)
For weekly/monthly/yearly: USE BOUNDARY FETCH — massive performance win
  - 30-day period: 2 rows per meter instead of 30
  - 1-year period: 2 rows per meter instead of 365
  - 5-year period: 2 rows per meter instead of 1,825
```

### Formula 3: Site Consumption (Any Period)
```
siteConsumption[station][period] =
  Σ periodConsumption[meter]
  for all meters WHERE meter.stationId = station

Revenue cross-check:
  siteRevenue[station][period] =
    Σ totalPaid from creditTokenRecord
    WHERE stationId = station AND createDate IN period

Expected revenue:
  siteExpected[station][period] =
    Σ (periodConsumption[meter] × tariffPrice[meter.tariffId])

Revenue Gap = siteExpected - siteRevenue
```

### Formula 4: Customer Consumption (Daily/Weekly/Monthly/Yearly)
```
For DAILY granularity (customer timeline):
  customerDailyConsumption[date] = MAX(0, total1[date] - total1[date-1])
  → API call: DailyDataMeter, stationId=customer.stationId, filter client-side by customerId

For WEEKLY granularity:
  weekKey = ISO week string (e.g. "2026-W18")
  customerWeeklyConsumption[weekKey] =
    total1[sunday_of_week] - total1[saturday_of_prior_week]
  → Boundary fetch: 2 rows per week

For MONTHLY granularity (most common):
  customerMonthlyConsumption[YYYY-MM] =
    total1[last_day_of_month] - total1[last_day_of_prior_month]
  → Boundary fetch: 2 rows per month

For YEARLY granularity:
  customerYearlyConsumption[YYYY] =
    total1[Dec31] - total1[Dec31 prior year]
  → Boundary fetch: 2 rows per year
```

### Formula 5: Customer Recharge History (Monthly)
```
Source: /api/token/creditTokenRecord/read
Filter: customerId = target customer

Monthly recharge profile:
  month = createDate.substring(0, 7)  // "YYYY-MM"
  
  customerRechargeHistory[month] = {
    count:      COUNT of records in month,
    totalPaid:  Σ totalPaid in month       (₦ spent),
    totalUnits: Σ totalUnit in month       (kWh purchased),
    avgPaid:    totalPaid / count           (avg per recharge),
    tariffs:    SET of tariffId values used (tariff changes visible)
  }

Cross-reference with consumption:
  If customerRechargeHistory[month].totalUnits > 0 AND
     customerMonthlyConsumption[month] > customerRechargeHistory[month].totalUnits + priorMonthRemain1:
     → FLAG: consuming more than purchased (bypass candidate)
```

### Formula 6: Tariff Price Resolution
```
tariffMap = Map from /api/tariff/read:
  "RESIDENTIAL" → { price: 350, tax: 0 }
  "COMMERCIAL"  → { price: 350, tax: 0 }
  "KOLO"        → { price: 450, tax: 7.5 }
  "PRODUCTIVE"  → { price: 350, tax: 0 }
  "PUBLIC"      → { price: 350, tax: 0 }

effectivePrice(tariffId) = price × (1 + tax/100)
  "RESIDENTIAL" → 350 × 1.00 = ₦350/kWh
  "KOLO"        → 450 × 1.075 = ₦483.75/kWh

expectedRevenue(customer, period) =
  periodConsumption[customer] × effectivePrice(customer.tariffId)
```

---

## Granularity Views — Complete Matrix

### Site-Level Views

| View | Time Group | Data Source | API Strategy | Rows Fetched |
|------|-----------|-------------|-------------|-------------|
| Daily | `YYYY-MM-DD` | DailyDataMeter | All rows in period, per station | `days × meters_in_station` |
| Weekly | `YYYY-Www` | DailyDataMeter | Boundary fetch per week | `2 × weeks × meters_in_station` |
| Monthly | `YYYY-MM` | DailyDataMeter | Boundary fetch per month | `2 × months × meters_in_station` |
| Yearly | `YYYY` | DailyDataMeter | Boundary fetch per year | `2 × years × meters_in_station` |
| Revenue Daily | `YYYY-MM-DD` | Token Records | All records in period | Typically < 200/day/station |
| Revenue Monthly | `YYYY-MM` | Token Records | All records in period | All token records for period |

### Customer-Level Views

| View | Time Group | Consumption Source | Recharge Source |
|------|-----------|-------------------|----------------|
| Daily Profile | Day | `Δtotal1` per day | Token records per day |
| Weekly Summary | ISO Week | Boundary fetch | Token records aggregated per week |
| Monthly Summary | Month | Boundary fetch | Token records grouped by month |
| Yearly Summary | Year | Boundary fetch | Token records grouped by year |
| Recharge History | Month | N/A | Token records: count, kWh, ₦, avg |

---

## API Call Strategy Per View

### "All Sites" Dashboard (Zone 1 + Zone 2a)
```
Step 1: Fetch tariffs (1 call, 6 rows, cached for session)
Step 2: Fetch token records for period, ALL stations (1 call, paginated)
  → Groups to: stationId → { totalPaid, totalUnits, rechargeCount }
Step 3: For MONTHLY/YEARLY views — Boundary fetch per station (5 stations × 2 calls = 10 calls)
  → Each returns pageSize=500, filters: stationId + dateRange=[boundaryDay, boundaryDay]
Step 4: Compute siteConsumption, siteRevenue, gap per station
Step 5: Render Zone 1 KPI cards + Zone 2a station bar chart
```

### Station Detail View (Zone 2b — Temporal Line)
```
For DAILY (selected month, one station):
  → 1 API call: DailyDataMeter, stationId=X, dateRange=[month_start, month_end]
  → Returns ~30 × meters_in_station rows (e.g. TUNGA: 30 × 602 = 18,060 rows)
  → Group by date, sum all meter deltas per day → 30 data points

For WEEKLY (selected year, one station):
  → 52 boundary pairs = 104 API calls (optimize: 1 call per month boundary)
  → Better: 12 month-start + 12 month-end = 24 calls → weekly from monthly data

For MONTHLY (selected year, one station):
  → 12 boundary pairs = 24 calls total (fast, each returns 1 row per meter)
  → Or 1 call per month: 12 calls with dateRange=[month_start, month_end]

For YEARLY (last 5 years, one station):
  → 5 year boundaries = 10 calls (pageSize=500, returns 1 row per meter per call)
```

### Customer Detail View (Drawer Panel)
```
Step 1: Fetch customer's DailyDataMeter for selected period
  → stationId=customer.stationId, dateRange=[period], filter client-side by customerId
  → Reuse station cache if already loaded

Step 2: Fetch customer's full token record history
  → /api/token/creditTokenRecord/read, filter client-side by customerId
  → Token records are already in memory from Zone 1 fetch if same period

Step 3: Compute per-day deltas, per-month recharge groups
Step 4: Render dual-axis chart: consumption line + recharge event markers
```

---

## Scalability Plan (Long-Term)

### Data Growth Projection
```
Current:    2,420 meters × 102 days  = 246,840 rows
Year 1:     2,420 meters × 365 days  = 883,300 rows
Year 3:     3,000 meters × 1,095 days = 3,285,000 rows
Year 5:     4,000 meters × 1,825 days = 7,300,000 rows
```

### Boundary Fetch Performance at Scale
```
Even at Year 5 with 4,000 meters:
  Monthly view: 2 boundary calls × 4,000 meters (pageSize=500 = 8 pages each) = 16 API calls
  Each call returns 500 rows (meter's month-end reading)
  Total data transferred: 8,000 rows × ~200 bytes = 1.6MB
  → Still fast (<3s)

Raw daily fetch at Year 5 for 1-year view:
  365 days × 4,000 meters = 1,460,000 rows × 200 bytes = 292MB
  → CATASTROPHIC. This is why boundary fetch is mandatory for weekly/monthly/yearly.
```

### Caching Strategy (In-Component)
```js
const cache = new Map();  // key: "stationId|YYYY-MM|granularity"

function cacheKey(stationId, period, granularity) {
  return `${stationId}|${period}|${granularity}`;
}

// Before any fetch:
if (cache.has(cacheKey(...))) return cache.get(cacheKey(...));

// After computing aggregates:
cache.set(cacheKey(...), result);

// Invalidate on station/date filter change:
cache.clear();
```

---

## Verified Aggregation Functions

```js
// ── consumption-aggregator.mjs ──────────────────────────────────────

/**
 * Derives daily consumption deltas from sorted DailyDataMeter rows.
 * One row per meter per day (API-verified).
 * Uses MAX(0,...) to handle meter resets (total1 going to 0).
 */
export function deriveDailyDeltas(rows) {
  // rows must be for ONE meter, sorted ASC by currentDate
  return rows.map((row, i) => {
    const curr = Number(row.total1) || 0;
    const prev = i === 0 ? curr : (Number(rows[i - 1].total1) || 0);
    return {
      date:         row.currentDate.substring(0, 10),
      delta:        Math.max(0, curr - prev),  // kWh consumed this day
      total1:       curr,
      remain1:      Number(row.remain1) || 0,
      tamper:       !!(row.terminalCoverOpen || row.magneticInterference || row.currentReverse),
      relayOpen:    row.relayOpen,
    };
  });
}

/**
 * Boundary-fetch period consumption.
 * Uses first + last rows only — O(1) per meter regardless of period length.
 * @param {number} baselineTotal1 - total1 from the day BEFORE period starts
 * @param {number} endTotal1      - total1 from the last day of the period
 */
export function boundaryConsumption(baselineTotal1, endTotal1) {
  return Math.max(0, (Number(endTotal1) || 0) - (Number(baselineTotal1) || 0));
}

/**
 * Groups token records by ISO week key "YYYY-Www".
 */
export function toISOWeekKey(dateStr) {
  const d = new Date(dateStr);
  const dayOfWeek = d.getUTCDay() || 7;  // Mon=1, Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Groups token records into recharge history by time unit.
 * @param {Array} records  - creditTokenRecord rows
 * @param {'daily'|'weekly'|'monthly'|'yearly'} granularity
 */
export function groupRechargesByPeriod(records, granularity = 'monthly') {
  const keyFn = {
    daily:   r => r.createDate.substring(0, 10),
    weekly:  r => toISOWeekKey(r.createDate),
    monthly: r => r.createDate.substring(0, 7),
    yearly:  r => r.createDate.substring(0, 4),
  }[granularity];

  return records.reduce((acc, r) => {
    const key = keyFn(r);
    if (!acc[key]) acc[key] = { count: 0, totalPaid: 0, totalUnits: 0, tariffs: new Set() };
    acc[key].count++;
    acc[key].totalPaid  += Number(r.totalPaid)  || 0;
    acc[key].totalUnits += Number(r.totalUnit)   || 0;
    acc[key].tariffs.add(r.tariffId);
    return acc;
  }, {});
}

/**
 * Groups token records by station + period for site revenue view.
 */
export function groupRevenueByStation(records, granularity = 'monthly') {
  const keyFn = {
    daily:   r => r.createDate.substring(0, 10),
    weekly:  r => toISOWeekKey(r.createDate),
    monthly: r => r.createDate.substring(0, 7),
    yearly:  r => r.createDate.substring(0, 4),
  }[granularity];

  // Returns: { "TUNGA|2026-04": { count, totalPaid, totalUnits }, ... }
  return records.reduce((acc, r) => {
    const k = `${r.stationId}|${keyFn(r)}`;
    if (!acc[k]) acc[k] = { station: r.stationId, period: keyFn(r), count: 0, totalPaid: 0, totalUnits: 0 };
    acc[k].count++;
    acc[k].totalPaid  += Number(r.totalPaid)  || 0;
    acc[k].totalUnits += Number(r.totalUnit)   || 0;
    return acc;
  }, {});
}

/**
 * Resolves effective tariff price (base + tax).
 * Live-verified tariffs: RESIDENTIAL=₦350, KOLO=₦483.75
 */
export function resolveEffectivePrice(tariffId, tariffList) {
  const t = tariffList.find(t => String(t.tariffId).toUpperCase() === String(tariffId).toUpperCase());
  if (!t) return 350;  // default fallback: residential rate
  const base = Number(t.price) || 0;
  const tax  = Number(t.tax)   || 0;
  return base * (1 + tax / 100);
}

/**
 * Revenue gap: how much was owed vs how much was paid.
 * Positive = customer owes (under-paid), Negative = over-paid (credit).
 */
export function revenueGap(consumedKwh, effectivePrice, actualPaid) {
  const expected = (Number(consumedKwh) || 0) * effectivePrice;
  const actual   = Number(actualPaid) || 0;
  return parseFloat((expected - actual).toFixed(2));
}
```

---

## Page Layout — Final Specification

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: "Site Consumption Intelligence"                         │
│  [Site: All ▾] [Granularity: Monthly ▾] [Apr 2026 ▾] [Export]  │
├─────────┬───────────────────────────────────────────────────────┤
│  SITE   │  KPI CARDS (6 cards, 2 cols × 3 rows)                │
│  PILL   │  ┌──────────────┐ ┌──────────────┐                   │
│  NAV    │  │ Total kWh    │ │ Revenue (₦)  │                   │
│         │  │ (consumption)│ │ (recharges)  │                   │
│  ALL    │  └──────────────┘ └──────────────┘                   │
│  MUSHA  │  ┌──────────────┐ ┌──────────────┐                   │
│  KYAK.  │  │ Revenue Gap  │ │ High-Risk #  │                   │
│  TUNGA  │  │ (Expected-   │ │ (score ≥ 70) │                   │
│  OGUFA  │  │  Actual)     │ │              │                   │
│  UMAI.  │  └──────────────┘ └──────────────┘                   │
│         │  ┌──────────────┐ ┌──────────────┐                   │
│         │  │ Avg Daily kWh│ │ Recharge Freq│                   │
│         │  │ per account  │ │ per account  │                   │
│         │  └──────────────┘ └──────────────┘                   │
│         ├─────────────────────────────────────────────────────┤
│         │  ZONE 2: CHARTS (tabs: Consumption | Revenue | Both)  │
│         │  ┌──────────────────────┐  ┌────────────────────┐   │
│         │  │ Station Bar Chart    │  │ Temporal Line Chart │   │
│         │  │ (all 5 sites,        │  │ (selected period,   │   │
│         │  │  side-by-side bars:  │  │  Daily/Wk/Mo/Yr    │   │
│         │  │  kWh + Revenue)      │  │  toggle)            │   │
│         │  └──────────────────────┘  └────────────────────┘   │
│         ├─────────────────────────────────────────────────────┤
│         │  ZONE 3: CUSTOMER TABLE (sorted by Risk Score DESC)   │
│         │  Customer | Station | Consumed | Paid | Gap | Risk   │
│         │  [Click row → opens Customer Drawer]                  │
└─────────┴─────────────────────────────────────────────────────┘

CUSTOMER DRAWER (right slide-in):
┌─────────────────────────────────────┐
│  AMINU SALE — TUNGA — RESIDENTIAL   │
│  Meter: 47005368189                 │
├─────────────────────────────────────┤
│  TABS: Daily | Weekly | Monthly     │
│  ┌───────────────────────────────┐  │
│  │ Dual-axis Line Chart:         │  │
│  │  Teal: daily Δtotal1 (kWh)   │  │
│  │  Amber dashes: recharge events│  │
│  └───────────────────────────────┘  │
│  RECHARGE HISTORY TABLE:            │
│  Month | # | kWh | ₦ | Avg/Charge  │
│  2026-04 | 3 | 45.2 | 15,750 | 5,250│
│  2026-03 | 2 | 28.4 | 9,940 | 4,970 │
├─────────────────────────────────────┤
│  [Remote Relay Control] [Export PDF]│
└─────────────────────────────────────┘
```

---

## File Manifest (Final)

| File | Lines Est. | Purpose |
|------|-----------|---------|
| `src/components/SiteConsumptionPage.vue` | 400 | Root orchestrator, filter state, zone layout |
| `src/components/consumption/SiteSidebar.vue` | 80 | Station pill switcher |
| `src/components/consumption/KpiCardGrid.vue` | 120 | 6 KPI stat cards with delta indicators |
| `src/components/consumption/StationBarChart.vue` | 100 | ECharts grouped horizontal bar |
| `src/components/consumption/TemporalLineChart.vue` | 120 | ECharts temporal trend, granularity tabs |
| `src/components/consumption/SuspectLedger.vue` | 200 | Ranked risk table with pagination |
| `src/components/consumption/CustomerDrawer.vue` | 250 | Slide-in panel: charts + recharge table |
| `src/services/consumption-service.mjs` | 180 | Orchestrates all parallel + sequential fetches |
| `src/services/consumption-aggregator.mjs` | 150 | Pure functions: deltas, grouping, gap math |
| `src/services/fraud-engine.mjs` | 120 | Risk score with station normalization |

---

## Route Manifest Entry

```js
// In src/data/route-manifest.js:
{
  group: "Data Report",
  title: "Site Consumption",
  hash: "#/prepay-report/site-consumption",
  apis: [
    "/api/token/creditTokenRecord/read",
    "/api/DailyDataMeter/read",
    "/api/account/read",
    "/api/tariff/read"
  ],
  columns: [],           // custom page — not rendered by TablePage.vue
  isCustomPage: true,    // App.vue uses this flag to load SiteConsumptionPage instead
  actions: ["Export"],
  roles: ["super-admin", "operations-manager", "account"]
}
```

---

## Constraints That Are Non-Negotiable

| Rule | Code Enforcement |
|------|-----------------|
| `DailyDataMeter` MUST include `stationId` for date-range queries | Throw in `consumption-service.mjs` if stationId is null |
| NEVER use `usage1` — always `Δtotal1` | No reference to `usage1` anywhere in aggregator |
| Default period = current calendar month | `filters.from` and `filters.to` initialized on mount |
| Boundary fetch for weekly/monthly/yearly | `fetchMode: 'boundary'` vs `fetchMode: 'full'` param |
| `Math.max(0, delta)` on every delta | Enforced inside `deriveDailyDeltas()` — callers never raw-subtract |
| Float precision: all money rounded to 2dp, kWh to 3dp | `parseFloat(x.toFixed(2))` at aggregation boundary |
