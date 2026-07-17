# Beverly Audit Report

Date: 2026-07-16. Scope: src/, api/, backend/, apps/, supabase/migrations/, tools/, root configs.

## Part 1 — Audit findings

| # | File | Line | Category | Finding | Fix Applied | Verified |
|---|------|------|----------|---------|-------------|----------|
| 1 | src/services/consumption-service.mjs | 38-44 | Auth & security | `readCookie("token")` built an `Authorization` header. Dead since Phase 7 (token is HttpOnly) and a banned pattern; a stale legacy JS cookie could override valid cookie auth. | Removed token-cookie read; auth now rides the HttpOnly `bev_token` cookie only. | station-consumption-rollout-contract, service-layer, route-permissions, reference-parity, typecheck, full build — all pass. |
| 2 | .env.example | 85+ | Environment | 19 env vars read in code were undocumented: API_PORT, VITE_API_PROXY_TARGET, VITE_API_TIMEOUT_MS, VITE_SESSION_TIMEOUT_MS, VITE_ADMIN_URL, VITE_AUTH_NOTICE, WEBHOOK_SECRET, SUPABASE_SECRET_KEY, LOCAL_DB_MODE, LEGACY_WALLET_TEST_MODE, PUBLIC_BASE_URL, SMS_ALLOWED/BLOCKED/HIGH_RISK_COUNTRY_CODES, SMS_OTP_RATE_LIMIT_MAX/WINDOW_SECONDS, CONSUMPTION_SYNC_RETRIES, CONSUMPTION_SYNC_TIMEOUT_MS, CONSUMPTION_BACKFILL_MAX_PAGES_PER_RUN. | Added all 19 with code-default values. | provisioning-env, security-config, production-hardening — all pass. |
| 3 | package.json / node_modules | — | Build integrity | Root `node_modules` was partially installed; `npm run typecheck` failed ("cannot find path", no `.bin/tsc`). | Ran `corepack pnpm install`; typecheck and build now green. | typecheck exit 0; build exit 0. |
| 4 | backend/wallet/src/services/reconciliation.ts | 48-64 | Money correctness | **Real defect.** Paystack reconciliation summed only page 1 of the transaction list (`perPage=200`, no pagination). Any day with >200 successful transactions reported a false mismatch or masked a real one. Gateway query failure also silently recorded `status: 'ok'`. | Added full pagination (50-page cap = 10k tx/day) and only assign a gateway total when the walk completes; unverified runs now annotate `notes` instead of implying a clean reconciliation. | 4 new tests in `reconciliation.test.ts`; wallet vitest 113/113. |
| 5 | backend/src/services/gateway-health-service.js | 246+ | Observability | Gateway outage/recovery incidents were persisted to Supabase but never dispatched — the automation webhook pipeline existed and was never called. Outages were silent. | Transitions now route through `handleAutomationIncident` as `gateway-down` / `gateway-recovered` with severity. Failures log without breaking the health refresh. | gateway-health-service, automation-control — pass. |
| 6 | vercel.json | — | Security headers | **RETRACTED — auditor error.** I reported "no CSP" after reading only the first 40 lines of `vercel.json`; the CSP was further down the same headers block. I then added a second, stricter CSP, leaving **two** `Content-Security-Policy` headers. Browsers intersect duplicate CSPs, so the deployed result would have been my `script-src 'self'` ANDed with the real one — stripping `'unsafe-eval'`/`'unsafe-inline'` and likely breaking the SPA. Caught by reading live production headers, which already served a CSP. | Reverted; `vercel.json` byte-identical to HEAD (`git diff` empty, one CSP, valid JSON). No CSP change was ever deployed. | Live prod headers confirm CSP + HSTS + X-Frame-Options + Permissions-Policy already present. |
| 7 | package.json | 84 | Repo hygiene | `"main": "check_swagger.js"` pointed the package entry at an ad-hoc debug script. Tracked root clutter: `test_api.js`, `test_err.js`, `check_swagger.js`, `browser_logs.txt`. | Removed the `main` field, fixed the placeholder description, `git rm`'d all four files. | Build + full suite green. |
| 8 | supabase/migrations/20260714120000_* | — | Migrations | Two migrations share version `20260714120000` (notifications_legacy_compatibility, rename_vendor_manager_role). Supabase CLI requires unique versions; ordering is ambiguous. | GRANDFATHERED — both applied; renaming applied migrations is prohibited. New guard blocks recurrence. | migration-hygiene-check passes. |
| 9 | supabase/migrations/20260708_*, 20260709_* | — | Migrations | Version format lacks HHMMSS, inconsistent with all other migrations. | GRANDFATHERED — applied; do not rename. Guard enforces format on new files. | migration-hygiene-check passes. |
| 10 | supabase/migrations (5 files, 20260518–20260525) | — | Migrations | `create table` without `if not exists` in meter_purchase_orders, fraud_risk_engine, operations_hardening, compliance_launch, wallet_support_system — non-idempotent re-runs. | GRANDFATHERED — applied migrations must not be edited. RLS coverage is safe: `20260702150000_full_rls_permissions` force-enables RLS on all public tables. Guard blocks new offenders. | RLS diff cross-checked; migration-hygiene-check passes. |
| 11 | ARCHITECTURE.md | 64-68 | Doc drift | Named three services that do not exist: `wallet-hold-service.js`, `wallet-risk-service.js`, `wallet-audit-service.js`. | Corrected to the real owners: holds/freeze live in `wallet-ledger-service.js`; risk in `backend/wallet/src/services/fraud-engine.ts`; audit in `backend/wallet/src/services/audit.ts`. | Approved by user; no gate referenced the stale names. |
| 12 | package.json / .npmrc | 7 | Runtime | Engines want Node 22.x; local runtime was Node 24 (pnpm "Unsupported engine" warning; `node:verify` failed locally). `.nvmrc`/`.node-version` pinned 22.13.1 but no version manager was installed, so both files were inert. | Added `.npmrc` with `use-node-version=22.23.1` — pnpm now fetches and runs every script on Node 22 regardless of PATH. Aligned `.nvmrc`/`.node-version` to 22.23.1. Pointed the `crm-web` dev launcher at the Node 22 binary like the other four apps. | `pnpm run node:verify` → v22.23.1 with PATH still on 24. Build: 5/5 apps, **zero engine warnings**. Suite 60/60, wallet 113/113, wallet tsc clean — all on Node 22. |

## Part 2 — Improvements implemented

| Area | Change | Endpoint reached |
|---|---|---|
| Observability | Client error telemetry: `error-logger.mjs` batches + ships to `/api/system/client-errors` (keepalive, pagehide flush, requeue-on-failure); global `window.error` / `unhandledrejection` handlers; Vue `errorHandler` in `main.js`; `client-error-service.js` sanitizes and clamps ingest, staff-role-gated reads; `listAuditLogs` added to local-database + storage-adapter. | Browser-verified: thrown error captured, POST fired, auth gate enforced. `client-error-telemetry.test.cjs` (batch cap, clamping, actor, round trip). |
| Observability | Gateway incidents wired to the automation alert pipeline (finding #5). | Outage → webhook dispatch, proven by contract test. |
| Money correctness | `payment-fulfillment-race.test.ts`: concurrent double-webhook credits exactly once; sequential replay rejected; crash releases the lease so scheduler retry credits once; amount mismatch blocks without touching the ledger; frozen wallet blocks and flags ops review; non-success verification ignored. | 6 race proofs green. |
| Money correctness | Integer-minor-unit audit across wallet services — VAT breakdown and ledger paths are integer-only; no float money math found. | Clean. |
| Test infrastructure | `tools/test-runner.cjs` — expands the `&&` script chains, runs on a worker pool with a serial quarantine for shared-state tests, no fail-fast abort, aggregated report. `npm run test:parallel`. | Full suite **60/60 in ~12s** vs minutes sequentially. |
| Security | `tools/migration-hygiene-check.cjs` guards unique versions, timestamp format, idempotent DDL — wired into `test:security`. | 69 migrations pass. |
| Architecture | `backend/wallet/src/routes/admin.ts` 3810 → 3514 lines. Dev console (39 routes) extracted to `admin-dev.ts` (266); access catalog extracted to `admin-access-constants.ts` (59) as single source. Dev plugin registers inside admin so it inherits the full preHandler chain (requireStaff → /dev gate → dev.console permission → station scope). | wallet tsc clean; 113/113 vitest; 18/18 wallet contracts. |
| Architecture | `src/App.vue` 1134 → 1039 lines; sidebar chrome (group icons, section labels, route icon paths/overrides) extracted to `src/data/shell-chrome.mjs`. | design-system-contract + theme-contract green; production bundle renders login shell (browser-verified). |
| Type safety | `tsconfig.json` now typechecks `src/services/**/*.mjs`; `// @ts-check` + JSDoc contracts on the money/write guard path: `guarded-write.mjs`, `write-helpers.mjs`, `upload-policy.mjs` (+ `isManagementRoute` signature). Errors surfaced and fixed, then locked. | `npm run typecheck` exit 0 with the pragmas enforced. |
| Regression guard | `tests/module-boundaries.test.cjs` — locks admin.ts < 3600 lines and dev-handler-free, dev plugin auth inheritance, single-source access catalog, App.vue < 1100 lines and chrome-free, the three `@ts-check` pragmas, and the tsconfig include that enforces them. Wired into `test:contracts`. | Passing; prevents silent recollapse. |
| Runtime pin | `tools/node-version-check.cjs` rewritten: still hard-fails off Node 22, and now cross-checks that `package.json` engines, `.npmrc` `use-node-version`, `.nvmrc`, and `.node-version` all agree. Runs as the `node:verify` CI step. | Negative-tested: rejects Node 24, and rejects a drifted `.nvmrc` (22.13.1 vs 22.23.1). |

## Results

All gates below ran on **Node 22.23.1**, supplied by pnpm via `.npmrc`.

- **Runtime:** `node:verify` PASS — v22.23.1, pins consistent. Zero engine warnings.
- **Build:** PASS (exit 0 — wallet-backend, CRM, admin, vendor, customer, landing).
- **Typecheck:** PASS — root (`tsc --noEmit`, includes `src/services/**/*.mjs`) and wallet backend.
- **Root suite:** 60/60 PASS via `pnpm run test:parallel` (~12s).
- **Wallet backend:** 113/113 vitest across 16 files.
- **Sub-suites:** test:contracts 14/14, test:security 16/16, test:wallet 18/18.
- **Gates:** hardening:audit 12/12, security:audit accepted-baseline, migration-hygiene 69/69, env:validate ok, reference-parity ok.
- **Files scanned:** 280 source files + configs.
- **Findings:** 12. **Fixed:** 9. **Grandfathered (guarded against recurrence):** 3. **Flagged:** 0.

## Running the project

Use **pnpm**, not npm. `.npmrc` sets `use-node-version=22.23.1`, so pnpm downloads and runs Node 22 for every script regardless of what is on PATH. Plain `npm run …` bypasses that pin and will execute on the system Node.

```
corepack pnpm install
corepack pnpm run node:verify     # v22.23.1
corepack pnpm run test:parallel   # 60/60
corepack pnpm run build
```

## Open items requiring the user

1. `gh auth login` → confirm remote `Production Hardening CI` is green (unreadable from this session).
2. Deploy preview with Vercel scope `team_QaH3UbO8a73beiWz5LmJc5k4` → verify CSP breaks nothing, then promote.
3. ~~`package-lock.json` removal~~ — **RESOLVED via live build log.** Vercel logs `Detected pnpm-lock.yaml version 9 generated by pnpm@10.x with package.json#packageManager pnpm@10.28.0` and installs with pnpm 10.28.0. `package-lock.json` is never read; it is safe to delete. (Deletion left to the user — it is not blocking anything.)

## Verified against live Vercel (2026-07-16)

Read from the real production deploy (`acob-beverly.vercel.app`, project `prj_QMCFwDLXVsgyEwlPrfRrA52Fam9r`, scope `team_QaH3UbO8a73beiWz5LmJc5k4` = "Danmusa Abdulsamad's projects"):

- **Package manager:** pnpm 10.28.0 via `packageManager` + `pnpm-lock.yaml`. `package-lock.json` ignored.
- **Node version:** the project's dashboard setting is `24.x`, but the build log shows Vercel overrides it — *"Due to `engines: { node: 22.x }` … Node.js Version 22.x will be used instead."* **Production already builds on Node 22.** The `24.x` dashboard setting is cosmetic and only generates warning noise; aligning it to 22.x would silence that.
- **Security headers, live:** CSP, HSTS (`max-age=63072000; includeSubDomains`), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy — all present and served. The header posture was already sound; finding #6 was auditor error, now retracted.
