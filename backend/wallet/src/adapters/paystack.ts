/**
 * Paystack adapter — minimal Phase 1 surface.
 *
 * Provides:
 *   • initializeTransaction      — creates a Paystack init for redirect/inline
 *   • verifyTransaction          — server-side verification by reference
 *   • verifyWebhookSignature     — HMAC-SHA512 signature check
 *   • verifyIdentity             — Paystack Identity API (NIN, BVN)
 *
 * Never trust gateway-supplied success in webhook without verify-API double-check.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const BASE = 'https://api.paystack.co';

interface PaystackOk<T> { status: true; message: string; data: T; }
interface PaystackErr { status: false; message: string; }
type PaystackResp<T> = PaystackOk<T> | PaystackErr;

async function call<T>(path: string, init: RequestInit): Promise<T> {
    if (!env.PAYSTACK_SECRET_KEY) {
        throw new Error('PAYSTACK_SECRET_KEY not configured');
    }
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });
    const json = (await res.json()) as PaystackResp<T>;
    if (!json.status) {
        throw new Error(`paystack: ${json.message}`);
    }
    return json.data;
}

export interface InitOptions {
    email: string;
    amountMinor: number;            // kobo
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
    channels?: ('card' | 'bank' | 'ussd' | 'qr' | 'mobile_money' | 'bank_transfer')[];
}

export interface InitResult {
    authorization_url: string;
    access_code: string;
    reference: string;
}

export async function initializeTransaction(opts: InitOptions): Promise<InitResult> {
    return call<InitResult>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
            email: opts.email,
            amount: opts.amountMinor,
            reference: opts.reference,
            callback_url: opts.callbackUrl,
            metadata: opts.metadata,
            channels: opts.channels,
        }),
    });
}

export interface VerifyResult {
    status: 'success' | 'failed' | 'abandoned' | 'pending';
    reference: string;
    amount: number;        // kobo
    currency: string;
    paid_at: string | null;
    channel: string;
    customer: { email: string; customer_code: string };
    authorization?: {
        authorization_code: string;
        last4: string;
        card_type: string;
        bank: string;
        exp_month: string;
        exp_year: string;
        brand: string;
    };
    metadata?: Record<string, unknown>;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
    return call<VerifyResult>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
}

export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature || !env.PAYSTACK_WEBHOOK_SECRET) return false;
    const computed = crypto
        .createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
        .update(typeof rawBody === 'string' ? rawBody : rawBody)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// ── Identity API ──
export interface NinResult { first_name: string; last_name: string; phone: string; gender: string; date_of_birth: string; }
export async function resolveNin(nin: string): Promise<NinResult> {
    return call<NinResult>(`/identity/verify_nin?nin=${encodeURIComponent(nin)}`, { method: 'GET' });
}

export interface BvnResult { first_name: string; last_name: string; date_of_birth: string; phone: string; }
export async function resolveBvn(bvn: string): Promise<BvnResult> {
    return call<BvnResult>(`/identity/bvn/match`, {
        method: 'POST',
        body: JSON.stringify({ bvn }),
    });
}
