# Beverly Production Stack Audit and Operations Playbook

**Audit date:** 2026-07-26  
**Repository:** `FrostGraphix/beverly`  
**Branch reviewed:** `fix/test-timeouts`, then `codex/admin-vendor-balance-transfer`
**Scope:** repository, deployment configuration, database migrations, security controls, CI state, tests, and operational documentation  
**Audit type:** repository, Vercel, GitHub, and Supabase evidence review. Production health endpoints, project settings, environment identities, branch protection, migration state, feature flags, and controlled database behavior were directly verified on 2026-08-12. DNS, certificate internals, backup entitlements, restore execution, external paging destinations, and unrestricted traffic telemetry remain unverified.

## Vendor balance transfer implementation addendum — 2026-08-12

This addendum replaces the earlier vendor-to-customer funding requirement. The implemented capability is an immediate Wallet Admin transfer of existing available balance from one approved vendor wallet to another approved vendor wallet.

### Evidence-backed decisions

- Financial truth remains `public.wallet_ledger_entries`; no second wallet or ledger system was introduced.
- `public.fn_admin_transfer_vendor_balance` is the only write primitive for this capability. It locks both wallets in stable ID order and commits the transfer record, source debit, destination credit, materialized balances, and two vendor inbox notifications in one transaction.
- `public.fn_preview_admin_vendor_balance_transfer` validates the same vendor, wallet, currency, available-balance, hold, and debit-cap conditions without moving money.
- Completed transfers are immutable. Corrections require new compensating ledger movement rather than updates or deletes.
- Transfer records snapshot both vendor names so historical receipts remain intelligible after later vendor renames.
- The idempotency request fingerprint remains internal: the RPC removes it from its JSON response and history/detail queries use an explicit public-column allowlist.
- The RPCs are `SECURITY DEFINER` with an empty search path. Execute is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.
- The new table enables and forces RLS. Browser roles receive no mutation grants or permissive policies.
- The API requires the critical `wallet.vendor_transfers.manage` permission and independently allowlists only `super-admin` and `developer`. Assigning the permission to any other role does not grant transfer authority.
- The create endpoint also requires verified MFA, explicit confirmation, a valid idempotency key, the environment feature gate, the money-write gate, and a route-specific rate limit.
- Successful and failed attempts use structured audit actions. Role and MFA denials use security telemetry. Audit functions remain best-effort under repository policy; the immutable transfer record is the durable financial record.
- Vendor accounts receive in-app debit/credit notifications but have no transfer API authority.

### Release posture

Tracks A through D are implemented in the clean `codex/admin-vendor-balance-transfer` worktree. The additive migration `20260812145901_admin_vendor_balance_transfers.sql` is applied to the Beverly Supabase project. The environment and database transfer flags remain disabled. Existing business writes were never stopped.

Local typecheck, root contracts, wallet contracts, auth contracts, security contracts, hardening (16/16), security audit, every production build target, and desktop/mobile browser verification pass. High and critical dependency findings are cleared. The remaining moderate `uuid` advisory is an explicit ExcelJS transitive exception without an available fixed ExcelJS release.

The clean worktree is linked to Vercel project `beverly`. Repository, CI, and Vercel target Node 22. The current desktop runtime remains Node 24 and emits an engine warning, so protected CI provides the authoritative Node 22 result.

Database proof covered eight concurrent idempotent requests yielding one transfer identifier, two competing 60,000 debits yielding one completed transfer and one insufficient-funds result, injected notification failure yielding zero partial transfer or ledger rows, two completed transfers yielding four notifications, and zero-sum ledger conservation. All synthetic fixtures were removed. The database transfer flag was restored disabled.

This database proof ran against the live Beverly project because isolated staging is unavailable. Vercel preview and development currently share that database. Supabase preview branches require Pro, and restoring the inactive project exceeds the current active-project allowance. The application transfer gate remained disabled throughout proof.

Production application deployment remains blocked by independent review and main merge. Canary activation additionally requires named vendors, approved amount and reason, an authorized MFA session, and finance/operations reconciliation. Track F remains unused.

Draft pull request 80 is open. Protected GitHub checks pass at commit `58a2943c`. Vercel preview deployment `dpl_5sCdJ3RVu39HmQy6MQsyHnyK6Qwn` reached Ready with transfer flags disabled. An unauthenticated transfer request returned HTTP 401. Preview read probes redirect through deployment protection; the authenticated CLI probe timed out without runtime logs. Preview read-path proof therefore remains open.

CodeRabbit CLI review is unavailable because its installer rejects Windows and this machine has no WSL distribution. Independent human approval remains required by branch protection.

Four remote-only migration versions remain unresolved: `20260811100000`, `20260811110000`, `20260811120000`, and `20260811140000`. Their SQL bodies are absent from repository history. No fabricated placeholders were committed.

## 1. Executive verdict

The stack has a strong dedicated wallet core but is **not ready for unrestricted production money writes**. The dedicated Fastify/Supabase path contains good controls: validated environment configuration, authenticated actor resolution, MFA enforcement, database-backed idempotency, row locking, structured errors, readiness checks, Redis queues, audit hooks, and extensive tests. Those controls are weakened by a parallel legacy Vercel API that still owns broad CRM behavior and proxies wallet traffic.

The immediate risk is not a lack of infrastructure. It is inconsistent behavior between the two production paths:

- the legacy API signs sessions with a public fallback secret if configuration is missing;
- it buffers request bodies without an application limit;
- its process-local limiter is neither distributed nor applied before canonical wallet proxying;
- failed Supabase persistence silently falls back to local SQLite/memory, which is ephemeral and instance-specific on Vercel;
- cached operational responses have an `expires_at` column but the read/write path neither sets nor enforces expiry;
- an untracked migration irreversibly erases historical JSON and deletes aggregates without a backup gate;
- the tracked migration chain includes a migration explicitly identified later as belonging to another ERP project;
- browser bearer and refresh tokens coexist with a CSP that permits `unsafe-inline` and `unsafe-eval`;
- production observability, restore testing, and live smoke evidence are missing.

**Release decision:** keep `MONEY_WRITES_ENABLED=false`, `WALLET_PROXY_MONEY_WRITES_ENABLED=false`, `ALLOW_LIVE_WRITES=false`, and the runtime live-write flag disabled until P0 findings are closed and the go/no-go checklist in this document passes.

## 2. Scorecard

| Layer | Rating | Current position | Release posture |
|---|---:|---|---|
| 1. Frontend foundations | 6/10 | Four Vue apps build and type-check; auth/API logic is duplicated and tokens are browser-readable | Conditional |
| 2. APIs and backend logic | 5/10 | Dedicated backend is sound; legacy 4,700+ line handler is a second, weaker control plane | Block money writes |
| 3. Database and storage | 5/10 | Atomic wallet RPCs and RLS exist; migration provenance and ephemeral fallback are unsafe | Block destructive migration |
| 4. Auth and permissions | 5/10 | Supabase validation and MFA are strong; fallback signing secret and token storage are high risk | Block until fixed |
| 5. Hosting and deployment | 6/10 | Vercel routing is explicit; external settings and live deployment were not verifiable | Conditional |
| 6. Cloud and compute | 5/10 | Serverless API plus managed database is simple; workers/Redis and runbooks disagree with deployed mode | Conditional |
| 7. CI/CD and version control | 6/10 | CI is active and main is protected; critical tests are non-blocking and no approval is required | Tighten gate |
| 8. Security and RLS | 4/10 | Strong July RLS baseline is undermined by migration provenance, service-role breadth, CSP, and advisories | Block until P0/P1 fixed |
| 9. Rate limiting | 3/10 | Controls exist but are ineffective across serverless instances and canonical wallet routing | Block writes |
| 10. Caching and CDN | 4/10 | API responses are not CDN-cached; application fallback cache can be indefinitely stale | Fix before relying on fallback |
| 11. Load balancing and scaling | 5/10 | Platform can scale stateless functions; several operational states remain process-local | Conditional |
| 12. Error tracking and logs | 3/10 | Pino/correlation IDs exist in the wallet service; no external error/metric/alert pipeline is configured | Add before launch |
| 13. Availability and recovery | 3/10 | Health/runbooks exist; production target, RPO/RTO, backup evidence, and restore drills are absent | Add before launch |

**Overall:** 4.7/10, **high-risk conditional deployment**. Read-only operation can continue with monitoring. Financial writes should remain disabled.

## 3. Evidence and verification results

### Passed

- `npm run hardening:audit`: 16/16 checks passed.
- Security contract checks passed through provisioning, CORS/rate-limit structure, admin CORS, session expiry, Vercel preflight, onboarding schema, SMS guardrails, and migration hygiene.
- Dedicated wallet MFA runtime: 3 files, 6 tests passed.
- Root TypeScript check and the admin, vendor, and customer app TypeScript checks passed.
- Latest observed GitHub runs were green, including main `Production Hardening CI` on 2026-07-23 and PR runs for both production and wallet workflows.
- Main branch protection requires an up-to-date `Build and contracts` check, blocks force pushes/deletion, enforces linear history, resolves conversations, and applies to administrators.

### Failed, incomplete, or misleading

- `npm audit --omit=dev`: 10 high and 1 moderate vulnerabilities. The chain is primarily `exceljs -> archiver/glob/minimatch/brace-expansion`; `postcss` also has a high path-traversal advisory with a fix available.
- `npm run security:audit`: failed because nine high findings are not in the repository's accepted-risk list. The accepted list only covers `exceljs` and `uuid`.
- `backend/wallet` lint cannot run: the package exposes an ESLint command but does not install ESLint.
- Local runtime is Node 24.13.1 while the repository and CI require Node 22. Local `node:verify` correctly fails.
- Chromium QA and wallet E2E API integrity are marked `continue-on-error`, so a green workflow does not mean those tests passed.
- The monitoring workflow is manual only. No scheduled uptime workflow was found.
- Production smoke did not run because `TARGET_URL`, `PREVIEW_TARGET_URL`, and `PRODUCTION_TARGET_URL` resolve to no configured value for the tool.
- Production log review returned “ok” while reviewing zero files. That is no evidence of healthy production logs.
- GitHub branch protection requires zero approving reviews and has no repository CODEOWNERS file.
- No Dependabot/Renovate, CodeQL, secret scanner, SAST, SBOM, or container scan configuration was found. The GitHub vulnerability-alert endpoint was unavailable to the current credential/repository configuration.

## 4. Prioritized findings

### P0 — release blockers

#### P0-1: Known fallback session-signing secret

`api/reference.js:138-142` returns `beverly-default-session-signing-secret-2026` when all configured secrets are absent. An attacker who knows the code can forge the `bev_session` signature. The token fingerprint still requires a token, but the fallback defeats the server-session integrity layer and turns configuration failure into insecure operation.

**Fix:** require a dedicated `SESSION_SECRET` of at least 32 random bytes in every deployed environment and throw during cold start if absent. Do not reuse the Supabase JWT secret. Rotate all affected sessions after deployment.

**Acceptance:** deployment fails without the secret; a session signed with the old fallback is rejected; login, refresh, idle timeout, and absolute timeout tests pass.

#### P0-2: Supabase failures silently persist to ephemeral local storage

`backend/src/services/storage-adapter.js:121-128` catches every remote storage error and runs the local action. On Vercel, local SQLite lives in temporary instance storage. Writes can appear successful, disappear on recycle, and diverge across instances. This affects audit logs, API cache, account bindings, operational artifacts, and OEM configuration/credentials.

**Fix:** in production, fail closed for every mutation and audit write. Local fallback should only be available in explicit local/test mode. Read fallback, if retained, must be visibly labeled stale and must never fabricate write success.

**Acceptance:** simulate a Supabase 500; mutations return 503 and no local record is created. Audit persistence failure emits a critical alert. No production path writes to SQLite or memory.

#### P0-3: Wallet rate limiting is not an effective distributed control

Canonical wallet requests are proxied at `api/reference.js:4298-4304` before the legacy limiter runs at `4307`. The internal adapter uses Fastify injection without a remote address (`api/wallet-service.mjs:29-34`). In serverless mode Redis queues are disabled, leaving Fastify's in-memory limiter. The result is either a shared synthetic IP bucket or per-instance state, neither of which provides correct per-client protection across scale. The legacy limiter is also a process-local `Map` (`api/reference.js:119`).

**Fix:** enforce rate limits at one shared boundary before proxying: Vercel Firewall/rate limiting if available, or a Redis-backed limiter using a verified client key. Preserve trusted proxy configuration and test the real forwarded IP behavior. Add stricter route limits for login, OTP, vending, payment initialization, webhook replay, and exports.

**Acceptance:** two instances share counters; distinct clients do not share a bucket; spoofed `X-Forwarded-For` is ignored; canonical wallet routes return 429 with `Retry-After`; load tests prove limits under horizontal scale.

#### P0-4: Untracked destructive database migration

`supabase/migrations/20260725100000_database_quota_resolution.sql` is untracked and performs irreversible bulk changes: it replaces all historical `row_json` with `{}`, deletes delta/aggregate history older than 90 days, and installs recurring deletion. It has no backup assertion, row-count guard, batched execution, rollback artifact, or post-migration verification. Running it can create long locks, WAL growth, API latency, and unrecoverable data loss.

**Fix:** do not run this file. First capture database size, table/index bloat, retention/legal requirements, row counts, and a restorable backup. Split archival/export, batched updates, concurrent maintenance, and retention scheduling into reviewed changes. Test on a production-size clone and document the restore point.

**Acceptance:** approved retention policy; restore tested; estimated lock/WAL impact; batched dry run; before/after row counts and checksums; tracked reviewed migration; rollback decision point.

### P1 — fix before general availability

#### P1-1: Tracked migration chain contains another product's security migration

`20260708_vapt_security_remediation.sql` targets ERP tables and creates authenticated `USING (true)` CRUD policies on `crm_pipelines`, `crm_activities`, `crm_contacts`, and `crm_tags`. The next migration explicitly says those tables are ERP and not Beverly. The incorrect migration remains in the chain. A clean Beverly database can fail if those relations do not exist; a shared database can receive overly broad authenticated writes.

**Fix:** establish which migrations were actually applied to the Beverly project. Add a forward-only corrective migration that removes broad policies and scopes or removes the foreign objects safely. Never edit an already-applied migration without proving it has not run anywhere.

#### P1-2: Browser-readable tokens plus permissive script CSP

Admin access tokens and vendor/customer access and refresh tokens are stored in `localStorage`/`sessionStorage`. `vercel.json:52-53` permits both `unsafe-inline` and `unsafe-eval`. Any successful XSS has immediate token theft impact, including long-lived refresh tokens.

**Fix:** move portal sessions to Secure, HttpOnly, SameSite cookies issued by the backend. Until that migration is complete, remove `unsafe-eval`, reduce inline script/style usage with hashes/nonces, keep tokens session-only by default, shorten refresh lifetime, and revoke on logout/password reset.

#### P1-3: Legacy request bodies are unbounded

`api/reference.js:672-704` buffers all chunks before parsing. There is no byte counter, early 413, content-type allowlist, or timeout in that function. Multipart parsing is custom. A large request can exhaust function memory before downstream route validation.

**Fix:** reject bodies above a route-appropriate limit while streaming; use the platform/framework parser for multipart. Keep the explicit 12 MiB limit only where a real upload requires it and use smaller defaults elsewhere.

#### P1-4: Dependency audit is red

Production dependency audit reports 10 high and 1 moderate advisories. `postcss` has a direct available fix. Most remaining findings arrive through ExcelJS archive generation. The existing baseline accepts only part of that chain, so CI and local policy disagree with actual exposure.

**Fix:** update the directly fixable packages now. For ExcelJS, document whether attacker-controlled filenames, globs, source maps, or archive inputs reach vulnerable code; sandbox exports and apply strict input/size limits. Replace ExcelJS only if the exposure cannot be contained—do not add a second spreadsheet library speculatively.

#### P1-5: No production-grade telemetry or paging

The dedicated backend uses Pino and correlation IDs, which is a good base. No Sentry/OpenTelemetry/metrics exporter, log drain, trace propagation, dashboard-as-code, alert destination, or paging integration was found. `ENABLE_METRICS` is configured but no metrics endpoint/implementation was found. Reconciliation comments still describe alerting as future work.

**Fix:** add one error-tracking destination and one log/metric destination. Alert on money-write failures, webhook verification failures, reconciliation mismatches, DB/Redis readiness, queue age, auth spikes, 5xx rate, and stale-data fallback. Do not build a custom observability platform.

#### P1-6: Backup and failover claims are unverified and internally inconsistent

The backup guide covers local SQLite rather than the production Supabase ledger. The database failover runbook claims a seven-day PITR entitlement and instructs Fly scaling, while the deployment guide says Vercel serverless and Supabase Cron. No `fly.toml`, Supabase config, backup job, backup evidence, restore log, RPO, or RTO was found.

**Fix:** verify the actual Supabase plan and backup/PITR entitlement in the dashboard, export evidence, test restore to an isolated project, and rewrite runbooks for the deployed architecture.

### P2 — hardening and maintainability

- **Stale fallback cache:** the schema has `expires_at`, but cache writes do not set it and reads do not filter it. Cached operational data can be served indefinitely after upstream failure.
- **Process-local operational state:** gateway acknowledgements/silences, some feature/privacy state, rate buckets, and dynamic caches use process memory. Across serverless instances, operators can see inconsistent state.
- **CI false confidence:** browser and E2E jobs are allowed to fail; monitoring is manual; only one workflow context is required; no human approval is required.
- **Broken lint contract:** wallet package advertises linting but has no ESLint dependency/configuration. Either install and enforce one linter or remove the dead script; a broken gate is worse than no claimed gate.
- **Two lockfiles:** CI alternates between pnpm and npm while both `pnpm-lock.yaml` and `package-lock.json` exist. This can resolve different dependency graphs. Standardize on pnpm, already declared by `packageManager`.
- **Container hardening:** Docker builds use `npm install` without a frozen lock, run as root, and use mutable base/image tags. Redis has no authentication/TLS in Compose. Fine for isolated local development, not a production definition.
- **No reproducible infrastructure definition:** Vercel routes are versioned, but project settings, Supabase configuration, DNS, Redis, log drains, alert rules, and backup policies are not.
- **Frontend duplication:** three portal API/auth clients and three receipt implementations have already drifted. Consolidate only the security/session and receipt primitives; do not attempt a broad component rewrite.
- **Accessibility/performance gates absent:** no axe/Lighthouse/bundle-budget gate was found. Add one browser smoke covering keyboard login, form labels/errors, focus management, and main dashboard performance.
- **Load tests are not a gate:** k6 scripts and thresholds exist but are not scheduled or attached to release evidence.

## 5. Layer-by-layer audit

### 5.1 Frontend foundations

**What works**

- Vue 3, Vite, TypeScript, Pinia, and Vue Router are consistently used for admin, vendor, customer, and landing apps.
- Shared design tokens exist in `packages/tokens`.
- Portal builds and TypeScript checks are represented in CI.
- Fetch wrappers add correlation-friendly errors and idempotency keys for mutations.
- Payment redirect URLs are restricted to HTTPS Paystack domains.
- Receipt interpolation uses HTML escaping at the reviewed `innerHTML` sinks.

**Gaps**

- Admin, vendor, and customer session/token implementations differ. Customer has request timeouts; vendor/admin do not consistently do so.
- Security-critical auth state and refresh tokens are browser-readable.
- CSP substantially weakens XSS containment.
- Local-storage cached permissions are acceptable only for rendering; the UI must never treat them as authority. Current backend guards must remain canonical.
- Root TypeScript config has `allowJs` with `checkJs: false`, leaving much of the legacy JavaScript outside static checking.
- No functioning lint or automated accessibility gate.

**Decision:** keep the four apps. Share only a small session transport and API error/idempotency layer after moving to HttpOnly sessions. A frontend consolidation project is not required for production safety.

### 5.2 APIs and backend logic

**What works**

- Dedicated Fastify backend has centralized errors, correlation IDs, schema validation, route policy checks, audit hooks, CORS validation, safe money-write flags, and graceful shutdown.
- Canonical financial mutations are identifiable and proxied to the wallet backend.
- Supabase calls have timeouts; retries are limited to read-safe operations.
- Wallet operations use deterministic idempotency and database RPCs for atomic holds/payment fulfillment.

**Gaps**

- The legacy `api/reference.js` combines auth, proxying, cron, cache, local DB, reporting, wallet compatibility, notifications, uploads, and governance in one function. A failure or deploy affects all those concerns.
- Canonical proxying occurs before legacy rate limiting and before its common body processing.
- Legacy parsing silently converts invalid JSON into `{ raw }` rather than rejecting malformed JSON at the trust boundary.
- Optional persistence is awaited on many response paths, increasing latency and coupling availability to nonessential storage.
- Live/sample/cache fallbacks can make unavailable upstream data appear valid unless every consumer inspects `_proxy.source`.

**Decision:** route all new wallet work through the dedicated backend. Freeze legacy feature growth and retire one domain at a time, starting with financial and authentication flows.

### 5.3 Database and storage

**What works**

- PostgreSQL/Supabase is the canonical wallet store.
- Ledger/hold/idempotency RPCs use uniqueness constraints and row locks.
- The July full RLS migration establishes database-backed role and tenant helpers rather than trusting JWT user metadata.
- Data retention functions and storage buckets are represented in migrations.

**Gaps**

- The service-role client bypasses RLS for nearly all backend operations. That is normal for a trusted backend, but it makes route/service authorization and query scoping the only tenant barrier.
- Migration provenance is confused across projects, and no checked-in Supabase project configuration/baseline was found.
- Production fallback to SQLite/memory creates divergent, non-durable state.
- The untracked quota migration is destructive and monolithic.
- There is no repository evidence of database backup verification, restore verification, or schema drift checks against live production.

**Decision:** keep Supabase and the existing atomic RPC pattern. Do not add another database. Remove production local-write fallback and repair migration provenance.

### 5.4 Authentication and permissions

**What works**

- Dedicated backend validates Supabase access tokens with `auth.getUser`, then resolves active staff/vendor/customer records.
- Vendor organization approval, station scope, customer status, KYC tier, password-reset requirement, and MFA are server-enforced.
- Dedicated MFA runtime tests passed.
- Legacy CRM cookies are HttpOnly, Secure in deployed environments, SameSite Strict, and have idle plus absolute expiry.
- Database RLS uses database mappings for current role/tenant in the strongest migration.

**Gaps**

- Legacy session signing fails open to a known secret.
- Dedicated portals still transmit bearer tokens from Web Storage.
- Staff roles are a fixed allowlist in the auth plugin; dynamic permissions exist elsewhere. Drift between role catalogs is possible.
- A service-role client resolves authorization context, so every route must consistently apply a pre-handler and scope queries. Structural tests reduce but do not eliminate this risk.

**Decision:** fail closed on session configuration, converge portals on server cookies, and retain database/route authorization tests for every new mutation.

### 5.5 Hosting and deployment

**What works**

- Vercel configuration defines build output, serverless function limits, cron routes, security headers, API no-store policy, and portal rewrites.
- Preview and production safety flags are described.
- Main branch deployments have recent green CI evidence.

**Gaps**

- Live deployment could not be smoke-tested from the repository configuration.
- No versioned production project binding, DNS/TLS configuration, region selection, function concurrency/maximum instance policy, log drain, or firewall policy was available.
- CSP pins one Supabase project hostname in source, increasing environment drift risk.
- `api/reference.js` is a single large blast radius with a 300-second maximum duration.

**Decision:** keep Vercel. Add only the missing project/runbook evidence and edge controls; do not introduce Kubernetes or a second hosting provider.

### 5.6 Cloud and compute

**What works**

- Managed serverless compute plus managed Postgres minimizes operational surface.
- Dedicated worker code has bounded concurrency, retries, exponential backoff, retention limits, and graceful shutdown.

**Gaps**

- Deployed serverless mode disables Redis queues while worker/runbooks still refer to BullMQ and Fly.
- It is unclear whether Supabase Cron or the standalone worker owns each maintenance schedule. Duplicate ownership risks double execution; absent ownership risks missed execution.
- Docker/Compose is suitable for local development, not hardened production.

**Decision:** designate exactly one scheduler for every job in an ownership table. In the current Vercel design, use Supabase Cron for durable schedules and database idempotency; run BullMQ only if a persistent worker is actually deployed.

### 5.7 CI/CD and version control

**What works**

- Frozen pnpm installs, Node 22, builds, type checks, contracts, browser setup, security baseline, and hardening checks exist.
- Main branch protection is strict about current checks and history.

**Gaps**

- Browser QA and E2E integrity are non-blocking.
- Wallet CI only runs on selected paths; changes to shared root API/deployment files can miss wallet-specific gates.
- Required review count is zero; no CODEOWNERS.
- Dependency/security scanning and release artifact provenance are absent.
- Monitoring smoke is manual and can silently skip when variables are missing.

**Decision:** make the current tests truthful before adding new tooling. Remove `continue-on-error`, require one reviewer for money/security/database paths, schedule smoke tests, then add a single dependency/SAST scanner.

### 5.8 Security and RLS

**What works**

- RLS is enabled broadly; July helpers use safe `search_path` handling and database mappings.
- Anonymous grants and public function execution are revoked in the full baseline.
- Service-role credentials are not tracked in Git.
- CORS allowlists, HSTS, clickjacking, MIME-sniffing, referrer, and permissions headers exist.
- Webhook, SMS, MFA, route permission, and auth tests are extensive.

**Gaps**

- Foreign migration creates broad authenticated CRUD policies.
- Service-role operations bypass RLS and therefore need exhaustive backend scoping.
- CSP permits unsafe script execution.
- No automated secret/SAST/dependency/container scanning gate.
- Known dependency advisories remain.
- The hard-coded session secret and unbounded body parser are direct security defects.

**Decision:** repair the concrete defects first. A new security framework is unnecessary.

### 5.9 Rate limiting

**What works**

- Both backends contain limiter code; dedicated backend can use Redis.
- SMS/OTP-specific guardrails exist.
- k6 auth and purchase scripts define latency/error thresholds.

**Gaps**

- Canonical proxy ordering bypasses the legacy limiter.
- Serverless counters are process-local.
- Internal injection does not preserve verified client address.
- Dedicated backend uses `trustProxy: isDev`, which is unlikely to be correct behind a production reverse proxy.
- One global 200/minute limit is not appropriate for login, OTP, financial writes, exports, and read-heavy dashboards.

**Decision:** one shared edge/Redis limiter, route groups, and verified proxy identity. Do not maintain two limiter implementations.

### 5.10 Caching and CDN

**What works**

- API responses receive `no-store`, appropriate for authenticated financial and operational data.
- A long immutable cache is used for the wallet email/logo asset.
- Application fallback cache is restricted to selected read paths.

**Gaps**

- Fallback cache never applies TTL despite an `expires_at` schema column.
- Cache keys include query/body but not clearly actor/tenant/station identity. Authorization usually scopes the upstream call, but a shared cache key can cross scopes if payloads collide.
- Static portal assets have no explicit repository cache policy or bundle budget evidence.
- Sample fallback may disguise an outage as data.

**Decision:** keep authenticated API data out of CDN caches. Add actor/tenant scope and hard TTL to the application cache; return explicit stale metadata and warning headers.

### 5.11 Load balancing and scaling

**What works**

- Vercel handles HTTP distribution and static delivery.
- Stateless dedicated endpoints and Supabase storage can scale horizontally.
- Load-test scripts exist.

**Gaps**

- Rate, gateway acknowledgement/silence, privacy, and feature state remain process-local in legacy services.
- No recent load-test result or capacity model is checked in.
- No explicit DB connection/concurrency budget or upstream protection budget was found.
- Long Vercel functions and large in-memory exports can amplify concurrency cost.

**Decision:** externalize only correctness-critical state. Let Vercel load-balance; do not add a custom load balancer. Prove capacity with the existing k6 scripts after rate-limit correction.

### 5.12 Error tracking and logs

**What works**

- Dedicated backend logs JSON in production and emits correlation IDs.
- Central error handler hides 5xx internals.
- Audit taps and database audit tables exist.
- Client error capture exists locally.

**Gaps**

- No external error aggregation, metrics, traces, paging, or retention evidence.
- Legacy logs are ad-hoc `console` markers and sometimes omit structured context.
- Production log review succeeds with zero files.
- Audit-log failure can fall back to ephemeral storage and remain invisible.

**Decision:** connect Pino/Vercel logs to one managed destination and connect frontend/backend errors to one tracker. Alert on outcomes, not every log line.

### 5.13 Availability and recovery

**What works**

- Dedicated `/health`, `/ready`, and `/version` endpoints exist. Readiness checks database and Redis with a Redis timeout.
- Worker jobs have retry/backoff and finite history.
- Several incident runbooks exist.

**Gaps**

- The Docker health check uses liveness, not readiness; a process with a dead database still reports healthy.
- Database readiness query has no explicit timeout around Supabase.
- Live uptime monitoring is manual.
- Runbooks reference incompatible architectures and unverified PITR.
- No declared RPO/RTO, restore test, failover exercise, or immutable incident timeline store.

**Decision:** define targets, schedule probes, verify backups, and run a restore drill. Multi-region active-active is not justified yet.

## 6. Remediation roadmap

### 0–48 hours: contain

1. Keep all money/live write flags disabled.
2. Replace fallback session secret with fail-fast required `SESSION_SECRET`; rotate sessions.
3. Disable all production local-write fallbacks.
4. Quarantine `20260725100000_database_quota_resolution.sql`; do not apply it.
5. Put shared rate limiting in front of canonical wallet routes and verify client IP handling.
6. Patch `postcss`; document/contain ExcelJS exposure.
7. Configure a real production smoke target and a log/error destination.

### Days 3–7: make the release gate truthful

1. Add request body limits and reject malformed JSON.
2. Remove `continue-on-error` from browser/E2E jobs; make missing smoke variables fail scheduled/production workflows.
3. Require one approving review and CODEOWNERS for `api/`, `backend/wallet/`, `supabase/migrations/`, `vercel.json`, and workflows.
4. Standardize CI/local installs on pnpm and remove stale npm lock use after confirming no consumer needs it.
5. Repair migration provenance with a forward-only correction.
6. Add cache TTL plus actor/tenant scope.
7. Correct runbooks to Vercel + Supabase Cron or document the actual persistent worker deployment.

### Days 8–30: prove operations

1. Move portal auth to HttpOnly server sessions and tighten CSP.
2. Add managed error tracking, log drain, service metrics, and paging.
3. Verify Supabase backups/PITR entitlement and complete an isolated restore drill.
4. Run k6 against staging with production-like limits; record p95, error rate, DB load, and rate-limit behavior.
5. Freeze new legacy handler features and move financial/auth routes fully to the dedicated backend.
6. Add minimal infrastructure documentation or code for Vercel, Supabase, Redis/cron, DNS, alerts, and backups.

## 7. Production operations playbook

### 7.1 Ownership and severity

Assign named people in the incident system; do not leave role names unstaffed.

| Role | Responsibility |
|---|---|
| Incident commander | Declares severity, coordinates, owns timeline and decisions |
| Operations lead | Vercel, DNS, firewall, deploy/rollback |
| Application lead | API/frontends, feature/write flags, logs |
| Data lead | Supabase, migrations, backups, reconciliation |
| Finance lead | Money-write freeze, settlement/refund approval, ledger sign-off |
| Communications lead | Internal/customer/vendor updates |

| Severity | Definition | Acknowledge target | Update cadence |
|---|---|---:|---:|
| SEV-0 | Confirmed compromise, incorrect balances, duplicate/lost money, destructive DB event | 5 min | 15 min |
| SEV-1 | Major outage, widespread auth/payment/vending failure, DB unavailable | 10 min | 30 min |
| SEV-2 | Degraded feature, elevated errors/latency, stale nonfinancial data | 30 min | 60 min |
| SEV-3 | Minor issue, workaround exists, no security/data risk | Business hours | Daily |

### 7.2 Proposed service objectives

These are launch defaults and require business approval:

- Wallet read/API availability: 99.9% monthly.
- Financial mutation correctness: no known duplicate or unbalanced ledger entry.
- API p95: under 500 ms for ordinary reads; under 2 s for payment/token orchestration excluding third-party completion.
- 5xx rate: under 1% over five minutes; page above 5% for five minutes.
- Database RPO: 15 minutes for ledger/payment data.
- Database RTO: 60 minutes for wallet writes; 4 hours for nonfinancial reporting.
- Queue age: under 5 minutes for notifications; under 10 minutes for maintenance/payment sweeps.

If the current Supabase plan cannot meet the RPO, upgrade the plan or adopt verified encrypted logical backups before enabling money writes.

### 7.3 Pre-deployment checklist

**Change controls**

- [ ] PR identifies affected layer(s), risk, rollback, data impact, and owner.
- [ ] One reviewer approves; finance/data reviewer approves money or migration changes.
- [ ] No unresolved security or data-integrity P0/P1 for the changed path.
- [ ] `git status` contains only intended files; no `.env`, database, generated secret, or local artifact.
- [ ] Node 22 and pnpm 10.28.0 are in use.

**Required local/CI gates**

```powershell
npm.cmd run node:verify
corepack.cmd pnpm install --frozen-lockfile
npm.cmd run typecheck
npm.cmd run test:security
npm.cmd run test:wallet
npm.cmd run hardening:audit
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

- [ ] Browser and relevant E2E tests passed without `continue-on-error`.
- [ ] Dependency findings are fixed or have a current owner, exposure statement, expiry date, and compensating control.

**Database gate**

- [ ] Migration is tracked, forward-only, idempotent where practical, and belongs to this Supabase project.
- [ ] No `USING (true)`/`WITH CHECK (true)` policy without explicit public/authenticated justification.
- [ ] Destructive statements list expected affected rows and retention approval.
- [ ] Backup/restore point exists and was verified before destructive work.
- [ ] Migration ran on a production-size clone; lock time and runtime are within the window.
- [ ] Post-migration RLS, grants, row counts, and key ledger invariants have queries ready.

**Configuration gate**

- [ ] Required secrets exist in the target environment; values were not copied into source or chat.
- [ ] `SESSION_SECRET`, service-role, payment, webhook, cron, encryption, and upstream credentials have owners and rotation dates.
- [ ] Preview cannot forward production money writes.
- [ ] Production write flags remain false for deployment.
- [ ] Production smoke URL, protection bypass, log drain, and paging destination are configured.

### 7.4 Deployment sequence

1. Announce the change window and incident channel.
2. Record current deployment ID, Git SHA, database migration version, feature flags, queue depths, and baseline error/latency rates.
3. If a migration is involved, create/verify the restore point.
4. Apply additive/backward-compatible database changes first.
5. Verify RLS/grants and database health.
6. Deploy the dedicated backend with money writes disabled.
7. Verify `/health`, `/ready`, and `/version`; confirm the expected SHA.
8. Deploy frontends.
9. Run unauthenticated, staff, vendor, and customer smoke flows.
10. Run a nonfinancial read and verify live—not sample/cache—provenance.
11. Run one approved staging/synthetic financial flow with a unique idempotency key.
12. Watch errors, latency, DB, rate limits, queue age, and reconciliation for at least 15 minutes.
13. Enable money-write flags only with application, data, and finance approval.
14. Record evidence and close the window.

### 7.5 Post-deployment smoke matrix

| Check | Expected |
|---|---|
| `/health` | 200, correct service |
| `/ready` | 200, database/Redis checks healthy for the deployed mode |
| `/version` | Expected Git SHA/build |
| Unauthenticated admin/customer/vendor read | 401 |
| Invalid role/station access | 403 or empty scoped result, never foreign data |
| Staff MFA-required action | Challenge enforced |
| Customer/vendor login and refresh | Session succeeds; revoked/expired token fails |
| CORS from approved origin | Allowed with correct credentials policy |
| CORS from unapproved origin | Rejected |
| Oversized/malformed request | 413/400 before business logic |
| Repeated idempotency key, same payload | Same safe result, no duplicate ledger effect |
| Repeated idempotency key, different payload | Rejected |
| Rate-limit burst | 429 plus `Retry-After`; other clients unaffected |
| Payment webhook replay | Verified and idempotent |
| Upstream outage | Explicit degraded response; no silent sample presented as live |
| Audit event | Durable Supabase record with actor, request/correlation ID, outcome |
| Reconciliation | Balanced; no unexplained mismatch |

### 7.6 Go/no-go rules

**No-go immediately if:**

- any session uses the fallback signing secret;
- any production mutation can fall back to SQLite/memory;
- RLS or tenant-scope test exposes another actor's data;
- money-write idempotency or ledger invariants fail;
- database backup/restore point is unverified for destructive work;
- rate limiting does not work across instances;
- error tracking/logging cannot show the result of the deployment;
- smoke traffic is served from sample/indefinitely stale cache unexpectedly.

### 7.7 Universal incident procedure

1. **Declare:** assign severity, incident commander, channel, and timestamp.
2. **Contain:** for SEV-0/SEV-1 affecting money or integrity, disable all three write controls immediately.
3. **Preserve:** record deployment ID, Git SHA, feature flags, correlation IDs, audit rows, provider events, and relevant logs. Do not paste secrets or full sensitive payloads.
4. **Assess:** determine blast radius by time, actor, tenant/station, route, payment reference, and deployment.
5. **Stabilize:** rollback application first when schema remains compatible; otherwise use the prepared forward fix. Never improvise a down migration on live financial tables.
6. **Verify:** run auth/RLS/idempotency/reconciliation checks before restoring writes.
7. **Communicate:** state impact, containment, next update time, and workaround. Avoid unsupported root-cause claims.
8. **Recover:** re-enable writes gradually with finance/data approval.
9. **Review:** publish a blameless timeline, root cause, detection gap, corrective owners, and due dates within two business days.

### 7.8 Incident playbooks

#### A. Suspected credential/session compromise — SEV-0

1. Disable money/live writes and block affected routes/IPs at the edge.
2. Rotate the exposed credential in this order: application session secret, provider/API token, webhook/cron secret, service-role key, encryption key only with a tested data re-encryption plan.
3. Revoke Supabase sessions for affected users and force reauthentication/MFA.
4. Search audit/auth logs by user, IP, correlation ID, route, station, and time window.
5. Reconcile every affected wallet/payment/token operation.
6. Deploy the new secret and verify old sessions/signatures fail.
7. Notify privacy/legal/leadership according to confirmed exposure and jurisdiction.

#### B. Database unavailable or degraded — SEV-1

1. Disable writes; do not allow local fallback.
2. Check provider status, `/ready`, DB latency, connection usage, long queries, locks, storage, and recent migrations.
3. Stop nonessential sync/backfill/export jobs.
4. If caused by a deploy, rollback application. If caused by migration, use the pre-approved forward fix or provider restore process.
5. After recovery, run ledger invariants, payment reconciliation, missed-job recovery, and RLS checks before enabling writes.

#### C. Incorrect balance, duplicate debit/credit, or ledger mismatch — SEV-0

1. Disable all financial writes and payment/webhook fulfillment.
2. Do not edit balances directly.
3. Identify affected idempotency keys, holds, ledger entries, payment references, and purchase orders.
4. Preserve rows and provider responses; run reconciliation in read-only mode.
5. Correct through an approved compensating ledger entry/RPC with dual approval.
6. Verify wallet balance equals ledger sum and provider settlement totals.

#### D. Payment provider or token engine outage — SEV-1

1. Keep accepted payment state distinct from token-delivery state.
2. Stop new purchases if fulfillment cannot be guaranteed; keep status reads available.
3. Queue/retry only idempotent status and fulfillment operations.
4. Never issue a second token/payment request with a new idempotency key for the same customer action.
5. Reconcile pending transactions after provider recovery; notify affected users with references, not secrets/tokens in logs.

#### E. Rate-limit abuse or traffic spike — SEV-1/2

1. Confirm whether traffic is attack, retry storm, or legitimate load.
2. Apply temporary edge limits by route and verified identity/IP; block obvious abusive sources.
3. Protect login, OTP, payment, vending, export, and webhook routes first.
4. Watch false positives by client/tenant and provider webhook delivery.
5. Remove temporary rules only after shared counters and origin health stabilize.

#### F. Stale or incorrect cached/sample data — SEV-2, SEV-0 if financial

1. Disable fallback cache/sample serving for the affected route.
2. Mark UI/API degraded; never label fallback data as live.
3. Purge the scoped cache key after verifying actor/tenant isolation.
4. Restore upstream, repopulate cache with TTL, and compare against source.
5. If financial decisions used stale data, escalate to SEV-0 and reconcile.

#### G. Redis/worker outage — SEV-1/2

1. Confirm whether the deployed architecture actually uses BullMQ or Supabase Cron for the affected job.
2. Stop duplicate schedulers.
3. Inspect queue age, failed jobs, retries, and Redis memory/persistence.
4. Restore one worker, verify idempotency, then scale gradually.
5. Reconcile missed payments/holds/refunds/notifications by durable database state, not queue history alone.

#### H. Bad deployment — SEV-1

1. Keep writes disabled or disable immediately.
2. Roll back to the recorded last-known-good Vercel deployment if schema is backward compatible.
3. If schema is not backward compatible, deploy the prepared forward-compatible fix.
4. Run the post-deploy matrix and verify expected SHA before restoring traffic/writes.

### 7.9 Database backup and restore playbook

#### Before launch

- Confirm Supabase backup schedule, retention, PITR window, storage coverage, and restore procedure in the actual project/plan.
- Store encrypted logical backups outside the primary project if managed backups do not meet the proposed 15-minute RPO.
- Include schema, functions, policies, grants, sequences, auth mappings required for recovery, and storage-object inventory.
- Never treat `/tmp` SQLite as a production backup.

#### Quarterly restore drill

1. Select a backup without exposing production secrets to the drill environment.
2. Restore to an isolated Supabase project/network.
3. Apply only migrations newer than the restore point.
4. Verify schema version, RLS/grants, row counts, ledger invariants, payment references, storage object counts, and application smoke.
5. Record actual RPO/RTO, failures, owner, and corrective due dates.
6. Destroy the drill environment through the approved data-disposal process.

#### Restore decision

- Prefer application rollback for code defects.
- Prefer forward database fixes for compatible schema defects.
- Use point-in-time/full restore only for confirmed destructive/corrupting events with data and finance approval.
- Before restore, record the last known-good timestamp and export post-timestamp transactions for reconciliation/replay.

### 7.10 Monitoring and alert minimums

| Signal | Warning | Page |
|---|---:|---:|
| API 5xx | >1% for 5 min | >5% for 5 min |
| API p95 | >1 s for 10 min | >2 s for 10 min |
| `/ready` | one failure | 3 consecutive failures |
| Auth failures | 3x baseline | 10x baseline or cross-tenant anomaly |
| Rate-limit responses | 2x baseline | sustained legitimate-client impact |
| Payment/token pending age | >5 min | >15 min |
| Queue age | >5 min | >15 min |
| Reconciliation mismatch | any small mismatch | any material/unknown mismatch |
| Audit persistence failure | any | immediate |
| Stale/sample fallback | any unexpected use | financial/tenant-sensitive route |
| DB storage/connection use | >70% | >85% |
| Backup/cron job | late | missed/failed |

Every alert must include environment, service, route/job, correlation/reference ID, first/last seen time, and runbook link. Never include bearer tokens, refresh tokens, OTPs, card data, passwords, or unredacted identity documents.

### 7.11 Weekly operating review

- [ ] Production smoke and uptime evidence exists.
- [ ] Error budget, p95, 5xx, auth failures, and rate limits reviewed.
- [ ] Payment/token pending queues and reconciliation are clean.
- [ ] Backup and cron jobs succeeded.
- [ ] Dependency/security alerts triaged with owners and expiry dates.
- [ ] Failed audit persistence or stale fallback usage is zero.
- [ ] Upcoming migrations have restore evidence and retention approval.
- [ ] Access review covers super-admin, service-role, Vercel, Supabase, GitHub, payment, SMS, and email providers.

### 7.12 Monthly/quarterly controls

**Monthly**

- Rotate short-lived automation/test credentials; review rotation age of long-lived provider secrets.
- Review staff/vendor roles, inactive accounts, MFA enrollment, and break-glass access.
- Run staging load tests and compare against capacity budget.
- Review Vercel/Supabase spend, function duration, DB growth, and retention execution.

**Quarterly**

- Restore a backup to isolation and measure RPO/RTO.
- Exercise one SEV-0 tabletop: credential theft, ledger mismatch, or destructive migration.
- Test edge limits and webhook replay under multi-instance load.
- Review RLS policies as anon, customer, vendor, each staff role, and service role.
- Confirm runbooks match the actual deployed provider architecture.

## 8. Production readiness exit criteria

General availability with money writes is approved only when all are true:

- [ ] P0-1 through P0-4 are closed with tests/evidence.
- [ ] Production mutations cannot persist to ephemeral storage.
- [ ] Session configuration fails closed and old sessions are rotated.
- [ ] Distributed rate limits pass multi-instance tests.
- [ ] Migration chain provenance is documented and the destructive untracked migration is replaced or abandoned.
- [ ] High dependency findings are fixed or formally contained with expiring acceptance.
- [ ] Browser/E2E/security gates are blocking and one reviewer is required.
- [ ] Live production smoke, error tracking, log drain, paging, and uptime monitor work.
- [ ] Backup entitlement is verified and a restore drill meets approved RPO/RTO.
- [ ] Ledger, payment, webhook replay, auth/MFA, RLS, and tenant-scope checks pass.
- [ ] Finance, data, security, and application owners sign the release record.

## 9. Intentionally not recommended

- No Kubernetes, service mesh, custom load balancer, multi-region active-active database, or new microservices. Vercel, Supabase, and one shared limiter are sufficient at the current evidence level.
- No rewrite of all four frontends. Share only the security-critical session/API pieces.
- No custom observability stack. Use one managed error tracker plus the existing provider/log pipeline.
- No second cache. Correct the existing cache TTL/scope or remove fallback where correctness matters.

The smallest safe architecture is the existing dedicated wallet backend as the single financial control plane, Supabase as the only durable store, Vercel as the HTTP/static platform, and one durable scheduler/limiter path.
