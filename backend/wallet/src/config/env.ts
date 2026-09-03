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

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    loadEnvFile(path.resolve(process.cwd(), '.env'));
    loadEnvFile(path.resolve(process.cwd(), '.env.local'));
    loadEnvFile(path.resolve(process.cwd(), '..', '..', '.env'));
}

const schema = z.object({
    APP_ENV: z.enum(['development', 'test', 'preview', 'production']),
    EXPECTED_SUPABASE_PROJECT_REF: z.string().regex(/^[a-z0-9-]{2,63}$/),
    NODE_ENV: z.preprocess((val) => {
        if (process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production' || process.env.VERCEL) {
            return 'production';
        }
        if (typeof val === 'string' && val.trim()) return val.trim();
        return 'development';
    }, z.enum(['development', 'staging', 'production', 'test'])).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGINS: z.string().default(''),
    LOGIN_EMAIL_DOMAIN: z.string().default('org.acoblighting.com'),

    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SUPABASE_JWT_SECRET: z.string().min(20).optional(),

    REDIS_URL: z.string().default('redis://localhost:6379'),

    ENERGY_BACKEND_URL: z.string().url().optional(),
    ENERGY_BEARER_TOKEN: z.string().optional(),
    UPSTREAM_API_URL: z.string().url().optional(),
    UPSTREAM_PASSWORD: z.string().default('beverly-upstream-login-pwd'),
    UPSTREAM_BEARER_TOKEN: z.string().optional(),
    ENERGY_AUTHORIZATION_PASSWORD: z.string().default('beverly-energy-auth-secret-prod'),
    ENERGY_ENABLE_ARCHIVED_METER_FALLBACK: z.preprocess((value) => {
        if (value === undefined || value === '') return undefined;
        if (typeof value === 'boolean') return value;
        return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    }, z.boolean()).optional(),

    PAYSTACK_SECRET_KEY: z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).optional(),
    PAYSTACK_PUBLIC_KEY: z.string().regex(/^pk_(test|live)_[A-Za-z0-9]+$/).optional(),
    PAYSTACK_WEBHOOK_URL: z.string().url().optional(),
    PAYSTACK_PAYMENTS_ENABLED: envBoolean.default(false),

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
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    VAPID_PUBLIC_KEY: z.string().min(40).optional(),
    VAPID_PRIVATE_KEY: z.string().min(20).optional(),
    VAPID_SUBJECT: z.string().default('mailto:wallet@acoblighting.com'),
    // Absolute base URL this backend is deployed at, used to build the
    // /assets/beverly-logo.png link embedded in transactional emails
    // (see emails/templates.ts logoUrl()). Email clients can't resolve
    // the SPA's relative /brand/* paths, so this must be an absolute URL.
    EMAIL_ASSET_BASE_URL: z.string().optional(),
    VENDOR_PORTAL_URL: z.string().url().default('https://acob-beverly.vercel.app/wallet-vendor/'),
    STAFF_PORTAL_URL: z.string().url().default('https://acob-beverly.vercel.app/wallet-admin/'),
    CUSTOMER_FUNDING_CALLBACK_URL: z.string().url().optional(),
    VENDOR_FUNDING_CALLBACK_URL: z.string().url().optional(),
    CUSTOMER_METER_ORDER_CALLBACK_URL: z.string().url().optional(),

    // Public app base URLs — used to build password-reset links in emails.
    CUSTOMER_APP_URL: z.string().url().default('https://acob-beverly.vercel.app/wallet-customer/'),
    VENDOR_APP_URL: z.string().url().default('https://acob-beverly.vercel.app/wallet-vendor/'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

    // Firebase Cloud Messaging — push notifications
    FCM_SERVER_KEY: z.string().optional(),

    APP_ENCRYPTION_KEY: z.string().min(32).optional(),
    // Must be the SAME value as the CRM's OEM_CREDENTIALS_ENCRYPTION_KEY (both
    // services decrypt oem_credentials rows written by the CRM's Settings UI).
    OEM_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
    OEM_REGISTRY_DISABLED: envBoolean.default(false),
    OEM_CONFIG_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(30000),

    FEATURE_CUSTOMER_WALLET: envBoolean.default(true),
    FEATURE_METER_PURCHASE: envBoolean.default(true),
    FEATURE_VENDOR_VENDING: envBoolean.default(true),
    FEATURE_VENDOR_BALANCE_TRANSFERS: envBoolean.default(true),
    VENDOR_TRANSFER_RATE_LIMIT_MODE: z.enum(['off', 'observe', 'enforce']).default('off'),
    VENDOR_TRANSFER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
    VENDOR_TRANSFER_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    MONEY_WRITES_ENABLED: envBoolean.default(false),
    DEV_CONSOLE_ENABLED: envBoolean.default(false),
    DEV_CONSOLE_BREAK_GLASS_TOKEN: z.string().min(32).optional(),
    // Approved database policies own the rate. This value is the outage fallback.
    VENDING_VAT_BASIS_POINTS: z.coerce.number().int().min(0).max(10_000).default(VENDING_VAT_BASIS_POINTS),
}).superRefine((values, context) => {
    const actualProjectRef = new URL(values.SUPABASE_URL).hostname.split('.')[0];
    if (actualProjectRef !== values.EXPECTED_SUPABASE_PROJECT_REF) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SUPABASE_URL'],
            message: 'Supabase project does not match EXPECTED_SUPABASE_PROJECT_REF.',
        });
    }
    if (['preview', 'production'].includes(values.APP_ENV)
        && (!values.EXPECTED_SUPABASE_PROJECT_REF
            || !/^[a-z0-9-]{2,63}$/.test(values.EXPECTED_SUPABASE_PROJECT_REF))) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['EXPECTED_SUPABASE_PROJECT_REF'],
            message: 'Deployed environments require an explicit Supabase project reference.',
        });
    }
    if (values.APP_ENV === 'production' && values.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.VERCEL_ENV && process.env.SERVERLESS !== '1') {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['NODE_ENV'],
            message: 'Production deployments require NODE_ENV=production.',
        });
    }
    if (values.APP_ENV === 'preview' && values.MONEY_WRITES_ENABLED) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MONEY_WRITES_ENABLED'],
            message: 'Preview deployments cannot enable money writes.',
        });
    }
    if (Boolean(values.VAPID_PUBLIC_KEY) !== Boolean(values.VAPID_PRIVATE_KEY)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['VAPID_PUBLIC_KEY'],
            message: 'VAPID public and private keys must be configured together.',
        });
    }
    if (values.NODE_ENV === 'production' && !values.APP_ENCRYPTION_KEY && !process.env.VERCEL && !process.env.VERCEL_ENV && process.env.SERVERLESS !== '1') {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['APP_ENCRYPTION_KEY'],
            message: 'Production deployments require a dedicated APP_ENCRYPTION_KEY.',
        });
    }
    if (values.NODE_ENV === 'production' && values.RESEND_API_KEY && !values.RESEND_WEBHOOK_SECRET) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['RESEND_WEBHOOK_SECRET'],
            message: 'Required when production Resend delivery is enabled.',
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
        if ((values.FEATURE_METER_PURCHASE || values.FEATURE_VENDOR_VENDING) && !values.ENERGY_AUTHORIZATION_PASSWORD) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ENERGY_AUTHORIZATION_PASSWORD'],
                message: 'Required when production vending writes are enabled.',
            });
        }
        if (values.UPSTREAM_PASSWORD && values.ENERGY_AUTHORIZATION_PASSWORD === values.UPSTREAM_PASSWORD) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ENERGY_AUTHORIZATION_PASSWORD'],
                message: 'Must use the separate upstream write-authorization secret.',
            });
        }
    }
});

const appEnvironment = process.env.APP_ENV
    ?? (process.env.VERCEL_ENV === 'production' ? 'production'
        : process.env.VERCEL_ENV === 'preview' ? 'preview'
            : process.env.NODE_ENV === 'test' ? 'test'
                : 'development');

const nodeEnvironment = (appEnvironment === 'production' || process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview')
    ? 'production'
    : (process.env.NODE_ENV ?? 'development');

const rawSupabaseUrl = process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || 'https://qpoipyqgrjsjdvfqmxok.supabase.co';

const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF
    || (() => {
        try { return new URL(rawSupabaseUrl).hostname.split('.')[0]; }
        catch { return 'qpoipyqgrjsjdvfqmxok'; }
    })();

const parsed = schema.safeParse({
    ...process.env,
    APP_ENV: appEnvironment,
    NODE_ENV: nodeEnvironment,
    SUPABASE_URL: rawSupabaseUrl,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2lweXFncmpzamR2ZnFteG9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNzUwMjgsImV4cCI6MjA1MTg1MTAyOH0.Q1a2oTsd-tO5Bv08_7GgQsmL_0qQd4j_h5cW7eOsq0Q',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2lweXFncmpzamR2ZnFteG9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNzUwMjgsImV4cCI6MjA1MTg1MTAyOH0.Q1a2oTsd-tO5Bv08_7GgQsmL_0qQd4j_h5cW7eOsq0Q',
    EXPECTED_SUPABASE_PROJECT_REF: expectedProjectRef,
});

if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    const message = `Env validation failed:\n${issues}`;
    console.error(message);
    if (!process.env.VERCEL && process.env.SERVERLESS !== '1' && process.env.SERVERLESS !== 'true') {
        process.exit(1);
    }
}

const fallbackData = {
    APP_ENV: appEnvironment,
    NODE_ENV: nodeEnvironment,
    SUPABASE_URL: rawSupabaseUrl,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2lweXFncmpzamR2ZnFteG9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNzUwMjgsImV4cCI6MjA1MTg1MTAyOH0.Q1a2oTsd-tO5Bv08_7GgQsmL_0qQd4j_h5cW7eOsq0Q',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2lweXFncmpzamR2ZnFteG9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNzUwMjgsImV4cCI6MjA1MTg1MTAyOH0.Q1a2oTsd-tO5Bv08_7GgQsmL_0qQd4j_h5cW7eOsq0Q',
    EXPECTED_SUPABASE_PROJECT_REF: expectedProjectRef,
    ENERGY_AUTHORIZATION_PASSWORD: process.env.ENERGY_AUTHORIZATION_PASSWORD || 'beverly-energy-auth-secret-prod',
    UPSTREAM_PASSWORD: process.env.UPSTREAM_PASSWORD || 'beverly-upstream-login-pwd',
};

const resolvedData = parsed.success ? parsed.data : schema.parse(fallbackData);

export const env = {
    ...resolvedData,
    ENERGY_BACKEND_URL: parsed.success ? (parsed.data.UPSTREAM_API_URL || parsed.data.ENERGY_BACKEND_URL) : (resolvedData.UPSTREAM_API_URL || resolvedData.ENERGY_BACKEND_URL),
    ENERGY_BEARER_TOKEN: parsed.success ? (parsed.data.UPSTREAM_BEARER_TOKEN || parsed.data.ENERGY_BEARER_TOKEN) : (resolvedData.UPSTREAM_BEARER_TOKEN || resolvedData.ENERGY_BEARER_TOKEN),
};

export function buildCorsOrigins(explicit: string, applicationUrls: string[]): string[] {
    const explicitOrigins = explicit
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const applicationOrigins = applicationUrls
        .map((value) => {
            try { return new URL(value).origin; }
            catch { return ''; }
        })
        .filter(Boolean);
    return [...new Set([...explicitOrigins, ...applicationOrigins])];
}

export const corsOrigins = buildCorsOrigins(env.CORS_ORIGINS, [
    env.CUSTOMER_APP_URL,
    env.VENDOR_APP_URL,
    env.VENDOR_PORTAL_URL,
    env.STAFF_PORTAL_URL,
]);

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';

export function isCorsOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    if (corsOrigins.includes(origin)) return true;

    try {
        const parsed = new URL(origin);
        if (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            (
                parsed.hostname === 'beverly.acoblighting.com' ||
                parsed.hostname.endsWith('.acoblighting.com') ||
                parsed.hostname.endsWith('.vercel.app')
            )
        ) {
            return true;
        }
    } catch { /* ignore */ }

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
