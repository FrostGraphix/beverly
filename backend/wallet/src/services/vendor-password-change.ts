import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';

export class VendorPasswordChangeError extends Error {
    constructor(message: string, public code: string, public status = 400) {
        super(message);
        this.name = 'VendorPasswordChangeError';
    }
}

interface PasswordActor {
    actorId: string;
    userId: string;
    email: string | null;
    passwordResetRequired?: boolean;
}

interface PasswordGrant {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    user?: { id?: string };
}

export function tokenPredatesPasswordChange(accessToken: string, passwordChangedAt: string | null | undefined): boolean {
    if (!passwordChangedAt) return false;
    try {
        const payload = accessToken.split('.')[1];
        const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as { iat?: unknown };
        const issuedAt = Number(claims.iat) * 1000;
        const changedAt = new Date(passwordChangedAt).getTime();
        return Number.isFinite(issuedAt) && Number.isFinite(changedAt) && issuedAt < changedAt;
    } catch {
        return true;
    }
}

function tokenClaims(accessToken: string): { iat?: number; session_id?: string } {
    try {
        const payload = accessToken.split('.')[1];
        return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as { iat?: number; session_id?: string };
    } catch {
        return {};
    }
}

export function tokenAllowedAfterPasswordChange(
    accessToken: string,
    passwordChangedAt: string | null | undefined,
    passwordSessionId: string | null | undefined,
): boolean {
    const claims = tokenClaims(accessToken);
    if (passwordSessionId) return claims.session_id === passwordSessionId;
    return !tokenPredatesPasswordChange(accessToken, passwordChangedAt);
}

async function passwordGrant(email: string, password: string): Promise<PasswordGrant | null> {
    let response: Response;
    try {
        response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password }),
        });
    } catch {
        throw new VendorPasswordChangeError('Authentication service is temporarily unavailable.', 'auth_upstream_unreachable', 503);
    }
    const payload = await response.json().catch(() => ({})) as PasswordGrant;
    return response.ok && payload.access_token ? payload : null;
}

async function restorePassword(userId: string, previousPassword: string): Promise<void> {
    const { error: restoreError } = await adminClient.auth.admin.updateUserById(userId, { password: previousPassword });
    if (restoreError) throw new Error(restoreError.message);
    const { error: revokeError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (revokeError) throw new Error(revokeError.message);
}

export function passwordSessionId(accessToken: string): string | null {
    const sessionId = tokenClaims(accessToken).session_id;
    return typeof sessionId === 'string' && sessionId.trim() ? sessionId : null;
}

async function restoreOrEscalate(userId: string, previousPassword: string): Promise<void> {
    try {
        await restorePassword(userId, previousPassword);
    } catch {
        throw new VendorPasswordChangeError(
            'Password recovery requires support assistance.',
            'password_recovery_required',
            503,
        );
    }
}

export async function replaceVendorPassword(input: {
    actor: PasswordActor;
    currentPassword: string;
    nextPassword: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    const { actor } = input;
    if (!actor.email) throw new VendorPasswordChangeError('Account has no email.', 'no_email');

    const { data: attemptAllowed, error: attemptError } = await adminClient.rpc('fn_claim_vendor_password_change_attempt', {
        p_auth_user_id: actor.userId,
        p_ip_address: input.ip ?? null,
    });
    if (attemptError) {
        throw new VendorPasswordChangeError('Password security checks are temporarily unavailable.', 'password_change_guard_unavailable', 503);
    }
    if (attemptAllowed !== true) {
        await logSecurityEvent('rate_limit_hit', {
            actorUserId: actor.userId,
            severity: 'high',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { surface: 'vendor_password_change', scope: 'account' },
        }).catch(() => undefined);
        throw new VendorPasswordChangeError('Too many password-change attempts. Try again in 15 minutes.', 'password_change_rate_limited', 429);
    }

    const currentGrant = await passwordGrant(actor.email, input.currentPassword);
    if (!currentGrant || currentGrant.user?.id !== actor.userId) {
        await logSecurityEvent('password_change_failure', {
            actorUserId: actor.userId,
            severity: 'medium',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { reason: 'invalid_current_password' },
        }).catch(() => undefined);
        throw new VendorPasswordChangeError('Current password is incorrect.', 'invalid_current_password');
    }

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(actor.userId, {
        password: input.nextPassword,
    });
    if (passwordError) {
        throw new VendorPasswordChangeError(passwordError.message, 'password_update_failed');
    }

    const { error: revokeError } = await adminClient.auth.admin.signOut(actor.userId, 'global');
    if (revokeError) {
        await restoreOrEscalate(actor.userId, input.currentPassword);
        throw new VendorPasswordChangeError('Password change was cancelled because existing sessions could not be revoked.', 'session_revocation_failed', 503);
    }

    const rotated = await passwordGrant(actor.email, input.nextPassword);
    if (!rotated || rotated.user?.id !== actor.userId) {
        await restoreOrEscalate(actor.userId, input.currentPassword);
        throw new VendorPasswordChangeError('Password change was safely cancelled. Please try again.', 'session_rotation_failed', 503);
    }

    const rotatedClaims = tokenClaims(rotated.access_token);
    const changedAt = Number.isFinite(rotatedClaims.iat)
        ? new Date(Number(rotatedClaims.iat) * 1000).toISOString()
        : new Date().toISOString();
    const { error: stateError } = await adminClient
        .from('vendor_users')
        .update({
            password_reset_required: false,
            password_changed_at: changedAt,
            password_session_id: rotatedClaims.session_id ?? null,
        })
        .eq('id', actor.actorId);
    if (stateError) {
        await restoreOrEscalate(actor.userId, input.currentPassword);
        throw new VendorPasswordChangeError('Password change was safely cancelled because account state could not be saved.', 'password_state_update_failed', 503);
    }

    await logSecurityEvent('password_change', {
        actorUserId: actor.userId,
        severity: 'info',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { was_temp_password: actor.passwordResetRequired === true, sessions_revoked: true, session_rotated: true },
    }).catch(() => undefined);
    if (actor.passwordResetRequired === true) {
        await logSecurityEvent('temp_password_used', {
            actorUserId: actor.userId,
            severity: 'info',
            ip: input.ip,
            userAgent: input.userAgent,
        }).catch(() => undefined);
    }

    return {
        ok: true as const,
        was_temp_password: actor.passwordResetRequired === true,
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token ?? null,
        expires_at: rotated.expires_at ?? null,
        expires_in: rotated.expires_in ?? null,
    };
}
