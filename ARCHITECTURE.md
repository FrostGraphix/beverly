# Architecture

## Goal

Build a Vue 2 compatible remake clone of the reference Meter System.

## Frontend

- `src/main.js` boots Vue 2.
- `src/App.vue` owns the reference shell.
- `src/services/api.js` handles the `9310` API contract.
- `src/services/dashboard-service.mjs` owns dashboard read orchestration.
- `src/services/table-service.js` owns route table read orchestration.
- `src/services/action-service.mjs` owns guarded action/write submits.
- `src/services/mappers/` owns response normalization by domain.
- `src/data/route-manifest.js` owns visible routes.
- `src/styles/reference.css` mirrors reference layout.

## Backend

- `backend/reference-facade/` owns local facade logic.
- `api/reference.js` adapts facade logic to Vercel.
- Live proxy is controlled by environment variables.
- CORS is configured through `CORS_ORIGINS`.
- API rate limiting is configured through `RATE_LIMIT_*`.

## Data Policy

- Offline demo mode is default.
- Live reads are allowed when enabled.
- Live writes require explicit `ALLOW_LIVE_WRITES=true`.
- Phase 13 routes are live-first in preview and production.
- Facade data is fallback, local demo, and test support.
- Uploads follow `src/services/upload-policy.mjs`.
- Live report is available at `/api/system/live-report`.

## Roles

- Super admin.
- Operations manager.
- Account.

## Deployment

- Vercel hosts the Vue build.
- Vercel functions serve `/api/*`.
- Preview smoke uses `npm run smoke:vercel`.
- Visual parity supports focused route batches.
