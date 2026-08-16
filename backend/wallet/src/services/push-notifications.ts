import webpush from 'web-push';
import { adminClient } from '../db/supabase.js';
import { env } from '../config/env.js';

export type PushActorType = 'customer' | 'vendor' | 'staff';
export type PushPortal = 'customer' | 'vendor' | 'admin' | 'crm';

export interface PushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    icon?: string;
}

interface SubscriptionInput {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export function pushConfig() {
    return {
        available: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
        publicKey: env.VAPID_PUBLIC_KEY ?? null,
    };
}

export async function savePushSubscription(input: {
    actorType: PushActorType;
    actorId: string;
    portal: PushPortal;
    subscription: SubscriptionInput;
    userAgent?: string;
}): Promise<void> {
    if (!pushConfig().available) throw new Error('Push notifications are not configured.');
    const record = {
        actor_type: input.actorType,
        actor_id: input.actorId,
        portal: input.portal,
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        user_agent: input.userAgent ?? null,
        updated_at: new Date().toISOString(),
    };
    const { error: insertError } = await adminClient.from('push_subscriptions').insert(record);
    if (insertError && insertError.code !== '23505') throw insertError;
    if (!insertError) return;

    const { data, error } = await adminClient
        .from('push_subscriptions')
        .update(record)
        .eq('endpoint', input.subscription.endpoint)
        .eq('actor_type', input.actorType)
        .eq('actor_id', input.actorId)
        .select('id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Push subscription belongs to another account.');
}

export async function removePushSubscription(input: {
    actorType: PushActorType;
    actorId: string;
    endpoint: string;
}): Promise<void> {
    const { error } = await adminClient
        .from('push_subscriptions')
        .delete()
        .eq('actor_type', input.actorType)
        .eq('actor_id', input.actorId)
        .eq('endpoint', input.endpoint);
    if (error) throw error;
}

export async function sendWebPush(
    actorType: PushActorType,
    actorId: string,
    payload: PushPayload,
    portal?: PushPortal,
): Promise<{ sent: number; failed: number }> {
    if (!pushConfig().available) return { sent: 0, failed: 0 };
    let query = adminClient
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('actor_type', actorType)
        .eq('actor_id', actorId);
    if (portal) query = query.eq('portal', portal);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return { sent: 0, failed: 0 };

    const vapidDetails = {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY!,
        privateKey: env.VAPID_PRIVATE_KEY!,
    };
    let sent = 0;
    let failed = 0;
    await Promise.all(data.map(async (row: any) => {
        try {
            await webpush.sendNotification({
                endpoint: row.endpoint,
                keys: { p256dh: row.p256dh, auth: row.auth },
            }, JSON.stringify(payload), { vapidDetails, TTL: 300, urgency: 'normal' });
            sent += 1;
        } catch (caught: any) {
            failed += 1;
            if (caught?.statusCode === 404 || caught?.statusCode === 410) {
                await adminClient.from('push_subscriptions').delete().eq('id', row.id);
            }
        }
    }));
    return { sent, failed };
}
