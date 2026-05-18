// Set required env vars before any module that imports env.ts
process.env.NODE_ENV               ??= 'test';
process.env.SUPABASE_URL           ??= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY      ??= 'test-anon-key-at-least-twenty-chars';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key-at-least-twenty-chars';
process.env.REDIS_URL              ??= 'redis://localhost:6379';
process.env.PAYSTACK_SECRET_KEY    ??= 'sk_test_placeholder';
