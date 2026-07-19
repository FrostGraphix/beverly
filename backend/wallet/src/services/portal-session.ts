import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import type { Actor, ActorType } from '../plugins/auth.js';

const POLICIES: Record<ActorType, { idleSeconds: number; absoluteSeconds: number }> = {
    staff: { idleSeconds: 30 * 60, absoluteSeconds: 8 * 60 * 60 },
    vendor_user: { idleSeconds: 30 * 60, absoluteSeconds: 12 * 60 * 60 },
    customer: { idleSeconds: 60 * 60, absoluteSeconds: 30 * 24 * 60 * 60 },
};

type JwtClaims = { iat?: number; session_id?: string };

export class PortalSessionError extends Error {
    constructor(public code: string, message: string, public unavailable = false) {
        super(message);
    }
}

function claimsFromToken(token: string): JwtClaims | null {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as JwtClaims;
    } catch {
        return null;
    }
}

export function portalSessionIdentity(actor: Actor, token: string) {
    const claims = claimsFromToken(token);
    const issuedAt = Number(claims?.iat) * 1000;
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
        throw new PortalSessionError('invalid_session', 'Session issue time is invalid.');
    }
    const stableId = String(claims?.session_id || '').trim();
    if (!stableId) {
        throw new PortalSessionError('invalid_session', 'Session identifier is invalid.');
    }
    return {
        sessionKey: crypto.createHash('sha256').update(stableId).digest('hex'),
        startedAt: new Date(issuedAt).toISOString(),
        policy: POLICIES[actor.type],
    };
}

export async function enforcePortalSession(actor: Actor, token: string): Promise<string> {
    const { sessionKey, startedAt, policy } = portalSessionIdentity(actor, token);
    const { data, error } = await adminClient.rpc('touch_portal_session', {
        p_session_key: sessionKey,
        p_auth_user_id: actor.userId,
        p_actor_type: actor.type,
        p_started_at: startedAt,
        p_idle_seconds: policy.idleSeconds,
        p_absolute_seconds: policy.absoluteSeconds,
    });
    if (error) {
        throw new PortalSessionError('session_validation_unavailable', 'Session validation is temporarily unavailable.', true);
    }
    const status = String(data || 'invalid_session');
    if (status !== 'active') {
        const message = status === 'session_idle_timeout'
            ? 'Session timed out after inactivity.'
            : status === 'session_absolute_timeout'
                ? 'Session reached its maximum duration.'
                : 'Session is invalid or revoked.';
        throw new PortalSessionError(status, message);
    }
    return sessionKey;
}

export async function revokePortalSession(sessionKey: string | undefined): Promise<void> {
    if (!sessionKey) return;
    const { error } = await adminClient
        .from('portal_sessions')
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('session_key', sessionKey);
    if (error) throw new PortalSessionError('session_revocation_failed', 'Session revocation failed.', true);
}
