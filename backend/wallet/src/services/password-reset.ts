/**
 * Self-service password reset for email-authenticated users (customers + vendors).
 *
 * Flow:
 *   1. requestPasswordReset(email, userType) — generate 32-byte token, hash + store,
 *      email a reset link to the user.  Always returns ok=true to avoid user enumeration.
 *   2. confirmPasswordReset(token, newPassword, userType) — verify hash, check expiry,
 *      update Supabase auth password, mark token used.
 *
 * Token TTL: PASSWORD_RESET_TTL_MINUTES env var (default 30 min).
 * Security: raw token is never persisted; only SHA-256 hex hash stored.
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { sendEmail } from '../adapters/resend.js';
import { env } from '../config/env.js';
import { passwordResetLinkEmail } from '../emails/templates.js';

export type ResetUserType = 'customer' | 'vendor_user';

export class PasswordResetError extends Error {
    constructor(message: string, public code: string) {
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

function resetUrl(userType: ResetUserType, token: string): string {
    const base = userType === 'customer'
        ? env.CUSTOMER_APP_URL.replace(/\/+$/, '')
        : env.VENDOR_APP_URL.replace(/\/+$/, '');
    return `${base}/reset-password?token=${token}`;
}

async function lookupAuthUserId(email: string, userType: ResetUserType): Promise<string | null> {
    if (userType === 'customer') {
        const { data } = await adminClient
            .from('customers')
            .select('auth_user_id, user_id, status')
            .eq('email', email)
            .maybeSingle();
        if (!data || (data as any).status !== 'active') return null;
        return (data as any).auth_user_id ?? (data as any).user_id ?? null;
    }
    // vendor_user — look up via vendor_users.email
    const { data } = await adminClient
        .from('vendor_users')
        .select('auth_user_id, status')
        .eq('email', email)
        .maybeSingle();
    if (!data || (data as any).status !== 'active') return null;
    return (data as any).auth_user_id ?? null;
}

async function lookupResetDisplayName(email: string, userType: ResetUserType): Promise<string> {
    const table = userType === 'customer' ? 'customers' : 'vendor_users';
    const nameColumn = userType === 'customer' ? 'full_name' : 'full_name';
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
        );
    }

    // Always succeed visibly — never reveal whether an account exists.
    const authUserId = await lookupAuthUserId(normalizedEmail, userType).catch(() => null);
    if (!authUserId) return; // silent no-op

    // Invalidate any existing unused tokens for this user+type.
    await adminClient
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('auth_user_id', authUserId)
        .eq('user_type', userType)
        .is('used_at', null);

    const raw = generateRawToken();
    const ttlMs = env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const { error } = await adminClient.from('password_reset_tokens').insert({
        auth_user_id: authUserId,
        token_hash:   hashToken(raw),
        email:        normalizedEmail,
        user_type:    userType,
        expires_at:   expiresAt,
    });
    if (error) {
        throw new PasswordResetError(
            'Password reset storage is unavailable.',
            'token_store_failed',
        );
    }

    const link = resetUrl(userType, raw);
    const fullName = await lookupResetDisplayName(normalizedEmail, userType).catch(() => normalizedEmail);
    const content = passwordResetLinkEmail({
        fullName,
        resetUrl: link,
        expiresMinutes: env.PASSWORD_RESET_TTL_MINUTES,
        accountLabel: userType === 'vendor_user' ? 'vendor' : undefined,
    });

    try {
        await sendEmail({
            to:      normalizedEmail,
            subject: content.subject,
            text: content.text,
            html: content.html,
            tag: 'password-reset',
        });
    } catch {
        // Invalidate the undelivered token. A later retry must receive a fresh
        // link, and the frontend must never claim this message was delivered.
        try {
            await adminClient
                .from('password_reset_tokens')
                .update({ used_at: new Date().toISOString() })
                .eq('token_hash', hashToken(raw))
                .is('used_at', null);
        } catch {
            // Preserve the original delivery failure.
        }
        throw new PasswordResetError(
            'Password reset email could not be sent.',
            'email_delivery_failed',
        );
    }
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
    // Vendors need 12-char minimum (matches PasswordChange.vue policy)
    if (userType === 'vendor_user' && newPassword.length < 12) {
        throw new PasswordResetError('Password must be at least 12 characters.', 'weak_password');
    }

    const hash = hashToken(rawToken);

    const { data: row, error } = await adminClient
        .from('password_reset_tokens')
        .select('*')
        .eq('token_hash', hash)
        .eq('user_type', userType)
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

    // Update password via Supabase service role.
    const { error: authErr } = await adminClient.auth.admin.updateUserById(
        (row as any).auth_user_id,
        { password: newPassword },
    );
    if (authErr) throw new PasswordResetError(authErr.message, 'password_update_failed');

    // Revoke existing sessions after recovery.
    await adminClient.auth.admin.signOut((row as any).auth_user_id, 'global').catch(() => undefined);

    // For vendors, also clear the forced-reset flag if set
    if (userType === 'vendor_user') {
        await adminClient
            .from('vendor_users')
            .update({ password_reset_required: false })
            .eq('auth_user_id', (row as any).auth_user_id);
    }
}
