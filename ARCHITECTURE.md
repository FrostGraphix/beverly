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
- `backend/src/services/interval-export-service.js` streams styled interval XLSX exports.
- `backend/src/services/gateway-health-service.js` reads live gateway health and persists shared incidents.
- `backend/src/services/tariff-snapshot-service.js` synchronizes live account assignments and tariff rates into date-effective history used by consumption valuation.
- `backend/src/services/wallet-ledger-service.js` owns immutable wallet ledger posting and balance derivation.
- `backend/src/services/wallet-funding-service.js` owns funding requests, proof metadata, and finance approval.
- `backend/src/services/wallet-ledger-service.js` also owns wallet holds, capture, release, and freeze state.
- `backend/src/services/wallet-purchase-service.js` owns purchase orders, delivery state, receipts, and idempotent vend orchestration.
- `backend/src/services/wallet-approval-service.js` owns maker-checker approval contracts.
- `backend/wallet/src/services/fraud-engine.ts` owns wallet risk scoring and anomaly signals.
- `backend/wallet/src/services/audit.ts` owns structured wallet audit events.
- `backend/wallet/src/services/payment-transactions.ts` owns Paystack success fulfillment and legacy status compatibility.
- `backend/wallet/src/services/payment-webhooks.ts` owns verified Paystack webhook reconciliation.
- Authenticated customer/vendor Paystack callback verification reuses the same idempotent fulfillment service as webhooks and reconciliation.
- Payment redirects use server-owned, portal-specific callback URLs. Customer funding returns to the customer wallet, vendor funding returns to the vendor wallet, and customer meter purchases return to customer meter orders. Local callbacks use ports 5173 and 5174; Vercel callbacks use the dedicated customer and vendor hosts. Paystack webhooks target the canonical API host.
- Paystack verification distinguishes the requested principal from gateway fees. Financial fulfillment compares and credits the trusted `requested_amount` when Paystack charges fees to the payer, while retaining the gross charged amount and fees as reconciliation evidence.
- Gateway-confirmed fulfillment is lease-protected and replayable until value delivery completes. A review timestamp never makes an unapplied payment look fulfilled.
- Production vending fails startup when its dedicated upstream write-authorization secret is missing or copied from the login password. Runtime authorization failures preserve paid orders for bounded recovery instead of losing payment state.
- `backend/wallet/src/services/dev-console.ts` owns admin developer console data contracts.
- `backend/wallet/src/services/vendor-transfers.ts` owns Wallet Admin vendor-to-vendor balance transfer contracts.
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
- Supabase gateway health tables store shared outage state and incidents.
- Wallet RLS must isolate vendors by organization.
- Wallet staff reads must follow role claims.
- RLS identity comes from database mappings.
- User metadata never grants authorization.
- Public tables force row-level security.
- Client database access stays read-only.
- Trusted backend mutations use service role.
- Wallet ledger rows must be append-only.
- Wallet corrections use compensating entries.
- Vendor balance transfers use one service-role-only database RPC that atomically records the transfer, debits the source vendor wallet, credits the destination vendor wallet, and writes both vendor inbox notifications.

## Wallet Rules

- Vendor-first launch.
- Manual funding first.
- Token generation before remote-send.
- Customer-direct purchase is deferred.
- Vendor and staff shells stay separate.
- Vendor roles are `vendor_user` and `vendor`.
- Finance approval role is `finance-checker`.
- Funding approval posts ledger credit only after review.
- Purchases place holds before vend dispatch.
- Successful delivery captures holds.
- Failed delivery releases holds.
- Unknown delivery remains reviewable.
- Same actor cannot make and approve manual credits.
- Frozen wallets cannot transact.
- Receipts and token retrieval are first-class surfaces.
- Vendor-to-vendor transfers conserve value: the source debit and destination credit have the same positive integer minor-unit amount and currency.
- Vendor-to-vendor transfers are immediate only after an explicit Wallet Admin preview and confirmation.
- Vendor-to-vendor transfers require both `wallet.vendor_transfers.manage` and an explicit `super-admin` or `developer` role; permission assignment alone never authorizes another role.
- Vendor-to-vendor transfer requests require MFA, an idempotency key, a reason, active vendor wallets, sufficient available source balance, and distinct source and destination vendors.
- Completed vendor transfers are immutable. Corrections use a separately authorized compensating transfer and never edit ledger history.
- Vendor MFA remains available for account security and protected administration, but it is not a vending prerequisite. Vending uses the authenticated vendor session, mandatory password-reset enforcement, email verification for credential setup, a dedicated four-digit vending PIN, idempotency, wallet controls, and audit logging.
- Customer and vendor token purchases require a dedicated four-digit numeric vending PIN. Login passwords and MFA credentials never authorize wallet debits. PIN hashes use salted scrypt storage, constant-time comparison, server-side validation, and security-event logging.
- Customer-linked meters default to pending review and token purchases fail closed unless the link is explicitly approved.
- A physical meter can have only one approved customer owner; staff reviews are station-scoped, atomic, audited, and notify the customer.
- Meter-link requests use a reusable current association plus an immutable lifecycle history. Rejected links may be resubmitted as pending without losing prior decisions; pending and approved links remain unique blockers.
- Every submitted, approved, rejected, and unlinked transition is written to `customer_meter_link_history`. Customer history reads are owner-scoped through the trusted API, while admin rejection KPIs count historical rejection decisions rather than only current rows.
- Approval and rejection write the customer in-app inbox entry synchronously before optional email and SMS delivery is queued, so an unavailable worker cannot hide a completed decision.

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
- Station consumption analytics returns distinct-customer counts, average consumption per customer/station, and server-valued NGN equivalents.
- Daily consumption deltas snapshot the date-effective account tariff and positive NGN/kWh rate; aggregate valuation is the sum of those immutable daily snapshots, never a join to current account state.
- Unmatched or invalid tariff history remains explicitly unpriced. Analytics returns priced/unpriced kWh and displays a complete NGN equivalent only when unpriced kWh is within the storage rounding tolerance.
- Live account and tariff reads synchronize their complete paginated result sets into current bindings and date-effective history before aggregate refreshes run.
- `usage1` is ignored.
- `DailyDataMeter` filters dates through `currentDateRange`.
- `stationId` remains optional for super-admin reads.
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
- Wallet Admin vendor transfer endpoints live under `/api/v1/admin/vendor-transfers` and expose eligible-vendor lookup, preview, create, history, and detail contracts.
- Paystack callbacks are built from trusted server-side portal URLs; browser-supplied callback URLs are ignored.
- Vendor and customer funding use separate trusted callback variables. Local callbacks target ports `5174` and `5173`; Vercel callbacks target their dedicated portal hosts.
- Token purchases are wallet-only for customers and vendors. Paystack funds wallets first; successful token purchases then debit a wallet hold, generate the token synchronously, capture the hold, create the receipt, and expose remote-send actions.
- Legacy direct-payment token orders remain readable and reconcilable, but new customer purchase requests cannot create them.
- Legacy direct-payment recovery remains supported. Successful fee-bearing payments generate tokens idempotently; failed or abandoned payments close their purchase orders, clear in-flight states, and notify customers.
- Vending Monitor owns token-payment recovery visibility. Funding owns wallet-funding recovery. Automated retries handle only explicitly recoverable failures; ambiguous money states remain staff-reviewable.
- Paystack value delivery requires verified success, local ownership, exact reference, exact amount, and NGN currency.
- Wallet responses include stable status fields.

## Roles

- Super admin.
- Developer. Default permissions are `dev.console` and `wallet.vendor_transfers.manage`; all other Wallet Admin business APIs remain denied.
- Operations manager.
- Account.

## Deployment

- Vercel serves the SPA.
- Vercel functions serve `/api/*`.
- Large XLSX responses stream directly.
- Vercel hosts the bundled wallet Fastify service with `WALLET_API_BASE_URL=internal`.
- Supabase Cron invokes `/api/cron/wallet-maintenance` with the shared `CRON_SECRET` for payment recovery and scheduled wallet maintenance.
- Supabase Vault stores the maintenance endpoint URL and bearer secret; production does not require an always-on worker or Redis.
- `DEV_CONSOLE_ENABLED` is disabled by default; production developer routes always return `404`.
- `FEATURE_VENDOR_BALANCE_TRANSFERS` is disabled by default. The server and database path must both reject new transfers until an approved canary enables it.
- `APP_ENV` and `EXPECTED_SUPABASE_PROJECT_REF` bind every deployment to its intended database identity and fail closed on mismatch.
- Preview deployments reject money writes even when a broad write variable is accidentally enabled.
- Vendor-transfer throttling uses a database counter shared across serverless instances. `VENDOR_TRANSFER_RATE_LIMIT_MODE=observe` records breaches without interrupting business traffic; `enforce` requires a separate rollout decision.
- Serverless readiness treats intentionally disabled Redis queues as ready. Enabled queues still require reachable Redis.
- Vercel's platform forwarding header supplies the trusted client address. Arbitrary forwarded headers never become audit identity.
- Vercel preview never enables money writes.
- `npm run build` is the build gate.
- `npm run smoke:vercel` is preview smoke.
- Protected previews use `VERCEL_PROTECTION_BYPASS`.
- Staging write smoke must prove guarded writes.
- Visual parity remains focused-batch.
