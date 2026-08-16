# Backend Deep Audit

Date: 2026-06-22.
Scope: Backend and persistence.
Status: Release remains blocked.

## Audit Method

- Read canonical architecture.
- Inventoried backend implementation surfaces.
- Traced money-moving service paths.
- Compared permissions against routes.
- Reviewed migrations and RLS.
- Reviewed Vercel deployment boundaries.
- Ran focused contract checks.
- Ran dependency audit checks.

## Verified Controls

- Production dependency audit passed.
- Root production audit passed.
- Wallet ledger contracts passed.
- Payment status contracts passed.
- Migration contracts passed.
- Cron configuration contracts passed.
- Backend TypeScript passed directly.
- Admin application build passed.
- Customer application build passed.
- Vendor application build passed.

## Critical Findings

### ARCH-001: Financial backends split truth

Severity: P0.
Status: Unfixed.

Evidence:

- `api/reference.js:70`
- `backend/src/services/wallet-ledger-service.js`
- `backend/wallet/src/services/ledger.ts`
- `backend/wallet/src/routes/index.ts:15`
- `backend/src/services/local-database.js:61`

Gap:

- Legacy facade owns active Vercel routes.
- Fastify wallet owns Supabase ledger logic.
- Legacy facade owns separate wallet services.
- Serverless legacy persistence uses `/tmp`.

Impact:

- Financial state can diverge.
- Deployments can lose local records.
- Admin and portal flows disagree.
- Fixes land in wrong stack.

Required remediation:

- Choose one financial authority.
- Route all wallet writes there.
- Remove production legacy mutations.
- Add cross-surface contract tests.

### FIN-001: Capture rejects active holds

Severity: P0.
Status: Unfixed.

Evidence:

- `backend/wallet/src/services/vending.ts:164`
- `backend/wallet/src/services/vending.ts:208`
- `supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql:262`
- `supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql:370`

Flow:

1. A hold becomes active.
2. Token generation then succeeds.
3. Capture posts a debit.
4. Active hold reduces availability.
5. Debit then fails insufficient-balance.

Impact:

- Live tokens may issue.
- Wallet debits may fail.
- Orders enter reconciliation states.
- Revenue and delivery diverge.

Required remediation:

- Capture inside one database transaction.
- Exclude captured hold amount.
- Lock wallet before hold.
- Add PostgreSQL integration tests.
- Block vending release immediately.

### FIN-002: Hold creation races balances

Severity: P0.
Status: Unfixed.

Evidence:

- `backend/wallet/src/services/ledger.ts:177`
- `backend/wallet/src/services/ledger.ts:183`
- `supabase/migrations/20260521230000_wallet_freeze_guardrails.sql:5`

Flow:

1. Service reads current availability.
2. Separate insert creates hold.
3. Concurrent requests share balance.
4. Both holds may succeed.

Impact:

- Wallet funds can over-reserve.
- Later captures can fail.
- Vendor balances become misleading.

Required remediation:

- Create `fn_create_hold` RPC.
- Lock wallet row first.
- Validate aggregated active holds.
- Add concurrent purchase tests.

### DEP-001: Vercel enables live writes

Severity: P0.
Status: Unfixed.

Evidence:

- `vercel.json:7`
- `vercel.json:8`
- `api/reference.js:107`
- `api/reference.js:112`

Flow:

1. Vercel sets writes true.
2. Preview deployments inherit config.
3. Nonproduction defaults also enable.
4. Preview routes can mutate upstream.

Impact:

- Preview can change production systems.
- Smoke testing becomes unsafe.
- Staging boundaries become unclear.

Required remediation:

- Remove write flags from `vercel.json`.
- Scope flags by environment.
- Require signed write approvals.
- Deny preview writes always.

### AUTH-002: MFA verification fails open

Severity: P0.
Status: Unfixed.

Evidence:

- `backend/wallet/src/plugins/auth.ts:76`
- `backend/wallet/src/plugins/auth.ts:99`
- `backend/wallet/src/plugins/auth.ts:157`

Gap:

- Factor enrollment marks MFA verified.
- App-session verification is ORed.
- Enrolled factors bypass challenge sessions.
- Unenrolled staff bypass MFA entirely.

Impact:

- Privileged actions lack step-up assurance.
- Money controls lose MFA protection.
- Compromised passwords gain broad access.

Required remediation:

- Trust verified session evidence only.
- Require MFA for privileged roles.
- Add enrollment deadlines.
- Test challenge bypass attempts.

### AUTH-003: OTP storage fails open

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/services/customer-auth.ts:84`
- `backend/wallet/src/services/customer-auth.ts:286`
- `backend/wallet/src/services/customer-auth.ts:310`

Gap:

- Missing OTP table uses memory.
- Limits become instance-local.
- Restart loses challenge state.
- Production migration failures stay hidden.

Impact:

- OTP verification becomes unreliable.
- Rate limits can bypass instances.
- Recovery behavior becomes inconsistent.

Required remediation:

- Fail closed outside development.
- Require migration readiness checks.
- Use durable shared challenges.

### PAY-003: Payment fulfillment races token issuance

Severity: P0.
Status: Unfixed.

Evidence:

- `backend/wallet/src/services/payment-transactions.ts:237`
- `backend/wallet/src/services/payment-transactions.ts:254`
- `backend/wallet/src/services/payment-transactions.ts:328`
- `backend/wallet/src/services/payment-webhooks.ts:11`

Gap:

- Webhook and scheduler share fulfillment.
- Both read unfulfilled transactions.
- Token generation occurs before claim.
- No transactional fulfillment lease exists.

Impact:

- Direct-pay tokens can duplicate.
- Receipts can duplicate.
- Gateway retries amplify delivery.

Required remediation:

- Atomically claim transaction fulfillment.
- Add unique delivery idempotency.
- Lock purchase before generation.
- Test webhook scheduler races.

## High Findings

### DEP-002: Scheduler lacks deployment home

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/server.ts:96`
- `backend/wallet/src/jobs/scheduler.ts:163`
- `vercel.json:11`
- `vercel.json:19`

Gap:

- Vercel deploys reference functions.
- Wallet Fastify remains undeployed.
- Node cron needs residency.
- No worker deployment exists.

Impact:

- Holds may not expire.
- Payments may remain pending.
- Remote sends may stall.
- Refund expiry may stop.

Required remediation:

- Deploy dedicated wallet workers.
- Or use Vercel cron handlers.
- Use durable queue workers.
- Add scheduler health evidence.

### DEP-003: Scheduler duplicates are possible

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/jobs/scheduler.ts:163`
- `backend/wallet/src/jobs/scheduler.ts:165`

Gap:

- Every process registers jobs.
- No leader election exists.
- No distributed job lock.

Impact:

- Jobs can double-run.
- Reconciliation can overlap.
- Gateway polling can surge.

Required remediation:

- Use BullMQ repeatables.
- Or add advisory locks.
- Record scheduler lease ownership.

### OPS-004: Queues have no workers

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/queue/index.ts:43`
- `backend/wallet/src/queue/index.ts:46`
- `backend/wallet/src/queue/index.ts:52`
- `backend/wallet/src/workers/` absent

Gap:

- Queues are constructed only.
- No worker consumes jobs.
- No producer enqueues jobs.
- Queue health implies false readiness.

Impact:

- Async architecture remains dormant.
- Future queued writes will stall.
- Operations dashboards can mislead.

Required remediation:

- Implement dedicated worker processes.
- Add retry and dead-letter policy.
- Deploy workers independently.
- Expose queue lag metrics.

### OPS-001: Stuck scan misses orders

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/jobs/scheduler.ts:106`
- `backend/wallet/src/jobs/scheduler.ts:111`
- `supabase/migrations/20260519143000_wallet_vend_runtime_tables.sql:45`

Gap:

- Scanner queries `pending` status.
- Purchase schema excludes `pending`.
- Valid stuck states differ.

Impact:

- Stuck orders remain invisible.
- Operations never receive exceptions.

Required remediation:

- Scan active lifecycle states.
- Create exception queue rows.
- Alert assigned operations staff.

### SEC-001: Rate-limit keys are spoofable

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/server.ts:35`
- `backend/wallet/src/server.ts:62`
- `api/reference.js:154`
- `api/reference.js:166`

Gap:

- All proxies are trusted.
- Client XFF becomes limiter key.
- Serverless memory limits locally.

Impact:

- Attackers rotate header values.
- Requests bypass throttling.
- Instances lose shared counters.

Required remediation:

- Trust known proxy ranges.
- Use platform client addresses.
- Store counters centrally.
- Add route-specific controls.

### SEC-002: Production CORS fails open

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/config/env.ts:113`

Gap:

- Empty production allowlist accepts origins.
- Credentials remain enabled server-side.

Impact:

- Misconfiguration broadens browser access.
- Incident exposure increases sharply.

Required remediation:

- Fail startup when empty.
- Require explicit production origins.
- Test missing-origin deployments.

### SEC-003: Preview cron lacks secret

Severity: P1.
Status: Unfixed.

Evidence:

- `api/reference.js:576`
- `api/reference.js:578`

Gap:

- Nonproduction permits empty secrets.
- Preview cron routes remain callable.

Impact:

- Preview refreshes become public.
- External callers can trigger work.

Required remediation:

- Require secrets everywhere.
- Deny untrusted preview cron.
- Authenticate Vercel cron headers.

### SEC-004: Announcement tables lack RLS

Severity: P1.
Status: Unfixed.

Evidence:

- `supabase/migrations/20260617120000_wallet_admin_announcements.sql:3`
- `supabase/migrations/20260617120000_wallet_admin_announcements.sql:32`
- `supabase/migrations/20260617120000_wallet_admin_announcements.sql:57`

Gap:

- Tables have no RLS enablement.
- Tables have no policies.
- Delivery recipients contain PII.

Impact:

- Direct Supabase exposure possible.
- Recipient targeting may leak.
- Delivery history may leak.

Required remediation:

- Enable and force RLS.
- Add service-only write policies.
- Add recipient self-read policies.
- Verify grants explicitly.

### SEC-005: Write guard misses contract mutations

Severity: P1.
Status: Unfixed.

Evidence:

- `api/reference.js:90`
- `api/reference.js:519`
- `api/reference.js:3330`
- `reference-contract.json`

Gap:

- Guard depends on path verbs.
- Contract contains 149 POST mutations.
- 72 paths miss the matcher.
- Missed paths include approvals.
- Missed paths include task creation.
- Missed paths include onboarding.

Examples:

- `/api/wallet/funding/approve`
- `/api/vendor/onboarding/review`
- `/API/GPRSMeterTask/GPRSCreateTokenTask`
- `/api/local/consumption/trigger-sync`

Impact:

- Disabled writes lack enforcement.
- Preview controls can be bypassed.
- Cache classification becomes incorrect.
- Upstream mutation behavior becomes inconsistent.

Required remediation:

- Define mutation metadata centrally.
- Derive guards from contract.
- Deny unknown non-GET routes.
- Test every mutation route.

### PAY-001: Webhook retries lack deduplication

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/webhooks.ts:36`
- `supabase/migrations/20260531103000_payment_transaction_status_reconciliation.sql:17`

Gap:

- Webhook rows lack event identity.
- Gateway retries create duplicates.
- No unique replay guard exists.

Impact:

- Audit history becomes noisy.
- Retry processing becomes costly.
- Incident investigations slow down.

Required remediation:

- Persist gateway event identity.
- Add unique gateway-event index.
- Return cached duplicate response.

### PAY-002: Malformed signatures can throw

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/adapters/paystack.ts:93`
- `backend/wallet/src/adapters/paystack.ts:99`

Gap:

- `timingSafeEqual` requires equal lengths.
- Malformed signature lengths throw.

Impact:

- Invalid webhooks return 500.
- Gateway retries increase.
- Error logs become noisy.

Required remediation:

- Validate hex shape first.
- Compare buffer lengths first.
- Return deterministic 401 responses.

### SEC-006: Version endpoint leaks runtime details

Severity: P3.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/health.ts:56`
- `backend/wallet/src/routes/health.ts:59`
- `backend/wallet/src/routes/health.ts:60`

Gap:

- Public endpoint returns Node version.
- Public endpoint returns environment.

Impact:

- Reconnaissance becomes easier.
- Runtime patching becomes targeted.

Required remediation:

- Return build identifier only.
- Protect detailed diagnostics.

### SEC-007: Profile updates bypass upload controls

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/customer.ts:268`
- `backend/wallet/src/routes/customer.ts:273`
- `backend/wallet/src/routes/vendor.ts:198`
- `backend/wallet/src/services/profile-picture.ts:8`

Gap:

- Profile PATCH accepts arbitrary URLs.
- Signed upload SOP becomes optional.
- Malware scan is disconnected.
- Scan endpoint trusts unlimited Base64.

Impact:

- Remote image tracking becomes possible.
- Content constraints can be bypassed.
- Scanner can consume excessive memory.

Required remediation:

- Accept storage object paths only.
- Bind scan to uploaded object.
- Enforce byte limits server-side.
- Require successful scan before activation.

### SEC-008: Developer console ships production-capable

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/admin.ts:295`
- `backend/wallet/src/routes/admin.ts:447`
- `backend/wallet/src/routes/admin.ts:3151`
- `backend/wallet/src/services/dev-console.ts:623`

Gap:

- Developer routes always register.
- Super admins receive every permission.
- No environment feature gate exists.
- Sandbox credits real wallet tables.

Impact:

- Production attack surface expands.
- Admin compromise gains test tools.
- Accidental credits remain possible.

Required remediation:

- Disable console outside development.
- Separate break-glass roles.
- Block sandbox against production.
- Audit every console mutation.

## Medium Findings

### OPS-002: Fraud refresh truncates customers

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/jobs/scheduler.ts:127`
- `backend/wallet/src/jobs/scheduler.ts:131`

Gap:

- Job limits results to 500.
- No cursor pagination exists.

Impact:

- Later customers never refresh.
- Fraud baselines become stale.

Required remediation:

- Paginate deterministically.
- Record checkpoint progress.
- Alert on partial completion.

### OPS-003: Payment sweeper hides failures

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/jobs/scheduler.ts:78`
- `backend/wallet/src/jobs/scheduler.ts:100`

Gap:

- Per-transaction failures disappear.
- No retry metadata persists.
- No alert condition exists.

Impact:

- Payment defects remain silent.
- Recovery depends on chance.

Required remediation:

- Persist retry attempt data.
- Backoff failed verifications.
- Alert after retry exhaustion.

### OPS-005: Privacy export is process-bound

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/customer.ts:1019`
- `backend/wallet/src/services/data-privacy.ts:64`

Gap:

- Export begins after response.
- Work is not queued.
- Restart loses execution.

Impact:

- Exports can remain queued forever.
- Privacy requests become unreliable.

Required remediation:

- Queue export jobs durably.
- Record attempts and errors.
- Provide completion notification.

### OPS-006: Migration status is synthetic

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/services/dev-console.ts:975`
- `backend/wallet/src/services/dev-console.ts:981`

Gap:

- Every migration reports pending.
- Database history is never queried.

Impact:

- Operators receive false deployment status.
- Migration incidents become harder.

Required remediation:

- Query Supabase migration history.
- Compare checksums safely.
- Mark unknown status explicitly.

### OPS-007: Observability lacks production telemetry

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/server.ts:27`
- `backend/wallet/src/plugins/error-handler.ts:13`

Gap:

- Logs carry correlation IDs.
- Metrics are not exposed.
- Traces are not exported.
- Alert thresholds are absent.

Impact:

- Failures remain reactive.
- Financial incidents lack visibility.

Required remediation:

- Add metrics endpoints.
- Export distributed traces.
- Alert money-flow invariants.

### OPS-008: Schema drift becomes compatibility mode

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/plugins/auth.ts:62`
- `backend/wallet/src/plugins/auth.ts:120`
- `backend/wallet/src/services/customer-auth.ts:166`

Gap:

- Missing columns trigger fallbacks.
- Production schema drift is tolerated.
- Readiness does not detect drift.

Impact:

- Partial migrations stay unnoticed.
- Identity resolution changes silently.

Required remediation:

- Fail deployment on drift.
- Keep compatibility code temporary.
- Track removal deadlines.

### AUTH-001: Every request hits Supabase

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/plugins/auth.ts:74`
- `backend/wallet/src/plugins/auth.ts:76`

Gap:

- Session validation calls Supabase.
- No bounded verification cache exists.
- No auth outage fallback exists.

Impact:

- Auth latency rises sharply.
- Supabase outages block portals.

Required remediation:

- Cache verified sessions briefly.
- Enforce revocation-aware expiry.
- Add auth dependency telemetry.

### DATA-001: Webhooks store raw gateway payloads

Severity: P2.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/webhooks.ts:36`
- `backend/wallet/src/routes/webhooks.ts:42`

Gap:

- Full payloads persist indefinitely.
- Payloads can include PII.
- Retention policy is absent.

Impact:

- Privacy scope expands.
- Breach impact increases.

Required remediation:

- Redact unnecessary fields.
- Encrypt sensitive payload fields.
- Add retention deletion jobs.

### TEST-001: Database transaction tests missing

Severity: P2.
Status: Unfixed.

Evidence:

- `tests/wallet-ledger.test.cjs`
- `backend/wallet/src/services/__tests__/`
- `supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql:225`

Gap:

- Tests exercise local abstractions.
- Tests skip live Postgres RPCs.
- Capture ordering remains untested.

Impact:

- Database regressions ship silently.
- Financial invariants remain theoretical.

Required remediation:

- Add ephemeral Supabase integration tests.
- Exercise concurrent holds.
- Exercise capture and release.
- Verify ledger invariants afterward.

### FIN-003: Vendor vending allows missing idempotency

Severity: P1.
Status: Unfixed.

Evidence:

- `backend/wallet/src/routes/vendor.ts:846`
- `backend/wallet/src/services/vending.ts:99`

Gap:

- Missing header receives random key.
- Retries create new purchase identities.
- Financial retry protection disappears.

Impact:

- Network retries can vend twice.
- Holds and delivery diverge.

Required remediation:

- Require idempotency header.
- Validate key length and format.
- Replay stored response safely.

## VAT Configuration

Current rate: 7.5%.
Configuration: 750 basis points.
Default source: environment configuration.
Persistence: stored per purchase.

Evidence:

- `backend/wallet/src/config/env.ts`
- `backend/wallet/src/services/token-engine.ts`
- `supabase/migrations/20260619120000_vending_vat_inclusive_breakdown.sql`

Gap:

- VAT is environment-defined only.
- Admin cannot govern changes.
- Effective-date history is absent.

Required remediation:

- Add tax policy table.
- Add effective-date versioning.
- Require finance approval.
- Keep purchase snapshots immutable.

## Audit Limitations

- No SAST scanner installed.
- No secret scanner installed.
- Wallet audit needs lockfile.
- Production configuration remained unqueried.
- No production traffic replay occurred.
- No destructive checks ran.

## Release Gate

Do not release money flows.

Blockers:

1. Fix FIN-001 immediately.
2. Fix FIN-002 immediately.
3. Consolidate financial authority.
4. Remove preview live writes.
5. Fix MFA enforcement.
6. Claim payment fulfillment atomically.
7. Deploy durable scheduled workers.
8. Add announcement RLS policies.
9. Repair write classification.
10. Add database integration tests.
11. Disable production developer tools.
