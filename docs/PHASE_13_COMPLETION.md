Phase 13 Completion
===================

Architecture fit
- `src/services/table-service.js` owns route read orchestration.
- `src/services/live-report-adapters.mjs` owns live-derived report shaping.
- `tools/capture-live-samples.cjs` owns sample capture.
- `tools/capture-live-route-matrix.cjs` owns route source inventory.
- `tools/live-read-report.cjs` owns live-read release reporting.

Implemented
- Consumption Statistics no longer depends on the failing upstream report endpoint.
- The route now derives live rows from `/api/DailyDataMeter/readHourly`.
- Captured samples preserve the upstream code 99 failure.
- Derived samples expose the normal success envelope.
- Live route matrix now tracks source status per route.
- Live observation log now records source and sample state.
- Live gap audit documents remaining mixed routes.
- Live normalization regression guards the derived report.
- Live route smoke guards the first cutover wave.
- Dashboard panels now use live dashboard payloads.
- Dashboard charts now use live chart and hourly reading payloads.
- Static dashboard placeholder arrays were removed from production state.
- Account, station, tariff, customer, gateway, and dashboard samples were captured.
- Every visible route is now `live-ready` or `live-derived`.
- Hidden mapped read routes are live-ready except blocked upstream routes.
- Environment modes are documented in `docs/ENVIRONMENT_MODES.md`.
- Vercel smoke now checks dashboard, chart, account, station, tariff, customer, gateway, and write guard status.

Known upstream defect
- `/API/PrepayReport/ConsumptionStatistics` returns code 99.
- The error appears with valid `lang`, `dateRange`, `isDaily`, `pageNumber`, and `pageSize`.
- The working fix is live derivation from hourly meter readings.

Verified locally
- `npm run samples:capture -- /API/PrepayReport/ConsumptionStatistics /api/DailyDataMeter/readHourly`
- `npm run route-matrix:capture`
- `npm run live:report`
- `npm test`
- `npm run build`

Current route state
- visible routes: 23 live-ready/live-derived of 23
- all routes: 35 live-ready, 1 live-derived, 1 upstream-blocked, 1 guarded write

Remaining external items
- `/api/dlt645/read` returns HTTP 403 from upstream.
- `/API/File/Upload` remains guarded because it is a write/upload path.
- actual Vercel preview smoke requires a deployed preview `TARGET_URL`.
