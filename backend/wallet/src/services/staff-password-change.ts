import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';
import { passwordSessionId } from './vendor-password-change.js';

export class StaffPasswordChangeError extends Error {
    constructor(public code: string, message: string, public status = 400) {
        super(message);
        this.name = 'StaffPasswordChangeError';
    }
}

interface StaffPasswordActor {
    userId: string;
    email: string | null;
    passwordResetRequired?: boolean;
}

interface PasswordGrant {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    user?: { id?: string };
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
        throw new StaffPasswordChangeError('auth_upstream_unreachable', 'Authentication service is temporarily unavailable.', 503);
    }
    const payload = await response.json().catch(() => ({})) as PasswordGrant;
    return response.ok && payload.access_token ? payload : null;
}

async function restorePassword(userId: string, previousPassword: string) {
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password: previousPassword });
    if (error) throw new Error(error.message);
    const { error: revokeError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (revokeError) throw new Error(revokeError.message);
}

async function restoreOrEscalate(userId: string, previousPassword: string) {
    try {
        await restorePassword(userId, previousPassword);
    } catch {
        throw new StaffPasswordChangeError('password_recovery_required', 'Password recovery requires Super Admin assistance.', 503);
    }
}

export async function replaceStaffPassword(input: {
    actor: StaffPasswordActor;
    currentPassword: string;
    nextPassword: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    if (!input.actor.email) throw new StaffPasswordChangeError('no_email', 'Account has no email.');
    const { data: allowed, error: attemptError } = await adminClient.rpc('fn_claim_staff_password_change_attempt', {
        p_auth_user_id: input.actor.userId,
        p_ip_address: input.ip ?? null,
    });
    if (attemptError) throw new StaffPasswordChangeError('password_change_guard_unavailable', 'Password security checks are temporarily unavailable.', 503);
    if (allowed !== true) throw new StaffPasswordChangeError('password_change_rate_limited', 'Too many attempts. Try again in 15 minutes.', 429);

    const currentGrant = await passwordGrant(input.actor.email, input.currentPassword);
    if (!currentGrant || currentGrant.user?.id !== input.actor.userId) {
        await logSecurityEvent('password_change_failure', {
            actorUserId: input.actor.userId,
            severity: 'medium',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { reason: 'invalid_current_password' },
        }).catch(() => undefined);
        throw new StaffPasswordChangeError('invalid_current_password', 'Current password is incorrect.');
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(input.actor.userId, { password: input.nextPassword });
    if (updateError) throw new StaffPasswordChangeError('password_update_failed', updateError.message);
    const { error: revokeError } = await adminClient.auth.admin.signOut(input.actor.userId, 'global');
    if (revokeError) {
        await restoreOrEscalate(input.actor.userId, input.currentPassword);
        throw new StaffPasswordChangeError('session_revocation_failed', 'Password change was cancelled.', 503);
    }

    const rotated = await passwordGrant(input.actor.email, input.nextPassword);
    if (!rotated?.access_token || rotated.user?.id !== input.actor.userId) {
        await restoreOrEscalate(input.actor.userId, input.currentPassword);
        throw new StaffPasswordChangeError('session_rotation_failed', 'Password change was safely cancelled.', 503);
    }
    const sessionId = passwordSessionId(rotated.access_token);
    if (!sessionId) {
        await restoreOrEscalate(input.actor.userId, input.currentPassword);
        throw new StaffPasswordChangeError('session_binding_failed', 'Secure session creation failed.', 503);
    }
    const changedAt = new Date().toISOString();
    const { error: stateError } = await adminClient.from('users').update({
        password_reset_required: false,
        password_changed_at: changedAt,
        password_session_id: sessionId,
        updated_at: changedAt,
    }).or(`auth_user_id.eq.${input.actor.userId},user_id.eq.${input.actor.userId}`);
    if (stateError) {
        await restoreOrEscalate(input.actor.userId, input.currentPassword);
        throw new StaffPasswordChangeError('password_state_update_failed', 'Password change was safely cancelled.', 503);
    }

    await logSecurityEvent('password_change', {
        actorUserId: input.actor.userId,
        severity: 'info',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { was_temp_password: input.actor.passwordResetRequired === true, sessions_revoked: true },
    }).catch(() => undefined);
    return {
        ok: true as const,
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token ?? null,
        expires_at: rotated.expires_at ?? null,
        expires_in: rotated.expires_in ?? null,
    };
}
