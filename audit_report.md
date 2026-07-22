# Beverly Audit Report

Date: 2026-07-22.

Scope: requested source directories.

## Findings

| # | File | Line | Category | Finding | Fix Applied | Verified |
|---|------|------|----------|---------|-------------|----------|
| 1 | `backend/wallet/src/adapters/paystack.ts` | 99 | Security | Webhook used wrong secret. | Uses Paystack secret key. | Signature tests passed. |
| 2 | `backend/wallet/src/routes/customer.ts` | 554 | Security | Browser controlled callback URLs. | Server builds trusted callbacks. | Contract tests passed. |
| 3 | `apps/customer/src/views/FundWallet.vue` | 27 | Payments | Callback implied payment success. | Callback verifies gateway reference. | Frontend contracts passed. |
| 4 | `backend/wallet/src/services/payment-webhooks.ts` | 20 | Authorization | Callback verification lacked ownership. | Actor ownership now required. | Authorization tests passed. |
| 5 | `backend/wallet/src/services/payment-transactions.ts` | 425 | Payments | Reference and currency unchecked. | Both values now validated. | Payment tests passed. |
| 6 | `backend/wallet/src/adapters/paystack.ts` | 16 | Reliability | Paystack requests lacked timeout. | Added fifteen-second timeout. | Adapter tests passed. |
| 7 | `backend/wallet/src/config/env.ts` | 10 | Configuration | String false became true. | Added explicit boolean parsing. | Backend tests passed. |
| 8 | `tools/seed-meter-aggregates.mjs` | 23 | Security | Service credential was embedded. | Credentials now environment-only. | Hardening audit passed. |
| 9 | `tools/seed-meter-aggregates.mjs` | 24 | Security | Exposed credential remains compromised. | Rotation needs operator action. | Repository secret removed. |
| 10 | `src/components/MfaSetupFlow.vue` | 167 | Security | TOTP secret reached third-party. | QR now generates locally. | Authentication tests passed. |
| 11 | `src/components/MfaSetupFlow.vue` | 200 | Correctness | Fallback produced invalid QR. | Uses the declared `qrcode-generator` dependency. | Production build passed. |
| 12 | `src/services/receipt-tools.mjs` | 782 | Security | Receipt loaded runtime CDN. | Uses server PDF fallback. | Receipt tests passed. |
| 13 | `api/receipt-pdf.js` | 18 | Architecture | Chromium URL had default. | URL now environment-required. | Vercel Production configured; endpoint tests passed. |
| 14 | `api/reference.js` | former 2423 | Imports | Dead handlers imported missing engine. | Retired handlers were removed. | Import scan passed. |
| 15 | `src/services/action-service.mjs` | former 62 | Data flow | Mirror bypassed service boundary. | Dead mirror branch removed. | Service tests passed. |
| 16 | `src/data/route-manifest.js` | 10 | Routes | Cancel action lacked handler. | Unsupported action was removed. | Route tests passed. |
| 17 | `apps/admin/src/components/AppShell.vue` | 163 | Architecture | Deployment domain was embedded. | Uses configuration or origin. | CORS contract passed. |
| 18 | `src/components/oem-hub/OemSettingsPage.vue` | 65 | Architecture | Placeholder exposed upstream IP. | Replaced with neutral guidance. | Production build passed. |
| 19 | `.env.example` | 140 | Configuration | Used variables lacked documentation. | Missing variables were added. | Environment scan passed. |
| 20 | `supabase/migrations/20260518100000_meter_purchase_orders.sql` | 6 | Migrations | Applied migration lacks guards. | No applied file changed. | Human baseline decision required. |
| 21 | `supabase/migrations/20260518110000_fraud_risk_engine.sql` | 8 | Migrations | Applied migration lacks guards. | No applied file changed. | Human baseline decision required. |
| 22 | `supabase/migrations/20260518120000_operations_hardening.sql` | 6 | Migrations | Applied migration lacks guards. | No applied file changed. | Human baseline decision required. |
| 23 | `supabase/migrations/20260518130000_compliance_launch.sql` | 5 | Migrations | Applied migration lacks guards. | No applied file changed. | Human baseline decision required. |
| 24 | `supabase/migrations/20260525130000_wallet_support_system.sql` | 8 | Migrations | Applied migration lacks guards. | No applied file changed. | Human baseline decision required. |
| 25 | `package.json` | 7 | Runtime | Active Node version mismatches. | No source change appropriate. | Node 24 detected. |
| 26 | `package.json` | 61 | Dependencies | Two moderate advisories remain. | Accepted baseline retained. | Security audit passed. |
| 27 | `tests/vendor-role-rename.test.cjs` | 8 | Test integrity | Test referenced renamed migration. | Updated the migration path. | Wallet suite passed. |
| 28 | `tools/migration-hygiene-check.cjs` | former 20 | Migrations | Allowlist contained dead filename. | Deleted the stale exception. | Hygiene check passed. |
| 29 | `tests/visual-parity.test.cjs` | 12 | Test integrity | Test required private crawl artifact. | Added synthetic temporary crawl data. | Parallel suite passed. |
| 30 | `tests/live-proxy.test.cjs` | 56 | Test integrity | Response mock lacked setHeader. | Added faithful header forwarding. | Live proxy test passed. |
| 31 | `.gitignore` | 20 | Security | Runtime logs and SQLite journals remained tracked. | Removed them from Git tracking while preserving local runtime files. | Git status and ignore rules verified. |

## Clean Checks

- All scoped files read.
- Relative imports all resolve.
- No circular dependencies found.
- No unused imports found.
- Base components stay presentational.
- New state uses Pinia.
- Authorization headers stay centralized.
- Demo backdoors remain absent.
- Protected APIs authenticate first.
- Writes enforce route policies.
- Service-role stays server-side.
- Browser keys remain publishable.
- Forty-five routes remain valid.
- Manifest components all resolve.
- Manifest roles remain valid.
- API references all resolve.
- Thirteen RPC definitions exist.
- User tables enforce RLS.
- Anonymous execute grants absent.
- Sourcemaps remain disabled.
- Environment coverage is complete.

## Verification

- Build: PASS, exit zero.
- Five frontend bundles completed.
- Wallet backend compiled cleanly.
- Root typecheck passed cleanly.
- Wallet TypeScript passed strictly.
- Wallet tests: 137 passed.
- Root jobs: 63 passed.
- Security suite passed completely.
- Contract suite passed completely.
- Service suite passed completely.
- Authentication suite passed completely.
- Hardening checks: 16 passed.
- Migration hygiene: 79 passed.
- Dependency audit baseline passed.
- Node verification correctly failed.
- Required runtime: Node 22.
- Active runtime: Node 24.13.1.

## Counts

- Files scanned: 468.
- Directories mapped: 73.
- Lines read: 113,131.
- Findings: 31.
- Fixed: 23.
- Flagged: 8.

## Required Decisions

- Rotate the Supabase key.
- Purge leaked repository history.
- Choose migration baseline strategy.
- Run production under Node 22.
- Monitor accepted dependency advisories.

Concurrent consumption edits were preserved.
