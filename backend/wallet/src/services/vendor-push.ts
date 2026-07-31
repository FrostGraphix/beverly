import { createHash } from 'node:crypto';
import webPush from 'web-push';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

type PushSubscriptionInput = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
};

type VendorPushPayload = {
    title: string;
    body: string;
    eventKey: string;
    path?: string;
};

function pushConfigured(): boolean {
    return Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY && env.WEB_PUSH_VAPID_SUBJECT);
}

function portalUrl(path?: string): string {
    const base = env.VENDOR_PORTAL_URL.endsWith('/') ? env.VENDOR_PORTAL_URL : `${env.VENDOR_PORTAL_URL}/`;
    const relative = path?.startsWith('/') && !path.startsWith('//') ? path.slice(1) : '';
    return new URL(relative, base).toString();
}

export function vendorPushConfig() {
    return {
        available: pushConfigured(),
        publicKey: pushConfigured() ? env.WEB_PUSH_VAPID_PUBLIC_KEY : null,
    };
}

export async function saveVendorPushSubscription(input: {
    vendorOrganizationId: string;
    vendorUserId: string;
    subscription: PushSubscriptionInput;
    userAgent?: string;
}): Promise<void> {
    const { error } = await adminClient.from('vendor_push_subscriptions').upsert({
        vendor_organization_id: input.vendorOrganizationId,
        vendor_user_id: input.vendorUserId,
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        user_agent: input.userAgent?.slice(0, 500) ?? null,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
}

export async function removeVendorPushSubscription(vendorUserId: string, endpoint: string): Promise<void> {
    const { error } = await adminClient
        .from('vendor_push_subscriptions')
        .delete()
        .eq('vendor_user_id', vendorUserId)
        .eq('endpoint', endpoint);
    if (error) throw error;
}

export async function sendVendorPush(vendorOrganizationId: string, payload: VendorPushPayload): Promise<void> {
    if (!pushConfigured()) return;
    const { data: subscriptions, error } = await adminClient
        .from('vendor_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('vendor_organization_id', vendorOrganizationId);
    if (error) throw error;
    if (!subscriptions?.length) return;

    const notification = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: portalUrl(payload.path),
        icon: portalUrl('/pwa-192.png'),
        tag: payload.eventKey,
    });
    const expiredIds: string[] = [];
    const topic = createHash('sha256').update(payload.eventKey).digest('base64url').slice(0, 32);

    await Promise.all(subscriptions.map(async (subscription: any) => {
        try {
            await webPush.sendNotification({
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, notification, {
                TTL: 60 * 60,
                timeout: 5_000,
                urgency: 'high',
                topic,
                vapidDetails: {
                    subject: env.WEB_PUSH_VAPID_SUBJECT!,
                    publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY!,
                    privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY!,
                },
            });
        } catch (pushError: any) {
            if ([404, 410].includes(Number(pushError?.statusCode))) expiredIds.push(subscription.id);
            else console.error('[vendor-push] delivery failed:', pushError);
        }
    }));

    if (expiredIds.length) {
        await adminClient.from('vendor_push_subscriptions').delete().in('id', expiredIds);
    }
}
