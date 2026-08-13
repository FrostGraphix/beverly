import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';

export class CustomerVendPinError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'CustomerVendPinError';
    }
}

const PIN_RE = /^\d{4}$/;
const WEAK_PINS = new Set(['0000', '1111', '1234', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']);
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function validateCustomerVendPin(pin: string) {
    if (!PIN_RE.test(pin)) {
        throw new CustomerVendPinError('Use exactly four digits.', 'invalid_vend_pin');
    }
    if (WEAK_PINS.has(pin)) {
        throw new CustomerVendPinError('Choose a less predictable PIN.', 'weak_vend_pin');
    }
}

function hashPin(pin: string, salt: string) {
    return crypto.scryptSync(pin, salt, 64).toString('base64url');
}

function safeEqual(leftValue: string, rightValue: string) {
    const left = Buffer.from(leftValue);
    const right = Buffer.from(rightValue);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hasCustomerVendPin(row: Record<string, unknown> | null | undefined) {
    return Boolean(row?.vend_pin_hash && row?.vend_pin_salt && row?.vend_pin_set_at);
}

export async function customerVendPinStatus(customerId: string) {
    const { data, error } = await adminClient
        .from('customers')
        .select('vend_pin_hash, vend_pin_salt, vend_pin_set_at')
        .eq('id', customerId)
        .maybeSingle();
    if (error) throw new CustomerVendPinError(error.message, 'vend_pin_status_failed');
    return {
        configured: hasCustomerVendPin(data as Record<string, unknown> | null),
        set_at: (data as { vend_pin_set_at?: string | null } | null)?.vend_pin_set_at ?? null,
    };
}

export async function setCustomerVendPin(input: {
    customerId: string;
    authUserId: string;
    pin: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    validateCustomerVendPin(input.pin);
    const salt = crypto.randomBytes(24).toString('base64url');
    const setAt = new Date().toISOString();
    const { data, error } = await adminClient
        .from('customers')
        .update({
            vend_pin_hash: hashPin(input.pin, salt),
            vend_pin_salt: salt,
            vend_pin_set_at: setAt,
            vend_pin_failed_attempts: 0,
            vend_pin_locked_until: null,
        })
        .eq('id', input.customerId)
        .select('id')
        .maybeSingle();
    if (error) throw new CustomerVendPinError(error.message, 'vend_pin_update_failed');
    if (!data) throw new CustomerVendPinError('Customer account was not found.', 'customer_not_found');
    await logSecurityEvent('vend_pin_set', {
        actorUserId: input.authUserId,
        severity: 'info',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { actorType: 'customer' },
    });
    return { ok: true, configured: true, set_at: setAt };
}

export async function verifyCustomerVendPin(input: {
    customerId: string;
    authUserId: string;
    pin: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    if (!PIN_RE.test(input.pin)) {
        throw new CustomerVendPinError('Invalid vending PIN.', 'invalid_vend_pin');
    }
    const { data, error } = await adminClient
        .from('customers')
        .select('vend_pin_hash, vend_pin_salt, vend_pin_set_at, vend_pin_failed_attempts, vend_pin_locked_until')
        .eq('id', input.customerId)
        .maybeSingle();
    if (error) throw new CustomerVendPinError(error.message, 'vend_pin_status_failed');
    if (!hasCustomerVendPin(data as Record<string, unknown> | null)) {
        throw new CustomerVendPinError('Create your vending PIN first.', 'vend_pin_required');
    }
    const row = data as {
        vend_pin_hash: string;
        vend_pin_salt: string;
        vend_pin_failed_attempts?: number;
        vend_pin_locked_until?: string | null;
    };
    if (row.vend_pin_locked_until && new Date(row.vend_pin_locked_until).getTime() > Date.now()) {
        throw new CustomerVendPinError('Too many attempts. Try again later.', 'vend_pin_locked');
    }
    if (!safeEqual(hashPin(input.pin, row.vend_pin_salt), row.vend_pin_hash)) {
        const attempts = Number(row.vend_pin_failed_attempts ?? 0) + 1;
        const lockedUntil = attempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : null;
        await adminClient.from('customers').update({
            vend_pin_failed_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
            vend_pin_locked_until: lockedUntil,
        }).eq('id', input.customerId);
        await logSecurityEvent('vend_pin_failure', {
            actorUserId: input.authUserId,
            severity: 'high',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { actorType: 'customer' },
        });
        throw new CustomerVendPinError('Invalid vending PIN.', 'invalid_vend_pin');
    }
    if (row.vend_pin_failed_attempts || row.vend_pin_locked_until) {
        await adminClient.from('customers').update({
            vend_pin_failed_attempts: 0,
            vend_pin_locked_until: null,
        }).eq('id', input.customerId);
    }
    return { ok: true };
}
