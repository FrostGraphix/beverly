# Beverly Audit Report

Date: 2026-07-17. Scope: src/, api/, backend/, apps/, supabase/migrations/, tools/, configs. Runtime: Node 22.23.1 via pnpm.

State note: working tree matches `origin/main` (HEAD == origin/main, clean). The consumption-engine work and the Codex-session migrations are already committed. This audit therefore reflects the shipped baseline.

## Findings

| # | File | Line | Category | Finding | Fix Applied | Verified |
|---|------|------|----------|---------|-------------|----------|
| 1 | tests/visual-parity.test.cjs | — | Build/test (F) | Fails locally: `ENOENT tmp/reference-crawl-results.json`. The test compares against a reference-site crawl artifact produced by a live crawl tool; the fixture is not present in this environment. | FLAGGED — fixture-dependent, not a source defect. Generate the crawl artifact (or run in CI where it exists) before this gate is meaningful. | Confirmed fixture path in `tools/generate-reference-contract.cjs:8` and `tools/visual-parity.cjs:245`. |
| 2 | api/reference.js | 809, 820-829 | Auth/live-read (C) | `tests/live-proxy.test.cjs:226` expects 200, gets **401**. The synthetic live-read actor requires `cronAuthorized()`, which is env-gated (`CRON_SECRET`/`VERCEL_ENV`/`NODE_ENV`), and `requiresLiveRead` anchors on `…GetReadingTask$`. The path only authorizes under the documented live-proxy env. | FLAGGED — pre-existing on origin/main; **fails closed** (denies, never leaks). Not a security defect. Auth code is not patched speculatively (RULE 8). | Traced: `trustedLiveReadActor` → `cronAuthorized` (reference.js:856) → env-dependent. |

## Checks that passed clean (no findings)

- **A. Imports** — all relative imports across 129 src files resolve. No dead imports.
- **B. Architecture** — `VITE_USER_MIRROR_ENABLED` default `"false"` (action-service.mjs:63). No live upstream URL code default (reference.js:90 `liveBaseUrlDefault=""`). No hardcoded secrets/IPs (only CORS localhost origins and the loopback proxy target). No business logic in `src/components/base/`.
- **C. Auth/security** — no `getCookie("token")→Authorization` (removed earlier from consumption-service.mjs). No `getCookie("roleId")` render gate. `demoLogin()` is a removal comment only (api.js:322). No plaintext external `fetch()`. `/api/*` enforces auth (reference.js:447,459). Money-write paths keep service-role.
- **D. Data flow** — src services route through api.js / typed service clients; no raw external fetch. Supabase service-role stays server-side; portals reach data only through the wallet API.
- **E. Route manifest** — 45 routes, all have title/group/hash; all roles valid; all `apis` resolve to a handler/contract entry.
- **G. Migrations** — 74 migrations, **no duplicate version prefixes**, hygiene guard passes. Codex added 3 (`20260717140000_*` + 2); all idempotent-formatted. Consumption tables carry RLS (`20260717120000`). No `grant … to anon`.
- **H. Env** — every `process.env`/`import.meta.env` var used in code is documented in `.env.example`. No `VITE_*` secret exposure.
- **Consumption engine (this session's feature)** — hardened `queryConsumption` requires a `ConsumptionAuthority` (5 references), the error-swallowing `catch {}` is gone (0 occurrences), and the four-way isolation contract holds (16 authority tests + contract test green).

## Build & test results

- **Build:** PASS (exit 0) — wallet-backend, CRM, admin, vendor, customer, landing (5 vite builds). `sourcemap: false` confirmed.
- **Typecheck:** PASS — root (`tools/typecheck.cjs`, includes `src/services/**/*.mjs`) and wallet backend (`tsc --noEmit`, exit 0).
- **Wallet vitest:** 134/134 across 18 files (includes 16 consumption-authority + 4 reconciliation + 6 fulfillment-race).
- **Root suite (`test:parallel`):** 59/61. The 2 failures are findings #1 and #2 — both pre-existing on origin/main, fixture/env-dependent, neither a source defect.
- **Gates:** migration-hygiene 74/74, security config, contracts, module boundaries, consumption-access contract — all pass.

## Counts

- Files scanned: 280 source files (src, api, backend, apps, migrations, tools) + configs.
- Findings: 2.
- Fixed: 0 (both are environment/fixture-dependent pre-existing failures; neither is a provable source defect, and #2 is auth-sensitive and fails closed — patching on assumption is disallowed by RULE 8).
- Flagged for human decision: 2 (#1 crawl fixture, #2 live-proxy env).

## Recommendation

Neither failing test indicates a code vulnerability. To make both gates green locally, provide their runtime prerequisites: generate `tmp/reference-crawl-results.json` for visual-parity, and run live-proxy under the documented live-proxy env (or confirm CI already supplies both). If you want #2 chased to root, I can instrument the live-read auth path under the test's exact `withEnv` block — but I will not alter the auth logic without proving the intended behavior first.
