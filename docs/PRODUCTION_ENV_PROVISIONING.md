# Production Environment Provisioning

## Rule

Production credentials stay outside code.

## Required Production Variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVE_API_BASE_URL`
- `LIVE_API_BEARER_TOKEN`
- `JWT_SECRET`
- `CORS_ORIGINS`

## Recommended Production Values

```text
NODE_ENV=production
LIVE_READ_MODE=live
LIVE_API_PROXY_ENABLED=true
ALLOW_LIVE_WRITES=false
SUPABASE_AUTH_ENABLED=true
SUPABASE_STORAGE_ENABLED=true
SESSION_STORE_MODE=supabase
SNAPSHOT_STORE_ENABLED=true
API_CACHE_ENABLED=true
DEMO_AUTH_ENABLED=false
```

## Validation

```powershell
$env:NODE_ENV="production"
npm run env:validate
npm run security:review:production
```

## Vercel Setup

Set variables in Vercel project settings.

Do not commit production values.

## Local Development

Use `.env`.

Leave production secrets blank.

Use demo auth only when explicitly needed:

```text
DEMO_AUTH_ENABLED=true
DEMO_AUTH_USER=admin
DEMO_AUTH_PASSWORD=<local-only-password>
```
