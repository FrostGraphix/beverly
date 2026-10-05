# OEM pipeline execution status

Status: **Implementation complete; provider sandbox pending**. Updated 2026-10-05.

## Latest checkpoint

- Authenticated official Koios OpenAPI was recovered directly from SparkMeter. Koios v1 documents `POST /api/v1/customers/{customer_id}/payments` with organization-unique `external_id`, plus payment lookup by `external_id`. Koios v2 exposes no payment route. The adapter now uses Beverly's durable command ID as `external_id`; ambiguous outcomes require lookup before retry.
- SparkMeter support received the authorized sandbox and retry-contract request. A dedicated write sandbox, non-production Nova meter, Full-access credentials, and explicit timeout/5xx/429 guidance remain provider-controlled and pending. No live provider write was attempted.
- The restore database accepted all twenty OEM migrations atomically after a full transactional rollback rehearsal. Verification found 24 OEM tables, one active tenant membership, two grants, two draft installations, and zero active canary authorizations. The restored project lacks Supabase migration-history metadata, so this proves restored schema behavior, not CLI history reconciliation.
- Vercel's authenticated deployment-protection bypass reached the application. Preview health and readiness both returned HTTP 200 after configuring the existing serverless queue mode. Readiness verified database access; Redis and Paystack remained intentionally disabled there.
- The OEM credential encryption key now exists in Vercel Preview and Production. The single legacy Calinmeter bearer credential was atomically re-encrypted with its base URL preserved. Secret values were neither committed nor documented.
- Both provider installations remain draft. Production writes remain disabled. No canary authorization exists.

- Production now contains migrations through `20261001160000`. The telemetry tables, quarantine, atomic page checkpointing, and membership-plus-grant read function were applied successfully. A live read-only call with unrelated identities returned `authorized: false` and no readings.
- Verified Koios v2 telemetry now flows through an exact-host, HTTPS-only SparkMeter client, canonical validation, quarantine, idempotent persistence, bounded pagination, and an authenticated downstream API. Provider payloads and customer identifiers are excluded from downstream telemetry responses.
- A daily authenticated telemetry schedule is configured within the current Vercel plan limit. Both ACOB installations remain draft, so provider execution remains inert.
- The explicitly approved `admin@acoblighting.com` account was verified against both `auth.users` and the Beverly super-admin profile. Migration `20261002120000` activated the ACOB tenant, created one active tenant membership, and created two active installation grants. Both installations remain draft. Active canary authorizations remain zero.
- Legacy dynamic OEM registry and dimension-sync paths now reject non-Calinmeter providers. SparkMeter uses the installation gateway; existing Calinmeter behavior remains available through the default path.
- Node 22 verification passes: 92 wallet files with 614 tests, the full root regression, OEM checks, security checks, typechecking, targeted lint, migration hygiene, and all six production builds. The first security run rejected an unsupported fifteen-minute Hobby cron; the corrected daily schedule passes deployment preflight.
- Pull request 153 verifies commit `92e405ee`: production-hardening contracts, wallet tests, frontend type checks, frontend build, structural acceptance, and Vercel deployment all pass. The production dependency audit now reports only the documented ExcelJS `uuid` exception after patching `fast-uri` and `brace-expansion` through exact transitive overrides.
- Preview deployment `beverly-4ptrpujph-danmusa-abdulsamads-projects.vercel.app` passed authenticated `/api/v1/health` and `/api/v1/ready` smoke through Vercel's deployment-protection bypass.
- Tenant authority now requires two independent server-managed records: active tenant membership and active installation access. Both checks execute inside each database read. Staff role, browser parameters and installation grants alone cannot establish membership.
- Added installation-scoped customer and meter storage. `apply_oem_inventory_snapshot` validates complete identities, duplicate external IDs, duplicate serials, customer links and ownership changes before mutation. One installation lock serializes snapshots. Missing rows become stale; nothing is deleted. Legacy Calinmeter tables remain untouched.
- The SparkMeter importer now defaults to installation-scoped storage. Legacy OEM-wide storage requires explicit `--legacy --apply`. The existing metered-only plan still excludes the 39 meterless customers. No live import ran during this checkpoint.
- Downstream meter and reconciliation endpoints use database-enforced tenant membership plus installation grants. They return sanitized meter metadata and snapshot evidence without customer contact data. The Wallet Admin OEM console consumes these endpoints.
- Node 22 wallet verification passes 92 files and 614 tests. The full root regression, security suite, OEM suite, wallet typecheck and all six production builds pass. Targeted lint passes for changed wallet files. Full wallet lint still has 1,009 pre-existing violations.
- Database gates P1 and P5 require an explicit database URL and verify the official Supabase certificate chain. P5's embedded password fallback was removed. A security regression protects both boundaries.
- Restore target connectivity recovered. Twenty curated OEM migrations were rollback-rehearsed, then applied atomically. OEM schema and authority state now verify there; Supabase migration-history metadata remains absent.
- The repeatable audit now follows `OEM_MASTER_AUDIT_PROMPT.md`. Credential rotation persists ciphertext and version through one service-role-only compare-and-swap, records the responsible actor, and rejects concurrent changes. No credential row was rotated.
- Inventory snapshots now reject null and empty complete-snapshot payloads before locking or mutation. Malformed upstream results cannot mark an installation's entire inventory stale.
- Two tracked operator scripts were hardened. The Calinmeter credential synchronizer requires explicit apply intent and environment credentials, sanitizes failures, and exits nonzero. The historical reconciliation script now verifies Supabase TLS.
- Vercel now routes `/api/v1/oem/*` into the wallet backend before its legacy fallback. Caller-provided `x-oem-id` no longer selects manufacturer credentials; only an internal request field can select OEM configuration.
- The credential inspection utility selects metadata only. Inventory rollback removes its snapshot cursor. Existing meter serial swaps release unique keys inside the serialized snapshot transaction.

### Deployment gate

Vercel preview protection now permits authenticated automation. Health and readiness return HTTP 200, and the restore target contains the required OEM schema and authority state. Production activation remains prohibited until SparkMeter supplies the requested isolated write environment and credentials.

### Earlier installation checkpoint

- Added `/api/v1/oem/installations` behind existing staff authentication and explicit installation grants. Active tenant and grant filters apply in storage; client-supplied scope is ignored. Responses expose only installation metadata, reject malformed joins, bound queries to ten seconds and fail closed beyond 200 grants. This does not authorize provider dispatch.
- Added expand-only `20260927120000_oem_actor_installation_access.sql`. No grants are seeded. Its rollback requires explicit review and refuses populated tables. The table is service-role-only with forced RLS; application-layer grant checks remain necessary because the trusted backend bypasses RLS.
- Gateway routing already covers the new endpoint. Added `Cache-Control: no-store` at the canonical gateway boundary because upstream cache headers were not forwarded. A failing HTTP proxy test demonstrated the omission before the fix.
- Eight inventory HTTP checks pass. Full wallet regression passes 80 files / 557 tests; root regression and all application builds pass. The build chain still emits a Node 24 engine warning from its Corepack launcher; it is not evidence of an entirely Node 22 build chain.
- Migration hygiene passes (171 migrations). Live restore connection failed twice with SQLSTATE `XX000`; no database changes were attempted. Local Docker database execution is unavailable because its engine is stopped. Schema application, rollback execution and real RLS verification remain unverified.
- Remaining internal work still includes telemetry persistence/checkpoints, ingestion workers, installation-scoped resource migration, scoped consumers, atomic credential rotation and financial dispatch/reconciliation. These cannot be represented as external-only blockers.

### Installation inventory deployment and recovery

Apply the new migration through the existing reviewed migration process before deploying the new route. Verify actor ownership before provisioning grants; there is no automatic global staff access. Missing migration or malformed storage responses return sanitized 503 errors. No grants returns an empty inventory. Do not activate SparkMeter based on this read-only endpoint.

Restore target connectivity must be recovered before database verification. Recheck the project's status and the dashboard-provided connection details for `OEM_RESTORE_POOLER_DB_URL`, without changing production connection variables. The observed `XX000` code does not establish a specific root cause. Retain populated grant tables during code rollback; the SQL rollback intentionally rejects populated state.

### Earlier checkpoint

- Official authenticated Koios documentation access was recovered by refreshing an expired CSRF login session. The owner does not need to supply documentation already captured in `SPARKMETER_KOIOS_V2_VERIFIED_CONTRACT.md`.
- Live organization/site/freshness queries succeeded. Ten Nova sites were discovered; four returned freshness timestamps. AJEGUNLE freshness was null. Documented live queries and a historical query for 2026-09-27 returned successful empty pages. No physical meter state was established.
- Versioned installation credential encryption/decryption is now consumed by `loadInstallationCredentials`. New envelopes authenticate installation ID and version. Rotation preparation supports legacy v1 to newer keys without changing legacy Calinmeter encryption. No stored credentials were rotated.
- ESLint dependencies and recommended TypeScript configuration are now installed. Full lint runs but fails with 997 existing violations; no rules were suppressed. The four new/changed credential implementation/test files pass targeted lint.
- Node 22.23.2 wallet regression passed: 79 files, 549 tests. Wallet typecheck and build passed. These checks do not prove missing runtime integration or deployed database isolation.

### Credential rotation operation

Supply `OEM_INSTALLATION_ENCRYPTION_KEYS` as a secret JSON object mapping versions 2 and above to canonical base64-encoded 32-byte keys. Keep keys available for all stored versions. `rotateInstallationBundle` prepares authenticated ciphertext for a higher version; persist envelope and version together using an atomic compare-and-swap against the old values. That database rotation workflow remains to be implemented and exercised. Keep old keys until all rows and recovery backups have been accounted for; do not remove a key based only on a successful local roundtrip test.

## Evidence-backed gaps

- `packages/oem-contracts/index.d.ts` defines stations, meters and vending contracts, but not a complete reading/event ingestion contract.
- Installation authorization, credential loading and atomic rotation are implemented building blocks. No executed database rotation proves live rotation yet.
- `backend/wallet/src/adapters/sparkmeter-v1.ts` builds payment requests; it is not a deployed provider dispatcher. Its credit assessment has no runtime consumer. Prior claims that it actively blocks writes or prevents negative credit were overstated.
- `tools/import-sparkmeter-sandbox.cjs` is an operator import, not a scheduler or incremental telemetry pipeline. Pagination was unbounded and malformed meter collections were treated as meterless customers.
- Legacy imports retain OEM-wide keys for compatibility. The explicit scoped path uses installation-bound identities; database execution remains unverified.
- The current customer API proves account metadata and balances, not physical meter connectivity or offline cutoff. Firmware enforcement and current relay telemetry remain unverified.
- Production canary dispatch, reconciliation, authenticated preview smoke and real provider write certification remain incomplete. Existing draft gates must remain enforced.

## Ordered execution plan

1. Correct the advisory credit assessment using red/green tests. Preserve provider debt and reject malformed evidence; never equate telemetry with financial authorization.
2. Harden the existing inventory import against malformed payloads, cyclic cursors, unbounded reads and secret-bearing errors. Verify the executable import seam.
3. Reconcile official provider contracts with repository evidence. Record unavailable telemetry/write contracts explicitly.
4. Implement installation-bound ingestion, atomic persistence/checkpoints and scoped downstream queries only against verified provider contracts and reviewed storage ownership.
5. Integrate certified write dispatch with durable command claim, ledger reconciliation and independent authorization. Provider retry uncertainty must not become automatic financial retries.
6. Run relevant regressions, supported-runtime builds, migrations and deployment smoke. Distinguish local harness results from live verification.
7. Review final diff, document recovery and report unmet acceptance criteria candidly.

## Change ownership

Preserve the existing `supabase/.temp/cli-latest` modification. Do not apply production writes or infer activation from passing unit tests.

## Implemented and verified corrections

- Advisory credit assessment: malformed numbers, unknown relay states and invalid timestamps fail closed; negative provider balances remain visible; fresh telemetry never grants payment authority.
- Installation resolver: tenant and allowed-installation filters apply before candidate retrieval; missing authority is rejected before database access; substituted explicit identities are rejected.
- Existing inventory import: malformed meter collections cannot disappear into meterless exclusions; cursor loops, provider errors and page exhaustion abort the read. Requests refuse redirects, retain body timeouts and use bounded exponential retries with `Retry-After` handling. Errors do not propagate raw transport payloads.
- These changes improve existing boundaries but do not connect a complete ingestion-to-UI production pipeline.

## Executed verification

| Command | Outcome |
| --- | --- |
| `node tests/sparkmeter-sandbox-import.test.cjs` | Passed after red/green import regressions |
| `node tests/sparkmeter-production-import-target.test.cjs` | Passed |
| `npm run test:oem` | Passed |
| `npm run typecheck` | Passed at repository root |
| `npm --prefix backend/wallet test` | Passed on Node 22.23.2: 78 files, 538 tests |
| `npm --prefix backend/wallet run typecheck` | Passed on Node 22.23.2 |
| `npm --prefix backend/wallet run build` | Passed on Node 22.23.2 |
| `node tests/acob-oem-authority-migration.test.cjs` | Passed; exact identity, draft-state guards, bounded grants, and rollback are covered |
| `npx supabase db push --linked --include-all --dry-run` | Passed after aligning local-only history markers; isolated `20261002120000` |
| `npx supabase db push --linked --include-all` | Applied `20261002120000` successfully |
| Live authority query | Verified one matching super-admin, active tenant, one active membership, two active grants, two draft installations, and zero active canary authorizations |
| `npm run test:security` | Passed |
| `npm test` | Passed full repository regression |
| `npm --prefix backend/wallet test` | Passed on Node 22.13.1: 92 files, 614 tests |
| `npm run build` | Passed all six production builds on Node 22.13.1 |
| `npm test` | Full root regression passed on Node 24.13.1 |
| `npm run build` | Wallet, CRM, admin, vendor, customer and landing builds passed on Node 24.13.1; engine warning remains |
| `npm --prefix backend/wallet run lint` | Failed: ESLint is declared as a command but not installed/configured |
| `corepack pnpm install --lockfile-only --offline --frozen-lockfile --ignore-scripts` | Passed; no lockfile content change |
| `git diff --check` | Passed |
| `npm run test:oem` | Passed on Node 22.23.1 |
| `npm --prefix backend/wallet run typecheck` | Passed on Node 22.23.1 |
| Targeted SparkMeter ESLint | Passed on both changed adapter files |
| `npm --prefix backend/wallet test` | Passed on Node 22.23.1: 92 files, 614 tests |
| `npm run test:security` | Passed on Node 22.23.1, including 187 migration checks |
| `npm test` | Passed full root regression on Node 22.23.1 |
| `npm run build` | Passed wallet, CRM, admin, vendor, customer, and landing builds on Node 22.23.1 |
| Full wallet ESLint | Failed on 1,009 pre-existing errors; changed SparkMeter files pass |

The Node 22 suite used the existing cached Node 22.23.2 executable at the front of the process PATH. Database transport fixtures validate request scoping, not live database RLS. No migration/rollback was executed in this batch. No deployed smoke or remote CI completion is claimed.

## Provider verification and required inputs

An authenticated live read of `/api/v1/customers?per_page=1` returned HTTP 200 with JSON and no redirect. A one-page-budget scan correctly stopped at its budget. An initial complete-inventory attempt failed with an unclassified error. A subsequent full live scan completed and validated 3,112 customers, 3,073 metered customers, 3,073 meters, zero malformed meter collections and 39 intentionally excluded meterless customers. This differs from the earlier 3,111/3,072 snapshot; no new rows were imported. These are read-only results from the ACOB provider account, not a provider write sandbox, live relay verification or database reconciliation. Provider writes: zero. Database writes: zero.

Documentation access is now recovered. Remaining provider clarification concerns energy counter-versus-interval meaning, credit balance units, corrections/late-data semantics, ambiguous-payment reconciliation and firmware-specific local cutoff. The official schema and read-query contracts are recorded separately. Successful empty queries cannot substitute for a nonempty authorized telemetry fixture.

Protected-preview smoke is complete through Vercel's authenticated automation bypass. The bypass secret remains in secure platform storage and is not recorded here.

## Deployment, recovery and rollback

- Keep SparkMeter installations draft until runtime tenant authority, collision-safe storage, ingestion, reconciliation and deployed verification are complete.
- Deploy this batch through the existing reviewed branch/CI workflow only; do not interpret successful builds as installation certification.
- The earlier correction batch introduced no migration. The latest inventory batch adds the grant migration described above. Reverting code must not remove imported customer/meter records or populated grant tables.
- Inventory read failures occur before import mutation. Retry the operator command after the upstream failure is resolved. Existing batch transactions roll back the failing batch; earlier committed batches remain and reruns use existing conflict checks.
- Do not broaden this legacy importer to another installation or tenant until its OEM-wide resource identity is migrated and exercised against a real test database.
- Scoped inventory checkpoints and UI are implemented. Telemetry monitoring, replay, quarantine handling and deployed database verification remain incomplete.
