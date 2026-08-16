# June 24 Recovery Provenance

## Recovery target

This branch reconstructs the verified June 24 worktree. The cutoff is 23:59 in Africa/Lagos.

The branch starts from `7bdb44a`. Its source tree is replaced selectively by the authoritative June 24 stash tree, `c3e083a5`.

## Evidence precedence

1. Verified transcript patches before cutoff.
2. The tracked stash tree, `c3e083a5`.
3. Selected functional files from `c3e083a5^3`.
4. The committed baseline, `7bdb44a`.

## Transcript restorations

- `019ee3d6-8674-7360-a364-c1ab1fb89b0b`, at `15:21:57Z`: meter-order and protected-preview tests.
- `019ee3df-dbc3-7460-a687-07b03247eee6`, at `15:22:57Z`: breadcrumb and header geometry.
- `019ee3df-dbc3-7460-a687-07b03247eee6`, at `15:26:43Z`: collapsible sidebar groups and icon families.

## Functional restorations

- Meter-order transition validation.
- Customer idempotency requirements.
- Atomic payment confirmation.
- Deterministic meter-order references.
- Complete admin interfaces.
- Complete developer-console interfaces.
- Complete mobile action menus.
- Vercel-aligned reports.
- Protected preview preflight checks.
- VAT and webhook-retention modules.

## Phase 1-7 security remediation

These phases refer to `docs/BACKEND_REMEDIATION_ROADMAP_2026-06-22.md`. They are separate from the CRM feature phases documented in `docs/PHASE_1_COMPLETION.md` through `docs/PHASE_7_COMPLETION.md`.

The recovered implementation is anchored by recovery commit `c43ccdcd` and production merge commit `e8dd2058`.

### Phase 1: Financial authority

- Canonical wallet mutations route through `api/wallet-service.mjs` into the Fastify backend.
- `api/reference.js` rejects legacy financial mutations.
- `api/wallet-route-contract.cjs` classifies canonical money routes.
- `backend/wallet/Dockerfile`, `backend/wallet/src/worker.ts`, and health routes preserve the durable-runtime implementation.
- Production currently hosts the canonical API through the verified Vercel adapter. A separately resident worker remains an infrastructure deployment concern.

### Phase 2: Ledger invariants

- `supabase/migrations/20260622140000_wallet_atomic_holds.sql` provides atomic hold creation, capture, and idempotency claims.
- `backend/wallet/src/services/ledger.ts` calls the atomic database functions.
- `backend/wallet/src/services/idempotency.ts` validates client keys and fingerprints.
- Customer, vendor, and admin money routes require stable idempotency keys.
- Replays return existing holds, orders, and responses.

### Phase 3: Exactly-once payments

- Paystack signatures are length-checked and timing-safe.
- Gateway event identifiers and payload digests are unique.
- `supabase/migrations/20260622150000_payment_fulfillment_leases.sql` provides atomic fulfillment leases.
- `backend/wallet/src/services/payment-transactions.ts` claims fulfillment before token generation.
- `backend/wallet/src/jobs/scheduler.ts` persists retries, terminal failures, and operations exceptions.

### Phase 4: Identity boundaries

- MFA assurance uses verified session state.
- OTP memory fallback is test-only.
- Missing production OTP storage fails closed.
- Production requires explicit CORS origins.
- Deployed cron routes require secrets.
- Profile uploads enforce controlled paths, MIME types, sizes, scanning, and activation.
- `supabase/migrations/20260622160000_announcement_rls.sql` forces recipient-scoped announcement RLS.

### Phase 5: Platform operations

- `backend/wallet/src/worker.ts` owns repeatable schedules.
- BullMQ supplies unique schedule identifiers, retries, and backoff.
- Lifecycle scanners create reviewable operations exceptions.
- Privacy exports and notifications use durable queues.
- Health routes report dependency readiness.
- Version output excludes runtime and environment details.
- Separate worker residency still requires its infrastructure deployment.

### Phase 6: API governance

- `backend/wallet/src/contracts/route-policy.ts` explicitly classifies mutations.
- Unknown canonical mutations fail closed.
- Preview and production money writes remain disabled.
- Production developer routes return `404`.
- Staging developer routes require break-glass authorization.

### Phase 7: Data governance

- `supabase/migrations/20260624100000_phase7_data_governance.sql` adds webhook expiration and VAT policies.
- `backend/wallet/src/services/webhook-retention.ts` purges expired payloads.
- `backend/wallet/src/services/vat-policy.ts` enforces maker-checker approval.
- Purchases snapshot effective VAT rates.
- Historical receipts preserve their original rates.

### Security verification anchors

- `tests/june24-security-provenance.test.cjs`
- `tests/route-policy.test.cjs`
- `tests/canonical-wallet-routing.test.cjs`
- `tests/security-config.test.cjs`
- `backend/wallet/src/services/__tests__/idempotency.test.ts`
- `backend/wallet/src/services/__tests__/staff-mfa-runtime.test.ts`
- `backend/wallet/src/services/__tests__/profile-picture.test.ts`
- `backend/wallet/src/services/__tests__/vat-policy.test.ts`
- `backend/wallet/src/adapters/__tests__/paystack.test.ts`

### Post-recovery security verification

The July 1 provenance audit added a permanent Phase 1-7 contract test and closed three fail-open conditions:

- OTP memory fallback is now test-only.
- Deployed cron routes reject missing secrets.
- Version responses no longer expose runtime details.

Verification completed successfully:

- `npm run test:security`
- `npm test`
- `npm run build`
- `npm --prefix backend/wallet test -- --run`: 100 tests passed.
- `npm --prefix backend/wallet run build`

## Excluded evidence

- Antigravity placeholders.
- Runtime database debris.
- Generated logs and screenshots.
- Scratch scripts and generated PDFs.
- Unmerged Claude changes.
- June 25 remediation changes.

The later two-theme patch remains excluded. The approved recovery plan explicitly retains four theme modes.

## Deterministic repairs

An unused VAT import was removed. The import referenced no June 24 route implementation.

Three dashboard template fields were aligned. Their computed model already used camel-case names.

## Final verification repairs

- Meter-order requests now use atomic idempotency claims.
- Customer replays preserve payment authorization responses.
- Admin and vendor references are deterministic.
- Runtime VAT policies now drive every purchase preview.
- VAT policy approvals enforce maker-checker separation.
- VAT policy changes produce audit records.
- The notification panel now layers correctly on mobile.
- Direct bell and panel browser coverage was added.
- Notification station reads use the supported POST method.
- Preview profile lookup now preserves super-admin routing.
- ECharts Lines-series usage is prohibited by audit.
- Dashboard chart transitions no longer double-animate.
- Wallet previews now host the canonical backend.
- Tracked runtime artifacts match the mainline versions.
- Backend verification now passes one hundred tests.
- The complete recovery smoke suite passes.

## Safety controls

The original dirty worktree remains untouched. Recovery uses a separate worktree.

No force-push is permitted. Production promotion requires explicit visual approval.

The external evidence vault contains repository archives, Git archives, reflogs, unreachable-object listings, working-tree patches, and SHA-256 checksums.

The recovery preview used temporary demo authentication. Those credentials were removed before merging.

Production now uses verified Supabase authentication. Money writes remain disabled.

Vercel deployment protection remains enabled.
