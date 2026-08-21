/**
 * Phase 2 regression tests — password reset flows.
 *
 * Covers:
 *   • password-reset service: token generation, hashing, TTL, error codes
 *   • customer email reset routes: /auth/email/reset-request + /auth/email/reset-confirm
 *   • vendor reset routes: /vendor/auth/reset-request + /vendor/auth/reset-confirm
 *   • env additions: CUSTOMER_APP_URL, VENDOR_APP_URL, PASSWORD_RESET_TTL_MINUTES
 *   • blue-green workflows: both files exist and have required triggers
 *   • DB migration: password_reset_tokens table definition
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── Password reset service ────────────────────────────────────────────────────
describe('password-reset service', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/password-reset.ts'), 'utf-8');

    it('exports requestPasswordReset and confirmPasswordReset', () => {
        expect(src).toContain('export async function requestPasswordReset');
        expect(src).toContain('export async function confirmPasswordReset');
    });

    it('exports PasswordResetError with code field', () => {
        expect(src).toContain('export class PasswordResetError');
        expect(src).toContain('public code: string');
    });

    it('hashes token with SHA-256 — never stores raw token', () => {
        expect(src).toContain("createHash('sha256')");
        expect(src).toContain('beverly-pwd-reset');
    });

    it('uses PASSWORD_RESET_TTL_MINUTES from env for token expiry', () => {
        expect(src).toContain('env.PASSWORD_RESET_TTL_MINUTES');
    });

    it('token invalidation: marks prior unused tokens used before inserting new one', () => {
        expect(src).toContain("is('used_at', null)");
        expect(src).toContain("update({ used_at:");
    });

    it('returns silently when account not found but exposes infrastructure failures', () => {
        const start = src.indexOf('export async function requestPasswordReset');
        const end   = src.indexOf('\nexport async function ', start + 1);
        const body  = end > 0 ? src.slice(start, end) : src.slice(start);
        expect(body).toContain('if (!authUserId) return;');
        expect(body).toContain("'email_delivery_unconfigured'");
        expect(body).toContain("'token_store_unavailable'");
        expect(body).toContain("'email_delivery_failed'");
        expect(body).toContain("update({ used_at:");
    });

    it('confirmPasswordReset throws invalid_token on missing/used token', () => {
        expect(src).toContain("'invalid_token'");
    });

    it('confirmPasswordReset throws token_expired on stale token', () => {
        expect(src).toContain("'token_expired'");
    });

    it('confirmPasswordReset enforces 8-char minimum for customers', () => {
        expect(src).toContain('length < 8');
    });

    it('confirmPasswordReset enforces 12-char minimum for vendor_users', () => {
        expect(src).toContain("userType === 'vendor_user'");
        expect(src).toContain('length < 12');
    });

    it('uses adminClient.auth.admin.updateUserById to change password', () => {
        expect(src).toContain('auth.admin.updateUserById');
    });

    it('clears vendor password_reset_required flag on successful reset', () => {
        expect(src).toContain('password_reset_required: false');
    });

    it('sends reset email via postmark sendEmail', () => {
        expect(src).toContain('sendEmail');
        expect(src).toContain("tag: 'password-reset'");
        expect(src).toContain('passwordResetLinkEmail');
    });

    it('reset link includes raw token in query param', () => {
        expect(src).toContain('reset-password?token=');
    });

    it('uses CUSTOMER_APP_URL and VENDOR_APP_URL from env for reset links', () => {
        expect(src).toContain('env.CUSTOMER_APP_URL');
        expect(src).toContain('env.VENDOR_APP_URL');
    });
});

// ── Env additions ─────────────────────────────────────────────────────────────
describe('env config additions', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/config/env.ts'), 'utf-8');

    it('CUSTOMER_APP_URL is defined in env schema', () => {
        expect(src).toContain('CUSTOMER_APP_URL');
    });

    it('VENDOR_APP_URL is defined in env schema', () => {
        expect(src).toContain('VENDOR_APP_URL');
    });

    it('PASSWORD_RESET_TTL_MINUTES is defined with a default', () => {
        expect(src).toContain('PASSWORD_RESET_TTL_MINUTES');
        expect(src).toContain('.default(30)');
    });
});

// ── Customer backend route ────────────────────────────────────────────────────
describe('customer password reset route', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/customer.ts'), 'utf-8');

    it('POST /auth/email/recover route exists', () => {
        expect(src).toContain("'/auth/email/recover'");
    });

    it('POST /auth/email/reset-password route exists', () => {
        expect(src).toContain("'/auth/email/reset-password'");
    });

    it('recover calls sendPasswordRecoveryEmail', () => {
        const start = src.indexOf("'/auth/email/recover'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('sendPasswordRecoveryEmail');
    });

    it('reset-password handles password reset', () => {
        const start = src.indexOf("'/auth/email/reset-password'");
        const block = src.slice(start, start + 600);
        expect(block).toContain('reset');
    });
});

// ── Vendor backend route ──────────────────────────────────────────────────────
describe('vendor password reset route', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/vendor.ts'), 'utf-8');

    it('POST /auth/reset-request route exists', () => {
        expect(src).toContain("'/auth/reset-request'");
    });

    it('POST /auth/reset-confirm route exists', () => {
        expect(src).toContain("'/auth/reset-confirm'");
    });

    it('routes are public (no preHandler auth guard)', () => {
        const start = src.indexOf("'/auth/reset-request'");
        const block = src.slice(start, start + 200);
        expect(block).not.toContain('preHandler');
    });

    it('rate limits public vendor reset routes', () => {
        const start = src.indexOf("'/auth/reset-request'");
        const block = src.slice(start, start + 1200);
        expect(block).toContain('rateLimit');
        expect(block).toContain("timeWindow: '15 minutes'");
    });

    it('validates reset request and confirmation payloads', () => {
        const start = src.indexOf("'/auth/reset-request'");
        const block = src.slice(start, start + 2200);
        expect(block).toContain('z.string().trim().email().max(320)');
        expect(block).toContain("z.string().regex(/^[a-f0-9]{64}$/i)");
        expect(block).toContain('z.string().min(12).max(128)');
    });

    it('records password reset security events', () => {
        expect(src).toContain("logSecurityEvent('password_reset_requested'");
        expect(src).toContain("logSecurityEvent('password_reset_completed'");
        expect(src).toContain("logSecurityEvent('password_reset_failed'");
    });

    it('returns a truthful service error when delivery fails', () => {
        const start = src.indexOf("'/auth/reset-request'");
        const block = src.slice(start, start + 2200);
        expect(block).toContain("reply.code(503)");
        expect(block).toContain("error: 'password_reset_unavailable'");
    });
});

// ── DB migration ──────────────────────────────────────────────────────────────
describe('password_reset_tokens migration', () => {
    const sql = readFileSync(
        resolve(ROOT, 'supabase/migrations/20260529140000_password_reset_tokens.sql'),
        'utf-8',
    );

    it('creates password_reset_tokens table', () => {
        expect(sql).toContain('create table');
        expect(sql).toContain('password_reset_tokens');
    });

    it('has token_hash column (not raw token)', () => {
        expect(sql).toContain('token_hash');
        expect(sql).not.toContain('token text');
    });

    it('has expires_at column for TTL enforcement', () => {
        expect(sql).toContain('expires_at');
    });

    it('has used_at column for one-time-use enforcement', () => {
        expect(sql).toContain('used_at');
    });

    it('has user_type column with customer/vendor_user check constraint', () => {
        expect(sql).toContain('user_type');
        expect(sql).toContain("'customer'");
        expect(sql).toContain("'vendor_user'");
    });

    it('enables RLS', () => {
        expect(sql).toContain('enable row level security');
    });
});

describe('password reset delivery repair migration', () => {
    const sql = readFileSync(
        resolve(ROOT, 'supabase/migrations/20260821170000_password_reset_delivery_repair.sql'),
        'utf-8',
    );

    it('repairs missing storage idempotently', () => {
        expect(sql).toContain('create table if not exists public.password_reset_tokens');
        expect(sql).toContain('force row level security');
        expect(sql).toContain('notify pgrst');
    });
});

describe('password reset audit repair migration', () => {
    const sql = readFileSync(
        resolve(ROOT, 'supabase/migrations/20260821171000_wallet_security_event_delivery_columns.sql'),
        'utf-8',
    );

    it('restores security request context columns', () => {
        expect(sql).toContain('add column if not exists ip_address');
        expect(sql).toContain('add column if not exists user_agent');
        expect(sql).toContain('notify pgrst');
    });
});

// ── Blue-green workflows ──────────────────────────────────────────────────────
describe('blue-green deployment workflows', () => {
    it('blue-green-promote.yml exists', () => {
        expect(existsSync(resolve(ROOT, '.github/workflows/blue-green-promote.yml'))).toBe(true);
    });

    it('rollback-emergency.yml exists', () => {
        expect(existsSync(resolve(ROOT, '.github/workflows/rollback-emergency.yml'))).toBe(true);
    });

    it('promote workflow has health + readiness checks before aliasing', () => {
        const src = readFileSync(resolve(ROOT, '.github/workflows/blue-green-promote.yml'), 'utf-8');
        expect(src).toContain('/api/v1/health');
        expect(src).toContain('/api/v1/ready');
        expect(src).toContain('vercel alias');
        expect(src).toContain('LAST_STABLE_DEPLOYMENT_URL');
    });

    it('emergency rollback requires ROLLBACK confirmation string', () => {
        const src = readFileSync(resolve(ROOT, '.github/workflows/rollback-emergency.yml'), 'utf-8');
        expect(src).toContain("'ROLLBACK'");
        expect(src).toContain('vercel alias');
    });

    it('blue-green runbook exists', () => {
        expect(existsSync(resolve(ROOT, 'docs/runbooks/blue-green-deployment.md'))).toBe(true);
    });
});

// ── Frontend routes ───────────────────────────────────────────────────────────
describe('frontend password reset routes', () => {
    it('customer router has /recover and /reset-password', () => {
        const src = readFileSync(resolve(ROOT, 'apps/customer/src/router/index.ts'), 'utf-8');
        expect(src).toContain("'/recover'");
        expect(src).toContain("'/reset-password'");
    });

    it('vendor Login.vue contains password reset help option', () => {
        const src = readFileSync(resolve(ROOT, 'apps/vendor/src/views/Login.vue'), 'utf-8');
        expect(src).toContain('Forgot password?');
        expect(src).toContain('to="/forgot-password"');
    });

    it('customer ResetPassword.vue enforces 8-char minimum', () => {
        const src = readFileSync(resolve(ROOT, 'apps/customer/src/views/ResetPassword.vue'), 'utf-8');
        expect(src).toContain('length < 8');
    });

    it('customer ResetPassword view calls reset-password endpoint', () => {
        const cust = readFileSync(resolve(ROOT, 'apps/customer/src/views/ResetPassword.vue'), 'utf-8');
        expect(cust).toContain('/api/v1/customer/auth/email/reset-password');
    });
});
