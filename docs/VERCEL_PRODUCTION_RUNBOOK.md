Vercel Production Runbook
=========================

Required env vars
- `LIVE_API_PROXY_ENABLED`
- `LIVE_READ_MODE`
- `LIVE_API_BASE_URL`
- `LIVE_API_BEARER_TOKEN`
- `ALLOW_LIVE_WRITES`
- `LOCAL_DB_PATH`

Recommended values
- `LIVE_API_PROXY_ENABLED=true`
- `LIVE_READ_MODE=live`
- `LIVE_API_BASE_URL=http://8.208.16.168:9310`
- `ALLOW_LIVE_WRITES=false`
- `LOCAL_DB_PATH=/tmp/reference-crm.sqlite`

Preview checks
1. Deploy to Vercel preview.
2. Open preview URL.
3. Confirm login loads.
4. Confirm `/api/system/health` returns `200`.
5. Confirm dashboard loads.
6. Confirm account table loads.
7. Confirm write returns `403` while writes are disabled.
8. Confirm live route smoke succeeds.

Smoke command
```powershell
$env:TARGET_URL="https://your-preview-url.vercel.app"
npm run smoke:vercel
```

Write enable step
1. Set `ALLOW_LIVE_WRITES=true`.
2. Redeploy.
3. Run smoke again.
4. Manually test one protected write.

Notes
- SSL is handled by Vercel.
- Custom domain can be added later in Vercel project settings.
