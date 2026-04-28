Production Support Guide
========================

Service Map
-----------
- frontend: Vue 2 build
- API: Vercel functions
- upstream: Odyssey API
- local storage: SQLite
- fallback: reference facade

Daily Checks
------------
- open production URL
- call `/api/system/health`
- call `/api/system/live-report`
- verify dashboard panels
- verify account read
- confirm write guard

Smoke Command
-------------
```powershell
$env:TARGET_URL="https://production-url"
npm run smoke:vercel
```

Expected Health
---------------
- `ok` is true
- read mode is live
- live proxy is enabled
- writes are disabled
- route summary has zero mixed routes

Log Review
----------
- `[live-auth-failure]` needs token review
- `[live-schema-drift]` needs schema review
- `[fallback-cache]` should be rare
- `[fallback-facade]` should be rare
- `[write-request]` requires approval trace
- `[write-response]` requires approval trace

Write Incidents
---------------
- set `ALLOW_LIVE_WRITES=false`
- redeploy immediately
- collect audit records
- collect upstream response
- follow rollback guidance

Upload Incidents
----------------
- disable writes
- preserve uploaded filename
- preserve file size
- preserve operator details
- verify file type policy

Token Incidents
---------------
- rotate token immediately
- update Vercel secret
- redeploy preview
- run smoke
- promote only after pass

Visual Issues
-------------
```powershell
$env:PARITY_TARGETS="dashboard,account"
npm run diff
```

Escalation Data
---------------
- production URL
- failing route
- request method
- response status
- response code
- proxy source
- timestamp

Done Criteria
-------------
- issue is reproduced
- guard state is known
- logs are reviewed
- rollback is documented
