Live Write Approval Runbook
===========================

Default Position
----------------
- production writes stay disabled
- set `ALLOW_LIVE_WRITES=false`
- enable writes only for approved windows

Write Families
--------------
- create
- update
- delete
- import
- generate
- cancel
- reset
- modify
- upload

Required Approval
-----------------
- action name
- endpoint
- route
- operator
- confirmation text
- authorization password where required
- rollback notes

Before Enabling Writes
----------------------
1. Confirm target environment.
2. Confirm endpoint.
3. Confirm sample payload.
4. Confirm rollback plan.
5. Set `ALLOW_LIVE_WRITES=true`.
6. Redeploy staging first.
7. Run smoke.

Audit Behavior
--------------
- request payload is logged
- response payload is logged
- write confirmation is stored
- authorization password is stripped from stored details
- upload/import jobs are tracked

Upload Policy
-------------
- allowed extensions: `.bin`, `.csv`, `.txt`, `.xml`, `.xls`, `.xlsx`
- maximum size: 4MB
- route: `#/remote-support/file-upload`
- endpoint: `/API/File/Upload`

Rollback Guidance
-----------------
- keep original exported data
- document affected record ids
- prefer upstream undo endpoints where available
- record manual correction steps

Production Enablement
---------------------
- require signed approval
- set time-boxed write window
- monitor logs during window
- reset `ALLOW_LIVE_WRITES=false` after completion

Done Criteria
-------------
- writes are auditable
- writes are deliberate
- staging write smoke passes
- production enablement is documented
