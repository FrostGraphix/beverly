/**
 * Environment loader with Zod validation.
 * Fails fast if required vars missing.
 */
import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGINS: z.string().default(''),

    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SUPABASE_JWT_SECRET: z.string().min(20).optional(),

    REDIS_URL: z.string().default('redis://localhost:6379'),

    ENERGY_BACKEND_URL: z.string().url().optional(),
    ENERGY_BEARER_TOKEN: z.string().optional(),

    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    POSTMARK_SERVER_TOKEN: z.string().optional(),
    POSTMARK_FROM: z.string().default('Beverly <no-reply@beverly.acoblighting.com>'),

    APP_ENCRYPTION_KEY: z.string().min(32).optional(),

    FEATURE_CUSTOMER_WALLET: z.coerce.boolean().default(true),
    FEATURE_METER_PURCHASE: z.coerce.boolean().default(true),
    FEATURE_VENDOR_VENDING: z.coerce.boolean().default(true),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Env validation failed:\n${issues}`);
    process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
