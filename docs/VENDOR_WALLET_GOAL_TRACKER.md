# Vendor Wallet Goal Tracker

Status:
- Active tracker.
- Source plan: `docs/VENDOR_WALLET_IMPLEMENTATION_MASTER_PLAN.md`.
- Architecture source: root `ARCHITECTURE.md`.
- Update after each phase.

## Goal

Complete the vendor wallet system without stopping until each phase reaches a verifiable end state.

## Tracking Rules

- Mark every phase before moving on.
- Record evidence for completion.
- Record blockers immediately.
- Record tests run.
- Record residual risk.
- Keep ledger correctness central.
- Keep claim checks server-side.
- Keep vendor and staff shells separate.
- Keep history and receipts first-class.

## Phase Tracker

| Phase | Name | Status | Verifiable End State | Evidence | Tests |
|---:|---|---|---|---|---|
| 0 | Discovery and Scope Freeze | Completed | Vendor-first, manual-funding, token-first baseline locked | Master plan and tracker notes | Scope review |
| 1 | Architecture Update | Completed | Root architecture documents wallet boundaries | `ARCHITECTURE.md` wallet sections | Docs review |
| 2 | Data Model and Persistence | Completed | Migrations, constraints, RLS, and storage policies exist | `20260512190000_vendor_wallet_foundation.sql` | `tests/supabase-migrations.test.cjs`, `tests/wallet-ledger.test.cjs` |
| 3 | Auth, Claims, and Access Control | Completed | Wrong-role access is rejected server-side | Vendor RLS claim policies and API role gates | Migration and API tests |
| 4 | Vendor Onboarding | Completed | Approved vendors can complete onboarding | `vendor-onboarding-service.js` | Wallet service tests |
| 5 | Wallet Provisioning | Completed | Approved vendors receive zero-balance wallets | `wallet-ledger-service.js` | `tests/wallet-ledger.test.cjs`, `tests/wallet-api.test.cjs` |
| 6 | Funding Request Flow | Completed | Vendors can request top-up and upload proof | `wallet-funding-service.js` | `tests/wallet-ledger.test.cjs`, `tests/wallet-api.test.cjs` |
| 7 | Funding Review and Approval | Completed | Finance approval posts ledger credit | Funding approval API | `tests/wallet-ledger.test.cjs`, `tests/wallet-api.test.cjs` |
| 8 | Manual Credit Maker-Checker | Completed | Dual-actor manual credit works | `wallet-approval-service.js` | Segregation tests |
| 9 | Wallet Limits and Risk Controls | Completed | Frozen or limited wallets cannot transact | Freeze API blocks purchases | `tests/wallet-ledger.test.cjs` |
| 10 | Purchase Orchestration Core | Completed | Hold, vend, capture/release contract works | `wallet-purchase-service.js` | `tests/wallet-ledger.test.cjs`, `tests/wallet-api.test.cjs` |
| 11 | Token Generation Purchase | Completed | Vendor receives token, receipt, and history entry | Vendor wallet page receipt panel | Service, API, and browser tests |
| 12 | Remote-Send Purchase | Completed | Ambiguous remote-send states are handled safely | Pending and success remote states | Remote dispatch tests |
| 13 | Receipts, History, and Retrieval | Completed | Receipts and tokens are recoverable | Receipt panel and purchase history list | Browser and contract tests |
| 14 | Notifications and Status Communication | Completed | Money and delivery states are visible | Balance, pending, low-balance, receipt, queue states | UI state tests |
| 15 | Vendor Dashboard | Completed | Vendor sees balance, pending work, and quick actions | Dashboard strip on vendor wallet surface | Browser tests |
| 16 | Admin Vendor Management | Completed | Staff can review vendors and wallet status | Wallet Operations page | Admin flow tests |
| 17 | Reporting and Reconciliation | Completed | Finance reports and reconciliation jobs run | `wallet-reconciliation-service.js` | Report and reconciliation tests |
| 18 | Customer-Direct Purchase Expansion | Deferred Safely | Customer flow remains separate from vendor wallet | No customer payer writes touch vendor ledger | Expansion guard review |
| 19 | API Design | Completed | Explicit lowercase wallet and vendor API groups exist | `api/reference.js` wallet dispatch | `tests/wallet-api.test.cjs` |
| 20 | Frontend Module Plan | Completed | Vendor and staff wallet modules are wired cleanly | Vendor Dashboard, Vendor Wallet, Wallet Operations routes | Component and route tests |
| 21 | Backend Module Plan | Completed | Wallet services are isolated and covered | Ledger, funding, purchase, onboarding, approval, reconciliation services | Service tests |
| 22 | UI States Checklist | Completed | Loading, empty, success, error, blocked, pending, expired states exist | Empty, blocked, pending, receipt states present | Visual and browser tests |
| 23 | Creative Flow and Interaction Rules | Completed | Money states are unmistakable and action-safe | Balance, hold, receipt, queue, reconciliation states visible | UX contract review |
| 24 | What To Do | Completed | Mandatory implementation rules are satisfied | Ledger, audit, claims, RLS, history, approvals | Checklist review |
| 25 | What To Avoid | Completed | Forbidden patterns are absent | No mutable balance field, no direct credit, no public proof policy | Static and code review |

## Current Build Objective

Wallet subsystem foundation is implemented end to end.

## Current Acceptance Gates

- Scope baseline exists.
- Architecture reflects wallet ownership.
- Persistence boundaries are defined.
- Security model is explicit.
- Test ownership is explicit.
- UI system follows Beverly tokens.

## Bug Logging Format

For every bug found:

- Repro steps:
- Expected result:
- Actual result:
- Severity:

## Phase Notes

### Phase 0 Notes

- Vendor-first scope is recommended.
- Manual funding is recommended first.
- Token generation is recommended before remote-send.
- Customer-direct purchase is deferred.
- Scope baseline is now locked for implementation.

### Phase 1 Notes

- Root `ARCHITECTURE.md` must be updated first.
- `docs/ARCHITECTURE.md` remains legacy reference.
- Wallet code must not begin before architecture approval.
- Wallet ownership is now documented in root architecture.

### Phase 2 Notes

- Supabase wallet foundation migration exists.
- Local preview storage mirrors wallet tables.
- RLS currently permits service role only.
- Vendor-claim RLS policies remain next hardening step.

### Phase 5-7 Notes

- Vendor approval provisions wallets.
- Funding requests support proof metadata.
- Finance approval posts immutable credit entries.
- Same requester cannot approve funding.

### Phase 10-11 Notes

- Purchase orders place wallet holds first.
- Token completion captures holds.
- Failed purchase releases holds.
- Token purchase has generated token and receipt number.
- Vendor receipt panel is now visible.
- Purchase history is now visible.
- Printable receipt template remains next polish layer.

### Frontend Notes

- `#/wallet/vendor` renders the vendor wallet surface.
- `#/wallet/operations` renders staff wallet operations.
- Browser QA covers both wallet routes.

### RLS Notes

- Vendor organization claim helper exists.
- Vendor users can read own wallet data.
- Wallet staff can read queue and ledger data.
- Service role remains the only write path.

### Phase 4 Notes

- Vendor onboarding submission exists.
- Vendor document metadata exists.
- Reviewer cannot approve own onboarding.
- Approval activates vendor and provisions wallet.

### Phase 8 Notes

- Manual credit requires maker-checker.
- Same actor approval is blocked.
- Approved manual credit posts ledger entry.

### Phase 12 Notes

- Remote-send order uses the same hold-first purchase core.
- Pending remote state is explicit.
- Confirmed remote success captures hold.

### Phase 14-17 Notes

- Vendor dashboard shows balance, pending funding, last purchase, and low-balance state.
- Staff operations page shows funding queue, manual credit queue, and reconciliation.
- Reconciliation validates delivered orders against capture entries.

### Phase 18 Notes

- Customer-direct remains intentionally separate.
- No customer payer logic mutates vendor wallet ledger.
- Shared vend orchestration can be extended later without mixing accounting domains.

### Final QA Notes

- `npm.cmd run test:wallet` passed.
- `node --disable-warning=ExperimentalWarning tests/supabase-migrations.test.cjs` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:browser` passed.
