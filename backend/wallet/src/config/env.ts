/**
 * Environment loader with Zod validation.
 * Fails fast if required vars missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { VENDING_VAT_BASIS_POINTS } from '@beverly/tokens';
import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === '') return undefined;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}, z.boolean());

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
    UPSTREAM_API_URL: z.string().url().optional(),
    UPSTREAM_BEARER_TOKEN: z.string().optional(),
    ENERGY_AUTHORIZATION_PASSWORD: z.string().optional(),
    ENERGY_ENABLE_ARCHIVED_METER_FALLBACK: z.preprocess((value) => {
        if (value === undefined || value === '') return undefined;
        if (typeof value === 'boolean') return value;
        return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    }, z.boolean()).optional(),

    PAYSTACK_SECRET_KEY: z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).optional(),
    PAYSTACK_PUBLIC_KEY: z.string().regex(/^pk_(test|live)_[A-Za-z0-9]+$/).optional(),
    PAYSTACK_CALLBACK_URL: z.string().url().optional(),
    PAYSTACK_WEBHOOK_URL: z.string().url().optional(),

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

    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().default('Beverly <noreply@acoblighting.com>'),
    // Absolute base URL this backend is deployed at, used to build the
    // /assets/beverly-logo.png link embedded in transactional emails
    // (see emails/templates.ts logoUrl()). Email clients can't resolve
    // the SPA's relative /brand/* paths, so this must be an absolute URL.
    EMAIL_ASSET_BASE_URL: z.string().optional(),
    CUSTOMER_APP_URL: z.string().url(),
    VENDOR_PORTAL_URL: z.string().url(),
    STAFF_PORTAL_URL: z.string().url(),

    // Firebase Cloud Messaging — push notifications
    FCM_SERVER_KEY: z.string().optional(),

    // Public app base URLs — used to build password-reset links in emails.
    CUSTOMER_APP_URL: z.string().url().default('https://customer-acob-beverly.vercel.app'),
    VENDOR_APP_URL: z.string().url().default('https://vendor-acob-beverly.vercel.app'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

    APP_ENCRYPTION_KEY: z.string().min(32).optional(),
    // Must be the SAME value as the CRM's OEM_CREDENTIALS_ENCRYPTION_KEY (both
    // services decrypt oem_credentials rows written by the CRM's Settings UI).
    OEM_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
    OEM_REGISTRY_DISABLED: envBoolean.default(false),
    OEM_CONFIG_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(30000),

    FEATURE_CUSTOMER_WALLET: envBoolean.default(true),
    FEATURE_METER_PURCHASE: envBoolean.default(true),
    FEATURE_VENDOR_VENDING: envBoolean.default(true),
    MONEY_WRITES_ENABLED: envBoolean.default(false),
    DEV_CONSOLE_ENABLED: envBoolean.default(false),
    DEV_CONSOLE_BREAK_GLASS_TOKEN: z.string().min(32).optional(),
    // Approved database policies own the rate. This value is the outage fallback.
    VENDING_VAT_BASIS_POINTS: z.coerce.number().int().min(0).max(10_000).default(VENDING_VAT_BASIS_POINTS),
}).superRefine((values, context) => {
    if (values.NODE_ENV === 'production' && !values.APP_ENCRYPTION_KEY) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['APP_ENCRYPTION_KEY'],
            message: 'Required in production.',
        });
    }
    if (values.NODE_ENV === 'production' && values.MONEY_WRITES_ENABLED) {
        if (!values.PAYSTACK_SECRET_KEY) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['PAYSTACK_SECRET_KEY'],
                message: 'Required when production money writes are enabled.',
            });
        }
        if (!values.PAYSTACK_WEBHOOK_URL) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['PAYSTACK_WEBHOOK_URL'],
                message: 'Required when production money writes are enabled.',
            });
        }
    }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Env validation failed:\n${issues}`);
    process.exit(1);
}

export const env = {
    ...parsed.data,
    ENERGY_BACKEND_URL: parsed.data.UPSTREAM_API_URL || parsed.data.ENERGY_BACKEND_URL,
    ENERGY_BEARER_TOKEN: parsed.data.UPSTREAM_BEARER_TOKEN || parsed.data.ENERGY_BEARER_TOKEN,
};

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

    return false;
}
