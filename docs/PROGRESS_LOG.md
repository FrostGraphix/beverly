# Beverly CRM — Progress Log & Engineering Journal

> **Last Updated:** 2026-05-02  
> **Scope:** Administration, Management, Data Reports, Protocol, Remote Support  
> **Backend:** `8.208.16.168:9310` (live), proxied via `api/reference.js` → `localhost:9310`  
> **Frontend:** Vue 2 SPA at `localhost:9311` (Vite dev server)

---

## 2026-05-04 â€” EIH Contract Hardening

- Restored `src/components/SiteConsumptionPage.vue` and cleared the build break.
- Kept `DailyDataMeterPage.vue` isolated from the generic custom-page branch.
- Locked the nested chart payload contract with `tests/site-consumption.test.mjs`.
- Added `tests/site-consumption-ui-contract.test.cjs` to guard the page/service seam.
- Rewrote stale task and remaining-work docs to reflect the real state.

## 2026-05-04 - Route Seam Closure

- Moved Consumption Statistics back onto `/api/DailyDataMeter/readHourly`.
- Locked Remote Support sample health inside `tests/live-route-smoke.test.cjs`.
- Added fixture-backed browser QA for `#/prepay-report/site-consumption`.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Bugs Fixed — Chronological](#bugs-fixed--chronological)
3. [Root Causes & Patterns](#root-causes--patterns)
4. [Mistakes Made & Lessons Learned](#mistakes-made--lessons-learned)
5. [Things to Avoid](#things-to-avoid)
6. [API Field Reference](#api-field-reference)
7. [File Change Index](#file-change-index)
8. [Known Remaining Issues](#known-remaining-issues)

---

## Architecture Overview

### Request Flow

```
Browser (9311)
  → Vite Dev Proxy ("/api" → localhost:9310)
    → reference.js (api/reference.js)
      → candidatePaths() — tries /api/ and /API/ variants
        → Live Backend (8.208.16.168:9310)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/data/route-manifest.js` | Column definitions, API paths, page groups |
| `src/services/table-service.js` | `tableDataPath()`, `tableRequest()`, pagination logic |
| `src/services/mappers/table-mapper.mjs` | Row field normalization (meterType, status, ids) |
| `src/services/table-helpers.mjs` | `columnKey()` map (UI label → API field) |
| `src/services/management-forms.mjs` | Form field defs, `managementFormSeed()` for prefill |
| `src/services/action-service.mjs` | CRUD write endpoint routing |
| `src/services/remote-task-flow.mjs` | Remote meter task endpoints and payloads |
| `src/components/ActionModal.vue` | Add/Edit/Delete modal logic, station loading |
| `src/components/PickerModal.vue` | Customer/Meter/Tariff picker modal |
| `src/components/TablePage.vue` | Main table renderer with pagination |
| `api/reference.js` | Proxy: auth, retry, casing fallback, write guards |

### Data Flow for a Table Page

```
1. route-manifest.js → defines columns + apis array
2. table-service.js  → tableDataPath(route) resolves the read endpoint
3. table-service.js  → tableRequest(route, options) builds POST payload
4. table-service.js  → fetchAllTableRows() pages through results (500/page, up to 20k)
5. table-mapper.mjs  → mapRowShape() normalizes field names/values
6. table-helpers.mjs → columnKey() maps UI column headers to API field names
7. TablePage.vue     → renders paginated rows (10/page default, configurable)
```

---

## Bugs Fixed — Chronological

### Phase 1: Account Page — Customer, Meter, Tariff Modals

**Problem:** Customer/Meter/Tariff picker modals in the Account page under Management were not populating data.

**Root Cause:** The picker modals were not making API calls or were referencing wrong fields.

**Fix:**
- Connected Customer picker to `/api/customer/read`
- Connected Meter picker to `/api/meter/read`
- Connected Tariff picker to `/api/tariff/read`
- Configured `pickerColumns`, `pickerValueKey`, and `pickerColumnLabels` in `management-forms.mjs`

---

### Phase 2: Meter Type Not Displaying

**Problem:** The "Type" column in the Meter picker modal within Account page showed blank cells.

**Root Cause (Mistake #1):** The meter API returns `type: 0` (numeric field named `type`), but the picker column was `meterType`. The PickerModal's `cellValue()` looked for `row["meterType"]` which didn't exist. The case-insensitive fallback checked `row["metertype"]` — also non-existent.

**Fix:**
- `PickerModal.vue` — added explicit fallback: when `col === 'meterType'`, also check `row['type']`
- Added normalization: `0 → "Electricity"`, `1 → "Water"`, `2 → "Gas"`

**Lesson:** Always check what field name the API actually returns. Don't assume the UI column name matches the API field name.

---

### Phase 3: meterType Column Empty on Account/Token Tables

**Problem:** The `meterType` column showed blank on Account, Token Generate, and Token Record pages.

**Root Cause (Mistake #2):** The numeric-to-label normalization (`0 → Electricity`) was only applied inside route-specific `if` blocks in `table-mapper.mjs` — specifically for `admin/meter` and `remote-operation/remote-meter-`. The Account page (`management/account`), Token Generate, and Token Record pages were missing the mapping.

**Fix:**
- Moved the normalization to a **global block** at the end of `mapRowShape()`:
```js
// Global normalization — runs for ALL routes
if (typeof record.meterType === "number" || /^[0-2]$/.test(String(record.meterType))) {
  const mt = Number(record.meterType);
  if (mt === 0) record.meterType = "Electricity";
  // ...
}
```

**Lesson:** When a field appears across multiple routes, normalize it globally instead of per-route. Per-route normalization leads to gaps when new routes are added.

---

### Phase 4: Station ID Cross-Validation

**Problem:** When creating an Account, the Customer and Meter must belong to the same Station ID.

**Fix:**
- `ActionModal.vue` — added cross-validation in the account form
- If `customerStationId !== meterStationId`, show a toast notification and block submission
- Internal tracking fields (`customerStationId`, `meterStationId`) stripped from write payloads in `write-helpers.mjs`

---

### Phase 5: Administration Pages — Full Audit

**Problem:** Multiple admin tables (User, Role, Log, Station, Item, Meter, Debt, DLMS, DLT645) had empty columns, wrong field mappings, or missing form configurations.

**Root Causes:**
- Column names in `route-manifest.js` didn't match API response field names
- `table-mapper.mjs` had no row shape mapping for many admin entities
- `management-forms.mjs` had no Add/Edit/Delete form definitions for admin entities
- `action-service.mjs` had no CRUD endpoint routing for admin entities

**Fixes Applied:**

| Entity | Manifest Columns Fixed | Mapper Added | Form Config Added | Action Routing Added |
|--------|----------------------|--------------|-------------------|---------------------|
| User | ✅ | — | ✅ Add/Edit/Delete | ✅ |
| Role | ✅ | — | ✅ Add/Edit/Delete | ✅ |
| Station | ✅ | ✅ `stationId → id` | ✅ Add/Edit/Delete | ✅ |
| Item | ✅ | ✅ `itemType → id`, `itemName → name` | ✅ Add/Edit/Delete | ✅ |
| Meter | ✅ (removed account-specific columns) | ✅ `type → meterType`, status labels | — (no forms) | — |
| Debt | ✅ | ✅ | — | — |
| DLMS | ✅ | ✅ `dlmsId → id`, `nameEN → name` | — | — |
| DLT645 | ✅ | ✅ `dlt645Id → id`, `nameEN → name` | — | — |

---

### Phase 6: Gateway stationId Not Prefilling in Edit Modal

**Problem:** Clicking "Edit" on a gateway row opened the modal but the StationId dropdown showed "Please Select" instead of the row's actual station.

**Root Cause (Mistake #3):** The `created()` hook in `ActionModal.vue` fetched stations from `/api/station/read` and mapped them as:
```js
this.stations = rows.map(s => ({ value: String(s.id).toUpperCase(), label: s.name || s.id }));
```
But the station API returns `stationId`, NOT `id`. So `s.id` was `undefined`, and every option had `value: "UNDEFINED"`.

**Additionally (Mistake #4):** The static `tableSiteOptions` only had 5 hardcoded stations (`KYAKALE`, `MUSHA`, etc.). The live API has 7 stations including `0001` and `admin`. A gateway with `stationId: "admin"` had no matching option.

**Fix:**
- Changed to `s.stationId || s.id || s.name`
- Added fallback: if the current row's stationId doesn't exist in the station list, inject it dynamically

---

### Phase 7: Role and Debt Pages — 403 Forbidden

**Problem:** The Role page under Administration and the Debt page both showed "Request failed with status code 403".

**Root Cause (Mistake #5 — Proxy Auth):** In `api/reference.js`, the proxy's token priority was:
```js
const token = request.headers.authorization || (env.liveBearerToken ? `Bearer ${env.liveBearerToken}` : "");
```
This forwarded the **frontend login token** (from the cookie) to the live backend. The login token has limited permissions and was rejected for `/api/role/read` and `/api/debt/read`.

**Fix:**
```js
const token = env.liveBearerToken ? `Bearer ${env.liveBearerToken}` : (request.headers.authorization || "");
```
Always prefer the upstream bearer token (from `.env`) which has full permissions.

**Lesson:** The upstream bearer token exists specifically for full API access. The frontend login token is scoped and should never be preferred over it.

---

### Phase 8: Data Report Tables Capping at 15 Rows

**Problem:** Long Nonpurchase, Low Purchase, and other report tables only showed ~15 rows even though the backend had 1200+ records.

**Root Cause (Mistake #6 — Uppercase Paths):** The `tableDataPath()` used uppercase `/API/PrepayReport/LongNonpurchaseSituation`. The live backend **rejects** uppercase `/API/` paths with 404. The proxy's `candidatePaths()` tried both variants, but:
1. First try: `/API/PrepayReport/...` → **404**
2. Second try: `/api/PrepayReport/...` → **200 with data**

While the retry logic technically worked, it introduced latency and sometimes failed under load. More critically, the proxy's `normalizeLivePayload` was wrapping the 404 response differently, causing the frontend to receive malformed pagination data.

**Fix:** Changed ALL paths from `/API/` to `/api/`:
- `table-service.js` — `tableDataPath()` and `tableRequest()` 
- `action-service.mjs` — write endpoints
- `remote-task-flow.mjs` — remote task create endpoints
- `route-manifest.js` — `apis` arrays

**Result:** Long Nonpurchase now returns `total: 1231`, Low Purchase `total: 1234` — all pages fetched correctly.

---

### Phase 9: Interval Data — 400 Bad Request

**Problem:** The Interval Data page under Data Reports showed "Request failed with status code 400".

**Root Cause (Mistake #7):** Two issues:
1. Path was `/api/DailyDataMeter/readHourly` — this endpoint doesn't exist on the backend
2. Missing required `lang: "en"` parameter — backend validation error: `"The Lang field is required."`

**Fix:**
- Changed endpoint to `/api/DailyDataMeter/read`
- Added `lang: "en"` to the POST payload
- Added `stationFilter()` for site-level filtering
- Updated columns in `route-manifest.js` to match actual API response fields

**Before (wrong columns):**
```
meterId, gatewayId, collectionDate, totalEnergy, lastHourUsage, creditBalance, maximumDemand, ...
```
**After (correct columns matching API):**
```
customerId, customerName, meterId, gatewayId, currentDate, usage1, total1, remain1, power, status, stationId
```

**Result:** 247,426 rows now accessible.

---

### Phase 10: Low Purchase Situation — Empty Columns

**Problem:** The `totalUnit` and `totalPaid` columns showed blank in the Low Purchase Situation table.

**Root Cause (Mistake #8):** The API returns `purchaseTotalUnit` and `purchaseTotalPaid`, NOT `totalUnit`/`totalPaid`.

**Fix:** Updated `route-manifest.js` columns to use the correct API field names.

---

## Root Causes & Patterns

### Pattern 1: API Field Name Mismatch

The most common bug. The UI assumes a field name that differs from what the API returns.

| UI Expected | API Returns | Where |
|-------------|-------------|-------|
| `meterType` | `type` | Meter API |
| `id` | `stationId` | Station API |
| `id` | `itemType` | Item API |
| `id` | `dlmsId` | DLMS API |
| `totalUnit` | `purchaseTotalUnit` | Low Purchase API |
| `collectionDate` | `currentDate` | DailyDataMeter API |
| `totalEnergy` | `total1` | DailyDataMeter API |
| `lastHourUsage` | `usage1` | DailyDataMeter API |
| `creditBalance` | `remain1` | DailyDataMeter API |

**How to avoid:** Always probe the live API first with a small `pageSize` request and log `Object.keys(response.data[0])` before writing column definitions.

### Pattern 2: Case-Sensitive API Paths

The live backend rejects uppercase `/API/` paths with 404 but accepts lowercase `/api/` paths.

| Path | Backend Response |
|------|-----------------|
| `/API/PrepayReport/LongNonpurchaseSituation` | **404** |
| `/api/PrepayReport/LongNonpurchaseSituation` | **200** ✅ |
| `/API/RemoteMeterTask/GetReadingTask` | **404** |
| `/api/RemoteMeterTask/GetReadingTask` | **200** ✅ |

**How to avoid:** Always use lowercase `/api/` prefix. Never use `/API/`.

### Pattern 3: Per-Route vs Global Normalization

Normalizing fields inside per-route `if` blocks causes gaps when new routes use the same fields.

**Bad:**
```js
if (route.hash.includes("admin/meter")) {
  if (record.meterType === 0) record.meterType = "Electricity";
}
// Account page never normalizes meterType!
```

**Good:**
```js
// At end of mapRowShape, runs for ALL routes
if (typeof record.meterType === "number") {
  if (record.meterType === 0) record.meterType = "Electricity";
}
```

### Pattern 4: Proxy Auth Token Priority

The frontend login token has limited permissions. The upstream bearer token (from `.env`) has full access.

**Bad:** `request.headers.authorization || env.liveBearerToken`  
**Good:** `env.liveBearerToken || request.headers.authorization`

---

## Mistakes Made & Lessons Learned

### Mistake 1: Assumed `id` Exists on All API Responses

Many admin APIs don't have a generic `id` field. Stations use `stationId`, items use `itemType`, meters use `meterId`. The mapper must create an `id` alias for the UI to work.

**Lesson:** Check every API response's actual field names before configuring the mapper.

### Mistake 2: Per-Route Normalization Instead of Global

Applied `meterType` normalization only for `admin/meter` route, missing 5+ other routes that also display `meterType`.

**Lesson:** If a field transformation applies to a data type (e.g., meter type codes), apply it globally at the end of the mapper function.

### Mistake 3: Used `s.id` Instead of `s.stationId` for Station Dropdown

The `created()` hook in ActionModal read stations as `s.id` but the API returns `s.stationId`. Result: all dropdown values were `"UNDEFINED"`.

**Lesson:** The station API is one of the entities where the primary key is NOT `id`. Always verify the actual key name.

### Mistake 4: Hardcoded Station Options

The `tableSiteOptions` array had only 5 static stations. The live backend has 7+. Stations like `admin` and `0001` were missing, causing dropdown mismatches.

**Lesson:** Always load options from the API. If using a static fallback, always merge with live data and include the current row's value as a safety net.

### Mistake 5: Proxy Forwarded Wrong Auth Token

The frontend login token was prioritized over the upstream `.env` token. The login token has scoped permissions and was rejected for admin endpoints.

**Lesson:** The upstream token is the full-access service credential. It should always take priority. The frontend token is for user-level operations only.

### Mistake 6: Used Uppercase `/API/` Paths

Legacy code used `/API/PrepayReport/...` paths. The live backend rejects them with 404. While the proxy retries with swapped casing, this added latency and intermittent failures.

**Lesson:** The live backend only accepts lowercase `/api/` prefix. Standardize on it everywhere.

### Mistake 7: Wrong DailyDataMeter Endpoint

Used `/api/DailyDataMeter/readHourly` (doesn't exist) instead of `/api/DailyDataMeter/read`. Also missed the required `lang: "en"` field.

**Lesson:** Before wiring an endpoint, test it with `curl` or a quick script. The backend returns clear validation errors when required fields are missing.

### Mistake 8: Assumed Column Names Without Probing API

Used `totalUnit`/`totalPaid` for Low Purchase, but the API returns `purchaseTotalUnit`/`purchaseTotalPaid`. Used `collectionDate` for DailyDataMeter but the API returns `currentDate`.

**Lesson:** Never guess field names. Always run:
```bash
node -e "post('/api/endpoint/read', {pageNumber:1, pageSize:1}).then(r => console.log(Object.keys(r.result.data[0])))"
```

### Mistake 9: Removed Import Jobs Handler During Multi-Edit

While editing `table-service.js` to fix DailyDataMeter, accidentally deleted the `/api/local/importJobs/read` handler block. Caught immediately and restored.

**Lesson:** When making multi-chunk replacements, verify that all existing blocks are preserved. Use `view_file` after edits to confirm nothing was lost.

---

## Things to Avoid

### ❌ Never Use Uppercase `/API/` Prefix
The live backend rejects it. Always use lowercase `/api/`.

### ❌ Never Assume API Field Names Match UI Column Names
Always probe the endpoint first. Common mismatches: `type` vs `meterType`, `stationId` vs `id`, `purchaseTotalUnit` vs `totalUnit`.

### ❌ Never Add Per-Route Normalization for Shared Fields
If `meterType`, `communicationWay`, or `status` appears on multiple routes, normalize it globally in `mapRowShape()`.

### ❌ Never Prefer Frontend Login Token Over Upstream Bearer Token
The `.env` upstream token has full permissions. The login token is user-scoped and may lack admin access.

### ❌ Never Hardcode Dropdown Options
Station lists, role lists — always fetch from the API. Include a fallback to inject the current row's value if it's missing from the fetched list.

### ❌ Never Wire an API Endpoint Without Testing It First
Run a quick POST test with `pageNumber: 1, pageSize: 1` to verify:
1. The endpoint exists (not 404)
2. Required fields aren't missing (not 400)
3. Auth works (not 403)
4. The response field names match what you expect

### ❌ Never Edit Multiple Non-Adjacent Blocks Without Verifying
Multi-chunk edits can accidentally delete blocks between the chunks. Always `view_file` after to confirm.

### ❌ Never Assume `total: 0` Means an Error
Some endpoints legitimately have zero records (e.g., Debt, DLT645). The table should render empty with no error, not show a 502 fallback.

---

## API Field Reference

### Verified API Response Schemas

**Gateway** (`/api/gateway/read`)
```
gatewayId, gatewayName, stationId, status (boolean), remark, createDate, updateDate
```

**Customer** (`/api/customer/read`)
```
customerId, customerName, phone, address, certifiName, certifiNo, remark, stationId, createDate, updateDate
```

**Meter** (`/api/meter/read`)
```
meterId, type (0/1/2), isThreePhase, communicationWay (0/1), protocolVersion, stationId, status, sgc, krn, ken, ti, kt, remark, createDate, updateDate
```

**Tariff** (`/api/tariff/read`)
```
tariffId, tariffName, price, tax, remark, createDate, updateDate
```

**Account** (`/api/account/read`)
```
customerId, customerName, meterId, meterType (0/1/2), communicationWay (0/1), tariffId, protocolVersion, stationId, remark, createDate, updateDate
```

**Station** (`/api/station/read`)
```
stationId, name, remark, createDate, updateDate
```

**Role** (`/api/role/read`)
```
roleId, name, content (comma-separated permission list), remark
```

**User** (`/api/user/read`)
```
userId, nickName, roleId, stationId, remark, createDate, updateDate
```

**Item** (`/api/item/read`)
```
itemType, itemName, remark, createDate, updateDate
```

**Long Nonpurchase** (`/api/PrepayReport/LongNonpurchaseSituation`)
```
customerId, customerName, customerAddress, meterId, stationId, tariffId, lastPurchaseUnit, lastPurchasePaid, lastPurchaseDate, nonpurchaseDays
```

**Low Purchase** (`/api/PrepayReport/LowPurchaseSituation`)
```
customerId, customerName, customerAddress, meterId, tariffId, stationId, purchaseTotalUnit, purchaseTotalPaid
```

**Interval Data** (`/api/DailyDataMeter/read`) — requires `lang: "en"`
```
currentDate, customerId, customerName, meterId, usage1, usage2, total1, total2, remain1, remain2, intervalDemand, power, voltageA/B/C, currentA/B/C, relayOpen, batteryLow, magneticInterference, terminalCoverOpen, coverOpen, source2Activated, currentReverse, currentUnbalance, status, stationId, gatewayId, createDate, updateDate, remark
```

**DLMS** (`/api/dlms/Read`)
```
dlmsId, version, type, classId, obis, nameEN, remark, createDate, updateDate
```

**Remote Meter Tasks** (`/api/RemoteMeterTask/GetReadingTask`)
```
customerId, customerName, meterId, dataItem, dataValue, data, token, stationId, status (0/1/2), createDate, updateDate
```

---

## File Change Index

| File | Changes |
|------|---------|
| `api/reference.js` | Auth token priority fix (line 475) |
| `src/data/route-manifest.js` | Fixed columns for LongNP, LowP, IntervalData, admin pages. All `/API/` → `/api/` |
| `src/services/table-service.js` | All `/API/` → `/api/`. Fixed DailyDataMeter endpoint + payload. Restored importJobs handler |
| `src/services/mappers/table-mapper.mjs` | Added global meterType + communicationWay normalization. Added mappers for Station, Item, Meter, Debt, DLMS, DLT645 |
| `src/services/table-helpers.mjs` | Added column key entries for Protocol fields (Version, Class Id, OBIS, Type) |
| `src/services/management-forms.mjs` | Added form configs for User, Role, Station, Item. Added stationId cross-validation fields for Account |
| `src/services/action-service.mjs` | Added admin entity CRUD routing. All `/API/` → `/api/` |
| `src/services/remote-task-flow.mjs` | All `/API/` → `/api/` |
| `src/services/write-helpers.mjs` | Strip internal tracking metadata from write payloads |
| `src/components/ActionModal.vue` | Station dropdown: `s.id` → `s.stationId`. Added current-value fallback. Station cross-validation |
| `src/components/PickerModal.vue` | Added `type → meterType` fallback in `cellValue()` |

---

## Known Remaining Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| `/api/account/create` returns 502 | Backend | Server-side error, not a frontend bug |
| DLT645 endpoint returns empty body | Backend | No data exists for this protocol in the live system |
| Debt table shows 0 rows | Data | Legitimate empty dataset — no outstanding debts |
| DailyDataMeter returns 247k+ rows | Performance | Multi-page fetch works but initial load takes several seconds. Consider limiting default date range |
| `login` token has limited permissions | By design | The proxy uses the upstream bearer token. If `.env` is misconfigured, admin pages will 403 |

---

## Verification Commands

Quick sanity check for all major endpoints:

```bash
# Run from project root — tests all critical endpoints
node -e "
const http = require('http');
function post(path, body = {}) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 9311, path, method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d.substring(0, 100) }); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}
(async () => {
  const P = { pageNumber: 1, pageSize: 1 };
  const tests = [
    ['Role',     '/api/role/read',     P],
    ['User',     '/api/user/read',     P],
    ['Station',  '/api/station/read',  P],
    ['Meter',    '/api/meter/read',    P],
    ['Gateway',  '/api/gateway/read',  P],
    ['Customer', '/api/customer/read', P],
    ['Account',  '/api/account/read',  P],
    ['LongNP',   '/api/PrepayReport/LongNonpurchaseSituation', { lang: 'en', ...P }],
    ['DailyData','/api/DailyDataMeter/read', { lang: 'en', ...P }],
  ];
  for (const [name, path, body] of tests) {
    const r = await post(path, body);
    const total = r?.result?.total || r?.data?.total || 0;
    const ok = r?.code === 0;
    console.log((ok ? '✅' : '❌') + ' ' + name.padEnd(12) + ' total=' + total);
  }
})();
"
```
