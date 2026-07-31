# Beverly Split Production Hardening Execution Plan

**Date:** 2026-07-26  
**Baseline:** `fe1d35920ebaebb0082221bdfe8cc7016331985e`  
**Purpose:** separate remediation that can occur while production financial writes remain available from remediation requiring an endpoint-specific pause or restricted canary.

This plan supersedes the earlier blanket assumption that every production write must remain disabled for the full remediation period. The business can continue operating. Only affected high-risk financial endpoints are paused, and only during their controlled cutover.

## 1. Operating rule

There are two execution tracks:

- **Track A — writes remain available:** develop, test and deploy without disabling production financial writes. Use blue-green deployment and normal rollback.
- **Track B — affected writes paused:** temporarily disable or restrict only the endpoints whose financial state model, database mutation or provider behavior is changing.

The following services remain available throughout both tracks unless an unrelated incident occurs:

- login and session refresh;
- CRM, dashboards and reports;
- customer/vendor balance and transaction viewing;
- support operations;
- non-destructive administration;
- health, readiness and monitoring endpoints.

## 2. Executive timeline

| Work | Duration | Business effect |
|---|---:|---|
| Track A implementation and deployment | 6–9 working days | No financial-write shutdown |
| Track B implementation in Preview/Staging | 3–5 working days, parallel with Track A | No production shutdown while code is prepared |
| Track B production cutovers | 2–6 hours total, split into windows | Only affected endpoints paused |
| Restricted financial canary | 24–48 hours | Writes continue for approved canary scope |
| Full remediation and rollout | 12–18 working days | Normal operations restored progressively |

The expanded remediation takes 12–18 working days, but expected complete financial-write downtime is **not** 12–18 days. With staged cutovers, the target is **2–6 total hours**.

## 3. Track A — fixes that do not require turning off live writes

### A1. Repair release tests and CI gates

**Goal:** make release evidence truthful without changing production financial behavior.  
**Duration:** 1–2 days.  
**Deployment:** normal blue-green deployment.

- [ ] Fix the `GW-KYA` station-alert browser regression.
- [ ] Fix the full CRM login/dashboard browser smoke.
- [ ] Reconcile the wallet sidebar account-footer contract.
- [ ] Replace the three OEM Hub raw buttons with the existing design-system primitive.
- [ ] Run the full build and test matrix on Node 22.
- [ ] Remove `continue-on-error` from release-critical browser/E2E checks.
- [ ] Make full smoke a required branch-protection check.
- [ ] Add CODEOWNERS and independent review for auth, money and migrations.

**Complete when:** one clean Node 22 run passes build, unit, contract, browser, wallet and visual tests, and CI enforces the same run.

### A2. Fix health, readiness and version reporting

**Goal:** make operational endpoints accurately describe the active deployment mode.  
**Duration:** 0.5–1 day.  
**Affected endpoints:**

- `GET /api/wallet-service/health`
- `GET /api/wallet-service/ready`
- `GET /api/wallet-service/version`

- [ ] Make readiness check only dependencies required by active serverless mode.
- [ ] Report disabled optional queues as capability state, not readiness failure.
- [ ] Fail startup if Production accidentally selects a development queue/Redis stub.
- [ ] Ensure `/version` reports the exact immutable deployment SHA.
- [ ] Add readiness tests for database healthy, database failed, queues disabled and queues required.

**Complete when:** production `/ready` returns `200` in valid serverless mode and `503` only when a required dependency fails.

### A3. Add the four missing mutation policies

**Goal:** restore dead admin endpoints without weakening the fail-closed route hook.  
**Duration:** 0.5–1 day.  
**Affected endpoints:**

- `PATCH /api/v1/admin/access/users/:userId/station`
- `PATCH /api/v1/admin/vendors/:id/station`
- `POST /api/v1/admin/vat-policies`
- `POST /api/v1/admin/vat-policies/:id/approve`

- [ ] Add canonical policies for all four routes.
- [ ] Replace minimum-count testing with exact mutation-to-policy coverage.
- [ ] Test anonymous, wrong-role, wrong-station and correct-role access.
- [ ] Verify one coherent audit event per mutation.

**Complete when:** every registered `/api/v1` mutation resolves to exactly one policy and every policy resolves to a real route.

### A4. Correct webhook audit routing

**Goal:** prevent duplicate/noisy webhook audit records.  
**Duration:** less than 0.5 day.

- [ ] Change the audit exclusion from `/api/v1/webhooks/` to the actual `/api/v1/webhook/` prefix.
- [ ] Add one webhook audit assertion.

**Complete when:** Paystack webhook processing retains its dedicated audit record without an unintended duplicate generic record.

### A5. Harden secrets and sessions

**Goal:** remove insecure configuration fallback without pausing financial endpoints.  
**Duration:** 1 day.  
**Customer effect:** existing users may need to sign in again after rotation.

- [ ] Remove the public fallback session secret.
- [ ] Require a dedicated random `SESSION_SECRET` of at least 32 bytes at cold start.
- [ ] Make the production environment review a mandatory deployment check.
- [ ] Rotate the production session secret during a communicated low-traffic window.
- [ ] Invalidate existing Beverly sessions.
- [ ] Verify login, refresh, idle timeout, absolute timeout, logout and revocation.

**Complete when:** startup fails without a strong secret and sessions signed with the removed fallback are rejected.

Financial writes do not need to be disabled; authenticated customers may need to reauthenticate.

### A6. Remove production local-storage fallback

**Goal:** fail visibly instead of acknowledging an ephemeral write.  
**Duration:** 1 day.  
**Deployment:** blue-green while Supabase is healthy.

- [ ] Make production remote mutation failure return `503` instead of running a local action.
- [ ] Reject local/memory/SQLite production store mode at startup.
- [ ] Keep local fallback only in explicit local/test environments.
- [ ] Add the forced-Supabase-`500` integration test.
- [ ] Alert on mandatory audit/persistence failures.

**Complete when:** a simulated Supabase failure creates no local record and returns a controlled error with correlation ID.

Financial writes remain available while Supabase is healthy. If Supabase fails, affected writes fail safely instead of appearing successful.

### A7. Fix cache expiry and proxy headers

**Goal:** eliminate indefinitely stale fallback responses and preserve backend response controls.  
**Duration:** 1 day.

- [ ] Set `expires_at` on cache writes.
- [ ] Reject expired cache reads.
- [ ] Preserve correlation and safe response headers through `api/reference.js`.
- [ ] Add stale/expired cache tests.

**Complete when:** expired data is never returned as current and proxy responses retain required metadata.

### A8. Improve monitoring and operational evidence

**Goal:** establish production visibility before changing money behavior.  
**Duration:** 1–2 days.

- [ ] Send structured logs to an external retained sink.
- [ ] Add deployment SHA and correlation ID to events.
- [ ] Add dashboards for readiness, latency, errors, persistence and financial states.
- [ ] Schedule public multi-region health/readiness probes.
- [ ] Alert on readiness failure, persistence failure, unknown outcomes, stuck holds and ledger mismatch.
- [ ] Make log review fail when zero events/files are available.
- [ ] Test alert delivery and acknowledgement.

**Complete when:** a synthetic production event appears in logs, dashboards and the alert channel with the correct SHA.

### A9. Frontend, CSP, uploads and dependencies

**Goal:** reduce browser and supply-chain risk without pausing financial writes.  
**Duration:** 2–3 days; may continue after Track B canary.

- [ ] Remove CSP `unsafe-eval`.
- [ ] Replace unsafe inline behavior with hashes/nonces where feasible.
- [ ] Audit browser token-storage and unsafe rendering paths.
- [ ] Validate image magic bytes and decode/re-encode profile images.
- [ ] Fail image activation closed when validation cannot complete.
- [ ] Patch PostCSS.
- [ ] Isolate/replace untrusted ExcelJS workbook processing or document a time-bounded exception.
- [ ] Correct the mixed static/dynamic `api.js` import.
- [ ] Add measured frontend bundle budgets.

**Complete when:** CSP/upload/security tests and the browser/visual suite pass, and no high dependency risk lacks an owner and expiry.

### A10. Graceful error handling and recovery experience

**Goal:** every failure clearly tells the user what happened, whether their action was applied, and the safest next step.  
**Duration:** 2–3 days.  
**Deployment:** additive API response fields and shared frontend behavior; live financial writes remain available.  
**Existing foundation to extend:** `backend/wallet/src/plugins/error-handler.ts`, the three portal API wrappers, portal error views, correlation IDs and client error telemetry.

#### Canonical API error contract

Keep the existing top-level fields for compatibility and add the recovery fields consistently:

```json
{
  "error": "stable_machine_code",
  "message": "Plain-language description of what happened.",
  "whatHappened": "The request was rejected before any change was made.",
  "nextAction": "Correct the highlighted fields and submit again.",
  "retryable": false,
  "correlationId": "server-generated-reference",
  "details": []
}
```

Rules:

- `error` is a stable machine code; never expose raw database/provider messages as the code.
- `message` and `whatHappened` use plain language and state whether a mutation committed, failed before commit, or has an unknown outcome.
- `nextAction` gives one safe action: correct fields, sign in, wait, retry, check status, contact support, or request permission.
- `retryable` is true only when repeating the same request with the same idempotency key is safe.
- `correlationId` is returned on every error, including `404` and proxy/provider errors.
- `details` is allowlisted validation/business detail only; never include stack traces, SQL, secrets, tokens, internal URLs or raw provider payloads.
- Production logs receive the full internal exception under the same correlation ID; users receive the safe contract.

#### Error decision matrix

| Condition | HTTP/code | What happened | What the user should do | Retry rule |
|---|---|---|---|---|
| Invalid input | `400 validation_failed` | Nothing changed; named fields are invalid | Correct highlighted fields | Retry after correction |
| Expired/missing session | `401 unauthenticated` | Request was not authorized; nothing changed | Sign in; preserve intended destination | Retry after authentication |
| MFA required | `403 mfa_required` | Session exists but security verification is incomplete | Complete MFA challenge | Retry automatically once after MFA |
| Permission/station denied | `403 permission_denied` | Action was blocked; nothing changed | Contact administrator or select permitted station | Never blind-retry |
| Missing resource | `404 not_found` | Record no longer exists or is unavailable | Refresh list/check reference | Retry only after refresh |
| Duplicate/concurrent state | `409 conflict` | Another request already changed or is processing the record | Refresh/check existing result | Reuse original idempotency key |
| Business-rule failure | `422 business_rule_failed` | Validation passed but policy prevented the action | Follow the specific corrective instruction | Only after state changes |
| Rate limited | `429 rate_limited` | Request was not processed | Wait the displayed period | Respect `Retry-After` |
| Upstream definite failure | `502 upstream_failed` | Provider rejected before a confirmed result | Check details or try later | Only when marked retryable |
| Temporary dependency failure | `503 temporarily_unavailable` | No durable result was committed | Wait and safely retry | Same idempotency key |
| Request deadline before dispatch | `504 request_timeout` | Request did not reach the provider | Retry when online | Same idempotency key |
| Financial provider outcome unknown | `202 outcome_unknown` or established pending status | Request was sent; final token/payment result is being checked | Do not submit again; view status/contact support with reference | Automatic reconciliation only |
| Unexpected server error | `500 internal_error` | Action could not be confirmed | Do not repeat a money action blindly; use support reference | Based on server status lookup |
| Browser offline/network failure | client `network_error` | App could not confirm whether the server received the request | Restore connection and check transaction status | Never blind-retry money action |
| Client rendering failure | client `ui_error` | Page could not display correctly | Reload once; contact support if repeated | Preserve unsent form data where safe |

#### Backend tasks

- [ ] Extend the existing centralized Fastify error handler; do not add route-specific competing formats.
- [ ] Ensure legacy `api/reference.js` and the wallet proxy normalize errors to the same safe contract.
- [ ] Return correlation ID on validation, authorization, not-found, rate-limit, provider and unexpected errors.
- [ ] Map known database constraint/error codes to stable business codes without exposing schema details.
- [ ] Map provider timeout, rejection and outcome-unknown separately.
- [ ] State mutation outcome explicitly: `not_applied`, `applied`, `pending`, or `unknown`.
- [ ] Preserve idempotency key and correlation ID across proxy, retry and provider calls.
- [ ] Add bounded timeouts to all external provider calls.
- [ ] Log full exception and stack only server-side with environment, release SHA, route and actor classification.
- [ ] Redact authorization headers, cookies, OTPs, Paystack keys, Supabase keys, encryption keys, meter credentials and sensitive before/after fields.

#### Frontend experience tasks

- [ ] Make admin, vendor and customer API wrappers parse the canonical error fields consistently.
- [ ] Add network deadlines to admin and vendor wrappers to match the customer wrapper.
- [ ] Keep the same idempotency key when a wrapper performs an authorized refresh-and-retry.
- [ ] Use existing alert/dialog components for a consistent three-part display: **What happened**, **What to do next**, **Reference**.
- [ ] Show field validation inline and move focus to the first invalid field.
- [ ] Keep user-entered form data after recoverable errors, excluding passwords, OTPs and payment secrets.
- [ ] Disable duplicate submit while a mutation is pending.
- [ ] For financial `unknown/pending`, replace “Try again” with “Check transaction status”.
- [ ] For `401`, preserve the requested route and return after successful login.
- [ ] For `429`, display the wait time from `Retry-After` and disable action until eligible.
- [ ] Provide a copyable support reference containing correlation ID and business reference, never technical stack output.
- [ ] Add an accessible global render-error boundary with `role="alert"`, keyboard focus and a safe reload action.
- [ ] Ensure screen readers announce errors once and color is not the only error indicator.

#### Operational tasks

- [ ] Link support searches to correlation ID, payment/purchase reference and release SHA.
- [ ] Add dashboards by stable error code, route, environment and retryability.
- [ ] Alert on spikes in `internal_error`, `outcome_unknown`, persistence failures and client render failures.
- [ ] Create support scripts for payment pending, token pending, permission denied and session expired.
- [ ] Define customer communication for prolonged provider incidents without exposing internal/vendor details.

#### Mandatory experience tests

- [ ] Invalid form identifies the exact field, keeps safe form content and explains correction.
- [ ] Session expiry returns the user to the intended page after login without duplicate mutation.
- [ ] MFA challenge preserves the original action and retries at most once.
- [ ] Rate limit displays server-provided wait time.
- [ ] Offline purchase submission never encourages an immediate duplicate purchase.
- [ ] Provider accepted-then-disconnected shows pending/check-status, not failed/retry.
- [ ] Supabase `500` shows temporary unavailability and creates no local record.
- [ ] Unexpected `500` exposes no stack/SQL/secret but support can locate it by correlation ID.
- [ ] Screen-reader and keyboard checks pass for inline, page and modal errors.
- [ ] Error behavior is identical across Development, Preview and Production except for safe developer diagnostics available only locally.

**Complete when:** every error class in the matrix has an automated API check and one representative UI check; financial ambiguity never presents a retry CTA; support can find the server event from the displayed reference.

### A11. Strict Development, Preview and Production separation

**Goal:** code, data, credentials, providers, callbacks and feature flags cannot accidentally cross environments.  
**Duration:** 2–3 days.  
**Deployment:** configuration and validation changes; no financial-write shutdown.  
**Existing foundation to extend:** wallet Zod environment schema, legacy `VERCEL_ENV` derivation, Vercel environment scopes and production environment checks.

#### Canonical environment identity

Add one explicit application identity used by both API paths:

- `APP_ENV=development` for local developer execution;
- `APP_ENV=preview` for Vercel Preview/Staging;
- `APP_ENV=production` for Vercel Production;
- `APP_ENV=test` for automated tests.

`APP_ENV` controls Beverly behavior. `NODE_ENV` remains the runtime/build optimization value. On Vercel, startup must verify `APP_ENV` agrees with `VERCEL_ENV`; disagreement fails deployment.

#### Environment boundary matrix

| Boundary | Development | Preview/Staging | Production |
|---|---|---|---|
| Database | local/dedicated development Supabase | dedicated staging Supabase | production Supabase only |
| Paystack | `sk_test` / `pk_test` | `sk_test` / `pk_test` | `sk_live` / `pk_live` only when money writes enabled |
| Energy provider | mock/sandbox | provider sandbox/test tenant | production tenant |
| Redis/rate store | local isolated namespace | staging instance/namespace | production instance/namespace |
| Storage buckets | development | staging | production |
| Email/SMS | sink/allowlist | test allowlist | approved production senders |
| URLs/callbacks | localhost | preview/staging hosts | approved production hosts |
| Feature flags | test writes allowed | sandbox writes only | controlled production flags |
| Developer console | permitted locally | off by default/explicit tester access | forbidden except audited break-glass design |
| Data | synthetic only | synthetic/sanitized | real production data |

#### Configuration tasks

- [ ] Add `APP_ENV` to wallet and legacy environment validation.
- [ ] Reject missing/unknown environment identity.
- [ ] Reject `APP_ENV`/`VERCEL_ENV` mismatch.
- [ ] Load `.env` and `.env.local` files only in local Development/Test; deployed environments use platform configuration only.
- [ ] Maintain committed variable-name templates with safe placeholders and no secrets.
- [ ] Validate environment-specific Supabase project host/reference against an approved value.
- [ ] Reject live Paystack keys outside Production and test keys when production money writes are enabled.
- [ ] Validate Paystack callback/webhook hosts match the active environment.
- [ ] Validate Energy provider base URL/tenant against the active environment allowlist.
- [ ] Use unique Redis key prefixes and queue names per environment.
- [ ] Validate CORS, customer/vendor/admin URLs and email asset base URL against environment-approved HTTPS origins.
- [ ] Ensure no `SUPABASE_SERVICE_ROLE_KEY`, provider secret, encryption key or private credential uses a `VITE_` name or appears in a frontend bundle.
- [ ] Prevent Development/Preview scheduled jobs from calling production webhooks or sending unrestricted SMS/email.
- [ ] Add a visible non-production banner containing environment and short SHA; Production has no debug banner.
- [ ] Include environment and SHA in health/version, logs and audit metadata without exposing secrets.

#### Vercel and database controls

- [ ] Store different secret values in Vercel Development, Preview and Production scopes.
- [ ] Limit who can edit Production variables and require review/change record.
- [ ] Use separate Supabase projects for Preview/Staging and Production.
- [ ] Require explicit project reference and environment confirmation before migrations, cleanup or seed commands.
- [ ] Make production seed/reset commands impossible through normal scripts.
- [ ] Prevent Preview deployments from receiving production cron schedules and live provider webhooks.
- [ ] Rotate any credential found shared between environments.
- [ ] Document secret ownership, rotation interval and emergency revocation.

#### Promotion workflow

- [ ] Develop and run targeted tests against Development dependencies.
- [ ] Promote one reviewed commit SHA to Preview with staging-only configuration.
- [ ] Run full smoke, RLS, provider sandbox, error-contract and audit checks in Preview.
- [ ] Approve the exact SHA and environment-variable name/diff report; never print values.
- [ ] Deploy the same approved SHA to Production with Production-scoped configuration.
- [ ] Verify `/version`, `APP_ENV`, provider modes and database project before enabling any canary writes.

#### Mandatory isolation tests

- [ ] Production startup with a Paystack test key fails when money writes are enabled.
- [ ] Preview startup with a Paystack live key fails.
- [ ] Preview configured with production Supabase project fails.
- [ ] Production configured with Preview callback/CORS URL fails.
- [ ] `APP_ENV` and `VERCEL_ENV` mismatch fails.
- [ ] Frontend bundles contain no known server-only variable names or secret patterns.
- [ ] Preview email/SMS can reach only approved test recipients.
- [ ] Preview cron/webhook cannot mutate production.
- [ ] Migration/cleanup command refuses the wrong project reference.
- [ ] Non-production banner and audit metadata show correct environment/SHA.

**Complete when:** automated negative tests prove each cross-environment mistake fails before serving traffic, each environment uses separate data/provider credentials, and the exact Preview-tested SHA is promoted to Production.

### A12. Complete audit trail for sensitive actions

**Goal:** every sensitive attempt and outcome is attributable, searchable, durable and protected from alteration without logging secrets.  
**Duration:** 3–4 days.  
**Deployment:** additive schema/RPC and shared audit-path changes; development occurs with writes available. Critical mutation cutover follows the relevant Track B endpoint window if atomic audit changes its database transaction.  
**Existing foundation to extend:** `wallet_audit_log`, `wallet_security_events`, `logAction()`, `logSecurityEvent()`, request audit tap and admin Audit view.

#### Audit reliability classes

- **Class 1 — mandatory atomic audit:** financial posting/approval/refund/settlement, wallet freeze/limit, permission/role/station changes, impersonation, credential/API-key changes, destructive data operations and break-glass actions. The state mutation and audit/outbox record commit in the same database transaction. If audit cannot commit, the mutation fails.
- **Class 2 — mandatory security attempt audit:** login/MFA/recovery/session/permission-denied/rate-limit events. Failure is sent to the external security log and raises an alert; raw secrets and OTPs are never recorded.
- **Class 3 — operational audit:** ordinary successful mutations caught by the route tap. Best-effort is acceptable only when it cannot affect money, access, privacy or security; failures are counted and alerted.

This replaces the current universal “best-effort, never throws” rule for Class 1 actions.

#### Canonical audit event

Every sensitive event must contain:

- immutable event ID and server timestamp;
- environment and release SHA;
- actor user ID, actor type, effective role and station/tenant scope;
- impersonator/delegator and approval actor where applicable;
- stable action name and schema version;
- target type and immutable target ID;
- result: `attempted`, `succeeded`, `denied`, `failed`, `pending`, or `reversed`;
- allowlisted before/after changes or field names changed;
- mandatory reason for administrative/high-risk actions;
- amount/currency and transaction/purchase/payment reference for money actions;
- correlation ID, request ID and hashed/idempotency-key reference;
- trusted client IP, user agent and source channel;
- linked prior event/reversal/approval ID where applicable;
- redacted, schema-validated metadata.

Never record passwords, access/refresh tokens, OTPs, Paystack/Supabase keys, encryption keys, full vend credentials, authorization headers, cookies, raw provider payloads, unnecessary PII or complete payment instrument data.

#### Sensitive action inventory

**Identity and security**

- [ ] Login success/failure, logout and session timeout.
- [ ] OTP request/send/verify/failure/rate limit without OTP value.
- [ ] Password reset/change and temporary-password use.
- [ ] MFA setup, verification failure, recovery-code use, regeneration and disable.
- [ ] Session revocation and impersonation start/end.
- [ ] Permission denial, suspicious activity and break-glass use.

**Access and administration**

- [ ] User/vendor creation, invitation, suspension, reactivation and deletion.
- [ ] Role, permission, station and tenant assignment changes with before/after.
- [ ] Feature-flag and production configuration changes.
- [ ] API key, webhook, OEM/provider credential creation/rotation/revocation without secret value.
- [ ] VAT policy creation and approval with separation-of-duties identity.

**Financial and vending**

- [ ] Funding initialization, webhook receipt/verification/duplicate/mismatch and fulfillment.
- [ ] Funding approval/rejection/reconciliation.
- [ ] Wallet creation, freeze/unfreeze, limit change and manual adjustment.
- [ ] Purchase preview acceptance, hold placement/capture/release and ledger posting.
- [ ] Token provider dispatch, outcome unknown, delivery, resend/reconciliation and reversal.
- [ ] Refund request/approval/rejection/posting.
- [ ] Settlement generation/approval/export and reconciliation exception.
- [ ] Money-write feature-flag enable/disable and canary-scope changes.

**Data and privacy**

- [ ] Customer data export/deletion request, review, completion and download.
- [ ] Audit export and sensitive report export.
- [ ] Migration, RLS/grant change, retention cleanup and restore operation.
- [ ] Bulk import/export and manual data correction.

#### Persistence and integrity tasks

- [ ] Use existing audit tables where their schema holds the canonical fields; add only missing columns/indexes.
- [ ] Route Class 1 operations through existing transaction/RPC patterns with an audit/outbox insert in the same transaction.
- [ ] Make audit tables append-only for application roles: deny update/delete and expose inserts only through approved server/RPC paths.
- [ ] Restrict audit reads/exports to `wallet.audit.view` and appropriate station/tenant scope.
- [ ] Audit every audit-log view, detail access and export.
- [ ] Send a redacted copy of Class 1/security events to an independent retained log sink.
- [ ] Set documented retention by event category and legal requirement.
- [ ] Archive before approved expiry; retention deletion itself is audited and requires approval.
- [ ] Add indexes for time, action, actor, target, result, correlation and business reference.
- [ ] Define clock source and monitor timestamp drift.
- [ ] Alert when mandatory audit/outbox backlog, insert failure or event-volume gap occurs.

#### End-user and administrator experience

- [ ] Sensitive admin forms require a reason before submission.
- [ ] Destructive and financial approvals show target, before/after, impact and confirmation.
- [ ] Successful action displays a receipt/reference that support can trace to the audit event.
- [ ] Failed action states whether no change occurred, a rollback occurred, or review is pending.
- [ ] Admin Audit view filters by time, actor, action, target, result, environment, correlation and financial reference.
- [ ] Audit detail shows approval chain and linked reversal without exposing redacted fields.
- [ ] Export respects active filters, is access-controlled, watermarked with requester/time/environment and is itself audited.
- [ ] Security dashboard highlights repeated denials, MFA failures, break-glass use, privilege changes and audit gaps.

#### Mandatory audit tests

- [ ] Exact mutation inventory proves every Class 1 route/service writes one canonical audit/outbox event.
- [ ] Successful money mutation and audit commit together.
- [ ] Forced audit insert failure causes Class 1 mutation rollback/failure.
- [ ] Failed and denied sensitive attempts produce the correct result event.
- [ ] Duplicate idempotent request does not duplicate financial effect and links to the original audit event.
- [ ] Reversal links original and reversing events.
- [ ] Impersonation records both real and effective actor.
- [ ] Cross-station audit read/export is denied.
- [ ] Application roles cannot update/delete audit records.
- [ ] Redaction test injects known secrets/PII and confirms none reach database, response, logs or exports.
- [ ] Correlation ID connects API error, application log, provider attempt, audit event and support search.
- [ ] Retention/archive test removes only eligible records and records the cleanup event.
- [ ] External audit sink outage raises an alert without silently losing the mandatory database event.

**Complete when:** 100% of the sensitive inventory is mapped to an owning service and tested event; every Class 1 mutation is atomic with its audit/outbox record; audit records are append-only, scoped, redacted, searchable and independently retained.

## 4. Track B — fixes requiring affected live writes to be paused or restricted

Track B does not require shutting down the CRM or every write. It pauses only the financial endpoints named in each cutover.

### B1. Token purchase ambiguity and provider timeout

**Why a pause is required:** changing the result semantics while purchases are in flight could leave old and new workers interpreting the same provider response differently.  
**Development duration:** 2–3 days in Preview/Staging.  
**Production pause target:** 1–2 hours.  
**Pause only:**

- `POST /api/v1/customer/purchase`
- `POST /api/v1/customer/purchase/:purchaseOrderId/remote-send`
- `POST /api/v1/vendor/vend/:purchaseOrderId/remote-send`

**Keep available:** purchase preview, balances, ledgers, histories, receipts and support.

#### Preparation while writes remain on

- [ ] Add provider `AbortController` deadline below platform timeout.
- [ ] Distinguish definite pre-dispatch failure from dispatched outcome unknown.
- [ ] Keep holds when provider outcome is unknown.
- [ ] Reconcile unknown outcomes by immutable purchase reference.
- [ ] Prevent retry from issuing a second token.
- [ ] Add operator reconciliation action and alerts.
- [ ] Pass accepted-then-disconnected, delayed response, duplicate retry and persistence-failure tests.

#### Cutover

- [ ] Stop new token/vend submissions through feature flags.
- [ ] Allow existing requests to drain for the bounded provider/function timeout.
- [ ] Record every remaining in-flight purchase reference.
- [ ] Deploy the exact verified SHA.
- [ ] Confirm `/version` and `/ready`.
- [ ] Enable one internal canary purchase.
- [ ] Reconcile payment, balance, hold, ledger, token, receipt and audit.
- [ ] Re-enable token writes gradually: internal → 5% → 25% → 100%.

**Complete when:** no ambiguous result releases funds and duplicate requests cannot create duplicate value or tokens.

### B2. Distributed financial/authentication rate limiting

**Why restriction is required:** a limiter-key or proxy mistake can block legitimate transactions or allow duplicates/abuse.  
**Development duration:** 1–2 days.  
**Production restriction target:** 30–60 minutes for sensitive endpoint canary, not a full shutdown.

**Sensitive endpoints:** login/OTP, wallet funding, token purchase, refunds, settlement and admin money mutations.

#### Preparation while writes remain on

- [ ] Use a managed distributed store independent of optional queues.
- [ ] Key anonymous traffic by trusted platform IP and authenticated traffic by actor/account.
- [ ] Define different thresholds for login, OTP, funding, purchase, webhook and admin mutation.
- [ ] Preserve `429`, `Retry-After`, `RateLimit-*` and correlation headers through the public proxy.
- [ ] Test shared counters across at least two instances.

#### Cutover

- [ ] Deploy initially in observe-only mode if supported by the existing limiter; otherwise use generous limits.
- [ ] Verify keys and counters contain no secrets or raw tokens.
- [ ] Enable enforcement for login/OTP first.
- [ ] Enable enforcement for financial endpoints with internal canary traffic.
- [ ] Tighten to approved thresholds after verifying legitimate workflows.

**Complete when:** two instances share one counter and public endpoints return correct `429` and retry headers without blocking normal canary transactions.

### B3. Payment, funding, refund and ledger mutation changes

**Why a pause is required:** any change to financial transition, idempotency or ledger posting must not mix application versions for the same in-flight transaction.  
**Development duration:** 2–3 days if changes are required after fault testing.  
**Production pause target:** 1–2 hours for affected endpoint group.

**Potentially paused endpoints:**

- `POST /api/v1/customer/wallet/fund`
- `POST /api/v1/vendor/funding/paystack`
- `POST /api/v1/vendor/funding/bank-transfer`
- `POST /api/v1/admin/funding/:id/approve`
- `POST /api/v1/admin/funding/:id/reject`
- `POST /api/v1/admin/funding/reconcile-approved`
- `POST /api/v1/admin/refunds`
- `POST /api/v1/admin/refunds/:id/approve`
- `POST /api/v1/admin/refunds/:id/reject`
- `PATCH /api/v1/admin/wallets/:id/status`
- `PATCH /api/v1/admin/wallets/:id/limits`

Do not pause an endpoint if fault testing proves no production change is needed.

#### Preparation while writes remain on

- [ ] Test existing payment lease, idempotency, amount/currency/reference validation and row locks.
- [ ] Change only controls that fail those tests.
- [ ] Add idempotency keys where missing.
- [ ] Require valid state transitions and immutable audit reasons.
- [ ] Test concurrent approval, refund, webhook and worker execution.

#### Cutover if code/database mutation changes are required

- [ ] Disable only the endpoint group being changed.
- [ ] Drain in-flight requests and payment leases.
- [ ] Reconcile all pending items before deployment.
- [ ] Deploy application/database change.
- [ ] Execute minimum-value canary for each changed flow.
- [ ] Reconcile ledger and balances before reopening.

**Complete when:** every fault/concurrency test posts value exactly once and canary reconciliation is balanced.

### B4. RLS or database policy changes

**Why a pause may be required:** replacing policies or grants while requests are executing can temporarily deny valid traffic or expose broader access if ordered incorrectly.  
**Development duration:** 2–3 days.  
**Production pause target:** 30–90 minutes only if production policies must change.

#### Work that does not need a pause

- [ ] Build a new empty database from the retained migration chain.
- [ ] Remove/quarantine foreign ERP migration operations.
- [ ] Generate schema and policy diff.
- [ ] Test anonymous, customer, vendor, staff, station staff and service role.
- [ ] Run horizontal-ID and cross-station access tests.
- [ ] Restore a backup into an isolated project and measure RPO/RTO.

#### Cutover only when policy changes are required

- [ ] Produce reviewed forward migration with explicit grants/policies.
- [ ] Take/verify timestamped backup or PITR point.
- [ ] Restrict affected mutations; reads may stay available if the migration permits.
- [ ] Apply changes transactionally where supported.
- [ ] Run the production role/RLS smoke matrix.
- [ ] Re-enable affected mutations after security approval.

**Complete when:** clean migration, schema diff, role matrix and restore drill pass, and production has no unexplained policy drift.

### B5. Destructive quota and retention migration

**Why a pause is required:** it rewrites historical JSON and deletes old data; concurrent ingestion/aggregation can produce inconsistent results and increase locking.  
**Preparation duration:** 1–2 days.  
**Production maintenance target:** 1–3 hours, scheduled separately.  
**Pause only:** meter-reading ingestion/aggregation and affected consumption/report writes. Financial wallet writes can remain available if database load testing proves isolation.

#### Preparation

- [ ] Split one-time cleanup from recurring retention.
- [ ] Produce dry-run row counts and byte impact.
- [ ] Confirm data-retention/legal approval.
- [ ] Verify backup/PITR and complete isolated restore test.
- [ ] Convert work to bounded batches.
- [ ] Set lock timeout, statement timeout and abort thresholds.
- [ ] Define latency, lock, database-size and error monitoring.

#### Maintenance window

- [ ] Pause scheduled ingestion/aggregation jobs.
- [ ] Confirm backup/PITR timestamp.
- [ ] Run one batch and inspect locks/latency/results.
- [ ] Continue batches only while thresholds remain healthy.
- [ ] Verify row counts, aggregates and reports.
- [ ] Resume jobs and monitor backlog recovery.

**Complete when:** approved records are removed, required history remains recoverable, application checks pass and backlog returns to normal.

## 5. Recommended execution order

### Days 1–2 — business remains fully operational

- [ ] A1 release tests and CI.
- [ ] A2 readiness/version.
- [ ] A3 route policies.
- [ ] A4 audit prefix.
- [ ] Define A10 canonical error codes, outcomes and recovery matrix.
- [ ] Inventory A11 environment variables, credentials, provider accounts and project IDs by environment.
- [ ] Inventory A12 Class 1–3 sensitive actions and owning services.
- [ ] Begin B1 token fix in Preview/Staging.
- [ ] Begin B2 distributed limiter in Preview/Staging.

### Days 3–5 — business remains operational

- [ ] A5 secret/session hardening.
- [ ] A6 durable fail-closed storage.
- [ ] A7 cache/proxy headers.
- [ ] A8 monitoring foundation.
- [ ] Implement A10 shared backend error contract and portal handling.
- [ ] Implement A11 `APP_ENV` validation and cross-environment startup guards.
- [ ] Add A12 audit schema/index additions and Class 1 transactional audit/outbox path in Preview.
- [ ] Complete B1/B2 fault tests.
- [ ] Begin B3 financial invariant tests.
- [ ] Begin B4 clean-database/RLS proof.

### Day 5 or 6 — first short financial window

- [ ] Deploy Track A release blue-green.
- [ ] Rotate sessions; users may reauthenticate.
- [ ] Verify Production environment identity, project/provider modes and release SHA.
- [ ] Verify graceful error references resolve in production monitoring/support tools.
- [ ] Complete B2 rate-limiter canary.
- [ ] Pause token/vend endpoints for B1 cutover.
- [ ] Drain, deploy and execute internal token canary.
- [ ] Reopen token/vend endpoints progressively.

### Days 6–9 — restricted canary, normal reads/CRM

- [ ] Monitor token/payment/ledger reconciliation for 24–48 hours.
- [ ] Complete B3 changes only if invariant tests found gaps.
- [ ] Complete B4 RLS and restore evidence.
- [ ] Complete A10 cross-portal accessibility and financial-ambiguity experience tests.
- [ ] Complete A11 isolation tests and rotate any credential shared between environments.
- [ ] Complete A12 sensitive-route coverage, atomicity, immutability and redaction tests.
- [ ] Continue A9 frontend/security/dependency work.

### Days 9–12 — remaining short windows only if required

- [ ] Apply B3 endpoint-group cutover if financial code changed.
- [ ] Deploy Class 1 atomic audit changes inside the matching B3 endpoint windows.
- [ ] Apply B4 policy cutover if production RLS changes are required.
- [ ] Schedule B5 separately after data-owner approval.
- [ ] Complete gradual financial rollout.

### Days 14–18 — stabilization

- [ ] Run full Node 22 release suite.
- [ ] Confirm production SHA, readiness and monitoring.
- [ ] Review 48-hour financial reconciliation.
- [ ] Review error-code dashboards, cross-environment guard evidence and audit coverage/gap alerts.
- [ ] Close or assign every remaining medium-risk item.
- [ ] Obtain final finance, security, database, SRE and release approval.

## 6. Cutover and rollback rules

### Before every Track B window

- [ ] Exact endpoint flags tested in Preview.
- [ ] In-flight count is visible.
- [ ] Drain timeout defined.
- [ ] Database backup/PITR verified when data changes are involved.
- [ ] Previous deployment and configuration are available.
- [ ] Incident commander and business contact are online.
- [ ] Canary identity, amount and expected ledger result are documented.

### Automatic abort conditions

Disable the affected endpoint group immediately if any occurs:

- readiness fails twice consecutively;
- deployed SHA differs from approved SHA;
- duplicate ledger posting or token;
- payment, currency or reference mismatch is fulfilled;
- unknown provider outcome releases a hold;
- mandatory persistence or audit storage fails;
- error/latency thresholds are exceeded;
- monitoring becomes unavailable;
- reconciliation does not balance exactly.

### Rollback principle

- Application-only failure: switch traffic to the prior deployment and keep affected writes disabled until in-flight records reconcile.
- Additive database failure: stop and deploy a reviewed forward correction.
- Destructive data failure: stop batches and restore into an isolated environment; never improvise a reverse query on the only production database.
- Provider ambiguity: retain holds and reconcile by immutable reference before retry or release.

## 7. Final completion checklist

### Track A

- [ ] Full release suite passes on Node 22.
- [ ] Readiness is green for active serverless mode.
- [ ] Every mutation has an exact route policy.
- [ ] No public/default session secret remains.
- [ ] Production cannot write to local SQLite/memory.
- [ ] Cache expiry and proxy headers work.
- [ ] External logs, metrics and alerts receive production events.
- [ ] CSP, uploads and dependency risks meet acceptance criteria.
- [ ] Every error explains what happened, the mutation outcome and the safe next action.
- [ ] Financial unknown outcomes never present a duplicate-submit/retry action.
- [ ] Correlation/support references connect frontend, API, logs and audit records.
- [ ] Development, Preview and Production use separate databases, providers, credentials and namespaces.
- [ ] Cross-environment misconfiguration fails before serving traffic.
- [ ] No server secret is exposed through `VITE_` variables or frontend bundles.
- [ ] Every sensitive action is classified and mapped to its owning audit implementation.
- [ ] Class 1 audit records commit atomically with the sensitive mutation.
- [ ] Audit records are append-only, access-scoped, redacted and independently retained.

### Track B

- [ ] Token/provider ambiguity retains funds and reconciles by reference.
- [ ] Distributed rate limiting works across instances.
- [ ] All changed money flows pass concurrency and idempotency tests.
- [ ] Clean migration and full RLS role matrix pass.
- [ ] Restore drill meets approved RPO/RTO.
- [ ] Destructive retention has backup, approval, batching and abort controls.
- [ ] Every affected endpoint was reopened only after exact canary reconciliation.

### Business continuity

- [ ] CRM, reads, reports and support remained available.
- [ ] Total financial endpoint downtime stayed within approved windows.
- [ ] Customers received notice only for session rotation or scheduled affected-service windows.
- [ ] All transactions created before, during and after cutovers reconcile.
- [ ] Final production SHA and approvals are recorded.

## 8. Definition of complete

The split plan is complete when Track A is fully deployed, every required Track B window has passed its canary and reconciliation gate, production runs the approved SHA, all financial endpoint groups are restored, and no automatic abort condition is active.

The expanded target is **12–18 working days of engineering work with only 2–6 hours of endpoint-specific financial interruption**, not a multi-day business shutdown.
