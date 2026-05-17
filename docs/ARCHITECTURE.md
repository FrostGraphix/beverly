# Beverly CRM — Architecture Reference

> Last Updated: 2026-05-04 | Reflects shipped EIH implementation

> Canonical source: root `ARCHITECTURE.md`.
> This file is legacy reference only.
> Release is blocked until remote CI, public preview smoke, and deployed Supabase smoke pass.

---

## System Overview

Beverly CRM is a Vue 3 single-page application backed by a Node.js reverse proxy (`api/reference.js`). It connects to a third-party energy management backend via authenticated HTTP. The frontend is entirely client-rendered — no SSR.

```
Browser (Vue SPA)
    │
    ▼
api/reference.js  ←── liveBearerToken (env var, highest priority)
    │                  └── falls back to client JWT cookie
    ▼
Third-party Energy Backend
    ├── /api/account/read
    ├── /api/DailyDataMeter/read       ← requires stationId + lang:"en"
    ├── /api/token/creditTokenRecord/read
    ├── /api/tariff/read
    └── … (see route-manifest.js for full list)
```

---

## Directory Structure

```
acob-crm-4/
├── api/
│   └── reference.js              # Express proxy — ALL backend calls route through here
│
├── src/
│   ├── App.vue                   # Root shell: sidebar, routing, auth state
│   ├── main.js                   # Vue mount point
│   │
│   ├── components/
│   │   ├── ActionModal.vue       # Add / Edit / Delete / Generate Token modals
│   │   ├── DashboardPage.vue     # Dashboard — stat cards + line chart
│   │   ├── EChartPanel.vue       # ECharts wrapper primitive
│   │   ├── LoginPage.vue         # Login form + cookie auth
│   │   ├── PickerModal.vue       # Server-paginated entity picker (Customer/Meter/Tariff)
│   │   ├── SiteConsumptionPage.vue  # ← EIH root orchestrator
│   │   ├── SuccessModal.vue      # Post-action success display
│   │   ├── TablePage.vue         # Generic table renderer (used by all non-custom routes)
│   │   ├── TaskOutputModal.vue   # Remote task result viewer
│   │   ├── ToastNotification.vue # Global toast system
│   │   │
│   │   └── consumption/          # Energy Intelligence Hub sub-components
│   │       ├── SiteSidebar.vue       # Station pill filter (All / TUNGA / UMAISHA / …)
│   │       ├── KpiCardGrid.vue       # 6 KPI stat cards with shimmer loading
│   │       ├── StationBarChart.vue   # Grouped bar: kWh + Revenue per station
│   │       ├── TemporalLineChart.vue # Line chart: Day/Week/Month/Year granularity
│   │       ├── SuspectLedger.vue     # Risk-ranked customer table with pagination
│   │       └── CustomerDrawer.vue    # Slide-in: daily chart, recharge history, monthly
│   │
│   ├── data/
│   │   └── route-manifest.js     # Single source of truth for ALL routes and their APIs
│   │
│   ├── services/
│   │   ├── action-service.mjs        # CRUD write operations (Add/Edit/Delete)
│   │   ├── api.js                    # Auth, cookie helpers, currentUserInfo
│   │   ├── consumption-aggregator.mjs  # ← Pure math: deltas, grouping, tariff, gap
│   │   ├── consumption-service.mjs     # ← 3-wave fetch orchestration + AbortController
│   │   ├── dashboard-chart-options.mjs # ECharts option builders for dashboard
│   │   ├── dashboard-service.mjs      # Dashboard API calls
│   │   ├── fraud-engine.mjs           # ← 4-signal risk scoring, suspect ledger builder
│   │   ├── import-export.mjs          # CSV/Excel export helpers
│   │   ├── live-report-adapters.mjs   # Data transforms for report pages
│   │   ├── local-jobs.mjs             # Background polling helpers
│   │   ├── management-forms.mjs       # Form field configs for Add/Edit/Delete modals
│   │   ├── receipt-tools.mjs          # PDF receipt generation
│   │   ├── record-mappers.mjs         # Token record field transformers
│   │   ├── remote-task-flow.mjs       # Remote meter task submission + polling
│   │   ├── response-normalizers.mjs   # Raw API response → { rows, total, envelope }
│   │   ├── table-helpers.mjs          # Sorting, filtering, column rendering
│   │   ├── table-service.js           # All table data fetching + pagination
│   │   ├── toast.js                   # Toast event emitter
│   │   ├── token-flow.mjs             # Credit/tamper/clear token generation
│   │   ├── upload-policy.mjs          # File upload validation
│   │   ├── write-helpers.mjs          # Shared CRUD submit helpers
│   │   │
│   │   └── mappers/
│   │       └── table-mapper.mjs       # Row-level field normalization per route
│   │
│   └── styles/
│       ├── index.css                  # Global CSS + design tokens
│       └── reference.css              # Beverly glassmorphic design system
│
├── docs/
│   ├── ARCHITECTURE.md              ← this file
│   ├── DESIGN_SYSTEM.md             # Color tokens, typography, shadow scale
│   ├── PROGRESS_LOG.md              # Chronological fix log
│   ├── REMAINING_WORK.md            # Outstanding issues + bug register
│   ├── SITE_CONSUMPTION_IMPLEMENTATION_PLAN.md  # EIH v3.0 verified spec
│   └── TASKS.md                     # Implementation task checklist
│
└── tests/
    ├── live-proxy.test.cjs           # Live API integration tests
    └── consumption-aggregator.test.mjs  # Pure math unit tests
```

---

## Routing Architecture

### How Pages Are Selected (`App.vue`)

```
hash → findRoute(hash, roleId) → route object

  if route.hash === '#/dashboard'                      -> <DashboardPage>
  if route.hash === '#/prepay-report/daily-data-meter' -> <DailyDataMeterPage>
  if route.isCustomPage === true                       -> <SiteConsumptionPage>
  else                                                 -> <TablePage :route="route">
```

### Route Manifest (`src/data/route-manifest.js`)

Every page is declared here. Fields:

| Field | Type | Purpose |
|-------|------|---------|
| `group` | string | Sidebar group name |
| `title` | string | Page title / breadcrumb |
| `hash` | string | URL hash (`#/...`) |
| `apis` | string[] | Endpoints this page fetches |
| `columns` | string[] | Table column field names |
| `actions` | string[] | Toolbar buttons to render |
| `roles` | string[] | Which roles can access this route |
| `isCustomPage` | boolean | If true, renders custom component instead of TablePage |

### Role Normalization

All incoming roleId strings are normalized in `normalizeRoleId()`:
- `"admin"`, `"1"`, `"super-admin"` → `"super-admin"`
- `"operator"`, `"operations"` → `"operations-manager"`
- `"account"`, `"finance"` → `"account"`

---

## Authentication & Proxy

**File:** `api/reference.js`

**Token Priority (highest → lowest):**
1. `process.env.LIVE_BEARER_TOKEN` (server env var) ← always wins
2. `req.cookies.token` (client JWT from login)

This ensures admin operations never fail with 403 even if the client JWT expires.

**Rule:** All API paths must be **lowercase** `/api/...` — the proxy does not retry with alternate casing. Exception: `RemoteMeterTask` endpoints use PascalCase (`/api/RemoteMeterTask/GetReadingTask`) because the backend requires it.

---

## Data Pipeline: TablePage (Generic)

```
TablePage.vue
  → table-service.js::fetchTableData(route)
      → POST /api/{endpoint} with { pageNumber, pageSize, stationId, dateRange }
      → response-normalizers.mjs::normalizeCollection() → { rows, total, envelope }
      → table-mapper.mjs::mapTableCollection() → normalizes field names per route
  → table-helpers.mjs → sorts, filters, formats for render
  → TablePage renders columns from route.columns[]
```

### Table Mapper Rules (`src/services/mappers/table-mapper.mjs`)

Applied in this order:
1. **Route-specific** field aliases (e.g. `gatewayId → id` for Gateway page)
2. **Global** normalization at the bottom — catches any remaining numeric `meterType` / `communicationWay` codes

| Code | `meterType` | `communicationWay` |
|------|------------|-------------------|
| 0 | "Electricity" | "GPRS" |
| 1 | "Water" | "LoraWan" |
| 2 | "Gas" | — |

---

## Energy Intelligence Hub (EIH) Pipeline

### Data Sources

| Source | Endpoint | Ground Truth For |
|--------|----------|-----------------|
| Token Records | `/api/token/creditTokenRecord/read` | Revenue, recharge history, financial KPIs |
| Daily Meter | `/api/DailyDataMeter/read` | Energy consumption deltas, tamper flags |
| Accounts | `/api/account/read` | Customer→Meter→Tariff linkage |
| Tariffs | `/api/tariff/read` | Effective price per kWh |

### Critical API Rules

1. **`DailyDataMeter` requires `stationId`** — without it, `dateRange` queries return 0 rows
2. **`total1` is a cumulative odometer** — daily consumption = `MAX(0, total1[n] - total1[n-1])`
3. **`usage1` is always "0"** — never use it for consumption math
4. **Meter resets** produce negative deltas → clamped to 0 via `Math.max(0, delta)`

### 3-Wave Progressive Load

```
Wave 1 (fast, ~2s):
  Parallel: fetchTokenRecords(from, to) + fetchTariffMap()
  → KPI cards render immediately

Wave 2 (immediate after wave 1):
  Computed from token records only (no extra API calls)
  → Station bar chart + temporal line chart render

Wave 3 (slow, ~5-15s depending on period):
  For each station: fetchAccounts() + fetchDailyMeterData()
  → buildMeterDeltaMap() → buildSuspectLedger()
  → Suspect ledger renders with progress skeleton
  → KPI cards update with highRiskCount + revenueGap
```

### Fraud Engine Signals

| Signal | Max Pts | Logic |
|--------|---------|-------|
| Divergence | 40 | kWh consumed after last recharge, normalized by station avg |
| Tamper | 30 | Days with tamper event flags × 5 |
| Flatline | 20 | Days: delta=0, relay closed, previous day had tamper × 4 |
| Gap | 10 | `(expectedPaid - actualPaid) / expectedPaid × 10` |

Risk tiers: LOW (0-30) · MEDIUM (31-60) · HIGH (61-80) · CRITICAL (81-100)

### Boundary Fetch Pattern (Scalability)

For weekly/monthly/yearly views, fetching all rows in the period is catastrophic at scale:

| Period | Naive fetch | Boundary fetch |
|--------|------------|----------------|
| 1 month | 30 × meters rows | 2 rows per meter |
| 1 year | 365 × meters rows | 2 rows per meter |
| 5 years | 1,825 × meters rows | 2 rows per meter |

Implementation: fetch `total1` for day BEFORE period start (baseline) and last day of period. `consumption = MAX(0, end.total1 - baseline.total1)`.

---

## Management Forms System

**File:** `src/services/management-forms.mjs`

Drives the Add/Edit/Delete modals in `ActionModal.vue`.

```
managementFields(route, action)  → field config array
managementFormSeed(route, action, row)  → pre-populated form values

Field types: "text" | "select" (station dropdown) | picker (PickerModal)
```

Entities with Add+Edit+Delete: Gateway, Customer, Tariff, Account, User, Role, Station, Item
Entities with Edit only: Meter (stationId correction)
Entities read-only: Log, Debt, Protocol, Remote Support

---

## Known Constraints

| Constraint | Detail |
|-----------|--------|
| `POST /api/account/create` | Returns 502 — backend endpoint not accepting creates |
| `DLT645` endpoint | Returns empty dataset — backend config issue, not frontend |
| Debt module | Returns 200 with 0 records — no debt in database |
| ECharts | Loaded through `src/services/echarts-loader.mjs` before chart init |
| Vue version | Vue 3 (Options API migration-safe) |

---

## Tariffs (Live-Verified 2026-05-02)

| tariffId | Base Price | Tax | Effective Price |
|----------|-----------|-----|----------------|
| RESIDENTIAL | ₦350/kWh | 0% | ₦350.00 |
| COMMERCIAL | ₦350/kWh | 0% | ₦350.00 |
| KOLO | ₦450/kWh | 7.5% | ₦483.75 |
| PRODUCTIVE | ₦350/kWh | 0% | ₦350.00 |
| PUBLIC | ₦350/kWh | 0% | ₦350.00 |

---

## Live Stations (Verified)

| Station ID | Approx Accounts | Notes |
|-----------|----------------|-------|
| TUNGA | ~602 | Largest, 58,270 daily records in Apr-May |
| UMAISHA | ~677 | Largest account count |
| OGUFA | ~400 | Mid-range |
| KYAKALE | ~400 | Mid-range |
| MUSHA | ~289 | Smallest |
| 0001 | ~5 | Test station — minimal data |
