# Wallet Service Deployment

## Runtime Roles

- API serves Fastify routes.
- Worker owns scheduled jobs.
- Redis backs rate limits.
- Supabase owns persistence.

## Required Variables

- `NODE_ENV=production`
- `MONEY_WRITES_ENABLED=false`
- `CORS_ORIGINS=<approved origins>`
- `SUPABASE_URL=<project URL>`
- `SUPABASE_ANON_KEY=<anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<service key>`
- `REDIS_URL=<durable Redis URL>`
- `PAYSTACK_SECRET_KEY=<secret>`
- `PAYSTACK_WEBHOOK_SECRET=<secret>`
- `APP_ENCRYPTION_KEY=<32+ characters>`

## Safe Startup

1. Apply migrations first.
2. Start Redis service.
3. Build API image.
4. Build worker image.
5. Deploy API service.
6. Deploy worker service.
7. Verify `/health` response.
8. Verify worker heartbeat.
9. Keep writes disabled.

## Write Enablement

Keep writes disabled initially.

Enable only after staging.

Set `MONEY_WRITES_ENABLED=true` only.

Use one approved deployment.

## Local Verification

```powershell
cd backend/wallet
docker compose up --build
```

## Vercel Integration

Set `WALLET_API_BASE_URL` in Vercel.

Use the API public URL.

Never point previews upstream.

Keep `WALLET_PROXY_MONEY_WRITES_ENABLED=false`.
