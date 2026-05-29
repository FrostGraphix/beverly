/**
 * Notification service — Phase 4 (queue-backed pipeline).
 *
 * Flow:
 *   sendNotification(customerId, payload)
 *     │
 *     ├── 1. Write in-app row SYNCHRONOUSLY → customer sees it instantly
 *     └── 2. Enqueue job to BullMQ 'notifications' queue
 *               │
 *               └── NotificationsWorker picks up:
 *                     • SMS   → Twilio  → delivery receipt
 *                     • Email → Postmark → delivery receipt
 *                     • Push  → FCM     → delivery receipt
 *                     └── Retry on failure (3× exponential backoff)
 *
 * In-app is written synchronously to avoid UX lag from queue latency.
 */
import { adminClient } from '../db/supabase.js';
import { notificationsQueue } from '../queue/index.js';
import { isFlagEnabled } from './feature-flags.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
    | 'token_purchased'
    | 'wallet_funded'
    | 'kyc_update'
    | 'dispute_update'
    | 'low_balance'
    | 'payment_failed'
    | 'meter_order_update';

export interface NotificationPayload {
    type: NotificationType;
    title: string;
    body: string;
    subject?: string;
    metadata?: Record<string, unknown>;
}

export interface NotificationJobData {
    notificationId: string;
    customerId: string;
    type: string;
    title: string;
    body: string;
    subject?: string;
    metadata?: Record<string, unknown>;
    channels: {
        sms:   boolean;
        email: boolean;
        push:  boolean;
    };
    phone?:      string | null;
    email?:      string | null;
    pushTokens?: string[];
    firstName?:  string;
}

interface CustomerRow {
    id: string;
    phone: string | null;
    email: string | null;
    full_name: string | null;
    notification_preferences: PreferencesShape | null;
}

interface PreferencesShape {
    sms?:    Record<string, boolean>;
    email?:  Record<string, boolean>;
    in_app?: Record<string, boolean>;
    push?:   Record<string, boolean>;
}

// ── Default preferences ───────────────────────────────────────────────────────

const PREF_DEFAULTS: Required<PreferencesShape> = {
    sms:    { token_purchased: false, wallet_funded: true, low_balance: true },
    email:  { token_purchased: false, wallet_funded: false, promotions: false },
    in_app: { token_purchased: true, wallet_funded: true, kyc_update: true, dispute_update: true, low_balance: true, payment_failed: true, meter_order_update: true },
    push:   { token_purchased: true, wallet_funded: true, low_balance: true, dispute_update: true, payment_failed: true },
};

function prefEnabled(prefs: PreferencesShape | null, channel: keyof PreferencesShape, type: NotificationType): boolean {
    const channelPrefs = prefs?.[channel] ?? PREF_DEFAULTS[channel] ?? {};
    return (channelPrefs as Record<string, boolean>)[type]
        ?? (PREF_DEFAULTS[channel] as Record<string, boolean>)[type]
        ?? false;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function sendNotification(
    customerId: string,
    payload: NotificationPayload,
): Promise<void> {
    const [customerRes, tokensRes] = await Promise.all([
        adminClient
            .from('customers')
            .select('id, phone, email, full_name, notification_preferences')
            .eq('id', customerId)
            .maybeSingle(),
        adminClient
            .from('customer_push_tokens')
            .select('token')
            .eq('customer_id', customerId)
            .eq('active', true),
    ]);

    if (!customerRes.data) return;

    const cu        = customerRes.data as CustomerRow;
    const prefs     = cu.notification_preferences as PreferencesShape | null;
    const pushTokens = (tokensRes.data ?? []).map((r: any) => r.token as string);

    // Step 1: write in-app row synchronously for immediate inbox visibility
    const notificationId = await writeInApp(cu, payload, prefs);

    // Step 2: enqueue external channel job (SMS / email / push)
    const channels = {
        sms:   prefEnabled(prefs, 'sms', payload.type),
        email: prefEnabled(prefs, 'email', payload.type),
        push:  prefEnabled(prefs, 'push', payload.type) && pushTokens.length > 0,
    };

    if ((channels.sms || channels.email || channels.push) && notificationId) {
        const job: NotificationJobData = {
            notificationId,
            customerId:  cu.id,
            type:        payload.type,
            title:       payload.title,
            body:        payload.body,
            subject:     payload.subject,
            metadata:    payload.metadata,
            channels,
            phone:       cu.phone,
            email:       cu.email,
            pushTokens,
            firstName:   cu.full_name?.split(' ')[0] ?? cu.email ?? 'there',
        };
        try {
            await notificationsQueue.add('send', job, {
                jobId: `notif:${notificationId}`,
            });
        } catch (err) {
            console.error('[notifications] enqueue failed:', err);
        }
    }
}

// ── In-app inbox (synchronous) ────────────────────────────────────────────────

async function writeInApp(
    cu: CustomerRow,
    payload: NotificationPayload,
    prefs: PreferencesShape | null,
): Promise<string | null> {
    if (!prefEnabled(prefs, 'in_app', payload.type)) return null;
    try {
        const { data } = await adminClient
            .from('notifications')
            .insert({
                customer_id: cu.id,
                type:        payload.type,
                title:       payload.title,
                body:        payload.body,
                metadata:    payload.metadata ?? {},
                read:        false,
            })
            .select('id')
            .single();
        return (data as any)?.id ?? null;
    } catch (err) {
        console.error('[notifications] in-app write failed:', err);
        return null;
    }
}

// ── Feature-flag helpers used by worker ──────────────────────────────────────

export async function isSmsEnabled(): Promise<boolean> {
    try { return await isFlagEnabled('notifications.sms'); } catch { return false; }
}

export async function isEmailEnabled(): Promise<boolean> {
    try { return await isFlagEnabled('notifications.email'); } catch { return false; }
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export function notifyTokenPurchased(customerId: string, opts: {
    meterId: string; units?: number | null; amountMinor: number; token: string;
}): Promise<void> {
    const units  = opts.units ? ` · ${opts.units.toFixed(2)} kWh` : '';
    const amount = `₦${(opts.amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    return sendNotification(customerId, {
        type:  'token_purchased',
        title: 'Token purchased',
        body:  `Your ${amount} token for meter ${opts.meterId}${units} is ready. Token: ${opts.token}`,
        metadata: { meterId: opts.meterId, amountMinor: opts.amountMinor, token: opts.token },
    });
}

export function notifyWalletFunded(customerId: string, opts: {
    amountMinor: number; reference: string;
}): Promise<void> {
    const amount = `₦${(opts.amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    return sendNotification(customerId, {
        type:  'wallet_funded',
        title: 'Wallet funded',
        body:  `${amount} has been added to your Beverly wallet.`,
        metadata: { amountMinor: opts.amountMinor, reference: opts.reference },
    });
}

export function notifyKycUpdate(customerId: string, opts: { tier: number }): Promise<void> {
    const tierLabel = opts.tier === 1 ? 'Tier 1 (₦50k/day)' : 'Tier 2 (₦200k/day)';
    return sendNotification(customerId, {
        type:  'kyc_update',
        title: 'KYC verified',
        body:  `Your identity has been verified to ${tierLabel}.`,
        metadata: { tier: opts.tier },
    });
}

export function notifyDisputeUpdate(customerId: string, opts: {
    disputeId: string; status: string; message?: string;
}): Promise<void> {
    const statusLabel = opts.status === 'resolved' ? 'resolved' : opts.status === 'rejected' ? 'closed' : 'updated';
    return sendNotification(customerId, {
        type:  'dispute_update',
        title: 'Dispute update',
        body:  opts.message ?? `Your dispute has been ${statusLabel}.`,
        metadata: { disputeId: opts.disputeId, status: opts.status },
    });
}

export function notifyPaymentFailed(customerId: string, opts: {
    amountMinor: number; reason?: string;
}): Promise<void> {
    const amount = `₦${(opts.amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    return sendNotification(customerId, {
        type:  'payment_failed',
        title: 'Payment failed',
        body:  `Your ${amount} payment could not be processed. ${opts.reason ?? 'Please try again or contact support.'}`,
        metadata: { amountMinor: opts.amountMinor, reason: opts.reason },
    });
}

export function notifyMeterOrderUpdate(customerId: string, opts: {
    orderId: string; status: string; technicianName?: string | null;
}): Promise<void> {
    const messages: Record<string, string> = {
        assigned:   `A technician${opts.technicianName ? ` (${opts.technicianName})` : ''} has been assigned to your meter order.`,
        dispatched: `Your technician is en route. Please ensure access to the installation site.`,
        installed:  `Your meter has been installed. Welcome to Beverly!`,
        cancelled:  `Your meter order has been cancelled. Contact support if this is unexpected.`,
    };
    return sendNotification(customerId, {
        type:  'meter_order_update',
        title: 'Meter order update',
        body:  messages[opts.status] ?? `Your meter order status has changed to ${opts.status}.`,
        metadata: { orderId: opts.orderId, status: opts.status },
    });
}
