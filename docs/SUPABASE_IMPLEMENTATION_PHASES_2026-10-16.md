# Data-preserving remediation execution

Branch: `codex/supabase-safe-remediation`, based on verified production commit `28b0d5f0`.
The final audit in `SUPABASE_FINAL_AUDIT_2026-10-16.md` is the baseline, not a claim that every historical issue remains current.

## Phase 1 — shared retry correctness (implemented locally)

- `captureHold` recognizes both live PostgreSQL error strings and older variants. No new debit, retry, or database function change.
- `createReceipt` re-reads only the requested order after SQLSTATE 23505. Returns the existing immutable receipt without overwriting historical values. Unrelated collisions and failed reads still fail.
- Existing database uniqueness remains the authority. No new receipt table or duplicate store.

## Phase 2 — proof-signing request reduction (implemented locally)

- Existing `attachProofUrls` callers already filter funding rows by owner/admin scope before signing.
- Replace per-row calls with the installed Supabase SDK's `createSignedUrls`, up to 100 unique paths per batch.
- Map responses by path, preserve row order, null missing/failed links, retain 1,800-second expiry. No cross-request caching, authorization changes, new endpoints or database writes.
- This reduces signing HTTP request counts in this code path. No measured production egress/storage savings are claimed.
- SDK evidence: installed `@supabase/storage-js@2.105.4/src/packages/StorageFileApi.ts`, `createSignedUrls` request and response types.

## Validation

- Final phase 1/2 suite: 86 backend test files, 560 tests passed under Node 22.23.3; TypeScript check passed.
- Full six-component build completed with exit code 0 using explicit Node 22 and Corepack JS entrypoint (avoids Windows Corepack shim selecting Node 24): backend, CRM, admin, vendor, customer and landing. Existing bundle/import warnings remain; no build errors.
- These unit/service checks do not establish live PostgreSQL concurrency or browser acceptance. CI, deployment and post-release measurements remain pending.

## Phase 3 — recovery and storage prerequisites (pending)

Choose a secure backup destination and isolated restore target. Current API returned no platform backups and PITR disabled; July export is insufficient. Local Docker engine is unavailable. Establish throttled, health-checked backup and restoration before any physical maintenance. Do not upload financial/customer data to an unapproved new destination.

Verify current worker identity, ingestion configuration, archive objects/checksums and restoration, quota billing scope and remaining errors. Trace high-volume balance/auth calls before optimizing; never cache debit-authorization balances or weaken revocation checks.

## Phase 4 — reclaim allocation without deleting business records (gated)

Revalidate actual reclaimable space and maintenance prerequisites. Compact eligible relations one at a time only after backup/restore, disk and lock gates. No retention purge, audit deletion, historical-charge repair or bulk export is authorized by this implementation artifact. Target remains measured allocation below 350,000,000 bytes after ingestion catch-up, not an estimated outcome.

## Phase 5 — release and sustained verification (pending)

Review exact diff and production/main divergence. Release only tested changes; preserve production-only staff/signup fixes. Verify funding history/proof access/receipt retries and financial invariants without live test charges. Record actual builds, CI, deployment, before/after allocation and traffic. Continue bounded observation; do not label pending work complete.
