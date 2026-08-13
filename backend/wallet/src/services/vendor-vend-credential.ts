import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';

export class VendorVendCredentialError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'VendorVendCredentialError';
    }
}

export type VendorVendCredentialType = 'pin';

const PIN_RE = /^\d{4}$/;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function hasVendorVendCredential(row: any) {
    return Boolean(
        row?.vend_credential_set_at
        && row?.vend_credential_hash
        && row?.vend_credential_salt
        && row?.vend_credential_type === 'pin',
    );
}

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
    if (type !== 'pin' || !PIN_RE.test(value)) {
        throw new VendorVendCredentialError('Use exactly four digits.', 'invalid_vend_pin');
    }
    if (/^(\d)\1+$/.test(value) || value === '1234') {
        throw new VendorVendCredentialError('Choose a less predictable PIN.', 'weak_vend_pin');
    }
}

export async function vendorVendCredentialStatus(vendorUserId: string) {
    const { data, error } = await adminClient
        .from('vendor_users')
        .select('vend_credential_type, vend_credential_hash, vend_credential_salt, vend_credential_set_at')
        .eq('id', vendorUserId)
        .maybeSingle();
    if (error) throw new VendorVendCredentialError(error.message, 'vend_credential_status_failed');
    return {
        configured: hasVendorVendCredential(data),
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
    const { data, error } = await adminClient
        .from('vendor_users')
        .update({
            vend_credential_type: input.type,
            vend_credential_hash: hash,
            vend_credential_salt: salt,
            vend_credential_set_at: setAt,
            vend_credential_failed_attempts: 0,
            vend_credential_locked_until: null,
        })
        .eq('id', input.vendorUserId)
        .select('id')
        .maybeSingle();
    if (error) throw new VendorVendCredentialError(error.message, 'vend_credential_update_failed');
    if (!data) throw new VendorVendCredentialError('Vendor account was not found.', 'vendor_user_not_found');
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
    const { data, error } = await adminClient
        .from('vendor_users')
        .select('vend_credential_hash, vend_credential_salt, vend_credential_type, vend_credential_failed_attempts, vend_credential_locked_until')
        .eq('id', input.vendorUserId)
        .maybeSingle();
    if (error) throw new VendorVendCredentialError(error.message, 'vend_credential_status_failed');
    const row = data as any;
    if (!row?.vend_credential_hash || !row?.vend_credential_salt) {
        throw new VendorVendCredentialError('Create your four-digit vending PIN first.', 'vend_credential_required');
    }
    if (row.vend_credential_locked_until && new Date(row.vend_credential_locked_until).getTime() > Date.now()) {
        throw new VendorVendCredentialError('Too many attempts. Try again later.', 'vend_credential_locked');
    }
    const candidate = hashCredential(input.credential, row.vend_credential_salt);
    if (!safeEqual(candidate, row.vend_credential_hash)) {
        const attempts = Number(row.vend_credential_failed_attempts ?? 0) + 1;
        const lockedUntil = attempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : null;
        await adminClient.from('vendor_users').update({
            vend_credential_failed_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
            vend_credential_locked_until: lockedUntil,
        }).eq('id', input.vendorUserId);
        await logSecurityEvent('vend_credential_failure', {
            actorUserId: input.authUserId,
            severity: 'high',
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: { type: row.vend_credential_type },
        });
        throw new VendorVendCredentialError('Invalid vendor authorization.', 'invalid_vend_credential');
    }
    if (row.vend_credential_failed_attempts || row.vend_credential_locked_until) {
        await adminClient.from('vendor_users').update({
            vend_credential_failed_attempts: 0,
            vend_credential_locked_until: null,
        }).eq('id', input.vendorUserId);
    }
    return { ok: true };
}
