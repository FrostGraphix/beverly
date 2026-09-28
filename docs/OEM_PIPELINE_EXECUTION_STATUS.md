# OEM pipeline execution status

Status: **Incomplete**. Updated 2026-09-28.

## Latest checkpoint

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
- `backend/wallet/src/services/oem-installations.ts` and `oem-installation-credentials.ts` are isolated authorization/credential building blocks. Runtime integration must be traced before claiming tenant isolation.
- `backend/wallet/src/adapters/sparkmeter-v1.ts` builds payment requests; it is not a deployed provider dispatcher. Its credit assessment has no runtime consumer. Prior claims that it actively blocks writes or prevents negative credit were overstated.
- `tools/import-sparkmeter-sandbox.cjs` is an operator import, not a scheduler or incremental telemetry pipeline. Pagination was unbounded and malformed meter collections were treated as meterless customers.
- Imported legacy customers/meters use OEM-wide keys. Multiple installations of one provider need collision-safe storage before general multi-tenant rollout.
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
| `npm test` | Full root regression passed on Node 24.13.1 |
| `npm run build` | Wallet, CRM, admin, vendor, customer and landing builds passed on Node 24.13.1; engine warning remains |
| `npm --prefix backend/wallet run lint` | Failed: ESLint is declared as a command but not installed/configured |
| `corepack pnpm install --lockfile-only --offline --frozen-lockfile --ignore-scripts` | Passed; no lockfile content change |
| `git diff --check` | Passed |

The Node 22 suite used the existing cached Node 22.23.2 executable at the front of the process PATH. Database transport fixtures validate request scoping, not live database RLS. No migration/rollback was executed in this batch. No deployed smoke or remote CI completion is claimed.

## Provider verification and required inputs

An authenticated live read of `/api/v1/customers?per_page=1` returned HTTP 200 with JSON and no redirect. A one-page-budget scan correctly stopped at its budget. An initial complete-inventory attempt failed with an unclassified error. A subsequent full live scan completed and validated 3,112 customers, 3,073 metered customers, 3,073 meters, zero malformed meter collections and 39 intentionally excluded meterless customers. This differs from the earlier 3,111/3,072 snapshot; no new rows were imported. These are read-only results from the ACOB provider account, not a provider write sandbox, live relay verification or database reconciliation. Provider writes: zero. Database writes: zero.

Documentation access is now recovered. Remaining provider clarification concerns energy counter-versus-interval meaning, credit balance units, corrections/late-data semantics, ambiguous-payment reconciliation and firmware-specific local cutoff. The official schema and read-query contracts are recorded separately. Successful empty queries cannot substitute for a nonempty authorized telemetry fixture.

Protected-preview smoke is separately blocked: none of `VERCEL_PROTECTION_BYPASS`, `VERCEL_AUTOMATION_BYPASS`, or `VERCEL_AUTOMATION_BYPASS_SECRET` is configured in the loaded local environment. `LIVE_API_BEARER_TOKEN` exists, but its suitability for preview authentication has not been verified. Configure the bypass through secure environment storage; do not paste it into documentation.

## Deployment, recovery and rollback

- Keep SparkMeter installations draft until runtime tenant authority, collision-safe storage, ingestion, reconciliation and deployed verification are complete.
- Deploy this batch through the existing reviewed branch/CI workflow only; do not interpret successful builds as installation certification.
- The earlier correction batch introduced no migration. The latest inventory batch adds the grant migration described above. Reverting code must not remove imported customer/meter records or populated grant tables.
- Inventory read failures occur before import mutation. Retry the operator command after the upstream failure is resolved. Existing batch transactions roll back the failing batch; earlier committed batches remain and reruns use existing conflict checks.
- Do not broaden this legacy importer to another installation or tenant until its OEM-wide resource identity is migrated and exercised against a real test database.
- Production monitoring, atomic checkpoints, replay, dead-letter handling and scoped UI remain implementation work, not deployed features.
