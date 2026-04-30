Monitoring And Alerts
=====================

Local Health
------------
- `/api/system/health`
- confirms service mode
- confirms write guard state

Live Report
-----------
- `/api/system/live-report`
- returns route summary
- returns local storage counts
- exposes live-ready, live-derived, blocked, guarded, and mixed counts

Log Markers
-----------
- `[live-proxy]`: upstream request failure
- `[live-auth-failure]`: upstream 401 or 403
- `[live-schema-drift]`: upstream business failure
- `[fallback-cache]`: cache served route
- `[fallback-facade]`: facade served route
- `[write-request]`: write payload submitted
- `[write-response]`: write response received
- `rate-limit`: response proxy source for throttled traffic

Recommended Alerts
------------------
- any `[live-auth-failure]`
- any visible route using `[fallback-facade]`
- any nonzero mixed route count
- repeated schema drift
- production write guard disabled unexpectedly
- repeated rate-limit responses

Preview Schedule
----------------
- run smoke after every deployment
- run route matrix after token rotation
- run live report daily during rollout
- `.github/workflows/monitoring-smoke.yml` runs hourly when configured
- set repository variable `PREVIEW_TARGET_URL` to enable preview smoke
- manual runs can pass `target_url`

Production Uptime Monitor
-------------------------
- check `/api/system/health`
- check `/api/system/live-report`
- check dashboard page
- check account read
- `.github/workflows/monitoring-smoke.yml` runs hourly when configured
- set repository variable `PRODUCTION_TARGET_URL` to enable production smoke
- failures should page the release owner

GitHub Variables
----------------
- `PREVIEW_TARGET_URL`: preview smoke target
- `PRODUCTION_TARGET_URL`: production smoke target
- leave unset until the matching deployment exists

Done Criteria
-------------
- live failures are visible
- fallback usage is exceptional
- schema drift is caught before release
