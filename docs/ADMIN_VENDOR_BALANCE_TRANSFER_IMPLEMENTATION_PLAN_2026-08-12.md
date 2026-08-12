# Wallet Admin Vendor Balance Transfer — Implementation and Release Plan

**Evidence cutoff:** 2026-08-12
**Branch:** `codex/admin-vendor-balance-transfer`
**Base:** `origin/main` at `93a7d6b63994ee98033b00d021a7622031d9698f`
**Business impact:** no write shutdown occurred. Existing production traffic remained active.

## 1. Final requirement

An authorized Wallet Admin transfers existing available balance between two approved vendor wallets. Only `super-admin` and `developer` may access or execute this operation. Both roles must also hold `wallet.vendor_transfers.manage` and complete verified MFA. Approval and explicit confirmation precede immediate execution.

Vendors, customers, finance roles, operations roles, account officers, and custom roles remain denied. Permission assignment alone cannot bypass the explicit role allowlist.

## 2. Track completion

### Track A — Feature foundation

- [x] Build the complete desktop and mobile Wallet Admin experience.
- [x] Add eligible-vendor search, preview, approval, confirmation, receipt, history, and detail flows.
- [x] Add graceful errors stating what happened and what the operator should do next.
- [x] Preserve one idempotency key across retries and uncertain responses.
- [x] Add explicit role, permission, MFA, money-write, feature, and confirmation gates.
- [x] Add immutable audit and security telemetry for sensitive actions and denials.
- [x] Add same-transaction vendor inbox notifications.

### Track B — Database safety

- [x] Add migration `20260812145901_admin_vendor_balance_transfers.sql`.
- [x] Enable and force RLS on both new tables.
- [x] Revoke browser mutations and RPC execution.
- [x] Grant mutation paths only to `service_role`.
- [x] Lock both wallets using stable identifier order.
- [x] Enforce holds, status, currency, daily caps, monthly caps, and available funds.
- [x] Write one debit and one equal credit atomically.
- [x] Store immutable transfer and ledger identifiers.
- [x] Reject idempotency payload changes.
- [x] Preserve legacy `refund_credit` ledger compatibility.
- [x] Add a distributed database rate counter.
- [x] Apply the additive migration with both feature gates disabled.
- [x] Restore the database feature flag after proof.

### Track C — Environment and delivery

- [x] Pin repository, CI, and Vercel to Node 22.
- [x] Resolve all high and critical dependency findings.
- [x] Link the clean worktree to the approved Vercel project.
- [x] Add `APP_ENV` and expected Supabase project validation.
- [x] Reject preview money writes.
- [x] Configure development, preview, and production environment identities.
- [x] Keep transfer flags disabled everywhere.
- [x] Add CODEOWNERS and required pull-request approvals.
- [x] Make critical CI checks blocking.
- [x] Schedule monitoring smoke checks.
- [ ] Provision an isolated staging database.
- [ ] Resolve four remote-only migration-history entries.

Staging isolation is unavailable today. Both Vercel preview and development point to the Beverly production Supabase project. The second Supabase project is inactive. Restoring it exceeds the free-plan active-project limit. Supabase preview branches require the Pro plan. No staging claim is therefore made.

Remote migration versions `20260811100000`, `20260811110000`, `20260811120000`, and `20260811140000` have no retrievable repository bodies. They remain recorded drift. No placeholder migrations were committed.

### Track D — Operations and proof

- [x] Make readiness healthy when serverless queues are intentionally disabled.
- [x] Trust only Vercel's platform-provided client address.
- [x] Add distributed observation-mode transfer limiting.
- [x] Add correlation identifiers and structured audit metadata.
- [x] Add production health, readiness, version, and denied-path smoke coverage.
- [x] Prove idempotent replay under concurrency.
- [x] Prove competing debit serialization.
- [x] Prove transactional rollback under injected failure.
- [x] Prove ledger conservation and notification parity.
- [ ] Obtain independent pull-request approval.
- [ ] Merge protected main.
- [ ] Deploy the application changes.
- [ ] Run an authorized transfer canary.
- [ ] Reconcile every canary transfer.

Track F remains unused. No concrete evidence requires downtime or destructive remediation.

## 3. Endpoint goals

| Method | Endpoint | Goal | Required evidence | Status |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/vendor-transfers/vendors?q=` | Return only eligible approved vendors | Role, permission, MFA, search, and disabled-path tests | Met |
| `POST` | `/api/v1/admin/vendor-transfers/preview` | Validate without moving money | No ledger writes; balances, holds, limits, and currency validated | Met |
| `POST` | `/api/v1/admin/vendor-transfers` | Execute one atomic confirmed transfer | Idempotency, confirmation, money gates, distributed observation, atomic RPC | Met |
| `GET` | `/api/v1/admin/vendor-transfers` | Return immutable transfer history | Explicit public columns and cursor pagination | Met |
| `GET` | `/api/v1/admin/vendor-transfers/:id` | Recover status and render receipts | Explicit public columns and durable snapshots | Met |
| `GET` | `/api/v1/health` | Confirm process liveness | Production returned HTTP 200 | Met |
| `GET` | `/api/v1/ready` | Confirm dependency readiness | Disabled queues now report intentional disabled mode | Met locally; deployment pending |
| `GET` | `/api/v1/version` | Correlate release and Git SHA | Production exposed the current main SHA | Met |

The create endpoint is a declared money route. It forbids caching. It requires `MONEY_WRITES_ENABLED=true`. The route observes a shared database counter. Enforcement can activate later without code changes.

## 4. Atomic execution contract

1. Validate the authorized database-backed actor.
2. Require the explicit role allowlist.
3. Require the critical permission.
4. Require verified MFA.
5. Require both feature gates.
6. Require the money-write gate.
7. Require explicit confirmation.
8. Require a valid idempotency key.
9. Observe the distributed rate counter.
10. Validate distinct approved vendors.
11. Lock both wallets deterministically.
12. Validate active wallet states.
13. Validate matching NGN currency.
14. Subtract active holds.
15. Enforce debit caps.
16. Insert balanced ledger legs.
17. Insert the transfer record.
18. Insert both notifications.
19. Commit everything together.
20. Return the durable receipt.

Any database failure rolls everything back. Completed transfers remain immutable. Corrections use compensating entries.

## 5. Database proof

The additive migration was applied through the official Supabase Management API. Application and database feature flags remained disabled during deployment.

Controlled proof used synthetic identifiers only. The database flag was enabled briefly. The application flag stayed disabled. All fixtures and the temporary fault trigger were removed afterward.

| Proof | Result |
|---|---|
| Eight identical concurrent requests | Eight successes; one transfer identifier |
| Two simultaneous 60,000 debits | One completed; one insufficient-funds result |
| Injected notification failure | Request failed; zero partial rows |
| Completed synthetic transfers | Two transfers; four notifications |
| Ledger conservation | Debit and credit sum equals zero |
| Fixture cleanup | Zero synthetic transfers, wallets, and vendors |
| Final database feature flag | Disabled |

This was live-database proof, not staging proof. It remained unreachable through application routes. Existing business writes stayed enabled and uninterrupted.

## 6. Verification evidence

- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run test:wallet`
- [x] `npm run test:auth`
- [x] `npm run test:security`
- [x] `npm run hardening:audit` — 16/16
- [x] `npm run security:audit` — no high or critical findings
- [x] `npm run build` — all six build targets
- [x] Desktop browser transfer flow
- [x] Mobile browser transfer flow
- [x] Zero browser console errors
- [x] Migration contract tests
- [x] Rate-limit behavior tests
- [x] Health readiness tests
- [x] `git diff --check`

The local machine runs Node 24. The repository, CI, and Vercel target Node 22. The build passes locally, with an expected engine warning. CI remains the authoritative Node 22 proof.

The remaining accepted advisory is moderate `uuid` exposure through ExcelJS. No fixed ExcelJS release exists. The security baseline records this explicit exception.

## 7. Zero-downtime rollout

1. Keep both transfer feature flags disabled.
2. Keep observation-only limiting enabled.
3. Open the draft pull request.
4. Complete independent code review.
5. Require all protected checks.
6. Deploy the hidden application changes.
7. Verify health and readiness.
8. Run read-only production smoke tests.
9. Run unauthorized denied-path tests.
10. Select two approved canary vendors.
11. Record balances, holds, and limits.
12. Enable the application feature gate.
13. Enable the database feature gate.
14. Execute one authorized confirmed transfer.
15. Reconcile both ledger legs.
16. Reconcile both wallet balances.
17. Reconcile audit and notifications.
18. Disable flags upon discrepancy.
19. Expand only after sign-off.

No general write shutdown is required. Existing wallet, vending, funding, and CRM writes continue throughout. Only the new transfer path is controlled by its dedicated flags.

## 8. Rollback

Disable the application feature flag first. Disable the database feature flag second. Keep history and receipts readable. Never delete completed transfers. Never rewrite ledger entries. Use compensating entries after formal approval.

Application rollback remains safe because the migration is additive. The new tables and functions may remain dormant. Rate limiting remains observation-only unless explicitly changed.

## 9. Remaining approvals

Release completion requires:

- [ ] An independent approving reviewer.
- [ ] Protected CI success.
- [ ] Protected main merge.
- [ ] Named canary source vendor.
- [ ] Named canary destination vendor.
- [ ] Approved canary amount and reason.
- [ ] Authorized Super Admin or Developer session.
- [ ] Verified MFA during execution.
- [ ] Finance and operations reconciliation.

These are governance dependencies. They are not code gaps.
