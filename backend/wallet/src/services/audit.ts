/**
 * Audit log writer.
 * Append-only.  Never throws — best-effort.
 * Use from every mutating route.
 */
import { adminClient } from '../db/supabase.js';

export interface LogActionInput {
    actorUserId: string | null;
    actorType: 'staff' | 'vendor_user' | 'customer' | 'system' | 'webhook';
    actorRole?: string | null;
    action: string;             // dotted: 'wallet.funding.approve', 'vendor.user.invite'
    targetType?: string | null; // 'wallet' | 'vendor_organization' | 'purchase_order' | …
    targetId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
}

export async function logAction(input: LogActionInput): Promise<void> {
    try {
        await adminClient.rpc('fn_audit_log', {
            p_actor_user_id: input.actorUserId,
            p_actor_type: input.actorType,
            p_actor_role: input.actorRole ?? null,
            p_action: input.action,
            p_target_type: input.targetType ?? null,
            p_target_id: input.targetId ?? null,
            p_before: input.before ?? null,
            p_after: input.after ?? null,
            p_metadata: input.metadata ?? null,
            p_ip: input.ip ?? null,
            p_user_agent: input.userAgent ?? null,
            p_correlation: input.correlationId ?? null,
        });
    } catch {
        // never throw from audit; metrics will alert on failures separately
    }
}

export async function logSecurityEvent(
    eventType:
        | 'login_success' | 'login_failure' | 'logout'
        | 'password_change' | 'mfa_enabled' | 'mfa_disabled' | 'mfa_failure'
        | 'suspicious_activity' | 'rate_limit_hit' | 'permission_denied'
        | 'impersonation_start' | 'impersonation_end' | 'session_revoked',
    opts: {
        actorUserId?: string | null;
        severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
        ip?: string | null;
        userAgent?: string | null;
        metadata?: Record<string, unknown>;
    } = {},
): Promise<void> {
    try {
        await adminClient.from('security_events').insert({
            event_type: eventType,
            actor_user_id: opts.actorUserId ?? null,
            severity: opts.severity ?? 'info',
            ip_address: opts.ip ?? null,
            user_agent: opts.userAgent ?? null,
            metadata: opts.metadata ?? {},
        });
    } catch {
        // best-effort
    }
}
