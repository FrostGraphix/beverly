# Beverly Multi-Tenant OEM Meter Pipeline

## Architecture Audit, Target Design, Delivery Pipeline, and Recovery Strategy

**Audit date:** 2026-09-13
**Repository:** Beverly
**Audited branch:** `codex/fix-crm-cookie-auth-consumption`
**Audited commit:** `c1b98ac9`
**Audit type:** Static architecture and implementation audit with targeted automated verification
**Scope:** Beverly CRM, Wallet Admin, vendor portal, customer portal, OEM registry, Calinmeter integration, vending, remote meter operations, telemetry, consumption, reports, station onboarding, configuration, security, deployment, rollback, and delivery workflow.

---

## 0. Full-Project Re-audit Verdict

### 0.1 Release verdict

**Status: not production-ready.**

The registry foundation works. The Calinmeter flow works. The system is not yet a multi-tenant, multi-OEM gateway.

The present design can change an upstream URL, credentials, and selected paths. It cannot safely absorb arbitrary OEM contracts. It cannot guarantee tenant isolation. It cannot guarantee OEM-safe vending. It cannot prevent telemetry collisions.

No second real OEM is certified. No deliberately different fake OEM passes an end-to-end conformance suite. Production expansion must remain blocked.

### 0.2 Coverage method

The refreshed audit scanned all source domains:

- `api`
- `src`
- `backend`
- `backend/wallet`
- `apps/admin`
- `apps/vendor`
- `apps/customer`
- `apps/wallet-landing`
- `supabase/migrations`
- `tests`
- `tools`
- `docs`

The scan covered 1,027 candidate files. It found 795 domain-signal files. Those signals included OEM, Calinmeter, meters, stations, vending, tokens, readings, consumption, and reports.

This was a dependency-surface audit. It was not merely an OEM-folder review.

### 0.3 System-wide coverage matrix

| Surface | Current state | Release state | Required closure |
|---|---|---:|---|
| OEM registry | Implemented twice | Blocked | One gateway authority |
| OEM Hub | CRUD exists | Blocked | Certification workflow |
| Credentials | Encrypted storage exists | Critical | Fail-closed keys |
| Authentication | CRM supports four modes | Critical | Wallet parity |
| Endpoint paths | Partial translation exists | Critical | Canonical operation adapters |
| Request mapping | Stored only | Critical | Execute validated mappings |
| Response mapping | Stored only | Critical | Normalize canonical responses |
| Pagination | Stored only | Critical | Execute per operation |
| Capabilities | Sidebar gating exists | High | Server enforcement |
| OEM status | Stored but bypassable | Critical | Enforce every invocation |
| Tenant model | Missing | Critical | Add tenant ownership |
| Installation model | Missing | Critical | Add installation boundary |
| Station mapping | Manufacturer-scoped | Critical | Installation-scoped mapping |
| Station creation | Proxied upstream | High | Recoverable onboarding saga |
| Meter onboarding | Partly synchronized | Critical | Canonical identity mapping |
| Meter updates | Calin-shaped proxy | Critical | Adapter command pipeline |
| CRM reads | Path-switched proxy | Critical | Canonical gateway reads |
| CRM writes | Path-switched proxy | Critical | Command safety controls |
| Vendor vending | Default-first lookup | Critical | Resolve installation first |
| Customer vending | Default-first lookup | Critical | Persist OEM identity |
| Token generation | Calin-specific payload | Critical | Adapter vending contract |
| Direct credit | Rejected safely | Blocked | Real specification required |
| Remote send | Calin-specific lifecycle | Critical | Adapter command lifecycle |
| Token policies | Meter-only lookups | Critical | Installation-scoped policies |
| Consumption polling | Calin-shaped endpoints | Critical | Installation-aware ingestion |
| Reading webhook | One global secret | Critical | Signed OEM webhooks |
| Raw readings | Collision-prone keys | Critical | Installation-scoped uniqueness |
| Aggregates | Station/meter keys | Critical | Installation-scoped keys |
| Sync governance | Station-only state | Critical | Installation-scoped leases |
| Reports | Archive partly scoped | High | Scope every report source |
| Wallet ledger | Strong foundation | High | Attach OEM command evidence |
| Receipts | Strong foundation | High | Add provider identifiers |
| Reconciliation | Financial pieces exist | Critical | OEM outcome reconciliation |
| Notifications | Generic pipeline exists | High | OEM command outcomes |
| Audit logs | Generic pipeline exists | High | Immutable config history |
| Rate limiting | Partial process cache | High | Distributed installation limits |
| Circuit breaking | Missing | Critical | Per-operation breakers |
| Retry policy | Generic read retries | Critical | Adapter retry classification |
| Idempotency | Wallet order exists | Critical | OEM command idempotency |
| Observability | Generic logging exists | High | Installation operation metrics |
| Secret rotation | Version field only | Critical | Rotation workflow |
| SSRF controls | Missing | Critical | Approved HTTPS destinations |
| Configuration rollback | Missing | Critical | Immutable revisions |
| Canary rollout | Missing | Critical | Shadow and canary states |
| Adapter tests | Missing | Critical | Shared conformance suite |
| Second OEM proof | Missing | Critical | Sandbox certification |
| Production rollback | Documented conceptually | High | Tested rollback drill |

### 0.4 Newly verified critical gaps

These findings extend Section 4.

#### Gap 12: disabled OEMs remain callable

Registry loading does not reject `draft` or `disabled` manufacturers. A supplied `X-Oem-Id` can still resolve credentials.

**Required correction:** Enforce installation state inside the gateway. Never rely on UI visibility.

#### Gap 13: customer vending loses OEM identity

Customer purchase creation omits `purchase_orders.oem_id`. Customer token generation also omits `oemId`.

**Required correction:** Resolve the approved meter installation first. Persist it before holding funds.

#### Gap 14: initial wallet lookup defaults blindly

Vendor and customer entry flows call `lookupMeter(meterId)` without an OEM. Meter identifiers are not globally unique.

**Required correction:** Require installation context. Reject ambiguous meter matches.

#### Gap 15: customer meter links collide

`customer_meters` has no OEM identity. Its unique key is `(customer_id, meter_id)`.

**Required correction:** Add `oem_installation_id`. Replace the unique key.

#### Gap 16: wallet idempotency omits OEM identity

Vendor order hashing includes station and meter. It omits the OEM installation. Customer hashing also lacks installation identity.

**Required correction:** Bind idempotency to installation and operation.

#### Gap 17: token policies remain globally keyed

Runtime lookups for `meter_token_overrides` use `meter_id` only. SGC rules use `sgc` only. Added `oem_id` columns are not used.

**Required correction:** Scope reads, writes, deletes, and uniqueness by installation.

#### Gap 18: station credentials contradict schema

Wallet code queries `oem_credentials.station_id`. The deployed table has no `station_id`. Its primary key remains `oem_id`.

**Required correction:** Remove the invalid query. Introduce installation credentials deliberately.

#### Gap 19: OAuth client secrets are disconnected

CRM stores `encrypted_client_secret`. Token acquisition uses username and password fields. Wallet lacks dynamic OAuth support entirely.

**Required correction:** Define one typed credential contract. Validate every strategy during certification.

#### Gap 20: reading webhooks are not OEM-safe

The webhook uses one global secret. Payloads carry no trusted installation identity. Replay protection is absent.

**Required correction:** Use per-installation signatures, timestamps, nonces, and event identifiers.

#### Gap 21: reading keys remain collision-prone

`daily_meter_readings` is unique by station, meter, and date. `daily_meter_raw_duplicates` and derived tables use similar raw identities.

**Required correction:** Prefix every operational key with installation identity.

#### Gap 22: sync locks remain station-only

Consumption run state and claims use `station_id` alone. Two OEM installations can share station identifiers.

**Required correction:** Claim `(installation, station)` tuples.

#### Gap 23: capabilities are presentation controls

Capabilities hide navigation. The gateway does not enforce capability manifests before upstream execution.

**Required correction:** Authorize capabilities server-side. Reject unsupported operations consistently.

#### Gap 24: configured methods remain ignored

Endpoint configuration stores HTTP methods. Live proxy execution preserves the incoming Beverly method.

**Required correction:** Let the adapter build the upstream request.

#### Gap 25: OEM deletion destroys control data

Deleting a manufacturer cascades credentials, endpoints, and station mappings. No retirement workflow exists.

**Required correction:** Disable first. Retain immutable configuration history.

#### Gap 26: outbound destinations are unrestricted

Administrators can configure arbitrary base URLs. Approved hosts and private-network protections are absent.

**Required correction:** Enforce HTTPS, DNS checks, host allowlists, and egress policy.

#### Gap 27: money and OEM commands separate

Wallet holds are durable. OEM calls are direct network requests. No durable command record precedes dispatch.

**Required correction:** Create commands transactionally. Dispatch through an outbox worker.

#### Gap 28: provider responses lack evidence records

There is no installation-scoped request attempt ledger. Ambiguous writes cannot be reconstructed reliably.

**Required correction:** Persist redacted request hashes, provider IDs, attempts, and outcomes.

#### Gap 29: tenants and OEMs are conflated

`oem_manufacturers` is described as a tenant entity. An OEM is a provider. One tenant may use several OEMs. One OEM may serve several tenants.

**Required correction:** Model tenants, providers, installations, stations, and mappings separately.

#### Gap 30: the historical OEM worktree is stale

`Beverly-multi-oem-gateway` remains at `22fc3146`. Current production work is at `c1b98ac9`. The branch has diverged significantly.

**Required correction:** Preserve it for reference. Start a fresh worktree from the chosen release commit.

#### Gap 31: station mapping uses wrong identity

CRM station synchronization reads `oemConfig.id`. The registry returns `oemConfig.oemId`. Slug fallbacks can then reach a UUID column.

**Required correction:** Use validated installation UUIDs only. Test create, update, and delete.

#### Gap 32: local meter mirrors default incorrectly

Successful CRM meter writes call `upsertMeterRecord(item)` without OEM identity. The storage adapter defaults missing identity to Calinmeter.

**Required correction:** Pass the resolved installation through every mirror write.

#### Gap 33: missing endpoint mappings fall through

Explicit non-default OEM requests reuse the incoming Calinmeter path when translation fails. Missing configuration does not fail closed.

**Required correction:** Reject missing required operation mappings.

#### Gap 34: cache invalidation is process-local

CRM cache busting does not invalidate wallet instances. Serverless instances can retain older credentials and settings.

**Required correction:** Publish versioned invalidations. Reject stale revisions.

#### Gap 35: rate limiting is process-local

Rate buckets live in memory. Horizontal instances cannot enforce one shared OEM quota.

**Required correction:** Use distributed quotas. Respect provider response headers.

#### Gap 36: two OEM consoles can drift

The CRM OEM Hub is live-backed. Wallet Admin also contains `DevOemConsole.vue`, hardcoded OEM defaults, and fallback records.

**Required correction:** Keep one control plane. Remove simulated production fallbacks.

#### Gap 37: portals lack provider context

Vendor and customer portals do not display resolved OEM installations. Users cannot verify provider routing before vending.

**Required correction:** Show server-resolved provider and station identity.

#### Gap 38: station selectors can collapse identities

Some admin controls use station identifiers as option values. Duplicate station identifiers across OEMs become ambiguous.

**Required correction:** Use installation-scoped station keys everywhere.

#### Gap 39: fallback fixtures remain provider-specific

Wallet archive fallback reads Calinmeter-shaped contract samples. Returned records lack trustworthy installation ownership.

**Required correction:** Disable production fixture fallback. Scope certified fixtures by adapter version.

#### Gap 40: test connection proves too little

The connection test exercises authentication and one GET endpoint. It does not certify writes, mappings, pagination, vending, or reversibility.

**Required correction:** Replace it with staged conformance certification.

### 0.5 Evidence traceability

| Concern | Primary evidence |
|---|---|
| CRM OEM selection | `src/services/api.js` |
| Browser persistence | `src/stores/oem-store.js` |
| Background isolation | `src/services/oem-prefetch.mjs` |
| OEM Hub behavior | `src/components/oem-hub/` |
| Capability navigation | `src/data/route-manifest.js` |
| CRM authorization | `api/reference.js` |
| CRM proxy execution | `api/reference.js` |
| CRM registry | `backend/src/services/oem-registry-service.js` |
| Wallet registry | `backend/wallet/src/services/oem-registry.ts` |
| Credential encryption | `backend/src/services/oem-credential-crypto.js` |
| Registry persistence | `backend/src/services/storage-adapter.js` |
| Local registry mirror | `backend/src/services/local-database.js` |
| Calinmeter seed | `backend/scripts/seed-calinmeter-oem.cjs` |
| Dimension ingestion | `backend/src/services/oem-dimension-sync-service.js` |
| Wallet token engine | `backend/wallet/src/services/token-engine.ts` |
| Vendor vending | `backend/wallet/src/services/vending.ts` |
| Customer vending | `backend/wallet/src/services/customer-purchase.ts` |
| Payment fulfillment | `backend/wallet/src/services/payment-transactions.ts` |
| Vendor routes | `backend/wallet/src/routes/vendor.ts` |
| Customer routes | `backend/wallet/src/routes/customer.ts` |
| Admin recovery | `backend/wallet/src/routes/admin.ts` |
| Reading ingestion | `backend/src/services/consumption-store.js` |
| Reading polling | `backend/src/services/consumption-sync-service.js` |
| CRM consumption | `src/services/consumption-service.mjs` |
| Reading schema | `supabase/migrations/20260508120000_daily_meter_readings.sql` |
| Consumption access | `supabase/migrations/20260717120000_consumption_access_model.sql` |
| OEM foundation | `supabase/migrations/20260719140000_oem_manufacturers_foundation.sql` |
| API-key support | `supabase/migrations/20260720100000_oem_credentials_api_key_header.sql` |
| Dimension scoping | `supabase/migrations/20260806150000_oem_scoped_dimension_sync.sql` |
| Archive scoping | `supabase/migrations/20260825130000_archive_reports_end_to_end_hardening.sql` |
| Sync governance | `supabase/migrations/20260910120000_consumption_sync_governance.sql` |
| Registry tests | `tests/oem-registry.test.cjs` |
| Prefetch tests | `tests/oem-prefetch-isolation.test.cjs` |
| Hub tests | `tests/oem-hub-resilience.test.cjs` |
| Store tests | `tests/oem-store-resilience.test.mjs` |
| Token tests | `backend/wallet/src/services/__tests__/token-engine.test.ts` |

No matching implementation exists for:

- `tenants`
- `oem_installations`
- `oem_adapter_versions`
- `oem_config_revisions`
- `external_resource_mappings`
- `oem_sync_cursors`
- `oem_commands`
- `oem_command_attempts`
- `oem_raw_events`
- `oem_webhook_events`
- `outbox_events`
- `oem_health_snapshots`

### 0.6 Calinmeter extraction boundary

Calinmeter behavior currently spans:

- CRM canonical route names.
- CRM request sanitization.
- CRM response expectations.
- Dimension sync field parsing.
- Wallet meter lookup.
- Token payload construction.
- Token response parsing.
- Remote task creation.
- Remote task polling.
- Consumption polling.
- Reading signal aliases.
- Historical fallback fixtures.

Extraction must preserve behavior. Extraction must remove hidden ownership. No application layer may retain Calinmeter semantics afterward.

### 0.7 Release blockers

All blockers must close:

1. Canonical gateway contracts exist.
2. Calinmeter becomes an adapter.
3. Tenant ownership becomes explicit.
4. Installation identity becomes mandatory.
5. Every operational key is scoped.
6. Wallet resolves installations first.
7. Customer orders persist OEM identity.
8. Endpoint mappings execute safely.
9. Disabled providers fail closed.
10. Credential handling reaches parity.
11. Production keys fail closed.
12. Outbound hosts are restricted.
13. Commands become durable first.
14. Ambiguous vending gets reconciled.
15. Webhooks become replay-safe.
16. Configuration becomes versioned.
17. Rollback becomes one action.
18. Conformance tests become mandatory.
19. A different fake OEM passes.
20. A real second OEM passes.

### 0.8 Refreshed verification

Executed on 2026-09-13:

- OEM registry test: passed.
- OEM prefetch isolation: passed.
- OEM Hub resilience: passed.
- OEM store resilience: passed.
- Migration hygiene: passed.
- Wallet token tests: 21 passed.
- Remote migration parity: matched.

These prove narrow regression safety. They do not prove multi-OEM readiness.

---

## 1. Executive Summary

Beverly already contains the foundation of a multi-OEM system. It has an OEM registry, encrypted credentials, an OEM Hub, endpoint records, capability flags, OEM-scoped requests, station mappings, and partial wallet propagation of `oem_id`. These foundations should be retained.

However, the current implementation is not yet a universal multi-OEM pipeline. It is primarily a Calinmeter-shaped application with configurable upstream URLs, authentication, and limited path translation. Several endpoint configuration fields are persisted but never executed, wallet vending still constructs Calinmeter-specific paths and payloads, consumption synchronization is still tied to Calinmeter-style endpoints and environment variables, and several telemetry tables do not namespace their keys by OEM.

The recommended target is a **Beverly OEM Integration Gateway** using a canonical Beverly domain model and versioned OEM adapters. Beverly applications should speak only Beverly contracts. Each adapter translates between those contracts and one OEM's authentication, endpoints, schemas, units, errors, pagination, token behavior, polling, and command lifecycle.

The principal design decision is:

> Do not make Beverly's frontend, CRM, wallet, or reporting services understand each OEM API. Put all OEM differences behind one canonical, versioned integration boundary.

The recommended implementation approach is:

1. Extract the current Calinmeter behavior into the first conforming adapter without changing its production behavior.
2. Route CRM reads, wallet vending, remote commands, onboarding sync, telemetry ingestion, and scheduled jobs through one shared OEM Integration Gateway.
3. Use configuration for structural differences and adapter code for semantic differences.
4. Treat an OEM as a provider, not as the tenant. Model the tenant/operator, OEM manufacturer, OEM installation, station, and external identifiers separately.
5. Use a fresh Git worktree created from a clean, updated `main` branch.
6. Use commits, tags, database backups, reversible migrations, configuration versioning, and feature flags for rollback.
7. Do not make a manual duplicate of the repository as the primary safety mechanism. Git worktrees and remote branches are safer and easier to audit. A separate encrypted backup is still appropriate for database dumps, OEM specifications, and operational recovery.

---

## 2. Audit Method and Evidence

The audit reviewed the following implementation areas:

- Root architecture and product documentation.
- CRM OEM Hub and OEM selection state.
- CRM OEM registry and proxy behavior.
- OEM database migrations and persistence adapters.
- Wallet OEM registry, token engine, vending, and remote-send flows.
- Consumption ingestion, storage, and aggregate keys.
- Station and meter onboarding paths.
- Vendor and customer meter lookup and vending authority.
- Existing multi-OEM blueprints and status reports.
- Git branch, worktree, and current working-tree state.

Targeted verification executed during the original audit:

- `tests/oem-registry.test.cjs`: passed.
- Wallet backend Vitest suite: **51 test files passed, 389 tests passed**.

These tests establish that the existing foundation and current Calinmeter wallet behavior are internally consistent. They do **not** prove compatibility with a second real OEM whose authentication, data model, token semantics, or command lifecycle differs from Calinmeter.

### 2.1 Important working-tree condition

At re-audit time, the current checkout contains uncommitted authentication and consumption changes. These changes must be preserved. They must not enter OEM commits accidentally.

The uncommitted files are:

- `api/reference.js`
- `backend/src/services/consumption-store.js`
- `package.json`
- `src/services/consumption-service.mjs`
- `tests/api-authz.test.cjs`
- `tests/consumption-store.test.cjs`
- `tests/station-consumption-rollout-contract.test.cjs`
- `tests/consumption-refresh-auth-boundary.test.mjs`

An existing worktree also exists at:

`C:\Users\ACOB\Desktop\VS Code\Beverly-multi-oem-gateway`

It is on branch `feature/multi-oem-gateway-integration` at commit `22fc3146`. That worktree is clean, but it is substantially behind the current `main` branch and should not be used as-is without deliberate synchronization.

---

## 3. Current Beverly Architecture

### 3.1 Application surfaces

Beverly currently has four important user-facing surfaces:

1. **Beverly CRM** for operational administration, stations, meters, customers, tariffs, remote operations, and reports.
2. **Wallet Admin** for financial administration, vendor management, funding, vending monitoring, reconciliation, disputes, and audit.
3. **Vendor portal** for wallet funding, meter vending, receipts, remote send, and consumption access.
4. **Customer portal** for meter onboarding, wallet activity, token purchase, receipts, remote send, and consumption.

These surfaces share operational data and wallet infrastructure but are deployed through different application and backend boundaries.

### 3.2 Existing OEM foundation

The existing OEM foundation includes:

- `oem_manufacturers`
- `oem_endpoint_configs`
- `oem_credentials`
- `oem_station_mappings`
- Encrypted credential storage using AES-256-GCM.
- OEM capability flags.
- Configurable vending strategy.
- Per-OEM rate-limit fields.
- OEM Hub UI.
- OEM settings and endpoint editor.
- `X-Oem-Id` propagation from the CRM frontend.
- CRM-side path translation.
- CRM-side static bearer, API-key, login-token, and OAuth2 client-credential authentication.
- Wallet-side OEM resolution.
- `oem_id` propagation through portions of account binding and purchase-order logic.
- A guard that refuses unsupported direct-credit vending rather than incorrectly generating an STS token.

### 3.3 Existing Calinmeter behavior

Calinmeter remains the effective reference vocabulary for Beverly:

- CRM routes are Calinmeter-shaped.
- The endpoint translator starts with a Calinmeter path and attempts to find the target OEM's equivalent path.
- Wallet meter lookup expects Calinmeter-compatible response fields.
- Token generation uses `/api/token/creditToken/generate`.
- Remote token delivery uses `/API/RemoteMeterTask/GetTokenTask`, `CreateTokenTask`, and `UpdateTokenTask`.
- Credit-token payload construction contains Calinmeter-specific field names and assumptions.
- Consumption sync uses `/api/DailyDataMeter/read` and `/api/station/read`.
- Success, error, token, and task-status normalization is based primarily on known Calinmeter shapes.

This makes Calinmeter the implicit domain model rather than one adapter implementation.

---

## 4. Verified Findings

### 4.1 What is strong and should be retained

#### OEM registry foundation

The manufacturer, credential, endpoint, capability, and station-mapping tables are useful building blocks. The OEM Hub also provides an appropriate starting point for an integration control plane.

#### Credential handling

Secrets are encrypted before persistence and are not returned to the browser. This is the correct direction, subject to the production key-management corrections described later.

#### Wallet financial workflow

The existing hold, capture, release, receipt, reconciliation, and immutable-ledger approach is the correct financial foundation. Multi-OEM work should route vend execution through an adapter without weakening these controls.

#### Explicit `oem_id` propagation

Adding `oem_id` to account bindings, purchase orders, meter token rules, dimensions, and reports is directionally correct. The remaining operational tables need the same treatment.

#### Unsupported-strategy guard

Rejecting `direct_credit` until it has a real adapter and contract is safer than attempting to force a Calinmeter STS request onto another manufacturer.

#### Capability-driven UI direction

Hiding unavailable operations is correct. This should be extended from sidebar visibility to forms, action buttons, workflows, validation, and API authorization.

### 4.2 Critical gaps

#### Gap 1: endpoint mappings are persisted but not executed

The OEM endpoint editor stores:

- HTTP method
- Casing variant
- Request field map
- Response field map
- Static payload fields
- Pagination style
- Adapter function name
- Read/write flags

The live CRM proxy currently uses the selected base URL, resolved authentication, and translated path. It does not apply most of the remaining configuration to the actual request or response.

**Impact:** A second OEM with different field names, response envelopes, HTTP methods, pagination, or payload nesting cannot be onboarded by configuration alone.

**Required correction:** Introduce an executable, schema-validated operation mapping pipeline with canonical request and response contracts.

#### Gap 2: wallet vending remains Calinmeter-specific

The wallet carries an `oemId`, but `token-engine.ts` still builds Calinmeter paths and payloads.

**Impact:** Pointing those calls at a second OEM URL does not make the vend compatible. It can send invalid or financially dangerous requests.

**Required correction:** Move token generation and remote-send behavior behind `adapter.vend()`, `adapter.getVendStatus()`, and `adapter.sendTokenRemotely()`.

#### Gap 3: duplicated registry implementations have drifted

CRM and wallet have separate registry and cryptography implementations. CRM supports dynamic login and OAuth2 token acquisition; wallet does not.

**Impact:** One OEM can appear healthy in the CRM but fail during wallet vending.

**Required correction:** Use one shared package or, preferably, one OEM Gateway service used by both deployables.

#### Gap 4: consumption ingestion is not OEM-aware

The consumption sync service resolves its upstream from legacy environment variables and fixed Calinmeter paths.

**Impact:** A second OEM's readings cannot be ingested safely through the existing scheduled job.

**Required correction:** Make ingestion operate per OEM installation, with adapter-defined polling or webhook ingestion, OEM-scoped cursors, and canonical readings.

#### Gap 5: telemetry identity collisions remain possible

Tables such as `daily_meter_readings`, `daily_meter_raw_duplicates`, `daily_meter_deltas`, `meter_consumption_aggregates`, `station_meter_read_rollups`, gateway health, tariff history, and refresh watermarks still contain keys centered on raw station and meter identifiers.

**Impact:** Two OEMs can use the same station or meter identifier and overwrite, merge, or misattribute each other's data.

**Required correction:** Namespace every operational uniqueness constraint by `oem_installation_id`, not merely manufacturer name.

#### Gap 6: OEM selection is partly browser-authoritative

The CRM frontend sends an OEM ID from local storage.

**Impact:** A browser value must not determine which upstream data a user is authorized to access.

**Required correction:** The server must validate the requested OEM installation against the authenticated actor's tenant, role, station scope, and allowed installations.

#### Gap 7: CRM fallback can cross OEM boundaries

When an OEM cannot be resolved, the CRM can fall back to legacy Calinmeter environment configuration.

**Impact:** An explicitly selected but invalid OEM could accidentally query Calinmeter.

**Required correction:** Legacy fallback is allowed only when no OEM was explicitly requested and the request belongs to the seeded default. Explicit OEM requests must fail closed.

#### Gap 8: station-specific credential model is incomplete

Wallet registry code attempts to filter `oem_credentials` by `station_id`, but the audited schema defines a primary key only on `oem_id` and does not define `station_id`.

**Impact:** Station-level connection overrides are not actually modeled.

**Required correction:** Replace this with an explicit `oem_installations` and `oem_installation_credentials` model. A connection may cover one tenant, a group of stations, or a single station.

#### Gap 9: production key fallback is unsafe

Both credential implementations contain a deterministic development fallback key when `OEM_CREDENTIALS_ENCRYPTION_KEY` is absent.

**Impact:** Production must not silently encrypt or decrypt OEM secrets using a known fallback.

**Required correction:** Production startup and readiness must fail closed when the key is absent. Support key versioning and rotation.

#### Gap 10: OEM Hub role behavior differs from its documented design

The current `showOemHub` computed state checks role readiness and OEM selection but does not itself enforce `super-admin`.

**Impact:** Non-super-admin behavior can become dependent on a registry request they are not authorized to make.

**Required correction:** Make the landing behavior explicit by role and have the server return only allowed OEM installations.

#### Gap 11: the current tests prove regression safety, not universal compatibility

The registry test verifies storage, encryption, cache behavior, and safe translation fallback. It does not certify a genuinely different OEM contract end-to-end.

**Required correction:** Add an adapter conformance suite and a fake OEM server with deliberately different paths, methods, pagination, fields, units, auth, errors, timeouts, and asynchronous vend behavior.

---

## 5. Correct Domain Model

The word "tenant" must not be used interchangeably with "OEM."

### 5.1 Tenant/operator

A tenant is the organization operating projects, stations, vendors, or customer relationships through Beverly.

Examples could include Beverly itself, a utility, a mini-grid operator, or a project owner.

### 5.2 OEM manufacturer

The OEM is the meter/platform provider, such as Calinmeter, SparkMeter, Ihemeter, or another manufacturer.

### 5.3 OEM installation

An OEM installation is a configured connection between one tenant and an OEM environment. It owns:

- Environment: sandbox or production.
- Base URL.
- Authentication configuration.
- Credential reference.
- Adapter version.
- Tenant scope.
- Station scope.
- Capability overrides.
- Rate limits.
- Webhook configuration.
- Health state.
- Activation state.

This allows two Beverly tenants to use the same OEM with separate accounts and credentials. It also allows one tenant to have multiple OEM accounts or regional endpoints.

### 5.4 Internal and external identities

Beverly should assign UUIDs to stations, meters, customers, tariffs, gateways, and commands. Raw OEM identifiers should live in a mapping table.

Recommended mapping identity:

```text
tenant_id
oem_installation_id
resource_type
internal_resource_id
external_resource_id
external_parent_id
status
metadata
```

The browser and wallet should primarily use Beverly's internal IDs. The adapter resolves the external ID at dispatch time.

---

## 6. Target Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Beverly User Applications                                   │
│ CRM Admin | Wallet Admin | Vendor Portal | Customer Portal  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Beverly canonical APIs
┌──────────────────────────────▼───────────────────────────────┐
│ Beverly Domain Services                                     │
│ Identity | Stations | Meters | Customers | Tariffs | Wallet │
│ Vending | Reports | Notifications | Audit | Approvals       │
└───────────────┬───────────────────────────┬──────────────────┘
                │ commands                  │ domain events
┌───────────────▼───────────────────────────▼──────────────────┐
│ Transactional Outbox and Job Workers                        │
│ Idempotency | retries | leases | reconciliation | polling   │
└──────────────────────────────┬───────────────────────────────┘
                               │ canonical OEM operations
┌──────────────────────────────▼───────────────────────────────┐
│ Beverly OEM Integration Gateway                             │
│ Registry | credentials | adapter selection | transformation │
│ rate limits | circuit breakers | tracing | raw evidence     │
└───────────────┬────────────────┬────────────────┬────────────┘
                │                │                │
       ┌────────▼──────┐ ┌───────▼───────┐ ┌─────▼──────────┐
       │ Calin Adapter │ │ Spark Adapter │ │ Future Adapter │
       └───────────────┘ └───────────────┘ └────────────────┘
```

### 6.1 Beverly canonical APIs

The UI should call stable Beverly routes such as:

```text
GET  /api/v1/stations
POST /api/v1/stations
GET  /api/v1/meters/:meterId
PATCH /api/v1/meters/:meterId
GET  /api/v1/meters/:meterId/readings
POST /api/v1/vends
GET  /api/v1/vends/:vendId
POST /api/v1/meter-commands
GET  /api/v1/meter-commands/:commandId
```

These routes must not expose Calinmeter path names.

### 6.2 Canonical adapter contract

```ts
interface MeterOemAdapter {
  capabilities(): CapabilityManifest;
  testConnection(): Promise<ConnectionResult>;

  listStations(input: PageQuery): Promise<Page<Station>>;
  createStation?(input: CreateStation): Promise<Station>;

  findMeter(input: MeterLookup): Promise<Meter>;
  createMeter?(input: CreateMeter): Promise<Meter>;
  updateMeter?(input: UpdateMeter): Promise<Meter>;

  listCustomers?(input: PageQuery): Promise<Page<Customer>>;
  listAccounts?(input: PageQuery): Promise<Page<Account>>;
  listTariffs?(input: PageQuery): Promise<Page<Tariff>>;

  vend(input: VendCommand): Promise<VendOutcome>;
  getVendStatus(input: VendStatusQuery): Promise<VendOutcome>;

  sendTokenRemotely?(input: RemoteTokenCommand): Promise<CommandOutcome>;
  executeMeterCommand?(input: MeterCommand): Promise<CommandOutcome>;

  readIntervals?(input: IntervalQuery): Promise<Page<MeterReading>>;
}
```

All adapter results must use Beverly types. Raw OEM responses should be stored separately as secured operational evidence.

### 6.3 Supported vending strategies

The model should support explicit strategies:

- `sts_token`
- `direct_credit`
- `remote_credit`
- `external_token`
- `unsupported`

An OEM's declared strategy selects an adapter behavior. It must not merely change a label while preserving Calinmeter payloads.

### 6.4 Configuration versus adapter code

Use configuration for structural differences:

- URLs and environments.
- Authentication and headers.
- Endpoint and method.
- Request and response field aliases.
- Static fields.
- Pagination.
- Date/time formats.
- Units and scaling.
- Timeout and retry policy.
- Rate limits.
- Error-code classification.
- Poll intervals.
- Webhook signature rules.

Use adapter code for semantic differences:

- Multi-call workflows.
- Request signing.
- Token-key and STS logic.
- Direct-credit behavior.
- Asynchronous vending.
- Command confirmation.
- Dynamic authentication refresh.
- Complex error interpretation.
- OEM-specific reconciliation.

Configuration transformations must use a restricted and validated mapping language. Never execute arbitrary JavaScript stored in the database.

---

## 7. Recommended Data Model

### 7.1 Control-plane tables

#### `tenants`

Owns the operator/customer organization using Beverly.

#### `oem_manufacturers`

Owns manufacturer identity and general metadata.

#### `oem_adapter_versions`

```text
id
oem_id
adapter_key
version
contract_version
status
release_notes
artifact_checksum
created_at
```

#### `oem_installations`

```text
id
tenant_id
oem_id
adapter_version_id
environment
display_name
base_url
status
station_scope_mode
config_version
created_at
updated_at
```

#### `oem_installation_credentials`

Credentials belong to an installation, not directly to a global manufacturer.

```text
oem_installation_id
auth_strategy
encrypted_secret_bundle
encryption_key_version
token_endpoint
token_expiry_policy
updated_by
updated_at
```

#### `oem_operation_configs`

Versioned operation mappings with draft and active revisions.

#### `oem_capability_manifests`

Machine-readable support levels per adapter/installation.

#### `oem_config_revisions`

Immutable snapshots for audit and rollback.

### 7.2 Operational mapping tables

#### `external_resource_mappings`

Maps Beverly UUIDs to OEM identifiers for stations, meters, customers, tariffs, accounts, gateways, and commands.

#### `oem_sync_cursors`

Stores pagination tokens, last timestamps, watermarks, and reconciliation state per installation and operation.

#### `oem_commands`

Canonical lifecycle for vends, remote-send tasks, meter updates, firmware tasks, disconnect/reconnect commands, and key changes.

#### `oem_command_attempts`

Stores every upstream attempt, timing, status, normalized error, redacted request fingerprint, and secured raw response reference.

#### `oem_raw_events`

Immutable inbound telemetry or polling evidence.

#### `oem_webhook_events`

Stores signature result, deduplication key, processing status, and retry state.

#### `outbox_events`

Transactional event publication for wallet, CRM, reporting, notifications, and reconciliation.

#### `oem_health_snapshots`

Tracks latency, success rate, auth health, quota, circuit state, and last successful operation.

### 7.3 Required key changes

The following categories must be namespaced by `oem_installation_id`:

- Meter readings.
- Duplicate readings.
- Daily deltas.
- Consumption aggregates.
- Station rollups.
- Tariff history.
- Gateway health.
- Sync watermarks.
- Token records.
- Command records.
- Report archives.
- Customer/account/meter external identifiers.

Bare station IDs and meter serials must not be global primary keys.

---

## 8. Capability Model

A boolean capability is insufficient for several operations. Prefer a structured state:

```text
unsupported
read_only
write_supported
async_supported
manual_upstream
certification_required
```

Recommended capabilities include:

- `station.read`
- `station.create`
- `station.update`
- `customer.read`
- `customer.create`
- `meter.read`
- `meter.create`
- `meter.update`
- `meter.disconnect`
- `meter.reconnect`
- `meter.key_change`
- `meter.firmware_update`
- `tariff.read`
- `tariff.publish`
- `vending.sts_token`
- `vending.direct_credit`
- `vending.status_query`
- `token.remote_send`
- `telemetry.poll`
- `telemetry.webhook`
- `report.upstream`

The backend must enforce these capabilities. UI capability gating is an experience improvement, not a security boundary.

---

## 9. OEM Onboarding Pipeline

### 9.1 Stage 1: intake

Required OEM material:

- OpenAPI specification or Postman collection.
- Sandbox and production URLs.
- Sandbox credentials.
- Authentication and token-rotation rules.
- Representative request and response samples.
- Complete error-code catalogue.
- Rate limits and quotas.
- Pagination semantics.
- Idempotency behavior.
- Webhook events and signature rules.
- Station, customer, account, tariff, gateway, and meter lifecycles.
- Vending semantics.
- STS/token specification where relevant.
- Timeout, pending, polling, and reconciliation behavior.
- Units, currency, timezone, and timestamp rules.
- Test stations and test meters.
- Written authorization for sandbox and canary vends.

If these are incomplete, the OEM remains `draft`.

### 9.2 Stage 2: contract modeling

For every advertised capability:

1. Map the OEM operation to a Beverly canonical operation.
2. Define request validation.
3. Define request transformation.
4. Define response transformation.
5. Define success codes.
6. Classify errors as definitive, retryable, ambiguous, authentication, quota, validation, or authorization failures.
7. Define idempotency and status-query behavior.
8. Attach sample fixtures.

### 9.3 Stage 3: automated certification

Run:

- Schema validation.
- Authentication test.
- Connection test.
- Read-operation contract tests.
- Pagination completeness test.
- Unit and timestamp normalization test.
- Error-mapping test.
- Timeout test.
- Duplicate request test.
- Vend idempotency/status test.
- Webhook replay test where applicable.

### 9.4 Stage 4: shadow reads

Read data from the OEM without affecting users or writes. Compare:

- Station counts.
- Meter counts.
- Customer/account relationships.
- Tariffs.
- Latest reading timestamps.
- Consumption totals.
- Existing token records.

Differences must be explained before activation.

### 9.5 Stage 5: canary activation

Activate one installation and one station first:

1. Read-only CRM.
2. Telemetry ingestion.
3. Meter lookup.
4. Token preview.
5. One authorized low-value vend.
6. Vend status reconciliation.
7. Receipt and notification verification.
8. Vendor/customer visibility.
9. Accounting and ledger reconciliation.

### 9.6 Stage 6: production promotion

Promote the certified configuration revision to active. Retain the previous revision for instant configuration rollback.

---

## 10. Station and Meter Onboarding Flow

```text
Create Beverly station UUID
→ Choose tenant and OEM installation
→ Check station.create capability
→ Create upstream station or record manual provisioning requirement
→ Save external station mapping
→ Attach gateway where applicable
→ Synchronize tariffs, customers, accounts, and meters
→ Create Beverly meter UUIDs
→ Save external meter mappings
→ Validate phase, SGC/key data, tariff, and communication mode
→ Approve customer ownership or vendor station scope
→ Mark meter vending-ready
```

### 10.1 Station ID creation rules

- Beverly owns the internal station UUID.
- The OEM owns its external station ID.
- One must never replace the other.
- If the OEM supports station creation, the adapter returns and maps the external ID.
- If the OEM requires manual creation, Beverly records a provisioning task and waits for the external ID.
- A station is not vending-ready until the external mapping and required tariff/meter relationships are verified.

### 10.2 Meter update rules

- Use a canonical `MeterUpdateCommand`.
- Persist the command before dispatch.
- Record who requested and approved it.
- Transform through the adapter.
- Treat timeouts as unknown, not failed.
- Query status or reconcile before retrying.
- Store before/after snapshots.
- Publish the final status through the outbox.

---

## 11. Wallet Vending Pipeline

```text
Authenticated customer/vendor request
→ Validate vending PIN and account state
→ Enforce idempotency
→ Resolve Beverly meter UUID
→ Resolve OEM installation and external meter ID
→ Verify station and ownership authority
→ Resolve trusted tariff and pricing
→ Create purchase order
→ Place wallet hold
→ Create canonical VendCommand
→ Dispatch through OEM adapter
→ Normalize outcome
   ├─ success: capture hold, create receipt, notify
   ├─ definitive failure: release hold, record failure
   └─ unknown/pending: retain recoverable state and reconcile
```

### 11.1 Financial invariants

- No upstream vend before a successful hold.
- No wallet capture without confirmed value delivery.
- No hold release for an ambiguous upstream outcome.
- No blind retry of a vend POST.
- Every retry uses the same Beverly idempotency identity.
- Every upstream reference is persisted.
- Corrections use compensating ledger entries.
- Reconciliation is installation-aware.
- Tokens are delivered through backend notifications after capture; delivery must not depend on the browser remaining open.

### 11.2 Outcome model

Every adapter should normalize to:

```text
confirmed_success
confirmed_failure
pending
unknown
requires_manual_review
```

An HTTP timeout alone is `unknown`, because the OEM may have completed the vend after Beverly stopped waiting.

---

## 12. Telemetry, Consumption, and Reporting Pipeline

```text
OEM webhook or scheduled poll
→ Authenticate source
→ Persist immutable raw event
→ Deduplicate by installation and external event identity
→ Normalize timestamps, units, identifiers, and quality flags
→ Resolve Beverly station/meter mapping
→ Upsert canonical meter readings
→ Calculate deltas
→ Snapshot tariff and valuation
→ Refresh aggregates
→ Publish report-ready domain events
→ Serve CRM, vendor, and customer reports from Beverly storage
```

### 12.1 Reporting policy

Beverly should generate operational and financial reports from normalized Beverly data. OEM-native reports may be exposed as diagnostic extensions, but they must not become the only source for Beverly dashboards.

### 12.2 Raw evidence policy

Raw OEM payloads are useful for dispute resolution and adapter debugging, but they should be:

- Stored separately from canonical hot tables.
- Encrypted or access-restricted.
- Redacted where necessary.
- Retained according to a defined policy.
- Linked using event IDs and correlation IDs.

### 12.3 Data-quality flags

Normalized readings should carry:

- Source installation.
- Source event ID.
- Observed timestamp.
- Received timestamp.
- Unit and multiplier.
- Quality status.
- Estimated/actual status.
- Duplicate status.
- Mapping confidence.
- Adapter version.

---

## 13. CRM as the Mothership

The Beverly CRM should remain the operational control plane, but it should not call arbitrary OEM APIs directly from page-specific code.

CRM owns:

- Tenant/operator configuration.
- OEM onboarding and certification.
- Stations and internal IDs.
- Meter inventory and mappings.
- Customer/account relationships.
- Tariff governance.
- Meter commands and approvals.
- Integration health.
- Operational audit.
- Data-quality and reconciliation queues.

Wallet owns:

- Balances.
- Holds.
- Ledger entries.
- Purchase orders.
- Captures and releases.
- Financial reconciliation.
- Receipts, refunds, and disputes.

The OEM Gateway owns:

- Credentials and token acquisition.
- Adapter selection.
- Request/response transformation.
- OEM call execution.
- Rate limiting.
- Circuit breaking.
- Raw integration evidence.
- OEM command status reconciliation.

Integration between these domains should use stable APIs plus transactional outbox events. A Postgres outbox and worker are sufficient initially; Kafka is not required to start.

---

## 14. Frontend Design

### 14.1 CRM OEM Integration Studio

Extend the existing OEM Hub into a controlled Integration Studio with:

- OEM overview.
- Installation/environment list.
- Capability manifest.
- Authentication configuration.
- Operation mapping.
- Request/response sample tester.
- Station and meter mappings.
- Sync cursors and last-run status.
- Webhook setup.
- Vending certification.
- Health and latency.
- Quota/rate-limit visibility.
- Redacted logs.
- Configuration revisions.
- Draft, sandbox, canary, active, suspended, and retired states.
- Rollback to last-known-good configuration.

### 14.2 Vendor and customer portals

Vendor and customer users should not choose an OEM for each vend. Beverly resolves it from the selected internal meter.

The UI should display normalized capabilities and states:

- Token generation available.
- Direct credit available.
- Remote delivery available.
- Live meter balance available.
- Remote control unsupported.
- OEM temporarily unavailable.
- Purchase pending reconciliation.

### 14.3 Server-authoritative workspace selection

The CRM may retain an OEM workspace picker for authorized staff, but the server must validate it. The selected installation should be part of a server-issued workspace context or validated on every request against the actor's permissions.

---

## 15. Reliability and Security Controls

### 15.1 Required reliability controls

- Per-operation timeout.
- Retry only for classified safe operations.
- Exponential backoff with jitter.
- Circuit breaker per OEM installation and operation.
- Bulkhead/concurrency limit per installation.
- Rate-limit awareness.
- Dead-letter/manual review state.
- Status-query reconciliation for ambiguous commands.
- Idempotency for all material writes.
- Correlation IDs across UI, wallet, gateway, and OEM.

### 15.2 Required security controls

- Production startup failure when the encryption key is absent.
- Key versioning and rotation.
- Secret access limited to the gateway.
- Redacted request/response logging.
- SSRF protection for configured base URLs.
- Approved hostname allowlist.
- HTTPS-only production endpoints.
- Webhook signature validation.
- Replay protection.
- Tenant and station authorization on the server.
- No arbitrary code execution from configuration.
- Maker-checker approval for production credential and vending configuration changes.
- Immutable audit of configuration activation and rollback.

### 15.3 Observability

Track by OEM installation and operation:

- Request count.
- Success/failure rate.
- Latency percentiles.
- Authentication failures.
- Rate-limit responses.
- Timeout count.
- Circuit state.
- Pending command age.
- Vend success and ambiguity rate.
- Telemetry lag.
- Mapping failures.
- Reconciliation differences.

---

## 16. Testing Strategy

### 16.1 Adapter conformance suite

Every adapter must pass the same tests:

- Connection and authentication.
- Station list normalization.
- Meter lookup normalization.
- Pagination completeness.
- Empty responses.
- Malformed responses.
- Unit conversion.
- Timezone normalization.
- Error classification.
- Rate-limit handling.
- Timeout handling.
- Vend success.
- Vend rejection.
- Vend timeout followed by status recovery.
- Duplicate vend request.
- Remote-send lifecycle.
- Unsupported capability behavior.

### 16.2 Fake OEM server

Build an offline fake OEM that deliberately differs from Calinmeter:

- OAuth2 instead of static bearer.
- GET instead of POST for selected reads.
- Cursor pagination.
- Snake-case fields.
- Nested result envelopes.
- Watt-hours instead of kilowatt-hours.
- ISO timestamps in a different timezone.
- Direct-credit or asynchronous vending.
- Webhook completion.
- 429 responses.
- Timeouts and delayed success.

This is the real proof that Beverly is canonical rather than Calinmeter-shaped.

### 16.3 Production acceptance

Before activating any OEM:

- Contract tests pass.
- Security review passes.
- Data reconciliation passes.
- Canary station passes.
- Authorized canary vend passes.
- Wallet ledger balances.
- Receipt and notification pass.
- Support runbook exists.
- Rollback drill passes.

---

## 17. Recommended Implementation Phases

This order supersedes the earlier gateway-before-identity sequence. A gateway cannot safely route by installation before installation identity exists. Likewise, wallet writes cannot switch before durable commands and reconciliation exist. Each phase uses one public-seam test at a time: red, minimal green, then review. Commit each passing, reversible slice. Update this audit after every phase.

### Phase 0: safety checkpoint and baseline

- Use only `Beverly-multi-oem-v2` at starting commit `ff54438d`; preserve the stale OEM worktree untouched.
- Confirm the clean worktree, remote baseline, last-known-good tag, database backup and restore procedure, deployment artifact, and secure feature-flag inventory.
- Record current Calinmeter request/response fixtures, vending outcomes, telemetry counts, ledger totals, and regression results without storing secrets.
- Gate: baseline tests and builds pass; backup restore is proven before any database migration. External backup and remote results remain blockers until evidenced.

### Phase 1: canonical contracts and conformance harness

- Define fully typed tenant, installation, mapping, capability, operation, error, vend-outcome, command, and reading contracts.
- Define the adapter interface and public gateway API. Keep CRM, wallet, and telemetry as consumers of Beverly contracts only.
- Add schema validation and a reusable conformance suite at the confirmed adapter and gateway seams.
- Gate: invalid, ambiguous, unsupported, or disabled installation requests have failing tests first and then fail closed. Existing tests and builds remain green.

### Phase 2: Calinmeter adapter extraction

- Move existing Calinmeter authentication, methods, payloads, parsing, pagination, token generation, remote-send, and reading normalization behind one versioned adapter.
- Preserve captured Calinmeter outputs, error classes, financial outcomes, and current feature-flag behavior. Do not silently change upstream requests.
- Gate: adapter conformance and all Calinmeter CRM, wallet, and consumption regressions pass against captured fixtures.

### Phase 3: expand-only tenant and installation schema

- Add tenants, installations, installation credentials, immutable adapter/config revisions, and external resource mappings with service-role-only mutation and tenant-safe RLS.
- Add nullable installation IDs to every operational table, link, policy, cursor, archive, command-related record, and report source. Keep old columns and constraints during transition.
- Backfill the seeded Calinmeter installation in resumable batches. Detect duplicate external IDs and unresolved ownership; quarantine uncertainty rather than guessing.
- Gate: counts, uniqueness candidates, links, readings, deltas, valuation, rollups, orders, receipts, and ledger totals reconcile. Old code works against the expanded schema. No destructive constraint switch occurs yet.

### Phase 4: read-only unified gateway and security

- Implement one server-authoritative installation resolver and one adapter gateway. Route CRM reads, wallet meter lookup, and shadow telemetry reads through it behind independent flags.
- Execute validated endpoint methods and mappings. Enforce installation status, tenant/station authorization, capability, HTTPS allowlists, DNS/private-network checks, production key requirements, revision freshness, and credential strategy parity.
- Add installation/operation correlation, redacted evidence, distributed quotas, bounded concurrency, safe-read retries, and circuit state. Reject missing mappings without legacy fallback for explicit selections.
- Gate: Calinmeter read parity and cross-tenant denial pass; a different offline fake OEM proves distinct auth, methods, pagination, envelopes, units, and error handling. No money writes switch here.

### Phase 5: durable command, outbox, and reconciliation foundation

- Add append-only OEM commands, attempts, raw evidence references, and transactional outbox records. Define leases, idempotency scoped by installation and operation, and pending/unknown/manual-review states.
- Build status-query reconciliation before any OEM vend dispatch switch. Never retry an ambiguous write blindly.
- Gate: crash, timeout-after-success, duplicate request, worker restart, and stale lease tests preserve exactly-once financial capture and recoverable commands.

### Phase 6: wallet and operational write cutover

- Resolve approved internal meter and installation before purchase creation or hold. Persist installation on customer/vendor orders, links, policies, receipts, and provider evidence.
- Move Calinmeter vend, remote-send, station/meter updates, and other supported commands through durable gateway dispatch behind per-operation flags. Unsupported direct credit remains rejected.
- Gate: vendor/customer PIN, authority, idempotency, hold/capture/release, receipt, notification, and reconciliation tests pass. Calinmeter requests match baseline fixtures. Rollback disables new dispatch while retaining pending recovery.

### Phase 7: installation-safe telemetry and reports

- Switch polling claims, cursors, raw events, webhook replay keys, reading uniqueness, deltas, tariff snapshots, rollups, archives, and reports to installation-scoped identities.
- Sign and verify webhooks per installation with timestamp, nonce, and event deduplication. Rebuild aggregates only after verified backfill.
- Gate: colliding station/meter IDs remain isolated across two installations; polling/webhook duplicates converge; report and valuation totals reconcile before old keys are retired.

### Phase 8: Integration Studio and rollback control

- Version and audit configuration, credential rotation, mapping, certification, canary, and activation changes. Remove production fixture fallbacks and duplicate control-plane authority.
- Provide one-action configuration rollback, health and mapping views, approval gates, and kill switches per installation and operation.
- Gate: a rollback drill restores the last-known-good revision while preserving pending command reconciliation and expanded-schema compatibility.

### Phase 9: second OEM certification; no production activation

- Intake a real specification, sandbox, representative samples, error catalogue, webhook rules, rate limits, idempotency semantics, and written test authorization. Missing material keeps the installation draft.
- Run the shared conformance suite, shadow reads, mapping and financial reconciliation, then prepare a one-station canary plan.
- Gate: a real second OEM passes sandbox certification. Stop before production activation, live canary vending, or production promotion, as requested.

### Phase 10: deferred legacy removal

- Do not remove Calinmeter fallback, old constraints, or backward-compatible columns during this implementation. Schedule their removal only after separate production activation, measured stabilization, and an approved rollback drill.

### Continuous verification

- After every phase: run the relevant seam tests, existing Calinmeter regression tests, typecheck, migration hygiene, and all builds. Record commands and outcomes here.
- Before handoff: run full regression suites, security checks, static migration checks, fake-OEM conformance, and local end-to-end flows. Remote CI, preview smoke, staging guard, restore drill, and real-OEM sandbox results require external evidence; never mark them passed by inference.

---

## 18. Worktree Versus Main Codebase

### Recommendation

Use a **fresh Git worktree** for the multi-tenant OEM implementation.

This change crosses CRM, wallet, data migrations, scheduled jobs, telemetry, security, and production vending. It should not be developed directly in the current `main` checkout.

### Why a worktree is best here

- Keeps current production work isolated.
- Prevents the active KYC changes from being mixed into OEM commits.
- Allows Beverly `main` to remain available for urgent fixes.
- Makes review and comparison straightforward.
- Supports small, reversible commits.
- Allows parallel testing without repeatedly switching a dirty checkout.
- Reduces the risk of accidentally shipping incomplete migrations or vending logic.

### Existing OEM worktree decision

The existing `Beverly-multi-oem-gateway` worktree is clean but substantially behind current `main`. The safest approach is one of:

1. Preserve its branch for historical reference and create a new worktree from the latest clean `main`; or
2. Deliberately rebase it after inspecting any branch-only commits.

The first option is recommended because the existing branch does not currently contain unique commits ahead of `main` in the audited comparison.

### Prerequisite

Do not create the implementation worktree from the current uncommitted state. First complete or checkpoint the KYC work and ensure the intended starting commit is pushed.

---

## 19. Rollback Strategy

Yes, rollback to the last good position is possible, but it must cover more than source code.

### 19.1 Source rollback

Use:

- A dedicated branch.
- Small commits by phase.
- Pull-request review.
- A signed or annotated last-known-good tag.
- Revert commits rather than rewriting shared history.

### 19.2 Configuration rollback

OEM configuration must be immutable and versioned:

- Draft revision.
- Tested revision.
- Active revision.
- Previous active revision.
- Activation audit.
- One-action rollback to the previous active revision.

### 19.3 Database rollback

Database changes need expand-and-contract migrations:

1. Add new nullable columns/tables.
2. Dual-write where required.
3. Backfill.
4. Verify row counts, uniqueness, and aggregates.
5. Switch reads behind a feature flag.
6. Keep old columns during the stabilization period.
7. Tighten constraints later.
8. Remove old structures only in a separate release.

Do not rely on automatically running a destructive down migration in production. Restore from a verified backup if a migration corrupts or removes data.

### 19.4 Runtime rollback

Provide feature flags and kill switches at these levels:

- Global OEM Gateway enablement.
- Per-OEM installation activation.
- Read operations.
- Telemetry ingestion.
- Station/meter writes.
- Vending.
- Remote send.
- Individual operation mapping revision.

Disabling an OEM must stop new commands without losing pending command and reconciliation records.

### 19.5 Deployment rollback

- Retain the prior deployable artifact.
- Keep schema backward-compatible during canary.
- Roll back application deployment independently of configuration.
- Validate that old code can run against the expanded schema.
- Perform a rollback drill before the first real OEM vend.

---

## 20. Should the Project Be Duplicated?

### Recommendation

Do not manually duplicate the entire repository as the main development strategy.

A copied folder creates problems:

- No reliable relationship between changes.
- Easy configuration and secret drift.
- Difficult merging.
- Duplicate dependency and generated files.
- Unclear source of truth.
- Greater risk of copying `.env` secrets into unsafe locations.

Use Git instead:

- Push the current good commit to the remote.
- Create a protected feature branch.
- Create a worktree for that branch.
- Tag the last-known-good version.
- Use pull requests and reviewed commits.

### What should still be backed up separately

A separate encrypted backup is advisable for:

- Supabase database dump.
- Storage objects required for recovery.
- OEM API specifications and Postman collections.
- Environment-variable inventory without exposing secret values in Git.
- Deployment configuration.
- Runbooks and migration verification evidence.

The backup should be restorable and periodically tested. A folder copy that has never been restored is not a recovery plan.

---

## 21. Definition of Done

The multi-tenant OEM initiative is complete only when:

- Calinmeter runs through a conforming adapter with no regression.
- CRM, wallet, jobs, and telemetry use the same gateway contract.
- No user-facing code builds OEM payloads.
- Explicit OEM selection fails closed.
- Server authorization controls every installation scope.
- Every external identity is installation-scoped.
- All telemetry and aggregates are collision-safe.
- Dynamic authentication works consistently for CRM and wallet.
- Vending supports confirmed, failed, pending, unknown, and manual-review outcomes.
- Wallet ambiguity never causes blind double vending.
- Direct-credit behavior is implemented only against a real specification.
- Configuration is versioned and rollbackable.
- A deliberately different fake OEM passes conformance tests.
- A second real OEM passes sandbox certification.
- One real station passes shadow reads and reconciliation.
- One authorized canary vend completes through wallet, adapter, OEM, receipt, notification, and reconciliation.
- A rollback drill restores the last-known-good configuration and application.
- Operations and support runbooks are approved.

---

## 22. Final Recommendation

Beverly should evolve the current OEM Hub into an integration control plane and move all manufacturer-specific behavior into a canonical OEM Integration Gateway.

The first engineering task should not be adding more endpoint rows for another manufacturer. It should be extracting Calinmeter into the first versioned adapter and proving that existing Beverly behavior remains unchanged. Once that boundary exists, the second OEM becomes the acceptance test of the architecture rather than another set of conditionals embedded across CRM, wallet, telemetry, and frontend code.

Commence the work only after the current KYC changes are safely checkpointed, `main` is clean and pushed, the last-known-good application and database state are backed up, and a fresh OEM worktree has been created from that exact starting commit.

---

## 23. Fresh-Worktree End-to-End Readiness Check (2026-09-14)

This checkpoint applies to `codex/multi-tenant-oem-pipeline` at `ff54438d`, in `Beverly-multi-oem-v2`. The worktree was clean when checked. The historical `Beverly-multi-oem-gateway` worktree was not used. This is a static and local-test checkpoint, not sandbox or production certification.

### 23.1 Verified execution-path blockers

| Path | Current evidence | Required gate |
|---|---|---|
| CRM request to OEM | `api/reference.js` uses `X-Oem-Id`, resolves a manufacturer, and falls back to the incoming path when translation fails around line 5020. | Authorize installation, require a mapped canonical operation, enforce status and capability, and transform method, request, and response. |
| CRM station/meter mirror | `api/reference.js` uses `oemConfig?.id` near lines 5143 and 5155, and calls `upsertMeterRecord(item)` without installation near line 5114. | Use validated installation UUIDs in every mapping and mirror write. |
| Wallet registry | `backend/wallet/src/services/oem-registry.ts` queries `oem_credentials.station_id` near line 144, despite the foundation migration defining no such column. | Introduce installation credentials. Remove the invalid filter. |
| Wallet vendor vend | `backend/wallet/src/services/vending.ts` first calls `lookupMeter(input.meterId)` near line 183; order records carry manufacturer `oem_id`, not installation identity. | Resolve one authorized installation before pricing, hold, idempotency, or dispatch. |
| Wallet customer vend | `backend/wallet/src/services/customer-purchase.ts` first calls `lookupMeter(input.meterId)` near line 300. The purchase insert near line 331 lacks installation identity. | Resolve approved link and installation. Persist both before any hold. |
| Token execution | `backend/wallet/src/services/token-engine.ts` retains provider-specific payloads and a direct-credit rejection. | Extract Calinmeter unchanged. Keep unknown strategies unsupported until specified. |
| Telemetry and sync | `daily_meter_readings` indexes station/meter/date. `consumption_sync_station_state` inserts and claims by station alone. | Expand schema, backfill installation IDs, verify collisions, then switch uniqueness and claims. |
| Credential security | Wallet registry warns and uses a default encryption key when configuration is missing. CRM crypto has a development fallback. | Production startup and readiness fail closed; version and rotate keys. |

### 23.2 Cross-cutting acceptance gates

The following must be proven together, not independently:

1. An authenticated actor can see only authorized tenant installations. Unknown, draft, suspended, retired, and ambiguous installations cannot reach an upstream call.
2. An internal station or meter UUID resolves to exactly one installation-scoped external identifier. Duplicate external IDs across installations remain separate in CRM, wallet, telemetry, reports, and archived evidence.
3. Every advertised operation has a validated canonical request and response, explicit method, capability, timeout, error classification, and adapter version. Missing mappings fail closed.
4. Production outbound calls use approved HTTPS hosts, DNS/private-network checks, redacted logs, and installation-scoped credentials. Credential rotation and stale-revision rejection work across instances.
5. A vend hold and durable command exist before dispatch. Confirmed delivery captures once; definitive failure releases once; timeout remains unknown until status reconciliation. Duplicate requests cannot double-vend.
6. Signed webhooks reject missing or invalid signatures, stale timestamps, reused nonces, and duplicate event IDs. Polling and webhook delivery converge on one canonical reading and one outcome.
7. Installation-scoped leases, quotas, circuit breakers, retries, and cursors work across serverless instances. A process-local cache cannot serve as their authority.
8. Backfill verification compares row counts, collision sets, daily deltas, tariff valuations, rollups, reports, customer links, purchase orders, receipts, and ledger totals before any read switch.
9. Configuration revisions are immutable. Rollback stops new commands but preserves pending command evidence and reconciliation. Old application code remains compatible with expanded schema.
10. The same adapter conformance suite passes Calinmeter and a deliberately different offline fake OEM. A real second OEM additionally requires its specification, sandbox, authorized test resources, and canary approval.

### 23.3 Verification limits and external blockers

Local `node tests/oem-registry.test.cjs` passed. Local `node tests/supabase-migrations.test.cjs` passed. This fresh worktree has no `node_modules`; wallet tests, full regression, and builds have not yet run here. No database backup, deployment flag inventory, remote CI result, preview smoke, staging guard, sandbox evidence, or rollback drill was available in this checkout. No real second-OEM specification, credentials, sandbox, or written canary authorization was supplied. These missing inputs must remain explicit blockers; no OEM semantics or production readiness should be inferred.

### 23.4 Phase gate

Phase 1 may begin against the confirmed public seams: adapter contract, gateway API, wallet vending API, and telemetry ingestion API. Phase 2 must preserve captured Calinmeter behavior. Phase 3 requires expand-only migrations and measured backfill verification before gateway routing. Phase 5 must precede wallet write cutover. Phase 9 and production activation remain blocked on real-OEM evidence and authorization.

### 23.5 Implementation checkpoint (2026-09-14)

- The fresh worktree baseline built all existing applications successfully using the frozen lockfile. The local runtime is Node 24, while the repository requires Node 22; Node 22 and remote CI verification remain outstanding.
- Phase 1 started at `packages/oem-contracts/`. A public-seam test first failed because the package did not exist, then passed after adding fail-closed resolution for ambiguous installation candidates.
- This initial contract does not query or authorize candidates. Its caller must supply actor- and resource-scoped candidates. No CRM, wallet, or telemetry caller has switched to it yet.
- Phase 1 remains incomplete. Adapter interfaces, capability enforcement, canonical operation models, gateway execution, and conformance still require separate red-green slices.
- Phase 1 verification: `node tests/oem-contracts.test.cjs`, `node tests/oem-registry.test.cjs`, `node tests/supabase-migrations.test.cjs`, `npm run build`, `npm test`, and the full wallet Vitest suite all passed locally. Wallet Vitest reported 62 files and 434 tests passed. The new contract test is included in `pretest` for subsequent runs.
- A second red-green contract slice now rejects inactive installations. Tenant mismatch also fails closed. Active, matching-tenant identity passes. The contract still lacks actor permission and resource mapping; no live caller may rely on it alone.
- Browser, remote CI, deployed preview, staging, Node 22, database restore, and real-OEM sandbox checks remain unverified. Local passing tests do not establish end-to-end certification.
- No migration, OEM dispatch, production configuration, or activation was changed.

### 23.6 Canonical adapter checkpoint (2026-09-14)

- The shared package now defines the audited core adapter methods, installation-scoped lookup and vend command types, a capability-state model, and the five normalized vend outcomes.
- Red-green contract tests deny missing or insufficient capabilities. Another red-green test denies a claimed vend success lacking a provider reference.
- A further red-green test rejects malformed provider references on pending outcomes. Optional token evidence now requires a non-empty string.
- A compile-time public adapter fixture checks the core interface. `npm run test:oem` runs runtime and type checks during root `pretest`.
- `npm run test:oem`, `npm run build`, and `npm test` passed after the final vend-outcome validation. The full wallet Vitest suite last passed before this slice; it remains a separate final regression gate.
- These are contracts, not a conforming Calinmeter adapter. No wallet capture path consumes the outcome validator yet. Phase 1 and all later phases remain incomplete.

### 23.7 Calinmeter extraction checkpoint (2026-09-14)

- Phase 2 began with two observed wallet wire formats: credit-token generation and remote token task creation. Their request builders now live in `backend/wallet/src/adapters/calinmeter-v1.ts`.
- Existing `token-engine.ts` exports remain compatibility facades. Authorization stays server-owned. The same call sites still use the same URL, method, authentication, and response handling.
- Two adapter-seam tests failed before extraction, then passed. The existing token-engine suite passed all 21 tests afterward. No real OEM specification was inferred.
- This is not complete adapter extraction. Meter lookup, station reads, token response parsing, remote-task lifecycle, telemetry, CRM proxy behavior, and dynamic authentication remain Calinmeter-shaped elsewhere.
- No production routing, database schema, activation, or financial state transition changed. Full wallet Vitest passed: 63 files, 436 tests. `npm run build` and `npm test` passed. Tests ran under local Node 24, not the declared Node 22. Browser, remote CI, staging, and real-OEM checks remain unverified.

### 23.8 Calinmeter response checkpoint (2026-09-14)

- Credit-token response aliases and fallbacks now parse inside `calinmeter-v1.ts`. The test uses `contracts/samples/credit-token-generate.code-reason-result.json`, which is labelled an observed-shape capture rather than a certified live sandbox record.
- The adapter test failed before implementation, then passed. Existing token-engine tests passed all 21 cases. Missing tokens still produce the wallet's `token_missing` error.
- The parser preserves current amount, units, timestamp, record-ID, and token alias behavior. It does not yet validate monetary finiteness or certify upstream financial truth; those remain separate fail-closed gateway and reconciliation work.
- Full wallet regression passed: 63 files, 437 tests. `npm run build` and `npm test` passed. Node 22, browser, remote CI, staging, and OEM sandbox verification remain outstanding.

### 23.9 Calinmeter account checkpoint (2026-09-14)

- Wallet account-envelope parsing, exact meter selection, field aliases, and boolean normalization now live in `calinmeter-v1.ts`. The wallet still owns local/historical fallback and station authority checks.
- A red-green adapter test used the captured `api__account__read.json` response. A second parity test covered the captured nested `account-read.code-msg-data.json` envelope.
- Existing token-engine tests passed all 21 cases. Wallet TypeScript build passed. No installation authority was inferred from a bare meter serial; the current default-first lookup remains a documented blocker.
- Full wallet regression passed: 63 files, 439 tests. `npm run build` and `npm test` passed. Node 22, browser, remote CI, staging, and OEM sandbox verification remain outstanding. No deployment or OEM activation changed.

### 23.10 Calinmeter remote-task checkpoint (2026-09-14)

- Calinmeter task status codes, result-row normalization, and remark mapping now live in `calinmeter-v1.ts`. `token-engine.ts` retains a compatibility export for remarks.
- A red-green adapter test used the captured `API__RemoteMeterTask__GetTokenTask.json` failure row. A second parity test covered its success row.
- Existing token-engine tests passed all 21 cases. Wallet TypeScript build passed. Task search, create/update dispatch, polling, retries, and financial reconciliation still reside outside the adapter.
- Full wallet regression passed: 63 files, 441 tests. `npm run build` and `npm test` passed. Node 22, browser, remote CI, staging, and OEM sandbox verification remain outstanding. No production routing changed.
