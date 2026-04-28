Obsolete Sample Archive
=======================

Purpose
-------
- preserve old sample context
- prevent stale implementation use
- keep live route work current

Current Source
--------------
- `docs/AMR_API_REFERENCE.md`
- `contracts/live-route-matrix.json`
- `tmp/reference-crawl-results.json`
- captured live samples under `tmp`

Archived Notes
--------------
- early fixture rows are obsolete
- placeholder dashboard arrays are obsolete
- mixed-route notes are obsolete
- generic CRM assumptions are obsolete

Current Policy
--------------
- prefer live samples
- prefer route matrix status
- prefer facade only as fallback
- keep DLT645 blocked
- keep Supabase deferred

Before Reusing Samples
----------------------
- check route matrix date
- confirm endpoint path
- confirm response shape
- confirm proxy source
- confirm token scope

Do Not Use
----------
- static dashboard chart arrays
- old generic table fixtures
- undocumented route guesses
- failed Consumption Statistics payloads
- DLT645 failure samples as schema truth

Refresh Command
---------------
```powershell
npm run samples:capture
npm run route-matrix:capture
npm run live:report
```

Done Criteria
-------------
- stale notes are identified
- current sources are named
- new developers avoid fixtures
