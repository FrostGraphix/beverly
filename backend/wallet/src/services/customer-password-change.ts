import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';
import { passwordSessionId } from './vendor-password-change.js';

export class CustomerPasswordChangeError extends Error {
    constructor(public code: string, message: string, public status = 400) {
        super(message);
        this.name = 'CustomerPasswordChangeError';
    }
}

async function grant(identifier: { email?: string; phone?: string }, password: string): Promise<any | null> {
    let response: Response;
    try {
        response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
            body: JSON.stringify({ ...identifier, password }),
        });
    } catch {
        throw new CustomerPasswordChangeError('auth_upstream_unreachable', 'Authentication service is temporarily unavailable.', 503);
    }
    const payload = await response.json().catch(() => ({}));
    return response.ok && (payload as any).access_token ? payload : null;
}

async function restoreOrEscalate(userId: string, previousPassword: string): Promise<never> {
    const { error: restoreError } = await adminClient.auth.admin.updateUserById(userId, { password: previousPassword });
    const { error: revokeError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (restoreError || revokeError) {
        throw new CustomerPasswordChangeError('password_recovery_required', 'Password recovery requires support assistance.', 503);
    }
    throw new CustomerPasswordChangeError('password_change_cancelled', 'Password change was safely cancelled.', 503);
}

export async function replaceCustomerPassword(input: {
    actor: { userId: string; actorId: string; email: string | null; phone?: string | null };
    currentPassword: string;
    nextPassword: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    const identifier = input.actor.email
        ? { email: input.actor.email }
        : input.actor.phone ? { phone: input.actor.phone } : null;
    if (!identifier) throw new CustomerPasswordChangeError('no_password_identity', 'This account does not use password sign-in.', 422);
    const { data: allowed, error: guardError } = await adminClient.rpc('fn_claim_customer_password_change_attempt', {
        p_auth_user_id: input.actor.userId,
        p_ip_address: input.ip ?? null,
    });
    if (guardError) throw new CustomerPasswordChangeError('password_change_guard_unavailable', 'Password security checks are unavailable.', 503);
    if (allowed !== true) throw new CustomerPasswordChangeError('password_change_rate_limited', 'Too many attempts. Try again in 15 minutes.', 429);

    const current = await grant(identifier, input.currentPassword);
    if (!current || current.user?.id !== input.actor.userId) {
        throw new CustomerPasswordChangeError('invalid_current_password', 'Current password is incorrect.', 401);
    }
    const { error: updateError } = await adminClient.auth.admin.updateUserById(input.actor.userId, { password: input.nextPassword });
    if (updateError) throw new CustomerPasswordChangeError('password_update_failed', updateError.message, 503);
    const { error: revokeError } = await adminClient.auth.admin.signOut(input.actor.userId, 'global');
    if (revokeError) await restoreOrEscalate(input.actor.userId, input.currentPassword);
    const rotated = await grant(identifier, input.nextPassword);
    const sessionId = rotated?.access_token ? passwordSessionId(rotated.access_token) : null;
    if (!rotated?.access_token || rotated.user?.id !== input.actor.userId || !sessionId) {
        await restoreOrEscalate(input.actor.userId, input.currentPassword);
    }
    const changedAt = new Date().toISOString();
    const { error: stateError } = await adminClient.from('customers').update({
        password_changed_at: changedAt,
        password_session_id: sessionId,
    }).eq('id', input.actor.actorId);
    if (stateError) {
        try {
            await restoreOrEscalate(input.actor.userId, input.currentPassword);
        } catch (error) {
            if (error instanceof CustomerPasswordChangeError && error.code === 'password_change_cancelled') {
                throw new CustomerPasswordChangeError('password_state_update_failed', 'Password change was safely cancelled.', 503);
            }
            throw error;
        }
    }
    await logSecurityEvent('password_change', {
        actorUserId: input.actor.userId,
        severity: 'info', ip: input.ip, userAgent: input.userAgent,
        metadata: { sessions_revoked: true, session_rotated: true, portal: 'customer' },
    }).catch(() => undefined);
    return {
        ok: true as const,
        access_token: rotated.access_token as string,
        refresh_token: rotated.refresh_token ?? null,
        expires_at: rotated.expires_at ?? null,
        expires_in: rotated.expires_in ?? null,
    };
}
