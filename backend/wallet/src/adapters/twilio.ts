/**
 * Twilio SMS adapter.
 * Single function: sendSms({ to, body, idempotencyKey }).
 * Returns provider message SID + status.
 */
import twilio from 'twilio';
import { env } from '../config/env.js';

let client: ReturnType<typeof twilio> | null = null;
const TWILIO_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${TWILIO_TIMEOUT_MS}ms`)), TWILIO_TIMEOUT_MS);
    });
    try {
        return await Promise.race([promise, guard]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function getClient() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw new Error('Twilio credentials not configured');
    }
    if (!client) {
        client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
    return client;
}

export interface SendSmsOpts {
    to: string;
    body: string;
    idempotencyKey?: string;
    from?: string;
    messagingServiceSid?: string;
}

export interface SmsResult {
    sid: string;
    status: string;
}

export interface VerifyResult {
    sid: string;
    status: string;
    valid: boolean;
    channel?: string;
}

export async function sendSms(opts: SendSmsOpts): Promise<SmsResult> {
    const messagingServiceSid = opts.messagingServiceSid ?? env.TWILIO_MESSAGING_SERVICE_SID;
    const from = opts.from ?? env.TWILIO_FROM_NUMBER;
    if (!from && !messagingServiceSid) {
        throw new Error('SMS sender not configured');
    }
    const c = getClient();
    const msg = await withTimeout(
        c.messages.create({
            ...(from ? { from } : { messagingServiceSid }),
            to: opts.to,
            body: opts.body,
        }),
        'Twilio SMS send',
    );
    return { sid: msg.sid, status: msg.status };
}

export async function sendVerification(to: string, channel: 'sms' | 'call' | 'whatsapp' = 'sms'): Promise<VerifyResult> {
    if (!env.TWILIO_VERIFY_SERVICE_SID) {
        throw new Error('TWILIO_VERIFY_SERVICE_SID not configured');
    }
    const verification = await withTimeout(
        getClient()
            .verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
            .verifications.create({ to, channel }),
        'Twilio Verify send',
    );
    return {
        sid: verification.sid,
        status: verification.status,
        valid: Boolean(verification.valid),
        channel: verification.channel,
    };
}

export async function checkVerification(to: string, code: string): Promise<VerifyResult> {
    if (!env.TWILIO_VERIFY_SERVICE_SID) {
        throw new Error('TWILIO_VERIFY_SERVICE_SID not configured');
    }
    const check = await withTimeout(
        getClient()
            .verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
            .verificationChecks.create({ to, code }),
        'Twilio Verify check',
    );
    return {
        sid: check.sid,
        status: check.status,
        valid: Boolean(check.valid),
        channel: check.channel,
    };
}
