import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';

export async function purgeExpiredWebhookPayloads(): Promise<number> {
    const { data, error } = await adminClient.rpc('purge_expired_payment_webhooks');
    if (error) throw error;
    const purged = Number(data ?? 0);
    if (purged > 0) {
        await logAction({ actorUserId: null, actorType: 'system', action: 'privacy.webhooks.purged', targetType: 'payment_webhook', targetId: 'retention', metadata: { purged } });
    }
    return purged;
}

export async function purgeExpiredOtpChallenges(): Promise<number> {
    const { data, error } = await adminClient.rpc('prune_expired_otp_challenges');
    if (error) return 0;
    const purged = Number(data ?? 0);
    if (purged > 0) {
        await logAction({ actorUserId: null, actorType: 'system', action: 'privacy.otp_challenges.purged', targetType: 'customer_email_otp', targetId: 'retention', metadata: { purged } }).catch(() => undefined);
    }
    return purged;
}
