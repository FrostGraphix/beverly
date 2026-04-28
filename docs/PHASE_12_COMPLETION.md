Phase 12 Completion
===================

Architecture fit
- `api/` owns Vercel serverless entrypoints.
- `vercel.json` owns production routing.
- `tools/vercel-smoke.cjs` owns deployment smoke checks.
- `tests/vercel-production.test.cjs` guards preview-safe behavior.

Implemented
- Vercel catch-all API runtime config
- SPA rewrite for non-API routes
- production health endpoint
- deploy smoke tool
- protected write smoke check
- env example updates
- Vercel runbook

Verified locally
- `npm run test`
- `npm run build`

Blocked from local machine
- actual Vercel preview deployment
- actual production deployment
- live preview smoke against Vercel URL

Ready steps
- set Vercel env vars
- deploy preview
- run `npm run smoke:vercel`
- enable writes only after preview passes
