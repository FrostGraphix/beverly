// Set required env vars before any module that imports env.ts
process.env.NODE_ENV               ??= 'test';
process.env.SUPABASE_URL           ??= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY      ??= 'test-anon-key-at-least-twenty-chars';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key-at-least-twenty-chars';
process.env.APP_ENCRYPTION_KEY       ??= 'test-encryption-key-at-least-thirty-two-characters';
process.env.REDIS_URL              ??= 'redis://localhost:6379';
process.env.PAYSTACK_SECRET_KEY    ??= 'sk_test_placeholder';
process.env.PAYSTACK_WEBHOOK_URL   ??= 'https://example.test/api/v1/webhook/paystack';
process.env.ENERGY_BACKEND_URL     ??= 'https://energy.test';
process.env.ENERGY_BEARER_TOKEN    ??= 'test-token';
process.env.CUSTOMER_APP_URL       ??= 'http://localhost:5173';
process.env.VENDOR_PORTAL_URL      ??= 'http://localhost:5174';
process.env.STAFF_PORTAL_URL       ??= 'http://localhost:5175';
