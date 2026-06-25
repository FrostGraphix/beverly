/**
 * Payment webhook retention.
 *
 * Expired webhook payloads are minimized in Supabase while keeping digests,
 * references, processing states, and audit timestamps intact.
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';

export async function purgeExpiredWebhookPayloads(): Promise<number> {
    const { data, error } = await adminClient.rpc('purge_expired_payment_webhooks');
    if (error) throw error;
    const purged = Number(data ?? 0);
    if (purged > 0) {
        await logAction({
            actorUserId: null,
            actorType: 'system',
            action: 'privacy.webhooks.purged',
            targetType: 'payment_webhook',
            targetId: null,
            after: { purged },
        }).catch(() => undefined);
    }
    return purged;
}
