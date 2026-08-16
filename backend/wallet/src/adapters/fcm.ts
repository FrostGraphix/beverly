/**
 * Firebase Cloud Messaging (FCM) adapter — Legacy HTTP API.
 *
 * Sends push notifications to a single device token.
 * Requires FCM_SERVER_KEY env var (Firebase Console → Project Settings → Cloud Messaging).
 *
 * Errors:
 *   • FcmError('not_configured') — FCM_SERVER_KEY missing
 *   • FcmError('invalid_token')  — FCM rejected the device token (stale/revoked)
 *   • FcmError('send_failed')    — unexpected FCM error
 */
import { env } from '../config/env.js';

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const FCM_TIMEOUT_MS = 10_000;

export class FcmError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'FcmError';
    }
}

export interface PushPayload {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    /** iOS badge count */
    badge?: number;
}

export interface PushResult {
    messageId: string;
}

/** Canonical FCM result errors that mean the token is permanently invalid */
const STALE_TOKEN_ERRORS = new Set([
    'NotRegistered',
    'InvalidRegistration',
    'MismatchSenderId',
    'InvalidApnsCredential',
]);

export async function sendPush(payload: PushPayload): Promise<PushResult> {
    if (!env.FCM_SERVER_KEY) {
        throw new FcmError('FCM_SERVER_KEY not configured', 'not_configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(FCM_ENDPOINT, {
            method:  'POST',
            signal:  controller.signal,
            headers: {
                'Authorization': `key=${env.FCM_SERVER_KEY}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({
                to:       payload.token,
                priority: 'high',
                notification: {
                    title: payload.title,
                    body:  payload.body,
                    badge: payload.badge,
                },
                data: payload.data ?? {},
            }),
        });
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw new FcmError(`FCM HTTP error ${res.status}`, 'send_failed');
    }

    const json: any = await res.json();

    if (json.failure > 0) {
        const err = json.results?.[0]?.error ?? 'unknown';
        if (STALE_TOKEN_ERRORS.has(err)) {
            throw new FcmError(`Stale push token: ${err}`, 'invalid_token');
        }
        throw new FcmError(`FCM delivery error: ${err}`, 'send_failed');
    }

    const messageId = json.results?.[0]?.message_id ?? json.multicast_id?.toString() ?? 'unknown';
    return { messageId };
}
