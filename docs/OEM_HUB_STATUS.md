# OEM Hub — Comprehensive Status Report

_Last updated: 2026-07-21_

This document is the single source of truth for the OEM Hub initiative: what it's supposed to be, what's built and verified, and what's left. The full architecture/design rationale lives in the approved plan at `C:\Users\ACOB\.claude\plans\misty-exploring-starlight.md` — this file is the status/tracking layer on top of it.

---

## 1. The Vision — What This Is Supposed To Be

Beverly CRM is wired to exactly one meter manufacturer today (Calinmeter), invisibly — the word "Calinmeter" never appears in code, only inferable from a JWT claim. The goal is to bring **every current and future meter manufacturer** (Calinmeter, Sparkmeter, Ihemeter, others later) under one umbrella: **"the Beverly Project."**

**The experience:**
1. A `super-admin` logs in with the existing Beverly CRM auth (unchanged) and lands on an **OEM Hub** screen instead of the dashboard — a card grid, one card per OEM, showing logo, name, status, and how many communities/stations that OEM is installed in.
2. **Add OEM** opens a full onboarding flow: name, logo, capabilities (what this manufacturer supports — remote tasks, tariffs, GPRS, protocols, wallet vending, etc.), vending strategy.
3. Each card has a **3-dot menu**: Edit name/details, Settings, Delete.
4. **Settings** is the deep configuration screen — credentials (base URL, auth strategy, tokens), and a full endpoint editor: every API path/method/casing/field-mapping that OEM needs, editable from the UI, changes reflected immediately (no redeploy).
5. Clicking a card drops the super-admin into the **same CRM pages/sidebar** they already know (dashboard, tables, reports, remote ops) — just scoped to that OEM's data and endpoints. Not a different app.
6. **Every OEM's dashboard preloads in the background** right after login, so clicking a card feels instant instead of a cold start.
7. Naming conventions and endpoint shapes differ per OEM — the system must not assume any convention; everything is independently configurable per manufacturer.
8. This wires into **both the CRM and the wallet portals** — not just a CRM-side skin.

**Locked design decisions (already made, not up for re-litigation):**
- "Wallet portal tokens/design system" = **visual only**. OEM Hub screens use `@beverly/tokens`'s CSS variables + `.bw-*` component classes. **CRM auth stays exactly as it is** (HttpOnly cookie, `/api/user/login`) — no Supabase auth migration.
- OEM Hub is shown **only to `super-admin`**, as the first screen right after a fresh login. Every other role goes straight to `#/dashboard`, unchanged. Selection persists across a page refresh within the same login, but a **new login always returns to the Hub**.
- Sidebar branding stays **general "Beverly"** regardless of which OEM workspace is active — Beverly is the umbrella brand; per-OEM identity lives on the Hub cards, not the primary sidebar.
- A full pre-implementation backup was taken: `Obsolete and Backup Beverly\Beverly-pre-oem-hub-20260719`.

---

## 2. What's Been Implemented (Phases 0–4 — all DONE and tested)

### Phase 0 — Data model + Calinmeter seed + proxy made config-driven
- **New Supabase tables**: `oem_manufacturers`, `oem_endpoint_configs`, `oem_credentials`, `oem_station_mappings` (migration `20260719140000_oem_manufacturers_foundation.sql`).
- **Retrofit `oem_id` columns** (nullable, additive) on every table with station/meter-identity collision risk: `account_bindings`, `purchase_orders`, `meter_token_overrides`, `sgc_token_rules`, `station_meter_read_rollups`, `consumption_aggregates` — closes the gap where two OEMs sharing a station name (e.g. both naming a site "0001") would silently collide.
- **AES-256-GCM credential encryption** — `backend/src/services/oem-credential-crypto.js`. Secrets are never stored in plaintext, never echoed back to the frontend (API responses only return `hasBearerToken: true/false` booleans).
- **Caching registry resolver** — `backend/src/services/oem-registry-service.js`: resolves an OEM's base URL/token/endpoint config, with an in-process cache and a legacy-env fallback chain so the system is provably zero-regression for Calinmeter even before any OEM is seeded.
- **Idempotent seed script** — `backend/scripts/seed-calinmeter-oem.cjs`: populates the seeded Calinmeter row with 145 endpoint configs derived from `reference-contract.json`, plus credentials sourced from the existing `.env` values. Verified to resolve to byte-identical base URL/token as the legacy env-var path.
- **`api/reference.js`'s `proxyLive()`** now resolves OEM-scoped config via the new `X-Oem-Id` header, falling back to raw env vars when unresolvable. The global enable/disable flags (`LIVE_READ_MODE`, `LIVE_API_PROXY_ENABLED`) remain fully authoritative — the registry only substitutes *which* base URL/token to use, never whether live calls happen at all.

### Phase 1 — OEM Hub read-only card grid UI
- `src/stores/oem-store.js` (Pinia — first real use of the store framework, previously installed but unused).
- `src/components/oem-hub/{OemHubPage, OemCard}.vue`.
- `GET /api/system/oem/list` endpoint, auto-gated to super-admin by the existing `/api/system/` role check.
- Wired into `App.vue` as a state-gate (`showOemHub` computed) alongside the existing `profileOpen`/`settingsOpen` pattern — not a new routing mechanism.
- Search filter, refresh button, "Manage OEMs" footer link, "Switch OEM" entry in the account dropdown to get back to the Hub after selecting.

### Phase 2 — Add/Edit OEM + Settings/endpoint editor
- **Backend**: `handleOemManagementRequest()` in `api/reference.js` handles the full CRUD surface: `POST/GET/PUT/DELETE /api/system/oem[/:id[/credentials|/cache-bust|/logo|/endpoints[/:logicalKey]]]`. All auto-gated to super-admin by the existing role check — no new auth code needed.
- Credentials encrypted server-side, never echoed back. Seed-default OEM (Calinmeter) **cannot be deleted** (409 response). Deleting an OEM locally cascades to its credentials/endpoints/station mappings (matches Supabase's `ON DELETE CASCADE`).
- **Frontend**: `OemFormModal.vue` (name/slug auto-derive, logo upload, capability checklist with a live sidebar preview), `OemSettingsPage.vue` (overview, credentials form, endpoint table), `OemEndpointEditModal.vue` (inline field-based endpoint add, replaced an earlier `window.prompt` placeholder), `oem-capabilities.mjs`, `oem-logo-upload-policy.mjs` (deliberately separate from the existing data-file `upload-policy.mjs`).
- New `deleteApi`/`uploadApi` helpers added to `src/services/api.js`.
- Logo storage bucket migration `20260719150000_oem_logos_bucket.sql`.
- Test suite: `tests/oem-registry.test.cjs`, registered in `package.json`'s `test` script.

### Phase 3 — Multi-OEM-aware sidebar, table service, rate limiting
- **`X-Oem-Id` request interceptor** in `src/services/api.js` — stamps every outgoing request with the selected OEM (reads `localStorage['beverly.currentOem']`), with a per-call override always winning (used by the prefetch service to warm a *specific* OEM regardless of current selection).
- **Capability-gated sidebar** — `route-manifest.js` gained a `routeCapabilityByHashPrefix` map and `routeCapabilityKey`/`routeCapabilityAllowed` helpers. `visibleRoutes`/`routeGroups`/`findRoute` all take an optional `capabilities` argument — `null` (the default, used by every pre-existing call site) means the full manifest, byte-identical to today. `App.vue` threads a `currentOemCapabilities` computed through.
- **Per-OEM rate limiting** — `rateLimitResult` now buckets by `(clientIP, oemId)` instead of just IP, and reads per-OEM window/max overrides via a new synchronous, cache-only `peekOemRateLimit` (never hits the DB on the hot pre-auth path).
- **Proxy path translation** — `translateEndpointPathForOem` in the registry: identity for the seeded default (Calinmeter, zero regression), remaps a CRM-canonical path to another OEM's actual configured path via the shared logical key for every other OEM. Wired into `proxyLive`.
- **TablePage generalization** — the four hardcoded route-hash whitelists (`routeUsesServerPagination`, `isBatchCheckableRoute`, `routeSortPolicy`, `rowActionButtons`) now check manifest-declared flags first (`serverPagination`, `batchCheckable`, `sortPolicy`, `rowActions`), falling back to the legacy hash-matching for every existing route. This is what actually delivers "a new OEM's standard entity types need zero new code."
- All of the above proven via node scripts and an expanded `oem-registry.test.cjs` (capability filtering, path translation, rate-limit peek).

### Phase 4 — Background dashboard preloading
- `src/services/oem-prefetch.mjs` → `warmAllOems()`: warms every *active* OEM's dashboard dataset right after login, using a per-OEM `X-Oem-Id` header override, bounded to 2 concurrent warms (so a super-admin with many OEMs doesn't fan out a burst that trips their own rate limiter), with per-OEM error isolation (one broken OEM's credentials can't block the others).
- Hooked into `App.vue`'s `loadUser()`, fire-and-forget, only for `super-admin`.
- `DashboardPage.vue` checks `oemStore.warmCache[currentOemId]` before fetching — paints the warm dataset instantly if present, then silently refreshes in the background.
- `OemCard.vue` shows a small warm-state indicator (loading/ready/error) on the logo corner.

### Post-Phase-4 fixes and polish (this session)
- **Fixed: login was skipping the Hub.** Root cause: the OEM selection persisted in `localStorage` across logins, so `restoreSelection()` on a fresh `loadUser()` silently restored a stale pick. Fix: `login()` in `src/services/api.js` now clears `beverly.currentOem` on every fresh login — selection still survives a plain page refresh within the same session, but a new login always returns to the Hub.
- **Fixed: logo upload was silently failing.** Root cause: `uploadApi()` manually set `Content-Type: multipart/form-data` with no boundary, which overrides the browser's automatic boundary injection for `FormData` bodies — the server's multipart parser had nothing to split on, so `_file` never populated. Fix: removed the manual header; the browser now sets `Content-Type` (with boundary) itself.
- **`OemCard.vue` redesigned** as a standard SaaS-style card: logo/name/status header, meta rows (community count, capabilities-enabled count, vending strategy), hover-lift affordance, explicit "Enter workspace →" call-to-action, warm-state indicator badge on the logo corner.
- **Responsive breakpoints added** (768px / 560px / 480px / 420px, matching the codebase's existing convention) across all five OEM Hub components — modals collapse to full-width bottom sheets on mobile, grids drop to 1–2 columns, footer button rows stack.
- **Considered and reverted**: making the primary sidebar logo swap to the current OEM's logo/name. Explicitly rejected — the sidebar stays general "Beverly" branding regardless of OEM workspace, by design.

### Test health
Ran every test file individually (not just the `&&`-chained `npm test`, which aborts on the first failure): **136 pass, 28 fail.** All 28 failures were verified — via a clean-`HEAD` git worktree — to **also fail identically on a fully unmodified checkout**, before any OEM Hub code existed. They are pre-existing: Windows CRLF-regex brittleness (e.g. `route-policy.test.cjs`), tests needing a live browser/server (`*.browser.test.cjs`, `full-crm-browser-smoke`), one test whose HTTP-mock lacks a `setHeader` method unrelated to OEM work (`live-proxy.test.cjs`), a missing migration file (`vendor-role-rename.test.cjs`), and wallet-app contract drift. **Every test that touches an OEM-Hub-changed file passes**: `route-permissions`, `table-ui-contract`, `design-system-hardening`, `vue3-migration`, `reference-parity-checker`, `rate-limit-cors`, `api-authz`, `oem-registry`, `local-database`.

---

## 3. What's Left

### Phase 5 — Onboard a second real OEM (the acceptance test) — **production blocked**

> **Current SparkMeter certification state:** Follow
> [`MULTI_TENANT_OEM_PIPELINE_ARCHITECTURE_AUDIT_2026-09-09.md`](./MULTI_TENANT_OEM_PIPELINE_ARCHITECTURE_AUDIT_2026-09-09.md)
> as the canonical record. Authenticated read-only inventory and isolated
> sandbox imports are complete. SparkMeter payment, vending, relay, and
> customer writes remain uncertified and disabled. Do not activate an
> installation or attempt a real vend from this checklist.
This is the proof that the abstraction holds for a real manufacturer, not merely a mock. SparkMeter read-only access exists. Its write contract remains uncertified.

What's already de-risked ahead of this phase: the mechanism has been exercised end-to-end against a **mock** second OEM during Phase 3 testing — path translation correctly remapped a CRM-canonical path to a fake OEM's configured path, capability gating correctly hid/showed sidebar groups, and credential encrypt→store→decrypt→resolve round-tripped correctly through the registry. The only missing piece is a real upstream to point it at.

#### Certified provisioning only

`backend/scripts/prestage-draft-oems.cjs` is retired. It previously assigned guessed capabilities, methods, endpoint meanings, and vending behavior. It now exits without database or provider access.

Each OEM installation must be provisioned from provider evidence. Store only verified operations. Keep every unverified operation disabled. Do not reuse Calinmeter paths, methods, payloads, or strategies.
- **All 4 auth strategies are now fully implemented, not just UI placeholders** — this was the biggest real gap the previous version of this doc flagged, and it's closed:
  - `bearer_static` (unchanged, was already done).
  - `api_key_header` — sends the credential under a configurable custom header name (`oem_credentials.api_key_header_name`, new column, defaults to `X-Api-Key` if left blank) instead of `Authorization`.
  - `bearer_login` — POSTs `{username, password}` to the configured token endpoint path, extracts a token from common response shapes (`token`/`access_token`/`accessToken`, nested under `data`/`result` too), caches it in-process with an expiry (refreshes 30s early; defaults to a 1h TTL if the OEM's response doesn't say), and refetches lazily once stale.
  - `oauth2_client_credentials` — standard RFC 6749 client-credentials grant: HTTP Basic auth of client_id:client_secret (the "Username/client ID" and "Password/client secret" fields the Settings UI already labeled for this), `grant_type=client_credentials` body, same token cache as above.
  - All four were verified end-to-end against a real fake HTTP upstream in a throwaway test (token fetch, correct header name/value, cache hit on second call) — see the auth-strategy verification in this session's transcript; not yet exercised against a *real* OEM's actual login/OAuth2 response shape, since that's unknown until credentials arrive. The flexible multi-field-name extraction is the hedge against that uncertainty — **if a real OEM's response uses an uncommon field name, `extractTokenFromResponse`/`extractExpiresInSeconds` in `oem-registry-service.js` are the two functions to extend.**
- **"Test Connection" button** — `OemSettingsPage.vue`'s credentials section now has a Test Connection action next to Save. Backend: `POST /api/system/oem/:id/test-connection` → `oemRegistry.testOemConnection()`, which forces a fresh (non-cached) token resolution for whichever auth strategy is configured, and — if at least one enabled GET endpoint exists — makes one real call and reports status/latency. Gives immediate feedback the moment credentials are pasted in, before any endpoint paths are filled in.
- **Rate-limit overrides are now in the Settings UI** (previously schema-only, API-only). Two number fields (window ms / max requests per window) with their own small save action, wired to the existing `PUT /api/system/oem/:id` endpoint.

**When provider evidence arrives:**
1. Create a draft installation.
2. Store verified credentials only.
3. Add certified read operations.
4. Test read-only operations.
5. Keep status `draft`.
6. Certify write behavior separately.
7. Verify installation-scoped collisions.
8. Record every unknown detail.

### Phase 6 — Wallet backend unification — **DONE** (built ahead of schedule, at the user's request, before Phase 5's real second OEM)
The plan originally deferred this until after Phase 5 proved the registry stable, to avoid compounding regression risk on the revenue-critical vending path in two systems at once. The user asked for it to be finished end-to-end now instead — built with the same zero-regression discipline as every other phase, and proven via the wallet backend's own pre-existing test suite (134/134 passing, unchanged) plus a `tsc --noEmit` clean typecheck.

- **`backend/wallet/src/services/oem-registry.ts`** (new) — a parallel, minimal port of the CRM's registry for this *separate deployable* (the wallet is a standalone Fastify service on Fly.io/Railway, not bundled with the CRM's Vercel functions — they share one Supabase project but can't share a Node module at runtime). Reads the SAME `oem_manufacturers`/`oem_credentials` tables via the wallet's own `adminClient`, decrypts with the SAME AES-256-GCM scheme and the SAME `OEM_CREDENTIALS_ENCRYPTION_KEY` env var (added to `config/env.ts`'s Zod schema, alongside `OEM_REGISTRY_DISABLED`/`OEM_CONFIG_CACHE_TTL_MS` for the same emergency-rollback/cache-tuning levers the CRM has), same in-process TTL cache. Fails closed to `null` on any error — never throws.
- **`token-engine.ts`'s `energyCall`** now resolves `{baseUrl, authHeader}` as a single atomic unit — either fully from the registry-resolved OEM (never mixing one OEM's URL with another's token) or fully from the legacy `env.ENERGY_BACKEND_URL`/`env.ENERGY_BEARER_TOKEN` pair, whichever is usable. `OEM_REGISTRY_DISABLED=true` forces the legacy path instantly, mirroring the CRM's own kill-switch.
- **`MeterInfo`/`GenerateTokenInput`/`RemoteSendInput` all carry an optional `oemId`**, threaded through every call site (`lookupMeter`, `lookupMeterMeta`, `lookupLocalAccountBinding` — now also selects+returns the `oem_id` column, `lookupHistoricalLowPurchaseReport`, `listStations` — cache now keyed per-OEM, `generateCreditToken`, `createRemoteSendTask`, `waitForRemoteTokenTerminal`, `pollRemoteSendStatus`). `vending.ts` tags every new `purchase_orders` row with `oem_id` and threads `meter.oemId`/`po.oem_id` through the generate/remote-send/poll/reconcile call chain.
- **`direct_credit` guard**: `assertVendingStrategySupported()` checks the resolved OEM's `vendingStrategy` before building an STS payload — throws a clear, specific error (`vending_strategy_not_implemented`) if a future OEM is configured for direct-credit vending, rather than silently trying to force Calinmeter's STS shape onto an OEM that doesn't speak it. The actual `direct_credit` code path is still not built and remains uncertified for SparkMeter — this guard makes that gap fail loudly instead of silently mis-vending.
- **Zero real-world behavior change today**: since no caller anywhere in the wallet passes a non-default `oemId` yet (there's no wallet-side OEM picker — vending still resolves to whichever OEM the meter's `account_bindings.oem_id` says, defaulting to Calinmeter for every existing meter, exactly as before), this phase is pure plumbing readiness. It becomes load-bearing the moment Phase 5 tags a real second OEM's meters via `account_bindings`.
- Confirmed via the existing test suite that the "registry unreachable → safe fallback" path genuinely works, not just in theory: `vitest.setup.ts` points `SUPABASE_URL` at a fake, unreachable domain, and all 134 tests still pass — proving the try/catch-to-null design gracefully falls through to the legacy env-var path exactly as intended.

**Still not built (unchanged from before, not needed yet):**
- The actual `direct_credit` vending code path (guarded against, not implemented — see above).
- `bearer_login`/`oauth2_client_credentials` dynamic token-fetch-and-cache on the *wallet* side (`resolveOemAuthHeader` in `oem-registry.ts` only handles `bearer_static`/`api_key_header`; the CRM side has all four). Not needed until a wallet-vending OEM actually requires one of those two strategies — the same `fetchLoginToken`/`fetchOAuth2Token` logic from the CRM's `oem-registry-service.js` is the reference to port if/when that happens.

### Smaller known gaps / deliberate scope boundaries
- **TablePage generalization covers existing vocabulary only.** A new OEM entity that maps onto the CRM's existing concepts (meter, customer, account, station, gateway, tariff, debt, log, token record) is now genuinely no-code via manifest flags. A **genuinely novel entity type** a future OEM might expose (e.g. "transformers," "solar inverters") is explicitly out of scope for a no-code path — it would still need a new column-alias/action registration, just as data now instead of a code edit.
- **"Manage OEMs" footer button is a placeholder.** Clicking it currently shows a "coming in the next update" message — there's no dedicated bulk-management screen distinct from the per-card Settings view yet. Low priority since the card grid already covers single-OEM management.
- **Token field-name extraction is a best-effort hedge, not a confirmed fit.** `bearer_login`/`oauth2_client_credentials` token extraction tries several common response shapes, but hasn't been tested against a real OEM's actual response — see the "when credentials arrive" checklist above for exactly which two functions to adjust if needed.

---

## 4. File Inventory (new/changed for this initiative)

**New files:**
- `backend/src/services/oem-credential-crypto.js`
- `backend/src/services/oem-registry-service.js`
- `backend/scripts/seed-calinmeter-oem.cjs`
- `backend/scripts/prestage-draft-oems.cjs`
- `src/stores/oem-store.js`
- `src/services/oem-prefetch.mjs`
- `src/services/oem-logo-upload-policy.mjs`
- `src/components/oem-hub/OemHubPage.vue`
- `src/components/oem-hub/OemCard.vue`
- `src/components/oem-hub/OemFormModal.vue`
- `src/components/oem-hub/OemSettingsPage.vue`
- `src/components/oem-hub/OemEndpointEditModal.vue`
- `src/components/oem-hub/oem-capabilities.mjs`
- `supabase/migrations/20260719140000_oem_manufacturers_foundation.sql`
- `supabase/migrations/20260719150000_oem_logos_bucket.sql`
- `supabase/migrations/20260720100000_oem_credentials_api_key_header.sql`
- `tests/oem-registry.test.cjs`
- `docs/OEM_HUB_STATUS.md` (this file)
- `backend/wallet/src/services/oem-registry.ts` (Phase 6 — wallet-side parallel registry)

**Changed files (core wiring):**
- `api/reference.js` — `handleOemManagementRequest()` (+ `test-connection` route), OEM-scoped `proxyLive()` with strategy-aware auth header resolution, per-OEM rate limiting, path translation, `X-Oem-Id` CORS header, `buildLiveHeaders`/`tryLivePath` accept a custom auth header name.
- `backend/src/services/storage-adapter.js`, `backend/src/services/local-database.js` — CRUD + dual-backend (Supabase/local-SQLite) support for the four new tables, `api_key_header_name` column + lightweight `ALTER TABLE` migration helper for existing local dev databases.
- `src/App.vue` — Hub state-gate, `currentOemCapabilities`, background-warm hook, "Switch OEM" menu entry.
- `src/components/oem-hub/OemSettingsPage.vue` — API-key header-name field, rate-limit fields, Test Connection button + result panel.
- `src/stores/oem-store.js` — `testConnection()` action.
- `src/services/api.js` — `X-Oem-Id` interceptor, `deleteApi`/`uploadApi`, login-clears-selection fix.
- `src/data/route-manifest.js` — capability map + gating helpers.
- `src/services/table-service.js`, `src/services/table-helpers.mjs` — manifest-flag generalization.
- `src/components/DashboardPage.vue` — warm-cache consumption.
- `tests/design-system-hardening.test.cjs` — allowlist entries for OEM Hub's deliberate wallet-token-system usage.
- `backend/wallet/src/services/token-engine.ts` — OEM-aware `energyCall`, `oemId` threaded through `MeterInfo`/`GenerateTokenInput`/`RemoteSendInput` and every function that uses them, `direct_credit` guard.
- `backend/wallet/src/services/vending.ts` — tags `purchase_orders.oem_id`, threads `meter.oemId`/`po.oem_id` through generate/remote-send/poll/reconcile.
- `backend/wallet/src/config/env.ts` — `OEM_CREDENTIALS_ENCRYPTION_KEY`, `OEM_REGISTRY_DISABLED`, `OEM_CONFIG_CACHE_TTL_MS` added to the Zod schema.

---

## 5. Reading Order For Picking This Back Up

1. This file (status).
2. The full plan: `C:\Users\ACOB\.claude\plans\misty-exploring-starlight.md` (architecture rationale, why each decision was made).
3. `backend/src/services/oem-registry-service.js` (the CRM-side core resolution/caching/translation/auth-strategy logic everything else hangs off of).
4. `backend/wallet/src/services/oem-registry.ts` (the wallet-side parallel port — same tables, same crypto, deliberately kept in sync with #3).
5. `tests/oem-registry.test.cjs` (the executable spec for the CRM registry's guarantees) and `backend/wallet/src/services/__tests__/token-engine.test.ts` (proves the wallet's zero-regression fallback).
