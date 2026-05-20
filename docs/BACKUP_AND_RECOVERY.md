Backup And Recovery
===================

Scope
-----
- local SQLite storage
- Vercel environment values
- route contracts
- live sample artifacts
- release documentation

Local Storage
-------------
- default path: `tmp/reference-crm.sqlite`
- Vercel path: `/tmp/reference-crm.sqlite`
- backup local files before release testing
- never commit local database files

Backup Command
--------------
```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "tmp\reference-crm.sqlite" "tmp\backup-reference-crm-$stamp.sqlite"
```

Restore Command
---------------
```powershell
Copy-Item "tmp\backup-reference-crm-YYYYMMDD-HHMMSS.sqlite" "tmp\reference-crm.sqlite"
```

Environment Recovery
--------------------
- keep secrets in Vercel
- keep `.env` local only
- rotate bearer tokens after exposure
- rotate `JWT_SECRET` after exposure
- rerun preview smoke after changes

Contract Recovery
-----------------
- regenerate contracts from reference data
- capture live samples again
- regenerate route matrix
- rerun live report

Commands
--------
```powershell
npm run contract:generate
npm run samples:capture
npm run route-matrix:capture
npm run live:report
npm test
npm run build
```

Incident Recovery
-----------------
- disable writes first
- set `ALLOW_LIVE_WRITES=false`
- preserve logs
- preserve request payloads
- preserve response payloads
- restore local database
- redeploy with safe env

Done Criteria
-------------
- app starts cleanly
- health endpoint passes
- live report passes
- smoke passes
- write guard is confirmed
