/**
 * Email verification + password recovery for email/password customers.
 *
 * Mirrors the phone OTP challenge pattern (customer-auth.ts) but keyed by email
 * and stored in its own table so it never touches the phone flow.
 *
 * Table: customer_email_otp (email, otp_hash, purpose 'verify'|'recovery', attempts, expires_at, consumed_at)
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { sendEmail } from '../adapters/resend.js';
import { verificationEmail, passwordRecoveryEmail } from '../emails/templates.js';
import { logAction } from './audit.js';
import { isFlagEnabled } from './feature-flags.js';

export class EmailOtpError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'EmailOtpError'; }
}

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

type OtpPurpose = 'verify' | 'recovery';

function generateOtp(): string {
    return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(email: string, purpose: OtpPurpose, otp: string): string {
    return crypto.createHash('sha256').update(`${email}:${purpose}:${otp}:beverly-email-otp-salt`).digest('hex');
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function isOtpStorageMissing(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('customer_email_otp')
        && (normalized.includes('schema cache') || normalized.includes('does not exist'));
}

function otpStorageError(message: string, fallbackCode: string): EmailOtpError {
    if (isOtpStorageMissing(message)) {
        return new EmailOtpError(
            'Email codes are not ready yet. Please try again shortly.',
            'otp_storage_missing',
        );
    }
    return new EmailOtpError('Something went wrong. Please try again.', fallbackCode);
}

async function assertNotRateLimited(email: string, purpose: OtpPurpose): Promise<void> {
    const { data } = await adminClient
        .from('customer_email_otp')
        .select('created_at')
        .eq('email', email)
        .eq('purpose', purpose)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data) return;
    const elapsed = Date.now() - new Date((data as any).created_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
        throw new EmailOtpError('Please wait before requesting another code.', 'otp_rate_limited');
    }
}

async function createChallenge(email: string, purpose: OtpPurpose): Promise<string> {
    const otp = generateOtp();
    const { error } = await adminClient.from('customer_email_otp').insert({
        email,
        otp_hash: hashOtp(email, purpose, otp),
        purpose,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (error) throw otpStorageError(error.message, 'challenge_create_failed');
    return otp;
}

async function consumeChallenge(email: string, purpose: OtpPurpose, otp: string): Promise<void> {
    const { data: challenge, error } = await adminClient
        .from('customer_email_otp')
        .select('id, otp_hash, attempts, expires_at, consumed_at')
        .eq('email', email)
        .eq('purpose', purpose)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw otpStorageError(error.message, 'challenge_lookup_failed');
    if (!challenge) throw new EmailOtpError('No active code found. Request a new one.', 'otp_not_found');

    const c = challenge as any;
    if (new Date(c.expires_at).getTime() < Date.now()) {
        throw new EmailOtpError('This code has expired. Request a new one.', 'otp_expired');
    }
    if (c.attempts >= OTP_MAX_ATTEMPTS) {
        throw new EmailOtpError('Too many attempts. Request a new code.', 'otp_locked');
    }
    if (c.otp_hash !== hashOtp(email, purpose, otp)) {
        await adminClient.from('customer_email_otp').update({ attempts: c.attempts + 1 }).eq('id', c.id);
        throw new EmailOtpError('Incorrect code.', 'otp_incorrect');
    }
    await adminClient.from('customer_email_otp').update({ consumed_at: new Date().toISOString() }).eq('id', c.id);
}

// ── Email verification ──────────────────────────────────────────────────────

export async function sendEmailVerification(email: string, fullName: string): Promise<void> {
    const normalized = normalizeEmail(email);
    await assertNotRateLimited(normalized, 'verify');
    const otp = await createChallenge(normalized, 'verify');

    let flagOn = false;
    try { flagOn = await isFlagEnabled('notifications.email.verification'); } catch { /* flag missing = disabled */ }
    if (!flagOn) return;

    try {
        const content = verificationEmail({ fullName, code: otp });
        await sendEmail({ to: normalized, subject: content.subject, html: content.html, text: content.text, tag: 'email-verification' });
    } catch (err) {
        console.error('[customer-email-otp] verification email send failed:', err);
    }
}

export async function confirmEmailVerification(email: string, otp: string): Promise<void> {
    const normalized = normalizeEmail(email);
    try {
        await consumeChallenge(normalized, 'verify', otp);
    } catch (error) {
        if (error instanceof EmailOtpError) throw error;
        throw new EmailOtpError('Could not verify code.', 'otp_verify_failed');
    }

    const { data: customer, error } = await adminClient
        .from('customers')
        .select('id')
        .eq('email', normalized)
        .maybeSingle();
    if (error || !customer) throw new EmailOtpError('No account found for this email.', 'customer_not_found');

    await adminClient
        .from('customers')
        .update({ email_verified_at: new Date().toISOString() })
        .eq('id', (customer as any).id);

    await logAction({
        actorUserId: (customer as any).id,
        actorType: 'customer',
        action: 'customer.email_verified',
        targetType: 'customer',
        targetId: (customer as any).id,
    }).catch(() => undefined);
}

// ── Password recovery ───────────────────────────────────────────────────────

export async function sendPasswordRecoveryEmail(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const { data: customer } = await adminClient
        .from('customers')
        .select('id, full_name, auth_user_id, user_id')
        .eq('email', normalized)
        .maybeSingle();
    // Do not reveal whether the account exists.
    if (!customer) return;

    await assertNotRateLimited(normalized, 'recovery');
    const otp = await createChallenge(normalized, 'recovery');

    let flagOn = false;
    try { flagOn = await isFlagEnabled('notifications.email.password_recovery'); } catch { /* flag missing = disabled */ }
    if (!flagOn) return;

    try {
        const fullName = (customer as any).full_name ?? normalized;
        const content = passwordRecoveryEmail({ fullName, code: otp });
        await sendEmail({ to: normalized, subject: content.subject, html: content.html, text: content.text, tag: 'password-recovery' });
    } catch (err) {
        console.error('[customer-email-otp] password recovery email send failed:', err);
    }
}

export async function confirmPasswordReset(email: string, otp: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
        throw new EmailOtpError('Password must be at least 8 characters.', 'weak_password');
    }
    const normalized = normalizeEmail(email);
    await consumeChallenge(normalized, 'recovery', otp);

    const { data: customer, error } = await adminClient
        .from('customers')
        .select('id, auth_user_id, user_id')
        .eq('email', normalized)
        .maybeSingle();
    if (error || !customer) throw new EmailOtpError('No account found for this email.', 'customer_not_found');

    const authUserId = (customer as any).auth_user_id ?? (customer as any).user_id;
    if (!authUserId) throw new EmailOtpError('Account is missing an auth user link.', 'customer_auth_link_missing');

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(authUserId, { password: newPassword });
    if (updateErr) throw new EmailOtpError(updateErr.message, 'password_update_failed');

    await adminClient.auth.admin.signOut(authUserId, 'global').catch(() => undefined);

    await logAction({
        actorUserId: (customer as any).id,
        actorType: 'customer',
        action: 'customer.password_reset',
        targetType: 'customer',
        targetId: (customer as any).id,
    }).catch(() => undefined);
}
