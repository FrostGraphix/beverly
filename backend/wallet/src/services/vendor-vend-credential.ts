import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';

export class VendorVendCredentialError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'VendorVendCredentialError';
    }
}

export type VendorVendCredentialType = 'pin' | 'password';

const PIN_RE = /^\d{4,6}$/;

function hashCredential(value: string, salt: string) {
    return crypto.scryptSync(value, salt, 64).toString('base64url');
}

function safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

export function validateVendCredential(type: VendorVendCredentialType, value: string) {
    if (type === 'pin') {
        if (!PIN_RE.test(value)) {
            throw new VendorVendCredentialError('Use a 4 to 6 digit PIN.', 'invalid_vend_pin');
        }
        if (/^(\d)\1+$/.test(value) || ['1234', '12345', '123456', '0000'].includes(value)) {
            throw new VendorVendCredentialError('Choose a less predictable PIN.', 'weak_vend_pin');
        }
        return;
    }
    if (value.length < 10 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        throw new VendorVendCredentialError('Use at least 10 characters with letters and numbers.', 'weak_vend_password');
    }
}

export async function vendorVendCredentialStatus(vendorUserId: string) {
    const { data } = await adminClient
        .from('vendor_users')
        .select('vend_credential_type, vend_credential_set_at')
        .eq('id', vendorUserId)
        .maybeSingle();
    return {
        configured: Boolean((data as any)?.vend_credential_set_at),
        type: (data as any)?.vend_credential_type ?? null,
        set_at: (data as any)?.vend_credential_set_at ?? null,
    };
}

export async function setVendorVendCredential(input: {
    vendorUserId: string;
    authUserId: string;
    type: VendorVendCredentialType;
    credential: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    validateVendCredential(input.type, input.credential);
    const salt = crypto.randomBytes(24).toString('base64url');
    const hash = hashCredential(input.credential, salt);
    const setAt = new Date().toISOString();
    const { error } = await adminClient
        .from('vendor_users')
        .update({
            vend_credential_type: input.type,
            vend_credential_hash: hash,
            vend_credential_salt: salt,
            vend_credential_set_at: setAt,
        })
        .eq('id', input.vendorUserId);
    if (error) throw new VendorVendCredentialError(error.message, 'vend_credential_update_failed');
    await logSecurityEvent('vend_credential_set', {
        actorUserId: input.authUserId,
        severity: 'info',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { type: input.type },
    });
    return { ok: true, configured: true, type: input.type, set_at: setAt };
}

export async function verifyVendorVendCredential(input: {
    vendorUserId: string;
    authUserId: string;
    credential: string;
    ip?: string | null;
    userAgent?: string | null;
}) {
    const { data } = await adminClient
        .from('vendor_users')
        .select('vend_credential_hash, vend_credential_salt, vend_credential_type')
        .eq('id', input.vendorUserId)
        .maybeSingle();
    const row = data as any;
    if (!row?.vend_credential_hash || !row?.vend_credential_salt) {
        throw new VendorVendCredentialError('Create a vendor PIN or password before vending.', 'vend_credential_required');
    }
    const candidate = hashCredential(input.credential, row.vend_credential_salt);
    if (!safeEqual(candidate, row.vend_credential_hash)) {
        await logSecurityEvent('vend_credential_failure', {
            actorUserId: input.authUserId,
            severity: 'high',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { type: row.vend_credential_type },
        });
        throw new VendorVendCredentialError('Invalid vendor authorization.', 'invalid_vend_credential');
    }
    return { ok: true };
}
