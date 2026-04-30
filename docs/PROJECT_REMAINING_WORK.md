Project Remaining Work
======================

Snapshot
--------

Date: 2026-04-28

Project: Beverly by ACOB

Current state:
- visible routes: 23 of 23 live-ready or live-derived
- full route matrix: 38 routes
- live-ready routes: 35
- live-derived routes: 1
- blocked upstream routes: 1
- guarded write routes: 1
- mixed routes: 0

Completed
---------

Core app:
- Vue 2 frontend shell is built.
- Vercel API proxy is built.
- Local facade fallback is built.
- Shared mapper service layer is built.
- Dashboard service owns dashboard reads.
- Action service owns CRUD/write submits.
- Table service owns route read orchestration.
- SQLite local audit/cache store is built.
- Role visibility is implemented.
- CRUD modal flows are implemented.
- Import, export, print, and receipt helpers are implemented.

Live cutover:
- live bearer token support is wired through environment variables
- live sample capture tooling exists
- live route matrix tooling exists
- live report tooling exists
- every visible route has live-ready or live-derived data
- hidden mapped read routes are mostly live-ready
- Consumption Statistics derives from hourly readings because upstream report endpoint fails
- dashboard placeholder arrays are removed from production state
- dashboard panels use live dashboard data
- dashboard charts use live dashboard and hourly data
- write guard remains configurable through `ALLOW_LIVE_WRITES`

Verification:
- `npm test` passes
- `npm run build` passes
- `npm run live:report` passes
- focused `npm run diff` passes
- route matrix records live-read status
- smoke tooling exists for Vercel preview
- upload policy tests pass
- live health reporting exists
- CORS controls exist
- API rate limits exist
- write approval docs exist
- token rotation docs exist
- monitoring docs exist
- backup and recovery docs exist
- production support docs exist

Remaining Work
--------------

1. Deploy Preview To Vercel
---------------------------

Status: blocked locally.

Reason:
- Vercel MCP returned CLI guidance only.
- local `vercel` CLI is not installed.
- preview URL is not available yet.

Tasks:
- create Vercel project
- set project root
- set build command: `npm run build`
- set output directory: `dist`
- add all required environment variables
- deploy preview
- save preview URL

Required env vars:
- `LIVE_READ_MODE=live`
- `LIVE_API_PROXY_ENABLED=true`
- `LIVE_API_BASE_URL=http://8.208.16.168:9310`
- `LIVE_API_BEARER_TOKEN=<secure token>`
- `ALLOW_LIVE_WRITES=false` for preview
- `LOCAL_DB_MODE=memory` for Vercel preview
- `LOCAL_DB_PATH=/tmp/reference-crm.sqlite` only when the runtime supports SQLite
- `JWT_SECRET=<secure secret>`
- `CORS_ORIGINS=<preview origin>`

Validation:
```powershell
$env:TARGET_URL="https://your-preview-url.vercel.app"
npm run smoke:vercel
```

Done when:
- smoke command passes
- dashboard loads in browser
- account table loads in browser
- write request returns `403` while guarded

2. Production Deployment
------------------------

Status: not done.

Tasks:
- promote preview to production
- configure custom domain if needed
- set production environment variables
- run post-deploy smoke
- verify login
- verify dashboard
- verify table routes
- verify write guard

Recommended production writes:
- keep `ALLOW_LIVE_WRITES=false`
- enable writes only after manual approval workflow exists

Done when:
- production URL passes `npm run smoke:vercel`
- production dashboard reads live data
- production write guard behavior is confirmed

3. Upstream DLT645 Access
-------------------------

Status: blocked by upstream.

Route:
- `#/protocol/dlt645`

Endpoint:
- `/api/dlt645/read`

Observed result:
- HTTP `403`
- empty response body

Likely cause:
- bearer token lacks required permission
- endpoint is protected differently upstream
- endpoint may require a different role token

Tasks:
- ask upstream provider for required permission
- test with a token containing DLT645 permissions
- capture a successful sample
- rerun route matrix

Validation:
```powershell
npm run samples:capture -- /api/dlt645/read
npm run route-matrix:capture
npm run live:report
```

Done when:
- route source changes from `blocked` to `live-ready`

4. File Upload Write Workflow
-----------------------------

Status: implemented and guarded.

Route:
- `#/remote-support/file-upload`

Endpoint:
- `/API/File/Upload`

Reason:
- upload is a write/transfer action
- user confirmation is required before real outbound upload
- current policy keeps it guarded

Implemented:
- allowed file types are defined in `src/services/upload-policy.mjs`
- max upload size is 4MB
- upload confirmation uses the existing action modal
- upload requires authorization password
- upload endpoint is classified as a write
- upload request is audited through write confirmations and import job tracking
- upload remains guarded unless writes are enabled

Remaining:
- verify Vercel payload behavior with a non-production file
- run staging upload only after explicit approval

Done when:
- upload remains blocked by default
- upload can be enabled deliberately
- upload action is audited

5. Live Write Approval Workflow
-------------------------------

Status: implemented locally, pending staging exercise.

Current local setting:
- `.env` has `ALLOW_LIVE_WRITES=true`

Production recommendation:
- keep writes disabled until workflow is finished

Implemented:
- per-action confirmation text exists
- authorization password is required where applicable
- write payloads are logged
- write responses are logged
- write confirmations are stored locally
- upload is included in write detection
- rollback guidance is documented in `docs/LIVE_WRITE_APPROVAL_RUNBOOK.md`
- manual approval checklist is documented

Remaining:
- test one low-risk write in staging after approval

Covered write families:
- create
- update
- delete
- import
- generate
- cancel
- reset
- modify
- upload

Done when:
- writes are auditable
- writes are deliberately enabled
- staging write smoke passes
- production write enablement is documented

6. Supabase Migration
---------------------

Status: not started.

Current state:
- local SQLite is used for cache, audit, import jobs, export jobs, print jobs, and write confirmations
- Vercel can use memory mode until Supabase is added

Tasks:
- create Supabase project
- design database schema
- migrate SQLite tables
- add migration scripts
- add Supabase service client
- move local database access behind a storage adapter
- keep SQLite for local mode
- add Supabase env vars

Suggested env vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_STORE_MODE=supabase`

Done when:
- Vercel functions use Supabase storage
- local mode still works
- audit records persist across deployments

7. Token Rotation Runbook
-------------------------

Status: documented.

Implemented:
- bearer token owner documented
- expiry checks documented
- rotation schedule documented
- emergency rotation documented
- smoke after rotation documented
- secure storage notes documented

Document:
- `docs/TOKEN_ROTATION_RUNBOOK.md`

Done when:
- token rotation can happen without code changes
- preview validates token before production

8. Monitoring And Alerts
------------------------

Status: implemented locally, external monitor workflow added.

Implemented:
- `/api/system/health`
- `/api/system/live-report`
- route source counters
- auth failure log marker
- schema drift log marker
- cache fallback log marker
- facade fallback log marker
- rate-limit response source
- monitoring notes in `docs/MONITORING_AND_ALERTS.md`
- hourly GitHub Actions smoke workflow
- preview target repository variable support
- production target repository variable support

Remaining:
- set `PREVIEW_TARGET_URL` after preview deploy
- set `PRODUCTION_TARGET_URL` after production deploy

Done when:
- live failures are visible
- fallback usage is exceptional
- schema drift is caught before release

9. Visual Parity Final Pass
---------------------------

Status: full route batches complete.

Current known result:
- previous report exists at `replica-screenshots/phase-11/visual-parity-report.json`
- focused dashboard/account/customer/gateway/tariff diff completed
- dashboard desktop diff is 6.15%
- account desktop diff is 9.11%
- customer desktop diff is 9.51%
- gateway desktop diff is 4.57%
- tariff desktop diff is 5.01%
- focused desktop routes are all under 10%
- full compared route batches are under 10%
- mobile overflow count is 0
- diff reflects live dataset differences
- dashboard parity mode uses reference-stable chart data
- full route diff can run in batches with `PARITY_TARGET_OFFSET`

Remaining:
- compare routes with missing reference screenshots when source captures exist
- continue spacing fixes only when a batch exceeds 10%

Command:
```powershell
$env:PARITY_TARGETS="dashboard,account"
$env:PARITY_SKIP_MOBILE="true"
npm run diff
```

Expanded command:
```powershell
$env:PARITY_TARGETS="dashboard,account,customer,gateway,tariff"
$env:PARITY_SKIP_MOBILE="true"
npm run diff
```

Done when:
- major visual diffs are explained or fixed
- dashboard remains stable with live series
- tables do not overflow

10. Browser QA
--------------

Status: automated smoke exists, manual cross-browser pending.

Target browsers:
- Chrome
- Edge
- Firefox
- Safari where available

Flows:
- login
- dashboard
- account table
- credit token record
- remote task tables
- report pages
- management pages
- export
- print
- guarded write

Implemented:
- browser QA covers Edge locally
- Chromium, Firefox, and WebKit are skipped when Playwright browsers are unavailable
- covered flows: login, dashboard, account table, credit token record, remote task table, report page, export, print, guarded write

Done when:
- all key workflows pass manually
- no layout-breaking browser issues remain

11. Documentation Cleanup
-------------------------

Status: complete for local handoff.

Implemented:
- `ARCHITECTURE.md` updated with Phase 13 live-read state
- final release checklist added
- token rotation runbook added
- live write approval runbook added
- monitoring guide added
- backup and recovery guide added
- production support guide added
- obsolete sample archive added
- known upstream issues are documented

Remaining:
- keep docs current after preview deployment

Done when:
- new developer can deploy and operate the app from docs

12. Security Hardening
----------------------

Status: implemented locally, deployment review pending.

Implemented:
- `.env` is gitignored
- `.env.example` contains empty secret values
- upload safeguards exist
- authorization passwords are stripped from stored payloads
- write guard is controlled by env
- token values are not logged by proxy
- CORS is env-configurable
- rate limits are env-configurable
- production environment validator exists
- production security config test exists

Remaining:
- run `npm run security:check` after production env is set
- replace default `JWT_SECRET` in deployment
- review CORS for production origin only
- verify write guard in production
- complete log review after preview deployment

Done when:
- production env has secure secrets
- write and upload paths are controlled
- logs do not expose bearer tokens

Known Blockers
--------------

1. DLT645 upstream block
- endpoint: `/api/dlt645/read`
- status: `403`
- owner: upstream API/provider
- workaround: keep route marked blocked

2. Vercel preview unavailable
- preview smoke cannot run without URL
- owner: deployment step
- workaround: local build and local tests pass

3. File upload requires explicit approval
- endpoint: `/API/File/Upload`
- reason: outbound file transfer/write
- workaround: keep guarded

Recommended Next Order
----------------------

1. Deploy Vercel preview.
2. Run `npm run smoke:vercel`.
3. Fix preview-only issues.
4. Request DLT645 permission.
5. Build write approval workflow.
6. Build Supabase storage adapter.
7. Run final screenshot diff.
8. Promote to production.

Release Gate
------------

Before production:
```powershell
npm run route-matrix:capture
npm run live:report
npm test
npm run build
$env:TARGET_URL="https://your-preview-url.vercel.app"
npm run smoke:vercel
```

Production ready when:
- all visible routes stay live-ready or live-derived
- preview smoke passes
- write guard is confirmed
- DLT645 blocker is accepted or resolved
- file upload policy is accepted
- production secrets are configured
