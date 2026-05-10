Automation Command Center
=========================

Direction
---------
- Operational Command
- executive utility
- one report surface
- one route surface
- one operator script

Live Refresh Lane
-----------------
- hot refresh cron
- hourly refresh cron
- daily refresh cron
- backfill refresh cron
- refresh target orchestration
- snapshot capture policy
- consumption row persistence

Operations Ledger Lane
----------------------
- import job logging
- export job logging
- print job logging
- write confirmation logging
- audit log capture

Release Guard Lane
------------------
- PR and push CI
- hourly smoke monitoring
- manual log review
- manual env validation
- manual backfill runs
- manual uptime smoke

Operator Surfaces
-----------------
- API report: `/api/system/automation-report`
- CLI report: `npm run automation:report`
- health route: `/api/system/health`
- live route summary: `/api/system/live-report`

Status Meanings
---------------
- `ready`: active now
- `conditional`: active when backing service exists
- `missing`: config gap

Conditional Notes
-----------------
- snapshots need Supabase session storage
- consumption persistence needs Supabase consumption store

Expected Flow
-------------
1. read automation report
2. verify cron paths
3. verify CI workflows
4. run manual checks
5. inspect storage and snapshot state

Manual Commands
---------------
```powershell
npm run automation:report
npm run logs:review
npm run security:check
npm run consumption:backfill
$env:TARGET_URL="https://production-url"
npm run smoke:vercel
```
