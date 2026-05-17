/**
 * Twilio SMS adapter.
 * Single function: sendSms({ to, body, idempotencyKey }).
 * Returns provider message SID + status.
 */
import twilio from 'twilio';
import { env } from '../config/env.js';

let client: ReturnType<typeof twilio> | null = null;

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
}

export interface SmsResult {
    sid: string;
    status: string;
}

export async function sendSms(opts: SendSmsOpts): Promise<SmsResult> {
    if (!env.TWILIO_FROM_NUMBER) {
        throw new Error('TWILIO_FROM_NUMBER not configured');
    }
    const c = getClient();
    const msg = await c.messages.create({
        from: env.TWILIO_FROM_NUMBER,
        to: opts.to,
        body: opts.body,
    });
    return { sid: msg.sid, status: msg.status };
}
