/**
 * Audit log writer.
 *
 * Append-only. Best-effort — never throws (audit must never break business flow).
 * Writes go through the service-role client to the dedicated `wallet_audit_log`
 * and `wallet_security_events` tables (see migration 20260518140000).
 *
 * Use `logAction()` from every mutating route.
 * Use `logSecurityEvent()` for auth, MFA, and abuse signals.
 * Use `auditFromRequest()` to capture ip / user-agent / correlation-id helpers.
 */
import type { FastifyRequest } from 'fastify';
import { adminClient } from '../db/supabase.js';

export type ActorType = 'staff' | 'vendor_user' | 'customer' | 'system' | 'webhook';

export type SecurityEventType =
    | 'login_success' | 'login_failure' | 'logout'
    | 'password_change' | 'mfa_enabled' | 'mfa_disabled' | 'mfa_failure'
    | 'suspicious_activity' | 'rate_limit_hit' | 'permission_denied'
    | 'impersonation_start' | 'impersonation_end' | 'session_revoked'
    | 'session_timeout' | 'temp_password_issued' | 'temp_password_used'
    | 'vend_credential_set' | 'vend_credential_failure'
    | 'sms_allowed' | 'sms_blocked';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface LogActionInput {
    actorUserId: string | null;
    actorType: ActorType;
    actorRole?: string | null;
    action: string;                              // dotted: 'wallet.funding.approve'
    targetType?: string | null;
    targetId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
}

export interface LogSecurityEventInput {
    actorUserId?: string | null;
    severity?: Severity;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
}

/**
 * Write one audit row. Returns true on success.
 * Never throws — caller can safely fire-and-forget.
 */
export async function logAction(input: LogActionInput): Promise<boolean> {
    try {
        const { error } = await adminClient.from('wallet_audit_log').insert({
            actor_user_id:  input.actorUserId,
            actor_type:     input.actorType,
            actor_role:     input.actorRole ?? null,
            action:         input.action,
            target_type:    input.targetType ?? 'request',
            target_id:      input.targetId ?? 'n/a',
            before:         input.before ?? null,
            after:          input.after ?? null,
            metadata:       input.metadata ?? {},
            ip:             input.ip ?? null,
            user_agent:     input.userAgent ?? null,
            correlation_id: input.correlationId ?? null,
        });
        if (error) {
            // Surface to stderr so log shippers pick it up; never re-throw
            console.error('[audit] logAction failed:', error.message);
            return false;
        }
        return true;
    } catch (e: any) {
        console.error('[audit] logAction exception:', e?.message ?? e);
        return false;
    }
}

/**
 * Write one security event row.
 */
export async function logSecurityEvent(
    eventType: SecurityEventType,
    opts: LogSecurityEventInput = {},
): Promise<boolean> {
    try {
        const { error } = await adminClient.from('wallet_security_events').insert({
            event_type:    eventType,
            actor_user_id: opts.actorUserId ?? null,
            severity:      opts.severity ?? 'info',
            ip_address:    opts.ip ?? null,
            user_agent:    opts.userAgent ?? null,
            metadata:      opts.metadata ?? {},
        });
        if (error) {
            console.error('[audit] logSecurityEvent failed:', error.message);
            return false;
        }
        return true;
    } catch (e: any) {
        console.error('[audit] logSecurityEvent exception:', e?.message ?? e);
        return false;
    }
}

/**
 * Extract audit-relevant request context (ip, user-agent, correlation-id).
 * Use to enrich logAction()/logSecurityEvent() calls from a Fastify route.
 */
export function auditFromRequest(req: FastifyRequest): {
    ip: string;
    userAgent: string | null;
    correlationId: string | null;
    actorUserId: string | null;
    actorType: ActorType;
    actorRole: string | null;
} {
    const cid = (req.headers['x-correlation-id'] as string | undefined) ?? req.id;
    return {
        ip:            (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip,
        userAgent:     (req.headers['user-agent'] as string | undefined) ?? null,
        correlationId: cid ?? null,
        actorUserId:   req.actor?.userId ?? null,
        actorType:     (req.actor?.type ?? 'system') as ActorType,
        actorRole:     req.actor?.role ?? null,
    };
}
