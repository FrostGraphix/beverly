/**
 * Unified notification service.
 *
 * sendNotification() fires all enabled channels for a customer event:
 *   • in-app  — always written (inbox row) when in_app pref is on
 *   • SMS     — sent via Twilio when sms pref is on and flag is live
 *   • email   — sent via Resend when email pref is on and flag is live
 *
 * All channels are best-effort: failures are logged but never thrown.
 */
import { adminClient } from '../db/supabase.js';
import { sendSms }   from '../adapters/twilio.js';
import { sendEmail } from '../adapters/resend.js';
import {
    walletFundedEmail, paymentFailedEmail, kycUpdateEmail,
    disputeUpdateEmail, meterOrderUpdateEmail, genericEmail,
    type EmailContent,
} from '../emails/templates.js';
import { logAction } from './audit.js';
import { isFlagEnabled } from './feature-flags.js';
import { env }       from '../config/env.js';
import { notificationsQueue } from '../queue/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
    | 'token_purchased'
    | 'wallet_funded'
    | 'kyc_update'
    | 'dispute_update'
    | 'admin_announcement'
    | 'low_balance'
    | 'payment_failed'
    | 'meter_order_update'
    | 'meter_link_update';

export interface NotificationPayload {
    type: NotificationType;
    title: string;
    body: string;
    /** Optional email subject — falls back to title */
    subject?: string;
    /** Structured data attached to in-app notification for deep-linking */
    metadata?: Record<string, unknown>;
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
}

// ── Default preferences (mirrors backend get endpoint defaults) ────────────────

const PREF_DEFAULTS: Required<PreferencesShape> = {
    // token_purchased SMS is false here because the dedicated token-SMS system
    // (sendTokenSmsToCustomer) already delivers the actual token code via SMS.
    // The notification service handles in-app + email for this event.
    sms:    { token_purchased: false, wallet_funded: true,  login_otp: true, admin_announcement: false },
    email:  { token_purchased: false, wallet_funded: true,  promotions: false, admin_announcement: false, kyc_update: true, dispute_update: true, payment_failed: true, meter_order_update: true, meter_link_update: true },
    in_app: { token_purchased: true,  wallet_funded: true,  kyc_update: true, dispute_update: true, low_balance: true, payment_failed: true, meter_order_update: true, meter_link_update: true, admin_announcement: true },
};

export interface NotificationJobData {
    notificationId?: string;
    customerId: string;
    type?: NotificationType;
    title?: string;
    body?: string;
    subject?: string;
    metadata?: Record<string, unknown>;
    channels?: { sms?: boolean; email?: boolean; pushTokens?: string[] };
    phone?: string;
    email?: string;
    firstName?: string;
    pushTokens?: string[];
    payload?: NotificationPayload;
    inAppWritten?: boolean;
}

export function isSmsEnabled(prefs: PreferencesShape | null, type: NotificationType): boolean {
    return prefEnabled(prefs, 'sms', type);
}

export function isEmailEnabled(prefs: PreferencesShape | null, type: NotificationType): boolean {
    return prefEnabled(prefs, 'email', type);
}

function prefEnabled(prefs: PreferencesShape | null, channel: 'sms' | 'email' | 'in_app', type: NotificationType): boolean {
    const channelPrefs = prefs?.[channel] ?? PREF_DEFAULTS[channel];
    const key = type as string;
    return channelPrefs[key] ?? (PREF_DEFAULTS[channel] as Record<string, boolean>)[key] ?? false;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function sendNotification(
    customerId: string,
    payload: NotificationPayload,
): Promise<void> {
    // Inbox parity is synchronous: once the business action completes, the
    // customer's in-app notification no longer depends on a running worker.
    await writeInAppForCustomer(customerId, payload);
    try {
        await notificationsQueue.add('deliver', { customerId, payload, inAppWritten: true }, {
            jobId: `notification:${customerId}:${payload.type}:${Date.now()}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 500,
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') throw error;
        await deliverNotification(customerId, payload, { includeInApp: false });
    }
}

export async function deliverNotification(
    customerId: string,
    payload: NotificationPayload,
    options: { includeInApp?: boolean } = {},
): Promise<void> {
    // Fetch customer in one query
    const { data: customer } = await adminClient
        .from('customers')
        .select('id, phone, email, full_name, notification_preferences')
        .eq('id', customerId)
        .maybeSingle();

    if (!customer) return; // customer not found — silently skip

    const cu = customer as CustomerRow;
    const prefs = cu.notification_preferences as PreferencesShape | null;

    await Promise.allSettled([
        ...(options.includeInApp === false ? [] : [writeInApp(cu, payload, prefs)]),
        sendSmsNotification(cu, payload, prefs),
        sendEmailNotification(cu, payload, prefs),
    ]);
}

async function writeInAppForCustomer(customerId: string, payload: NotificationPayload): Promise<void> {
    const { data: customer } = await adminClient
        .from('customers')
        .select('id, phone, email, full_name, notification_preferences')
        .eq('id', customerId)
        .maybeSingle();
    if (!customer) return;
    const cu = customer as CustomerRow;
    await writeInApp(cu, payload, cu.notification_preferences as PreferencesShape | null);
}

// ── In-app inbox ──────────────────────────────────────────────────────────────

async function writeInApp(cu: CustomerRow, payload: NotificationPayload, prefs: PreferencesShape | null): Promise<void> {
    // Ownership decisions change access and are always recorded in the inbox.
    if (payload.type !== 'meter_link_update' && !prefEnabled(prefs, 'in_app', payload.type)) return;
    try {
        await adminClient.from('notifications').insert({
            customer_id: cu.id,
            recipient_type: 'customer',
            recipient_id: cu.id,
            type:        payload.type,
            title:       payload.title,
            body:        payload.body,
            metadata:    payload.metadata ?? {},
            read:        false,
        });
    } catch (err) {
        console.error('[notifications] in-app write failed:', err);
    }
}

// ── SMS ───────────────────────────────────────────────────────────────────────

async function sendSmsNotification(cu: CustomerRow, payload: NotificationPayload, prefs: PreferencesShape | null): Promise<void> {
    if (!prefEnabled(prefs, 'sms', payload.type)) return;
    if (!cu.phone) return;

    // Gate behind feature flag
    let flagOn = false;
    try { flagOn = await isFlagEnabled('notifications.sms'); } catch { /* flag missing = disabled */ }
    if (!flagOn) return;

    try {
        const msg = await sendSms({
            to:   cu.phone,
            body: `Beverly: ${payload.body}`,
            from: env.TWILIO_FROM_NUMBER,
        });
        await logAction({
            actorUserId: cu.id,
            actorType:   'system',
            action:      `notification.sms.sent`,
            targetType:  'customer',
            targetId:    cu.id,
            after:       { type: payload.type, sid: msg.sid, status: msg.status },
        }).catch(() => undefined);
    } catch (err) {
        console.error('[notifications] SMS send failed:', err);
    }
}

// ── Email ─────────────────────────────────────────────────────────────────────

function formatNaira(amountMinor: number): string {
    return `₦${(amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function buildEmailContent(cu: CustomerRow, payload: NotificationPayload): EmailContent {
    const fullName = cu.full_name ?? cu.email ?? 'there';
    const md = payload.metadata ?? {};
    switch (payload.type) {
        case 'wallet_funded':
            return walletFundedEmail({
                fullName,
                amountLabel: formatNaira(Number(md.amountMinor ?? 0)),
                reference: String(md.reference ?? ''),
            });
        case 'payment_failed':
            return paymentFailedEmail({
                fullName,
                amountLabel: formatNaira(Number(md.amountMinor ?? 0)),
                reason: typeof md.reason === 'string' ? md.reason : undefined,
            });
        case 'kyc_update': {
            const tier = Number(md.tier ?? 0);
            return kycUpdateEmail({ fullName, tierLabel: tier === 1 ? 'Tier 1 (₦50k/day)' : 'Tier 2 (₦200k/day)' });
        }
        case 'dispute_update':
            return disputeUpdateEmail({ fullName, message: payload.body });
        case 'meter_order_update':
            return meterOrderUpdateEmail({ fullName, message: payload.body });
        default:
            return genericEmail({ fullName, title: payload.subject ?? payload.title, body: payload.body });
    }
}

async function sendEmailNotification(cu: CustomerRow, payload: NotificationPayload, prefs: PreferencesShape | null): Promise<void> {
    if (!prefEnabled(prefs, 'email', payload.type)) return;
    if (!cu.email) return;

    // Gate behind feature flag
    let flagOn = false;
    try { flagOn = await isFlagEnabled('notifications.email'); } catch { /* flag missing = disabled */ }
    if (!flagOn) return;

    try {
        const content = buildEmailContent(cu, payload);
        await sendEmail({
            to:      cu.email,
            subject: content.subject,
            html:    content.html,
            text:    content.text,
            tag:     payload.type,
        });
        await logAction({
            actorUserId: cu.id,
            actorType:   'system',
            action:      `notification.email.sent`,
            targetType:  'customer',
            targetId:    cu.id,
            after:       { type: payload.type },
        }).catch(() => undefined);
    } catch (err) {
        console.error('[notifications] email send failed:', err);
    }
}

// ── Convenience helpers (pre-composed for each event type) ────────────────────

export function notifyTokenPurchased(customerId: string, opts: {
    meterId: string; units?: number | null; amountMinor: number; token: string;
}): Promise<void> {
    const units = opts.units ? ` · ${opts.units.toFixed(4)} kWh` : '';
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

export function notifyKycUpdate(customerId: string, opts: {
    tier: number;
}): Promise<void> {
    const tierLabel = opts.tier === 1 ? 'Tier 1 (₦50k/day)' : 'Tier 2 (₦200k/day)';
    return sendNotification(customerId, {
        type:  'kyc_update',
        title: 'KYC verified',
        body:  `Your identity has been verified to ${tierLabel}. You can now buy tokens and fund your wallet.`,
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

export function notifyMeterLinkUpdate(customerId: string, opts: {
    meterId: string;
    status: 'approved' | 'rejected' | 'unlinked';
    reason?: string;
}): Promise<void> {
    const approved = opts.status === 'approved';
    const unlinked = opts.status === 'unlinked';
    return sendNotification(customerId, {
        type: 'meter_link_update',
        title: approved ? 'Meter approved' : unlinked ? 'Meter unlinked' : 'Meter link rejected',
        body: approved
            ? `Meter ${opts.meterId} is approved. You can now use it for token purchases.`
            : unlinked
                ? `Meter ${opts.meterId} was unlinked from your wallet. ${opts.reason ?? 'Contact support if you need help.'}`
                : `Meter ${opts.meterId} was not approved. ${opts.reason ?? 'Contact support if you need help.'}`,
        metadata: { meterId: opts.meterId, status: opts.status, reason: opts.reason ?? null, path: '/meters#link-history' },
    });
}
