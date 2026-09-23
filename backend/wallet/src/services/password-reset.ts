/**
 * Self-service password reset for email-authenticated users.
 *
 * Flow:
 *   1. requestPasswordReset(email, userType) — generate and email a six-digit OTP.
 *   2. verifyPasswordResetOtp(email, otp, userType) — exchange it once for a reset grant.
 *   3. confirmPasswordReset(token, newPassword, userType) — verify grant, check expiry,
 *      update Supabase auth password, mark token used.
 *
 * Token TTL: PASSWORD_RESET_TTL_MINUTES env var (default 30 min).
 * Security: raw token is never persisted; only SHA-256 hex hash stored.
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { sendEmail } from '../adapters/resend.js';
import { env } from '../config/env.js';
import { passwordRecoveryEmail } from '../emails/templates.js';
import { vendorPasswordError } from '@beverly/tokens/password-policy';

export type ResetUserType = 'customer' | 'vendor_user' | 'staff';

export class PasswordResetError extends Error {
    constructor(message: string, public code: string, public status = 400) {
        super(message);
        this.name = 'PasswordResetError';
    }
}

function hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw + 'beverly-pwd-reset').digest('hex');
}

function generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function generateOtp(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashOtp(otp: string, salt: string): string {
    return crypto.scryptSync(otp, salt, 32).toString('hex');
}

async function lookupAuthUserId(email: string, userType: ResetUserType): Promise<string | null> {
    if (userType === 'customer') {
        const { data, error } = await adminClient
            .from('customers')
            .select('auth_user_id, user_id, status')
            .eq('email', email)
            .maybeSingle();
        if (error) {
            throw new PasswordResetError(
                'Account lookup is temporarily unavailable.',
                'user_directory_unavailable',
                503,
            );
        }
        if (!data || (data as any).status !== 'active') return null;
        return (data as any).auth_user_id ?? (data as any).user_id ?? null;
    }
    if (userType === 'staff') {
        const { data, error } = await adminClient.from('users')
            .select('auth_user_id, user_id, role_key').eq('email', email).maybeSingle();
        if (error) throw new PasswordResetError('Account lookup is temporarily unavailable.', 'user_directory_unavailable', 503);
        if (!data || !(data as any).role_key) return null;
        return (data as any).auth_user_id ?? (data as any).user_id ?? null;
    }
    // vendor_user — look up via vendor_users.email
    const { data, error } = await adminClient
        .from('vendor_users')
        .select('auth_user_id, status')
        .eq('email', email)
        .maybeSingle();
    if (error) {
        throw new PasswordResetError(
            'Account lookup is temporarily unavailable.',
            'user_directory_unavailable',
            503,
        );
    }
    if (!data || (data as any).status !== 'active') return null;
    return (data as any).auth_user_id ?? null;
}

async function lookupResetDisplayName(email: string, userType: ResetUserType): Promise<string> {
    const table = userType === 'customer' ? 'customers' : userType === 'staff' ? 'users' : 'vendor_users';
    const nameColumn = userType === 'staff' ? 'user_name' : 'full_name';
    const { data } = await adminClient
        .from(table)
        .select(nameColumn)
        .eq('email', email)
        .maybeSingle();
    return String((data as Record<string, unknown> | null)?.[nameColumn] ?? email);
}

export async function requestPasswordReset(
    email: string,
    userType: ResetUserType,
): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    // Fail consistently for every address when delivery is unavailable. This
    // prevents false success messages without turning configuration failures
    // into an account-enumeration signal.
    if (!env.RESEND_API_KEY) {
        throw new PasswordResetError(
            'Password reset email delivery is not configured.',
            'email_delivery_unconfigured',
            503,
        );
    }

    const { error: readinessError } = await adminClient
        .from('password_reset_tokens')
        .select('id')
        .limit(1);
    if (readinessError) {
        throw new PasswordResetError(
            'Password reset storage is unavailable.',
            'token_store_unavailable',
            503,
        );
    }

    // Always succeed visibly — never reveal whether an account exists.
    const authUserId = await lookupAuthUserId(normalizedEmail, userType);
    if (!authUserId) return; // silent no-op

    // Invalidate any existing unused tokens for this user+type.
    const { error: invalidationError } = await adminClient
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('auth_user_id', authUserId)
        .eq('user_type', userType)
        .is('used_at', null);
    if (invalidationError) {
        throw new PasswordResetError(
            'Older password reset links could not be invalidated.',
            'token_invalidation_failed',
            503,
        );
    }

    const otp = generateOtp();
    const otpSalt = crypto.randomBytes(16).toString('hex');
    const ttlMs = env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const { error } = await adminClient.from('password_reset_tokens').insert({
        auth_user_id: authUserId,
        token_hash:   hashOtp(otp, otpSalt),
        otp_salt:     otpSalt,
        email:        normalizedEmail,
        user_type:    userType,
        token_kind:   'otp',
        attempts:     0,
        expires_at:   expiresAt,
    });
    if (error) {
        throw new PasswordResetError(
            'Password reset storage is unavailable.',
            'token_store_failed',
            503,
        );
    }

    const fullName = await lookupResetDisplayName(normalizedEmail, userType).catch(() => normalizedEmail);
    const content = passwordRecoveryEmail({
        fullName,
        code: otp,
    });

    try {
        await sendEmail({
            to:      normalizedEmail,
            subject: content.subject,
            text: content.text,
            html: content.html,
            tag: 'password-reset-otp',
        });
    } catch {
        // Invalidate the undelivered token. A later retry must receive a fresh
        // link, and the frontend must never claim this message was delivered.
        try {
            await adminClient
                .from('password_reset_tokens')
                .update({ used_at: new Date().toISOString() })
                .eq('token_hash', hashOtp(otp, otpSalt))
                .is('used_at', null);
        } catch {
            // Preserve the original delivery failure.
        }
        throw new PasswordResetError(
            'Password reset email could not be sent.',
            'email_delivery_failed',
            503,
        );
    }
}

export async function verifyPasswordResetOtp(
    email: string,
    otp: string,
    userType: ResetUserType,
): Promise<{ token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(otp)) {
        throw new PasswordResetError('Enter the six-digit code.', 'otp_incorrect', 401);
    }

    const { data: row, error } = await adminClient
        .from('password_reset_tokens')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('user_type', userType)
        .eq('token_kind', 'otp')
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new PasswordResetError('Code verification is unavailable.', 'otp_store_unavailable', 503);
    if (!row) throw new PasswordResetError('No active code exists. Request another.', 'otp_not_found', 401);
    if (!(row as any).otp_salt) throw new PasswordResetError('This code is invalid. Request another.', 'otp_not_found', 401);
    if (new Date((row as any).expires_at).getTime() <= Date.now()) {
        await adminClient.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', (row as any).id);
        throw new PasswordResetError('This code expired. Request another.', 'otp_expired', 401);
    }
    const attempts = Number((row as any).attempts ?? 0);
    if (attempts >= 5) throw new PasswordResetError('Too many attempts. Request another code.', 'otp_locked', 429);
    if (!crypto.timingSafeEqual(
        Buffer.from(String((row as any).token_hash), 'hex'),
        Buffer.from(hashOtp(otp, String((row as any).otp_salt)), 'hex'),
    )) {
        const nextAttempts = attempts + 1;
        await adminClient.from('password_reset_tokens').update({
            attempts: nextAttempts,
            ...(nextAttempts >= 5 ? { used_at: new Date().toISOString() } : {}),
        }).eq('id', (row as any).id).is('used_at', null);
        throw new PasswordResetError(
            nextAttempts >= 5 ? 'Too many attempts. Request another code.' : 'Incorrect code.',
            nextAttempts >= 5 ? 'otp_locked' : 'otp_incorrect',
            nextAttempts >= 5 ? 429 : 401,
        );
    }

    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await adminClient
        .from('password_reset_tokens')
        .update({ used_at: consumedAt })
        .eq('id', (row as any).id)
        .is('used_at', null)
        .select('id')
        .maybeSingle();
    if (consumeError || !consumed) throw new PasswordResetError('This code was already used.', 'otp_not_found', 401);

    const rawToken = generateRawToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: grantError } = await adminClient.from('password_reset_tokens').insert({
        auth_user_id: (row as any).auth_user_id,
        token_hash: hashToken(rawToken),
        email: normalizedEmail,
        user_type: userType,
        token_kind: 'reset_grant',
        attempts: 0,
        expires_at: expiresAt,
    });
    if (grantError) throw new PasswordResetError('Password reset is unavailable.', 'token_store_failed', 503);
    return { token: rawToken };
}

export async function confirmPasswordReset(
    rawToken: string,
    newPassword: string,
    userType: ResetUserType,
): Promise<void> {
    if (!rawToken || !newPassword) {
        throw new PasswordResetError('Token and new password are required.', 'missing_fields');
    }
    if (newPassword.length < 8) {
        throw new PasswordResetError('Password must be at least 8 characters.', 'weak_password');
    }
    if (userType === 'vendor_user' || userType === 'staff') {
        const policyError = vendorPasswordError(newPassword);
        if (policyError) throw new PasswordResetError(policyError, 'weak_password');
    }

    const hash = hashToken(rawToken);

    const { data: row, error } = await adminClient
        .from('password_reset_tokens')
        .select('*')
        .eq('token_hash', hash)
        .eq('user_type', userType)
        .eq('token_kind', 'reset_grant')
        .is('used_at', null)
        .maybeSingle();

    if (error) throw new PasswordResetError(error.message, 'db_error');
    if (!row)  throw new PasswordResetError('Reset link is invalid or has already been used.', 'invalid_token');
    if (new Date((row as any).expires_at).getTime() <= Date.now()) {
        throw new PasswordResetError('Reset link has expired. Please request a new one.', 'token_expired');
    }

    // Claim the one-time token before changing credentials. This prevents two
    // concurrent confirmations from both resetting the same account.
    const { data: claimed, error: claimError } = await adminClient
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', (row as any).id)
        .is('used_at', null)
        .select('id')
        .maybeSingle();
    if (claimError) throw new PasswordResetError(claimError.message, 'db_error');
    if (!claimed) throw new PasswordResetError('Reset link is invalid or has already been used.', 'invalid_token');

    const releaseClaim = async (): Promise<boolean> => {
        const { error: releaseError } = await adminClient
            .from('password_reset_tokens')
            .update({ used_at: null })
            .eq('id', (row as any).id);
        return !releaseError;
    };

    let previousVendorState: {
        password_reset_required: boolean;
        password_changed_at: string | null;
        password_session_id: string | null;
    } | null = null;

    if (userType === 'vendor_user' || userType === 'staff') {
        const stateTable = userType === 'staff' ? 'users' : 'vendor_users';
        const { data: vendorState, error: vendorStateReadError } = await adminClient
            .from(stateTable)
            .select('password_reset_required, password_changed_at, password_session_id')
            .eq('auth_user_id', (row as any).auth_user_id)
            .maybeSingle();
        if (vendorStateReadError || !vendorState) {
            await releaseClaim();
            throw new PasswordResetError(
                'Password security state is temporarily unavailable.',
                'password_state_unavailable',
                503,
            );
        }
        previousVendorState = {
            password_reset_required: (vendorState as any).password_reset_required === true,
            password_changed_at: (vendorState as any).password_changed_at ?? null,
            password_session_id: (vendorState as any).password_session_id ?? null,
        };
        const stateUpdate = adminClient
            .from(stateTable)
            .update({
                password_reset_required: true,
                password_changed_at: new Date().toISOString(),
                password_session_id: `password-reset:${crypto.randomUUID()}`,
            });
        const { error: vendorStateError } = userType === 'staff'
            ? await stateUpdate.or(`auth_user_id.eq.${(row as any).auth_user_id},user_id.eq.${(row as any).auth_user_id}`)
            : await stateUpdate.eq('auth_user_id', (row as any).auth_user_id);
        if (vendorStateError) {
            await releaseClaim();
            throw new PasswordResetError(
                'Password security state could not be saved.',
                'password_state_update_failed',
                503,
            );
        }
    }

    // Update password via Supabase service role.
    const { error: authErr } = await adminClient.auth.admin.updateUserById(
        (row as any).auth_user_id,
        { password: newPassword },
    );
    if (authErr) {
        let stateRestored = true;
        if (previousVendorState) {
            const stateTable = userType === 'staff' ? 'users' : 'vendor_users';
            const restoreUpdate = adminClient
                .from(stateTable)
                .update(previousVendorState);
            const { error: restoreError } = userType === 'staff'
                ? await restoreUpdate.or(`auth_user_id.eq.${(row as any).auth_user_id},user_id.eq.${(row as any).auth_user_id}`)
                : await restoreUpdate.eq('auth_user_id', (row as any).auth_user_id);
            stateRestored = !restoreError;
        }
        const claimReleased = stateRestored && await releaseClaim();
        if (!stateRestored || !claimReleased) {
            throw new PasswordResetError(
                'Password recovery requires support assistance.',
                'password_recovery_required',
                503,
            );
        }
        throw new PasswordResetError(authErr.message, 'password_update_failed', 503);
    }

    if (userType === 'vendor_user') {
        // The login boundary also completes this transition after a crash.
        // Keep the reset marker until credential replacement succeeds.
        await adminClient
            .from('vendor_users')
            .update({ password_reset_required: false })
            .eq('auth_user_id', (row as any).auth_user_id);
    }
    if (userType === 'staff') {
        const { error: staffStateError } = await adminClient.from('users').update({
            password_reset_required: false,
            password_session_id: null,
        }).or(`auth_user_id.eq.${(row as any).auth_user_id},user_id.eq.${(row as any).auth_user_id}`);
        if (staffStateError) {
            throw new PasswordResetError('Password was updated. Sign in again or contact support.', 'password_state_update_failed', 503);
        }
    }

    // Revoke existing sessions after recovery.
    await adminClient.auth.admin.signOut((row as any).auth_user_id, 'global').catch(() => undefined);

}
