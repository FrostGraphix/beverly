/**
 * Environment loader with Zod validation.
 * Fails fast if required vars missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

function loadEnvFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (key && !process.env[key]) process.env[key] = value;
    }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '..', '..', '.env'));

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
    ENERGY_AUTHORIZATION_PASSWORD: z.string().optional(),
    ENERGY_ENABLE_ARCHIVED_METER_FALLBACK: z.preprocess((value) => {
        if (value === undefined || value === '') return undefined;
        if (typeof value === 'boolean') return value;
        return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    }, z.boolean()).optional(),

    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
    TWILIO_TOKEN_SMS_FROM_NUMBER: z.string().optional(),
    TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID: z.string().optional(),
    SMS_ALLOWED_COUNTRY_CODES: z.string().default('+234'),
    SMS_BLOCKED_COUNTRY_CODES: z.string().default(''),
    SMS_HIGH_RISK_COUNTRY_CODES: z.string().default('+234'),
    SMS_OTP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10).default(2),
    SMS_OTP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    SMS_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    SMS_TOKEN_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    SMS_TOKEN_RESEND_DAILY_MAX: z.coerce.number().int().min(1).max(10).default(3),

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

export function isCorsOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    if (corsOrigins.includes(origin)) return true;

    if (isDev) {
        try {
            const parsed = new URL(origin);
            return (
                (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
                ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
            );
        } catch {
            return false;
        }
    }

    return corsOrigins.length === 0;
}
