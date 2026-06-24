Final Release Checklist
=======================

Release Status
--------------
- blocked as of 2026-05-20
- local build passes
- local security gates pass
- local wallet gates pass
- Supabase migrations are applied
- Wallet Admin now deploys at `/wallet-admin/`
- public Vercel smoke needs latest successful preview URL
- GitHub monitoring smoke is manual until target URLs exist
- staging write guard uses the same preview URL
- remote CI status is unverified locally
- do not promote to production

Local Gates
-----------
```powershell
npm run route-matrix:capture
npm run live:report
npm test
npm run build
$env:PARITY_TARGETS="dashboard,account"
npm run diff
```

Preview Gates
-------------
```powershell
$env:PREVIEW_TARGET_URL="https://beverly-3lrokjz2q-danmusa-abdulsamads-projects.vercel.app"
$env:TARGET_URL=$env:PREVIEW_TARGET_URL
$env:VERCEL_PROTECTION_BYPASS="<preview-bypass-secret>"
$env:SMOKE_AUTH_TOKEN="<smoke-token>"
npm run smoke:vercel
$env:STAGING_TARGET_URL=$env:PREVIEW_TARGET_URL
npm run write:staging
```

Use `SMOKE_USER_ID` and `SMOKE_PASSWORD` when no token exists.

Latest unread deployment failure:
- `2026-06-13T08:54:37Z`
- project: `acob-crm-4-clean-deploy`
- deployment: `dpl_ApHZfUvEfjjC1UNM6Rk6TjE1We6S`
- latest `beverly` failure: `dpl_4TL5qsL4Dbe9FuAgx9xWSRrY9fMS`

Run `.github/workflows/monitoring-smoke.yml` with `workflow_dispatch`.
Re-enable schedules only after target repository variables exist.

Manual QA
---------
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

Browser QA
----------
- Chrome
- Edge
- Firefox
- Safari where available

Security QA
-----------
- production `JWT_SECRET` replaced
- `ALLOW_LIVE_WRITES=false` unless approved
- CORS restricted to production domains
- rate limits enabled
- upload policy reviewed
- bearer token stored in Vercel only
- no secrets committed

Known Acceptances
-----------------
- `/api/dlt645/read` may remain blocked until upstream grants permission
- `/API/File/Upload` remains guarded unless explicitly enabled
- Consumption Statistics is live-derived from hourly readings

Release Decision
----------------
- approve only when all gates pass
- reject while any release gate fails
- reject while remote CI is red
- reject while public smoke is blocked
- reject while Supabase preview smoke is unproven
- record deployed URL
- record env mode
- record token rotation date
- record backup location
