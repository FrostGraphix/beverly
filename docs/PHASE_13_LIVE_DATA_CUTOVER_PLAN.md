Phase 13 Live Data Cutover Plan
===============================

Goal
----

Remove mock and facade-first behavior from day-to-day app flows.
Populate the full project from the real live API.
Keep rollback and write safety intact.

Architecture Fit
----------------

- `src/services/api.js` remains the live client entry.
- `src/services/response-normalizers.mjs` remains the shape adapter layer.
- `src/services/table-service.js` remains the table orchestration layer.
- `api/reference.js` remains the only Vercel proxy boundary.
- `backend/reference-facade/` becomes fallback and test-only support.
- `contracts/` remains the source of truth for endpoint and sample tracking.
- `tests/` remains the release gate for live-read compatibility.

Phase Outcome
-------------

Done when:

- every visible route reads from live API by default
- hidden routes with mapped endpoints also read live by default
- no user-facing page depends on hardcoded demo rows
- facade fallback is only used for outages, local demo mode, and tests
- contract drift is detected before release
- live-read parity is measured route by route
- protected writes remain gated until explicitly enabled

Non-Goals
---------

- changing business logic
- inventing new routes
- removing write guards
- deleting fallback tooling needed for local development
- replacing the proxy architecture

Core Principle
--------------

Live data becomes the primary source.
Mock data becomes controlled fallback.
Nothing user-facing should silently prefer fake rows over real rows.

Workstreams
-----------

1. Live Read Inventory

- classify every route by current data source
- mark routes as `live-ready`, `mixed`, `facade-only`, or `unmapped`
- map each route to exact endpoint set
- map each action modal to exact read dependencies
- document missing live samples

Artifacts:

- `contracts/live-route-matrix.json`
- `docs/live-route-gap-audit.md`

2. Contract and Sample Expansion

- capture fresh live samples for every read endpoint in use
- capture empty, partial, paginated, and error cases
- capture casing variants seen in production
- store route-linked samples under `contracts/samples/`
- add timestamps and source metadata to each sample

Artifacts:

- expanded `contracts/samples/`
- `contracts/live-observation-log.json`

3. Response Normalization Hardening

- review every visible and hidden route payload shape
- extend normalizers for all live variants
- remove remaining assumptions tied to facade-only field names
- preserve raw payloads for debugging
- add route-specific guards for missing fields

Files likely touched:

- `src/services/response-normalizers.mjs`
- `src/services/record-mappers.mjs`
- `src/services/table-service.js`

4. Table and Dashboard Live Cutover

- switch dashboard widgets to validated live series only
- switch every visible table page to real live rows by default
- switch hidden table pages where endpoint mapping exists
- remove seeded chart-only placeholder series from production mode
- preserve controlled local fallback for dev and outages

Files likely touched:

- `src/components/DashboardPage.vue`
- `src/components/TablePage.vue`
- `src/services/table-helpers.mjs`
- `src/services/table-service.js`

5. Facade Demotion

- keep facade for local offline mode
- keep facade for smoke tests
- keep facade for explicit fallback on live failure
- remove facade-first assumptions in UI messaging
- add explicit source markers in debug logs only

Files likely touched:

- `api/reference.js`
- `backend/reference-facade/handlers.js`
- `backend/reference-facade/data.js`

6. Environment Strategy

- define `production`, `preview`, `staging`, and `local` read modes
- enable live reads in preview by default
- keep writes off in preview unless explicitly testing
- document bearer token rotation
- document fail-open versus fail-closed behavior for reads

Required env review:

- `LIVE_API_PROXY_ENABLED`
- `LIVE_API_BASE_URL`
- `LIVE_API_BEARER_TOKEN`
- `ALLOW_LIVE_WRITES`
- `LOCAL_DB_PATH`

7. Error Handling and Observability

- log live endpoint failures with route context
- log normalization failures with sample snapshot ids
- distinguish auth failures, schema drift, and empty datasets
- expose a lightweight live health report
- add drift counters for preview verification

Files likely touched:

- `api/reference.js`
- `tools/vercel-smoke.cjs`
- new `tools/live-read-report.cjs`

8. Automated Verification

- add live-read smoke for every visible route
- verify each page loads rows or expected empty-state from live API
- verify filters and pagination still work with live totals
- verify export and print consume live-derived normalized rows
- verify route parity screenshots after live cutover

New tests and tools:

- `tests/live-route-smoke.test.cjs`
- `tests/live-normalization-regression.test.mjs`
- `tools/capture-live-route-matrix.cjs`

9. Rollout Sequence

Wave 1:
- dashboard
- credit token
- credit token record
- account

Wave 2:
- remaining visible token routes
- remote task routes
- report routes

Wave 3:
- management routes
- hidden admin and support routes

Wave 4:
- remove production dependence on placeholder dashboard series
- tighten fallback rules

10. Exit Cleanup

- remove dead placeholder generators from production paths
- mark facade datasets as test fixtures, not primary app data
- archive obsolete sample sets
- update architecture and runbooks

Detailed Execution Plan
-----------------------

Step 1. Build a route source matrix

- enumerate all routes from `src/data/route-manifest.js`
- list all read endpoints per route
- mark current source path:
  - live
  - cache
  - facade
  - hardcoded UI
- identify remaining hardcoded arrays and chart series

Step 2. Capture live payloads

- run authenticated live reads for each route endpoint
- save success payload
- save empty-state payload where possible
- save one error payload per critical endpoint class

Step 3. Normalize every shape

- extend collection normalizers
- extend dashboard metric normalizers
- extend chart payload normalizers
- add field-level fallback mapping only where proven necessary

Step 4. Cut over visible routes

- toggle route by route behind a read-mode flag
- validate screenshots and smoke outputs
- promote route after passing checks

Step 5. Cut over hidden routes

- repeat endpoint validation for admin and support modules
- keep hidden routes disabled for roles lacking permission

Step 6. Remove production mock dependence

- delete production use of static dashboard bar arrays
- delete production use of fake empty row builders
- retain fixture-backed fallback only in local demo mode

Risk Register
-------------

1. Schema drift
- risk: live payload shape changes
- mitigation: sample capture plus regression tests

2. Auth expiry
- risk: preview or production reads fail silently
- mitigation: health endpoint plus smoke command plus log alerts

3. Partial data
- risk: some routes return empty or sparse payloads
- mitigation: explicit empty-state handling and route-level samples

4. Mixed casing
- risk: `/API` and `/api` path mismatch
- mitigation: keep alias normalization in proxy and contract map

5. UI regression under real totals
- risk: pagination, filters, or print views break
- mitigation: route smoke plus parity runs after each wave

6. Fallback masking
- risk: facade hides live failures
- mitigation: track source in logs and fail route smoke on unexpected facade usage

Acceptance Criteria
-------------------

Required:

- all visible routes load from live API in preview
- all visible routes pass live smoke
- zero visible routes rely on hardcoded demo rows in production mode
- exports and prints use live-normalized rows
- dashboard cards and charts use live-derived values in production mode
- preview smoke passes against Vercel URL

Target:

- hidden routes with known endpoint mappings also cut over
- parity improves after live cutover, not worsens
- fallback usage becomes exceptional and logged

Suggested Deliverables
----------------------

- `docs/PHASE_13_COMPLETION.md`
- `docs/live-route-gap-audit.md`
- `contracts/live-route-matrix.json`
- `contracts/live-observation-log.json`
- `tests/live-route-smoke.test.cjs`
- `tests/live-normalization-regression.test.mjs`
- `tools/live-read-report.cjs`

Recommended First Sprint
------------------------

1. build route source matrix
2. capture live samples for dashboard, token, account
3. replace dashboard placeholder series with live-derived series
4. add live smoke for dashboard, credit token, credit token record, account
5. verify preview deployment against real API

After Phase 13
--------------

Immediate follow-up work:

- remove fallback-first behavior
- make facade test-only
- finish visual parity targets
- migrate SQLite schema to portable migrations
- add token rotation runbook
- add alerting and drift dashboards
- add production write approval workflow
- add backup and recovery docs
- add release checklist
- add post-deploy monitors

Likely Final Phases
-------------------

1. Live Data Cutover
2. Visual Parity Closure
3. Facade Demotion
4. Production Hardening
5. Postgres or Supabase Migration
6. Ops and Maintenance Docs

Biggest Remaining Milestone
---------------------------

True live-first production.
Mock data is no longer user-facing.

After Final Phases
------------------

Operational follow-up:

- production support mode
- ongoing contract drift checks
- API change monitoring
- token rotation cadence
- backup drills
- incident runbooks
- performance tuning
- audit review process
- role and permission reviews
- domain and branding cleanup

Steady-State Work
-----------------

Then it becomes:

- maintain
- monitor
- patch
- optimize
- scale

End State
---------

- no more big rebuild phases
- just release management
- reliability work
- incremental product changes
