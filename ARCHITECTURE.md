# Architecture

## Goal

Build a Vue 2 remake of the reference Meter System.
Keep live-read parity.
Keep write safety strict.

## Frontend

- `src/main.js` boots Vue 2.
- `src/App.vue` owns shell routing.
- `src/components/TablePage.vue` renders generic routes.
- `src/components/DailyDataMeterPage.vue` owns interval data.
- `src/components/SiteConsumptionPage.vue` owns the EIH flow.
- `src/components/consumption/` owns EIH subcomponents.
- `src/services/api.js` owns auth helpers.
- `src/services/dashboard-service.mjs` owns dashboard reads.
- `src/services/table-service.js` owns table reads.
- `src/services/action-service.mjs` owns guarded writes.
- `src/services/management-forms.mjs` owns modal field configs.
- `src/services/consumption-service.mjs` owns 3-wave EIH orchestration.
- `src/services/consumption-aggregator.mjs` owns pure EIH math.
- `src/services/fraud-engine.mjs` owns risk scoring.
- `src/services/mappers/` owns response normalization.
- `src/services/echarts-loader.mjs` owns chart loading.
- `src/data/route-manifest.js` owns route metadata.

## Backend

- `api/reference.js` fronts all backend calls.
- `backend/reference-facade/` owns local facade logic.
- `LIVE_BEARER_TOKEN` has priority over client auth.
- `CORS_ORIGINS` controls CORS.
- `RATE_LIMIT_*` controls rate limiting.

## Routing

- `#/dashboard` renders `DashboardPage`.
- `#/prepay-report/daily-data-meter` renders `DailyDataMeterPage`.
- Routes with `isCustomPage` render `SiteConsumptionPage`.
- All other routes render `TablePage`.

## Data Policy

- Offline demo mode is default.
- Live reads are opt-in.
- Live writes require `ALLOW_LIVE_WRITES=true`.
- Upload rules live in `src/services/upload-policy.mjs`.
- Live health is exposed at `/api/system/live-report`.

## EIH Rules

- Token records are financial truth.
- `DailyDataMeter.total1` is consumption truth.
- `usage1` is ignored.
- `DailyDataMeter` needs `stationId`.
- All-sites consumption fan-outs per station.
- KPI load is wave 1.
- Charts load by sales first.
- Ledger load is wave 3.
- Negative deltas clamp to `0`.

## API Rules

- Default to lowercase `/api/...`.
- Keep PascalCase only where backend requires it.
- Prefer upstream bearer auth.
- Never hardcode secrets.

## Roles

- Super admin.
- Operations manager.
- Account.

## Deployment

- Vercel serves the SPA.
- Vercel functions serve `/api/*`.
- `npm run build` is the build gate.
- `npm run smoke:vercel` is preview smoke.
- Visual parity remains focused-batch.
