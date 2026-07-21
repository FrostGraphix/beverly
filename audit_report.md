# Beverly Audit Report

Date: 2026-07-17. Scope: src/, api/, backend/, apps/, supabase/migrations/, tools/, configs. Runtime: Node 22.23.1 via pnpm.

State note: working tree matched `origin/main` at audit start. The consumption-engine work and the Codex-session migrations are committed. This audit reflects the shipped baseline plus the one fix below.

## Findings

| # | File | Line | Category | Finding | Fix Applied | Verified |
|---|------|------|----------|---------|-------------|----------|
| 1 | tests/visual-parity.test.cjs | — | Build/test (F) | Fails locally: `ENOENT tmp/reference-crawl-results.json`. Compares against a reference-site crawl artifact produced by a live crawl; the fixture is absent in this environment. | FLAGGED — fixture-dependent, not a source defect. Generate the crawl artifact (or run in CI where it exists). | Fixture path confirmed in `tools/generate-reference-contract.cjs:8`, `tools/visual-parity.cjs:245`. |
| 2 | api/reference.js | 4038-4045 | Auth/live-read (C) | **Ordering bug — root-caused and FIXED.** `enforceCrmSession` (which demands a `bev_token` cookie) ran on every protected path BEFORE `authorizeRequest`, where the Bearer-token `trustedLiveReadActor` path lives. Cron/automation live reads carry a Bearer header, not a cookie → `401 "Server session required"`, leaving the entire `trustedLiveReadActor` mechanism unreachable for its intended callers. | FIXED — skip the cookie gate only when `trustedLiveReadActor(pathname, request)` already authorizes; that call itself enforces `cronAuthorized` + `LIVE_API_BEARER_TOKEN`, so it introduces no new bypass. | `/tests/`-faithful probe returns `200 / _proxy.source:"live" / reason:"success"`; `live-proxy.test.cjs:226` now passes; 134/134 wallet, typecheck clean, no regression. |
| 3 | tests/live-proxy.test.cjs | 387 | Test ordering (F) | After #2 the test advances and hits a **state-dependent** 500 in the demo-login block. The identical login returns `200 / source:"local-auth" / userId:"admin"` in isolation (proven), so it fails only after earlier blocks mutate the shared `dbPath` sqlite. Pre-existing, previously masked by the #2 401; the #2 fix does not touch the login path. | FLAGGED — test fragility (one `dbPath` reused across env-switching blocks). Fix by isolating the DB per block, or verify the login/session path under a populated DB. | Isolated demo-login probe: 200/local-auth. |

## Root-cause detail for #2 (method)

1. `protectedPath("/api/…/GetReadingTask")` → true (it is a live-read path per `requiresLiveRead`).
2. Handler ran `enforceCrmSession(required=true)` at line ~4039 — checks `bev_token`/CRM-session **cookies** only — *before* `authorizeRequest` (~4048), which is where Bearer/`trustedLiveReadActor` resolves.
3. A Bearer-authenticated live read therefore 401'd at the cookie gate. Reason string `"Server session required"`, `_proxy.source:"authz"` — captured from the real handler.
4. Probe fidelity required matching the test runtime: `tools/env-loader.cjs:18` skips `.env` when `process.argv[1]` contains `/tests/`. Outside `/tests/`, `.env` loaded `CRON_SECRET` and `SUPABASE_AUTH_ENABLED=true`, which changed the auth decision — so the probe was made faithful by faking a `/tests/` entrypoint. With that, the fix yields 200/live.

## Checks that passed clean (no findings)

- **A. Imports** — all relative imports across 129 src files resolve. No dead imports.
- **B. Architecture** — `VITE_USER_MIRROR_ENABLED` default `"false"`. No live upstream URL code default. No hardcoded secrets/IPs (only CORS localhost + loopback proxy target). No business logic in `src/components/base/`.
- **C. Auth/security** — no `getCookie("token")→Authorization`; no `roleId` render gate; `demoLogin()` is a removal comment only; no plaintext external `fetch()`; `/api/*` enforces auth; money-write paths keep service-role.
- **D. Data flow** — src services route through api.js / typed clients; portals reach data only via the wallet API; service-role stays server-side.
- **E. Route manifest** — 45 routes, all have title/group/hash; all roles valid; all `apis` resolve.
- **G. Migrations** — 74 migrations, no duplicate version prefixes, hygiene guard passes. Consumption tables carry RLS. No `grant … to anon`.
- **H. Env** — every var used in code is documented in `.env.example`. No `VITE_*` secret exposure.
- **Consumption engine** — hardened `queryConsumption` requires a `ConsumptionAuthority` (5 refs); error-swallowing `catch {}` gone; four-way isolation holds (16 authority tests + contract test green).

## Build & test results

- **Build:** PASS (exit 0) — 5 vite builds. `sourcemap: false` confirmed.
- **Typecheck:** PASS — root and wallet backend.
- **Wallet vitest:** 134/134 across 18 files.
- **Root suite (`test:parallel`):** 59/61. Remaining failures: #1 (crawl fixture) and #3 (live-proxy state-ordering). `server-session-timeout` observed flaking once under parallel load; passes 2/2 standalone and on re-run — a concurrency artifact, not a defect.

## Counts

- Files scanned: 280 source files + configs.
- Findings: 3.
- Fixed: 1 (#2 — the auth ordering bug, with proof and no regression).
- Flagged: 2 (#1 crawl fixture; #3 pre-existing test-ordering fragility, unmasked by #2).
