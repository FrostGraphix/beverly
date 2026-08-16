# Wallet Service Deployment

## Runtime Roles

- Vercel serves the bundled Fastify routes.
- Supabase Cron owns scheduled jobs and calls the authenticated Vercel maintenance endpoint.
- Supabase owns persistence.

## Required Variables

- `NODE_ENV=production`
- `MONEY_WRITES_ENABLED=false`
- `CORS_ORIGINS=<approved origins>`
- `SUPABASE_URL=<project URL>`
- `SUPABASE_ANON_KEY=<anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<service key>`
- `PAYSTACK_SECRET_KEY=<secret>`
- `PAYSTACK_WEBHOOK_URL=<public /api/v1/webhook/paystack URL>`
- `APP_ENCRYPTION_KEY=<32+ characters>`
- `CRON_SECRET=<16+ random characters>`

## Safe Startup

1. Apply migrations first.
2. Configure `beverly_wallet_maintenance_url` and `beverly_cron_secret` in Supabase Vault.
3. Build and deploy Vercel.
4. Verify `/health` response.
5. Verify `cron.job` and `cron.job_run_details`.
6. Keep writes disabled until production verification passes.

## Write Enablement

Keep writes disabled initially.

Enable only after staging.

Set both `MONEY_WRITES_ENABLED=true` and `WALLET_PROXY_MONEY_WRITES_ENABLED=true` only after production verification passes.

Use one approved deployment.

## Vercel Integration

Set `WALLET_API_BASE_URL=internal` and `WALLET_SERVERLESS=true` in Vercel.

Never point previews upstream.

Keep `WALLET_PROXY_MONEY_WRITES_ENABLED=false` in previews and local environments that must not forward real money writes.

Supabase Cron calls `https://beverly.acoblighting.com/api/cron/wallet-maintenance?task=<task>` with `Authorization: Bearer <CRON_SECRET>`. Do not put the secret in migrations or query parameters.
