# Architecture

Status:
- This is the canonical architecture file.
- Update this file first.
- Treat `docs/ARCHITECTURE.md` as legacy reference.
- Release is blocked until remote CI, preview smoke, and staging write guard pass.

## Goal

Build a Vue 3 production remake of the reference Meter System.
Keep live-read parity.
Keep write safety strict.

## Frontend

- `src/main.js` boots Vue 3.
- `src/App.vue` owns shell routing.
- `src/components/vendor/` owns vendor portal pages and wallet UI flows.
- `src/components/wallet/` owns staff wallet operations surfaces.
- `src/components/TablePage.vue` renders generic routes.
- `src/components/DailyDataMeterPage.vue` owns interval data.
- `src/components/StationConsumptionPage.vue` owns station-level consumption analytics.
- `src/components/consumption/` contains legacy EIH helpers only. Do not route new pages there.
- `src/services/api.js` owns auth helpers.
- `src/services/dashboard-service.mjs` owns dashboard reads.
- `src/services/table-service.js` owns table reads.
- `src/services/action-service.mjs` owns guarded writes.
- `src/services/vendor-auth-service.mjs` owns vendor portal auth orchestration.
- `src/services/vendor-wallet-service.mjs` owns vendor wallet reads.
- `src/services/vendor-funding-service.mjs` owns funding request orchestration.
- `src/services/vendor-purchase-service.mjs` owns token and remote-send purchase orchestration.
- `src/services/vendor-history-service.mjs` owns receipt and history reads.
- `src/services/vendor-onboarding-service.mjs` owns vendor onboarding orchestration.
- `src/services/management-forms.mjs` owns modal field configs.
- `src/services/consumption-service.mjs` owns 3-wave EIH orchestration.
- `src/services/consumption-aggregator.mjs` owns pure EIH math.
- `src/services/fraud-engine.mjs` owns risk scoring.
- `src/services/mappers/` owns response normalization.
- `src/services/echarts-loader.mjs` owns chart loading.
- `src/data/route-manifest.js` owns route metadata.
- `src/styles/tokens.css` owns design primitives, semantic aliases, and component tokens.
- `src/styles/themes.css` owns theme overrides only.
- `src/styles/primitives.css` owns reusable UI class contracts.
- `src/styles/layouts.css` owns app shell and page geometry contracts.
- `src/styles/reference.css` remains the temporary style import hub during migration.
- `src/styles/legacy-components.css` owns extracted legacy component CSS until migration completes.
- `src/components/base/` owns reusable visual primitives only.
- Pinia is the target state layer.
- Legacy Vuex must not receive new state.

## Backend

- `api/reference.js` fronts all backend calls.
- `api/reference.js` proxies `/api/v1/*` only.
- `backend/wallet/` owns canonical wallet writes.
- `backend/wallet/src/contracts/route-policy.ts` owns canonical mutation policy, money-write flags, cache exclusion, and developer-only route classification.
- `api/wallet-route-contract.cjs` owns the legacy gateway's explicit canonical-money proxy contract.
- `backend/reference-facade/` owns local facade logic.
- `backend/src/services/wallet-ledger-service.js` owns immutable wallet ledger posting and balance derivation.
- `backend/src/services/wallet-funding-service.js` owns funding requests, proof metadata, and finance approval.
- `backend/src/services/wallet-hold-service.js` owns wallet holds, capture, release, expiry, and reversal.
- `backend/src/services/wallet-purchase-service.js` owns purchase orders, delivery state, receipts, and idempotent vend orchestration.
- `backend/src/services/wallet-approval-service.js` owns maker-checker approval contracts.
- `backend/src/services/wallet-risk-service.js` owns limits, freeze checks, and anomaly events.
- `backend/src/services/wallet-audit-service.js` owns structured wallet audit events.
- `backend/wallet/src/services/payment-transactions.ts` owns Paystack success fulfillment and legacy status compatibility.
- `backend/wallet/src/services/payment-webhooks.ts` owns verified Paystack webhook reconciliation.
- `backend/wallet/src/services/dev-console.ts` owns admin developer console data contracts.
- `LIVE_BEARER_TOKEN` has priority over client auth.
- `CORS_ORIGINS` controls CORS.
- `RATE_LIMIT_*` controls rate limiting.

## Routing

- `#/dashboard` renders `DashboardPage`.
- `#/prepay-report/daily-data-meter` renders `DailyDataMeterPage`.
- Custom report routes render their explicit `customComponent`.
- `#/prepay-report/site-consumption` is retired and redirects to `#/prepay-report/station-consumption`.
- `#/system/live-probing` is retired and redirects to `#/system/automation-command`.
- All other routes render `TablePage`.
- Wallet Admin is built into `/wallet-admin/` for same-Vercel hosting.
- Wallet Admin dev stays on `http://localhost:5175`.
- Wallet Admin must not route to unprovisioned custom domains.
- Wallet Admin developer console routes live under `/dev/*`.
- Wallet Admin developer console requires `dev.console`.

## Data Policy

- Offline demo mode is default.
- Live reads are opt-in.
- Live writes require `ALLOW_LIVE_WRITES=true`.
- Wallet local mode is development and preview-safe only.
- Wallet money writes default disabled.
- Wallet production persistence is Supabase.
- Wallet financial truth comes from immutable ledger rows.
- Wallet balances are derived from ledger or trusted snapshots.
- Wallet writes require idempotency keys.
- Wallet proof files must stay private.
- Upload rules live in `src/services/upload-policy.mjs`.
- Live health is exposed at `/api/system/live-report`.

## Persistence Strategy

- Supabase is production persistence.
- Supabase Auth owns production sign-in.
- Supabase Storage owns production artifacts.
- SQLite is local development persistence.
- SQLite is preview cache only when configured.
- Local memory mode is test persistence.
- Live upstream remains read-through source data.
- Live writes stay gated by `ALLOW_LIVE_WRITES=true`.
- Demo auth requires `DEMO_AUTH_ENABLED=true`.
- Demo auth requires `DEMO_AUTH_PASSWORD`.
- No live upstream URL has a code default.
- Supabase wallet tables live in `supabase/migrations/`.
- Supabase dev console tables live in `20260601120000_dev_console_access.sql`.
- Wallet RLS must isolate vendors by organization.
- Wallet staff reads must follow role claims.
- RLS identity comes from database mappings.
- User metadata never grants authorization.
- Public tables force row-level security.
- Client database access stays read-only.
- Trusted backend mutations use service role.
- Wallet ledger rows must be append-only.
- Wallet corrections use compensating entries.

## Wallet Rules

- Vendor-first launch.
- Manual funding first.
- Token generation before remote-send.
- Customer-direct purchase is deferred.
- Vendor and staff shells stay separate.
- Vendor roles are `vendor_user` and `vendor_manager`.
- Finance approval role is `finance-checker`.
- Funding approval posts ledger credit only after review.
- Purchases place holds before vend dispatch.
- Successful delivery captures holds.
- Failed delivery releases holds.
- Unknown delivery remains reviewable.
- Same actor cannot make and approve manual credits.
- Frozen wallets cannot transact.
- Receipts and token retrieval are first-class surfaces.

## Design System

- Use primitive, semantic, and component token layers.
- Keep theme deltas in `themes.css`.
- Keep reusable visual behavior in `primitives.css`.
- Keep page and shell geometry in `layouts.css`.
- Keep route and business behavior out of base components.
- Prefer token-backed classes before local component styles.
- Avoid new raw colors in component styles.
- Preserve table action column behavior during migration.
- Preserve modal flow contracts during migration.
- Keep `reference.css` as an import hub only.

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
- Wallet endpoints use lowercase `/api/wallet/*`.
- Vendor endpoints use lowercase `/api/vendor/*`.
- Material wallet writes accept idempotency keys.
- Wallet responses include stable status fields.

## Roles

- Super admin.
- Operations manager.
- Account.

## Deployment

- Vercel serves the SPA.
- Vercel functions serve `/api/*`.
- Wallet Fastify runs separately.
- Wallet workers run separately.
- `WALLET_API_BASE_URL` selects Fastify.
- `DEV_CONSOLE_ENABLED` is disabled by default; production developer routes always return `404`.
- Vercel preview never enables money writes.
- `npm run build` is the build gate.
- `npm run smoke:vercel` is preview smoke.
- Protected previews use `VERCEL_PROTECTION_BYPASS`.
- Staging write smoke must prove guarded writes.
- Visual parity remains focused-batch.
