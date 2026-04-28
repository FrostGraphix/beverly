Final Release Checklist
=======================

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
$env:TARGET_URL="https://your-preview-url.vercel.app"
npm run smoke:vercel
```

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
- record deployed URL
- record env mode
- record token rotation date
- record backup location
