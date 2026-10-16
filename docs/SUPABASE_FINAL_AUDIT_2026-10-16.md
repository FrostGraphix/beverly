# Final pre-implementation audit — 2026-10-16

## Verified baseline

- Production domain `beverly.acoblighting.com`: Vercel deployment `dpl_FzPfQNehZsFhzZDgUHRmxyjAAVgu`, READY, source `28b0d5f0bbe57890c9279b0867226f43aacd58ef`, branch `codex/customer-signup-staff-setup`. Obtained directly through the authenticated deployment API.
- Remote main is `f5771ee0`. Production contains seven additional staff/signup commits. Implementation branch `codex/supabase-safe-remediation` starts from production, preserving those fixes. The original dirty workspace is untouched.
- Live PostgreSQL at 2026-10-16T11:06:35Z: 418,606,227 bytes (418.61 decimal MB). Required reduction to strictly below 350 MB exceeds 68,606,227 bytes.
- Exact query: 126 token-bearing `hold_active` orders; zero active holds; dates August 20–September 2. All 126 have remote-send delivery states. Two additional hold-active orders have no token.
- Production source already excludes remote-send states from `reconcileGeneratedHoldOrders`. Therefore these rows alone do NOT establish ongoing retries by the current production scheduler. Identify other deployments/workers and fresh error signatures before attributing remaining retry traffic.
- The deployed-source recovery baseline passes all five existing recovery tests under installed Node 24. The repository requires Node 22; this is not final supported-runtime validation.
- Live `pg_get_functiondef` for `fn_capture_hold` confirms hold and wallet row locks, idempotency-key lookup, and active/expiry checks. Actual messages are `hold not active` and `hold expired`. The service only recognizes `hold is not active` and `hold has expired`, incorrectly classifying the live messages as generic capture errors.
- Live receipt indexes enforce receipt-number uniqueness; exact duplicate non-null purchase-order groups: zero. `createReceipt` checks then inserts, but does not recover the winning same-order receipt after a concurrent unique conflict. This is a reproducible retry-path defect, not evidence of existing duplicate storage.
- Live unique keys also cover purchase operation keys, payment operation keys and gateway references, wallet-scoped ledger operation keys, notification recipient/event keys, and station/meter/date readings. Reuse existing constraints; do not add duplicate stores.

## Fresh traffic evidence

Supabase Management API bounded logs, 2026-10-15T11:01:31Z–2026-10-16T11:01:31Z:

| Route | Requests |
|---|---:|
| All gateway requests | 204,435 |
| wallet balance view | 42,507 |
| vendor users | 25,722 |
| auth user | 18,888 |
| portal-session touch | 14,677 |
| purchase orders | 9,294 |

Serialized gateway log payload measured 510,620,971 bytes. This is not billed database allocation or authoritative billed log ingestion. Storage and gateway response lengths can overlap; do not sum them as billed egress. High frequency alone does not prove calls are unnecessary. Request-scoped reuse and on-demand proof signing need caller-specific tests; balance authorization and revocation checks must remain fresh.

A further bounded logs check for 2026-10-16T10:06:14Z–11:06:14Z found zero returned PostgreSQL rows matching `hold not active`, and ten gateway requests across capture RPC and operations exceptions combined. This sample does not prove universal absence of errors, but it does not support carrying forward the earlier thousands-per-day recovery-error attribution as current fact.

Largest relation allocations remain daily readings 78,561,280 bytes, meter aggregates 64,094,208, daily deltas 39,280,640. Wallet audit is 44,933,120; API audit 39,665,664; idempotency records 13,271,040. Exact audit counts are 49,742 and 164,747 respectively. Catalog row estimates for several large tables are stale and cannot support deletion decisions.

## Corrections and execution gates

The earlier remediation plan was based partly on an older dirty checkout. Its blanket recovery-loop diagnosis must not be applied to current production. Cache bounding and remote-send exclusion already landed in PRs #174/#175; vendor funding history/actions landed in #177. Verify remaining behavior, rather than reimplementing those changes.

Proceed first with independently reproducible, data-preserving service fixes: normalize actual capture errors and safely return the canonical same-order receipt after a unique conflict. No schema changes, financial posting changes, historical repairs, deletions or maintenance operations are necessary for these fixes. Tests must demonstrate original receipt payload preservation, unrelated-number collision rejection and error propagation.

Do not execute compaction, retention cleanup, historical-order repair or ingestion catch-up until their dependent gates pass: verified backup and restore rehearsal; deployed worker identity; ledger/reversal classification; maintenance disk/lock headroom; archive checksums and restore checks; actual ingestion configuration; supported-runtime tests; release checks. The 350 MB result remains unachieved. No savings estimate is a guarantee.

The broader audit is not complete: authoritative billing totals, additional workers, live archive objects and all reported historical API errors still require verification. No plan can guarantee zero operational risk. The user requires the comprehensive audit before implementation, so application fixes have not started; only audit documentation and isolated baseline preparation have changed.

Current backup check through the documented Supabase Management API `GET /v1/projects/qpoipyqgrjsjdvfqmxok/database/backups` returned `backups: []`, `pitr_enabled: false`, `physical_backup_data: {}`, region `eu-west-1`. This confirms no platform backups were returned; it does not rule out separately held exports. The historical August 3 remediation log explicitly records an unperformed restore test and a prior outage during bulk backup. Local Docker exists but its Linux engine is unavailable (`dockerDesktopLinuxEngine` pipe missing). A suitable restore target and secure independent backup destination must be established before maintenance. Do not initiate a bulk backup on this constrained production instance without a throttled, health-checked procedure.

Node 22.23.3 was obtained in the package-manager cache without changing repository dependencies or the global runtime. Use it for baseline validation.

All five existing purchase-recovery tests were rerun successfully with the explicit Node 22 executable. The root build launcher still selected Node 24 through its Corepack shim despite the PATH override; do not label that build Node-22-validated. The July 30 archive and its export directory were confirmed present locally, but their contents were not revalidated or restored and they cannot cover later production changes.

Full root baseline build completed with exit code 0: wallet backend, CRM, admin, vendor, customer and landing application. Engine warnings and existing bundle/import warnings remain. This is a successful local baseline build, not proof of supported-runtime production readiness, complete regression coverage, CI success or end-to-end browser verification. No application changes, database writes, deployment, commit or push were performed in this turn.

## Concrete sources

- Authenticated Vercel deployment response and local Git commit ancestry, observed this turn.
- Read-only scripts in the original checkout: `.codex-temp/supabase-growth-audit.cjs`, `.codex-temp/check-stuck-wallet-work.cjs`, `.codex-temp/query-supabase-logs.ps1`.
- Direct read-only query `select pg_get_functiondef(oid) from pg_proc where proname = 'fn_capture_hold'`.
- Production commit files: `backend/wallet/src/jobs/scheduler.ts`, `backend/wallet/src/services/ledger.ts`, `backend/wallet/src/services/vending.ts`, and recovery regression tests.
