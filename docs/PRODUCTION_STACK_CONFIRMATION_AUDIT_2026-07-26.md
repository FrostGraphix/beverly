# Beverly Production Stack Confirmation Audit

**Confirmation date:** 2026-07-26  
**Purpose:** independent second-pass verification of `PRODUCTION_STACK_AUDIT_AND_PLAYBOOK_2026-07-26.md`  
**Source revision reviewed:** `fe1d35920ebaebb0082221bdfe8cc7016331985e` (`fix/test-timeouts`)  
**Live revision observed:** `5149e828d4d10cb7078550a124433d8713e0ffc8` (`main`, reported by `/api/wallet-service/version`)  
**Production URL safely probed:** `https://beverly.acoblighting.com`  
**Method:** fresh source tracing, exact route-policy comparison, migration-chain review, safe anonymous Supabase reads, safe public HTTP probes, builds, contract tests, browser tests, dependency audit, and control-to-test comparison.

This addendum is deliberately separate from the original report. It records what the second audit confirmed, corrected, or newly found without overwriting the first audit's evidence.

## 1. Confirmation verdict

The original release decision is confirmed: **Beverly is not ready for unrestricted production financial writes.** Read-only operation may continue with active monitoring, but money-write feature flags should remain off until the P0 closure evidence in this document exists.

The second pass improved confidence in several controls:

- anonymous access to each tested live sensitive Supabase table was denied;
- unauthenticated access to the live admin identity endpoint returned `401`;
- database-backed payment leases, idempotent ledger operations, Paystack webhook verification, and MFA controls are substantive rather than cosmetic;
- every application completed a production build.

It also found material issues not captured precisely enough in the first report:

- the live readiness endpoint returns `503` because disabled Redis queues are treated as a failed dependency;
- four real admin mutation routes have no canonical mutation policy and are therefore unreachable;
- the energy/token provider call has no application timeout and cannot distinguish a definite failure from an upstream success whose response was lost;
- the latest source revision fails four advertised smoke/contract checks;
- the public wallet proxy drops dedicated-backend rate-limit and `Retry-After` response headers.

**Reconciled score:** **4.6/10 — high-risk conditional deployment.** This is effectively the same posture as the original 4.7/10. Strong wallet internals do not compensate for inconsistent serverless, legacy, migration, and operational controls.

## 2. Scope boundary and confidence

Two revisions must not be conflated:

| Evidence | Revision | Meaning |
|---|---|---|
| Source and local tests | `fe1d359...` | Current branch after the 2026-07-26 CRM/consumption changes |
| Public production probes | `5149e82...` | Older deployed `main` revision reported by the service itself |

Therefore, live findings describe the currently deployed revision, while source findings describe the newer branch. A deployment of `fe1d359...` still requires a fresh post-deploy verification.

The audit did not mutate production data, submit payments, create users, or invoke destructive functions. Direct inspection of Vercel project settings, Supabase backup/PITR entitlements, database migration history, DNS provider settings, and third-party vendor dashboards was not possible with the available credentials.

## 3. Reconciliation with the first audit

| Original area | Second-pass result | Reconciled conclusion |
|---|---|---|
| Fallback session secret | **Confirmed in source** | The handler still falls back to a public constant. The production checker catches weak/missing values only if it is run; the runtime itself does not fail closed. This weakens server-side session-age/fingerprint integrity but does not by itself forge a Supabase identity token. |
| Supabase-to-local write fallback | **Confirmed in source** | Any remote error can invoke local SQLite/memory persistence. In serverless production this can acknowledge writes that later disappear or diverge. |
| Rate limiting | **Confirmed and strengthened** | Dedicated limits are process-local in serverless mode, injected requests lack a trustworthy public client address, canonical requests bypass the legacy limiter, and public proxy responses omit rate-limit headers. |
| Destructive quota migration | **Confirmed, status corrected** | `20260725100000_database_quota_resolution.sql` is now tracked in Git, so “untracked” is obsolete. It still rewrites all historical `row_json`, deletes old data, and schedules continued cleanup without a backup assertion, batch guard, or verified rollback. |
| Migration provenance | **Confirmed** | `20260708_vapt_security_remediation.sql` targets foreign ERP tables that the following migration says do not belong to Beverly. Those tables are absent from the tested live schema, so no live exposure was found; the risk is a clean-deploy migration failure and unsafe future policy creation. |
| Live RLS exposure | **Not observed in tested scope** | Anonymous reads of `wallets`, `wallet_ledger_entries`, `customers`, `users`, `permissions`, `notifications`, `oem_credentials`, `audit_logs`, and `daily_meter_readings` all failed with PostgreSQL `42501`. This is positive but is not a complete role/policy proof. |
| CSP and browser tokens | **Confirmed** | Live CSP still permits `unsafe-inline` and `unsafe-eval`; bearer/refresh tokens remain browser-readable in application flows. |
| Dependency findings | **Confirmed** | Production dependency audit reports 10 high and 1 moderate vulnerability; `postcss` has a direct fix, while most remaining findings are in the ExcelJS archive chain. |
| Observability/recovery evidence | **Confirmed** | Health code and runbooks exist, but no demonstrated external error pipeline, scheduled public uptime check, backup restore drill, or measured RPO/RTO evidence was found. |

## 4. Critical release blockers (P0)

### P0-1 — Production persistence can silently fall back to ephemeral state

`backend/src/services/storage-adapter.js:121-128` catches a Supabase error and executes the local action. `SESSION_STORE_MODE` also allows production to use local storage if misconfigured.

**Failure mode:** an audit record, account binding, cache record, OEM credential, or other operational write can return success on one function instance and disappear after recycling or be absent from another instance.

**Required closure:**

1. In production, remote mutation failure must return `503`; never execute a local mutation.
2. Production startup must reject non-Supabase persistence mode.
3. Add an integration test that forces Supabase `500` and proves no local record is created.
4. Alert on failed mandatory audit persistence.

### P0-2 — Rate limiting is not a reliable distributed control

The dedicated server adds Redis only when queues are enabled (`backend/wallet/src/server.ts:66-69`). Serverless deployment disables queues, so each warm instance owns its own in-memory buckets. `api/wallet-service.mjs:29-34` injects requests without an explicit trusted remote address. `api/reference.js:4298-4307` proxies canonical wallet traffic before its legacy limiter, and its proxy copy path returns status/body but not the dedicated backend's rate-limit headers.

Safe live requests showed a `200` request limit on the internal health handler, but canonical public API responses did not expose those headers. Per-instance counters are not a fleet-wide protection.

**Required closure:** use a managed distributed limiter keyed by trusted client identity/IP; apply separate account, OTP, login, token-generation, payment, webhook, and admin policies; propagate `429`, `Retry-After`, and rate-limit headers through the public proxy; test across at least two instances.

### P0-3 — Token issuance has an ambiguous financial outcome path

`backend/wallet/src/services/token-engine.ts:72-94` calls the energy provider with bare `fetch` and no `AbortSignal` or application deadline. Purchase services only know a token was issued after a response is received. If the provider accepts and generates a token but the response is lost, `issuedToken` remains null and current catch logic can release a hold or mark a definite failure even though value may have been delivered upstream.

This differs from the better-handled case where a token response was received and later persistence fails; that path correctly uses `delivery_pending_review`.

**Required closure:**

1. Add a bounded provider deadline shorter than the platform timeout.
2. Treat timeout, disconnect, and malformed response after dispatch as `outcome_unknown`, not a definite failure.
3. Keep the financial hold while outcome is unknown.
4. Reconcile by immutable purchase reference before retrying or releasing funds.
5. Prove the provider's idempotency/reference contract with a test double and vendor documentation.
6. Add tests for accepted-then-disconnected, timeout-before-dispatch, duplicate retry, and delayed response.

### P0-4 — The quota migration performs irreversible bulk changes without a deployment safety gate

`supabase/migrations/20260725100000_database_quota_resolution.sql` unconditionally replaces every `daily_meter_readings.row_json` value with `{}`, deletes daily/weekly history older than 90 days, runs cleanup, and installs recurring cleanup.

Tracking the migration solves provenance, not operational safety.

**Required closure:** do not apply it to production until there is a timestamped backup/PITR verification, row-count and byte-impact preview, legal/data-owner approval, bounded batches, lock/statement timeouts, replica/latency monitoring, abort thresholds, and a tested restore procedure. Separate one-time remediation from recurring retention policy.

### P0-5 — Missing session configuration degrades to a known signing value

`api/reference.js:138-142` still returns `beverly-default-session-signing-secret-2026` when no configured secret exists. The production environment checker is useful but is not guaranteed by the runtime or all deployment paths.

**Required closure:** require a dedicated random `SESSION_SECRET` of at least 32 bytes at cold start; remove the fallback; do not reuse the Supabase JWT signing secret; rotate active Beverly sessions; add a deployment test proving startup fails when absent.

## 5. High-priority findings (P1)

### P1-1 — Production reports itself unready

`GET https://beverly.acoblighting.com/api/wallet-service/ready` returned `503` with database healthy and Redis failed: “Redis queues are disabled in development.” The database check took approximately 181 ms. `/health` still returned `200`.

`backend/wallet/src/routes/health.ts:41-48` always checks Redis, while serverless configuration intentionally disables queues. This makes readiness permanently degraded or indicates production is running with a development-mode stub.

**Fix:** readiness must check only required dependencies for the active deployment mode. Report optional queue capability separately. Alert if a production deployment unintentionally selects the development stub.

### P1-2 — Four admin mutations are unreachable

The server fails closed for every `/api/v1` mutation without a canonical policy (`backend/wallet/src/server.ts:71-87`). An exact comparison of all 165 registered mutations against `backend/wallet/src/contracts/route-policy.ts` found four omissions:

- `PATCH /api/v1/admin/access/users/:userId/station`
- `PATCH /api/v1/admin/vendors/:id/station`
- `POST /api/v1/admin/vat-policies`
- `POST /api/v1/admin/vat-policies/:id/approve`

The handlers and admin-permission mappings exist, but the global hook returns `404` before they run. This is a functionality outage, not an authorization bypass.

`tests/route-policy.test.cjs` only checks minimum counts and therefore passes despite the omissions.

**Fix:** add canonical policies and replace count thresholds with an exact assertion that every registered mutation resolves to one policy and every policy resolves to a real route.

### P1-3 — The current revision does not pass its full release suite

`npm run test:full-smoke` built all applications and passed the main unit/contract suite, then failed. Isolated reruns confirmed the failures:

| Check | Result |
|---|---|
| Core backend + CRM + admin + vendor + customer + landing builds | Passed |
| Main `npm test` matrix | Passed |
| CRM browser QA (`vue-app.browser`) | Passed |
| Station alerts browser test | Failed twice: `GW-KYA` alert never became visible |
| Full CRM browser smoke | Failed: `.dashboard-editor-container` did not become visible after login |
| Wallet suite | Failed: admin sidebar account-footer markup contract mismatch |
| Design-system visual audit | Failed: three raw OEM Hub buttons detected |

The latter three checks were run separately because the main script stops at the first failure.

**Fix:** make these blocking in CI, repair the regressions, and require one clean `test:full-smoke` run under Node 22 before release.

### P1-4 — The tracked migration chain is not proven reproducible from zero

`20260708_vapt_security_remediation.sql` directly alters and grants authenticated CRUD on `crm_pipelines`, `crm_activities`, `crm_contacts`, and `crm_tags`. The next migration explicitly identifies those as another ERP project's tables. Safe live REST checks returned `PGRST205` for those foreign tables, meaning they are absent from the current exposed schema.

**Fix:** remove or quarantine the foreign migration from Beverly's chain, create a fresh database from all retained migrations in CI, run schema/RLS assertions, and compare the resulting schema with production before promotion.

### P1-5 — Browser security policy remains permissive

The live CSP includes `unsafe-inline` and `unsafe-eval`. Browser-readable auth tokens increase the consequence of any XSS.

**Fix:** remove `unsafe-eval`, move inline code/styles to nonce/hash-compatible assets, prohibit unsafe rendering sinks, add dependency/content security tests, and prefer secure `HttpOnly`, `SameSite` cookies for application sessions where architecture permits.

### P1-6 — Release governance does not require enough independent evidence

The first audit confirmed zero required approving reviews, no repository CODEOWNERS, non-blocking browser/E2E jobs, and a manual-only monitoring workflow. The new reproducible browser/contract failures demonstrate why green minimum checks are insufficient.

**Fix:** require at least one approving reviewer (two for auth/money/migrations), add CODEOWNERS for sensitive paths, make full smoke/security checks mandatory, schedule public monitoring, and block deployments when readiness is not green.

### P1-7 — Recovery claims are not demonstrated

No evidence was found of a timed database restore, application configuration restore, secret recovery, or reconciliation drill. The destructive migration increases the urgency.

**Fix:** define service RTO/RPO, enable and verify PITR/backups, restore into an isolated project quarterly, run ledger/reconciliation invariants, record actual recovery time and data gap, and keep the evidence with incident ownership and expiry date.

## 6. Medium-priority findings (P2)

- **Profile-image scanning fails open.** `backend/wallet/src/services/file-scan.ts:7-17` returns success with mode `disabled` when no scan command exists, and production configuration does not require it. Prefer server-side image decode/re-encode and fail closed when validation cannot complete.
- **Webhook audit exclusion is misspelled.** `backend/wallet/src/plugins/audit-tap.ts:23` skips `/api/v1/webhooks/`, while the registered prefix is `/api/v1/webhook`; this can create duplicate/noisy audit records.
- **Frontend payload is heavy.** The CRM build produced approximately 874 KB main JS, 938 KB ECharts JS, and 533 KB CSS before gzip. Vite also warned that `src/services/api.js` is both statically and dynamically imported, preventing the intended split.
- **Production dependencies remain vulnerable.** The current audit reports 10 high and 1 moderate advisory. Patch `postcss` immediately, isolate workbook parsing from untrusted inputs, and plan an ExcelJS/archive-chain replacement or verified upgrade.
- **Runtime mismatch reduces local confidence.** Verification ran on Node 24.13.1 while the repository requires Node 22. CI/release evidence must be generated on Node 22; local Node 24 results are supplemental.
- **Logging checks can pass without logs.** A production-log review of zero files is not health evidence. Require a minimum time window, source identifier, and event count or fail as “no evidence.”

## 7. Revised 13-layer scorecard

| Layer | Score | Second-pass conclusion |
|---|---:|---|
| 1. Frontend foundations | 5/10 | Builds pass, but browser/visual regressions, large bundles, mixed import strategy, and permissive CSP remain. |
| 2. APIs and backend logic | 4/10 | Good dedicated service design; four dead mutations and ambiguous token-provider outcomes are release-relevant. |
| 3. Database and storage | 5/10 | Atomic wallet controls are strong; ephemeral fallback and destructive retention are unsafe. |
| 4. Auth and permissions | 5/10 | Live unauthenticated denial and MFA are positive; runtime fallback secret and browser token exposure remain. |
| 5. Hosting and deployment | 5/10 | Public service is reachable, but deployed code lags the audited branch and readiness is red. |
| 6. Cloud and compute | 4/10 | Serverless mode conflicts with Redis/readiness/rate assumptions; provider calls lack a bounded deadline. |
| 7. CI/CD and version control | 5/10 | Extensive checks exist, but the current branch fails full smoke and critical checks are not all blocking. |
| 8. Security and RLS | 5/10 | Tested anonymous sensitive-table reads are denied; migration provenance, CSP, fail-open scan, and advisories remain. |
| 9. Rate limiting | 2/10 | A limiter exists but is not a reliable distributed public control. |
| 10. Caching and CDN | 4/10 | Static CDN works; stale application cache and proxy/header behavior remain weak. |
| 11. Load balancing and scaling | 4/10 | Vercel can scale, but process-local state and synthetic injected client identity undermine consistency. |
| 12. Error tracking and logs | 3/10 | Structured logging exists; external ingestion, alert evidence, and meaningful log review are not demonstrated. |
| 13. Availability and recovery | 2/10 | Live readiness is `503`; no restore-drill evidence or validated RTO/RPO was found. |

## 8. End-to-end remediation playbook amendments

These steps amend the full playbook in the original audit. Execute in order; do not enable financial writes early.

### Phase A — Immediate containment (same day)

**Owner:** incident commander + backend lead + platform lead

1. Confirm all money-write flags remain disabled in production.
2. Treat `/ready = 503` as an active production defect; verify whether Redis/queues are intentionally disabled.
3. Freeze the quota migration and any manual cleanup until backup/restore evidence is approved.
4. Record deployed SHA, configuration mode, Supabase project ID, current schema migration version, and active feature flags in the incident log.
5. Add temporary alerting for payment rows stuck in processing/dispatching and holds approaching expiry.

**Exit:** no unrestricted financial write path is enabled; production mode is documented; destructive work is frozen.

### Phase B — Correct money and identity invariants (24–72 hours)

**Owner:** wallet/backend + security

1. Remove the public session-secret fallback and rotate sessions.
2. Make production persistence fail closed.
3. Implement distributed rate limits and proxy all rate headers.
4. Add energy-provider deadlines and the `outcome_unknown` state with reconciliation-by-reference.
5. Add the four missing route policies and exact route-policy completeness test.
6. Correct readiness so optional disabled dependencies do not fail it, while accidental development mode still does.

**Exit:** targeted adversarial/integration tests pass, `/ready` is green, and no money path can convert an unknown external result into a definite failure/release.

### Phase C — Database and RLS proof (2–5 days)

**Owner:** database lead + security reviewer

1. Build an empty temporary Supabase/Postgres environment from the full retained migration chain.
2. Remove/quarantine foreign ERP migrations.
3. Enumerate every table, view, function, grant, owner, and RLS policy for `anon`, `authenticated`, and `service_role`.
4. Run tenant/station isolation tests with real JWT claims, not only anonymous probes.
5. Preview destructive retention counts and bytes; obtain data-owner approval.
6. Restore the latest backup into isolation and run wallet/ledger/reconciliation invariants.

**Exit:** zero-to-current migration succeeds; cross-tenant tests deny access; restore evidence meets approved RPO/RTO; destructive retention has signed approval.

### Phase D — Release gate repair (2–5 days)

**Owner:** frontend + QA + repository administrator

1. Fix the station alert, CRM login smoke, wallet sidebar contract, and OEM visual audit failures.
2. Run `npm run test:full-smoke` on Node 22 from a clean install.
3. Make full smoke, exact route policy, production environment review, dependency policy, and migration-from-zero mandatory checks.
4. Require CODEOWNERS review for `api/`, `backend/wallet/`, auth, payments, and `supabase/migrations/`.
5. Patch PostCSS and document accepted risk/containment for any remaining dependency advisory with an expiry date.

**Exit:** one immutable candidate SHA passes all blocking checks with no `continue-on-error` on release-critical jobs.

### Phase E — Controlled deployment and verification

**Owner:** release manager + operations

1. Deploy the exact approved SHA to staging with production-equivalent configuration.
2. Verify headers, readiness, auth denials, RLS isolation, rate limiting across instances, webhook replay/idempotency, and ambiguous token reconciliation.
3. Deploy to production with writes still disabled.
4. Confirm `/version` equals the approved SHA and `/ready` is `200` for 30 minutes.
5. Enable internal/canary writes only; execute a small approved test purchase and reconcile wallet, ledger, payment, token, receipt, and audit records.
6. Expand gradually with abort thresholds for errors, latency, mismatch, duplicate fulfillment, stuck holds, and readiness.

**Exit:** canary financial flows reconcile exactly and monitoring remains within thresholds for the agreed soak period.

### Phase F — Ongoing operations

**Daily:** readiness/latency, failed webhooks, stuck holds/purchases, ledger imbalance, auth/rate anomalies, storage/audit failures.  
**Weekly:** dependency changes, privileged-user review, route-policy drift, capacity/quota trend, failed scheduled jobs.  
**Monthly:** access recertification, secret/key age, CSP report review, cost/capacity forecast, incident action closure.  
**Quarterly:** isolated restore drill, disaster exercise, tenant/RLS penetration tests, vendor timeout/idempotency proof, RTO/RPO measurement.

## 9. Go/no-go checklist

Financial writes are **NO-GO** unless every item is evidenced for the exact deployed SHA:

- [ ] No known/fallback session secret; session rotation completed.
- [ ] Production mutations cannot fall back to local storage.
- [ ] Distributed limiter works across instances and public headers are preserved.
- [ ] Token-provider ambiguous outcomes remain held and reconcile by reference.
- [ ] All registered mutations resolve to exact route policies.
- [ ] `/health` and `/ready` are green for the active production mode.
- [ ] Clean migration from zero succeeds; foreign ERP migration removed/quarantined.
- [ ] Tenant/station RLS tests pass for anonymous, customer, vendor, staff, and service roles.
- [ ] Quota cleanup has backup, approval, bounded execution, monitoring, and restore proof.
- [ ] Full smoke passes on Node 22; browser, wallet, and visual checks are blocking.
- [ ] Dependency policy passes or each exception has owner, containment, and expiry.
- [ ] External logs/metrics/alerts are receiving real production events.
- [ ] Restore drill meets documented RTO/RPO.
- [ ] `/version` matches the approved candidate and canary reconciliation is exact.

## 10. Final confirmation

The second audit **confirms the first audit's central conclusion** and narrows its claims:

- no anonymous live exposure was observed for the tested sensitive tables;
- the destructive migration is now tracked, but remains unsafe to apply without controls;
- the production smoke utility lacked its bypass variable, but direct safe production verification was possible;
- the greatest remaining risks are consistency and failure semantics across legacy/serverless/storage/provider boundaries, not the absence of basic wallet controls.

Until the checklist above passes, the defensible production posture is **read-only plus monitored authentication**, with financial and destructive operations disabled.
