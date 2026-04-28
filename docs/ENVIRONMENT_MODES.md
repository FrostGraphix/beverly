Environment Modes
=================

Production
----------
- `LIVE_READ_MODE=live`
- `LIVE_API_PROXY_ENABLED=true`
- `ALLOW_LIVE_WRITES=false`
- facade is outage fallback only

Preview
-------
- `LIVE_READ_MODE=live`
- `LIVE_API_PROXY_ENABLED=true`
- `ALLOW_LIVE_WRITES=false`
- run `npm run smoke:vercel`

Staging
-------
- `LIVE_READ_MODE=live`
- `LIVE_API_PROXY_ENABLED=true`
- `ALLOW_LIVE_WRITES=false`
- enable writes only for controlled write testing

Local
-----
- `LIVE_READ_MODE=local`
- `LIVE_API_PROXY_ENABLED=false`
- facade and SQLite are allowed

Bearer Rotation
---------------
- update `LIVE_API_BEARER_TOKEN`
- redeploy preview first
- run smoke checks
- promote after reads pass

Read Failure Behavior
---------------------
- live read succeeds: return live payload
- live read business-fails: skip cache write
- live outage: use cache or facade fallback
- write request: block unless `ALLOW_LIVE_WRITES=true`
