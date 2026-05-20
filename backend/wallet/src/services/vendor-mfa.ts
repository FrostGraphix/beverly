import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { env } from '../config/env.js';
import { logSecurityEvent } from './audit.js';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class VendorMfaError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'VendorMfaError';
    }
}

export interface VendorMfaActor {
    actorId: string;
    userId: string;
    email: string | null;
}

export interface VendorMfaRequestMeta {
    ip?: string | null;
    userAgent?: string | null;
}

function encryptionKey(): Buffer {
    const seed = env.APP_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    return crypto.createHash('sha256').update(seed).digest();
}

function encryptSecret(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(payload: string): string {
    const [ivText, tagText, cipherText] = payload.split('.');
    if (!ivText || !tagText || !cipherText) throw new VendorMfaError('Authenticator secret is unreadable.', 'mfa_secret_invalid');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(cipherText, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}

function base32Encode(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(value: string): Buffer {
    const clean = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0;
    let current = 0;
    const bytes: number[] = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new VendorMfaError('Authenticator secret has invalid characters.', 'mfa_secret_invalid');
        current = (current << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((current >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function normalizeCode(code: string): string {
    return String(code || '').replace(/\D/g, '').slice(0, TOTP_DIGITS);
}

function hotp(secret: string, counter: number): string {
    const key = base32Decode(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | (hmac[offset + 1] << 16)
        | (hmac[offset + 2] << 8)
        | hmac[offset + 3];
    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
    const normalized = normalizeCode(code);
    if (normalized.length !== TOTP_DIGITS) return false;
    const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
    for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift += 1) {
        if (hotp(secret, counter + drift) === normalized) return true;
    }
    return false;
}

function hashValue(value: string): string {
    return crypto.createHash('sha256').update(`${value}:beverly-vendor-mfa`).digest('hex');
}

function sessionHash(accessToken: string): string {
    return hashValue(accessToken);
}

function formatRecoveryCode(value: string): string {
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

function generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode(crypto.randomBytes(6).toString('hex').toUpperCase()));
}

function recoveryHash(code: string): string {
    return hashValue(code.replace(/[^a-z0-9]/gi, '').toUpperCase());
}

function otpauthUri(secret: string, actor: VendorMfaActor): string {
    const label = encodeURIComponent(`Beverly Vendor:${actor.email || actor.actorId}`);
    const issuer = encodeURIComponent('Beverly Vendor');
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

async function activeFactor(vendorUserId: string) {
    const { data } = await adminClient
        .from('vendor_mfa_factors')
        .select('*')
        .eq('vendor_user_id', vendorUserId)
        .eq('status', 'active')
        .maybeSingle();
    return data as any | null;
}

async function pendingFactor(vendorUserId: string) {
    const { data } = await adminClient
        .from('vendor_mfa_factors')
        .select('*')
        .eq('vendor_user_id', vendorUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data as any | null;
}

export async function vendorMfaSessionVerified(userId: string, accessToken: string): Promise<boolean> {
    const { data } = await adminClient
        .from('vendor_mfa_sessions')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('token_hash', sessionHash(accessToken))
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
    return Boolean(data);
}

export async function vendorMfaStatus(vendorUserId: string, userId: string, accessToken?: string) {
    const factor = await activeFactor(vendorUserId);
    const recovery = factor
        ? await adminClient
            .from('vendor_mfa_recovery_codes')
            .select('id', { count: 'exact', head: true })
            .eq('vendor_user_id', vendorUserId)
            .is('used_at', null)
        : { count: 0 };
    return {
        enrolled: Boolean(factor),
        verified: accessToken ? await vendorMfaSessionVerified(userId, accessToken) : false,
        method: factor ? 'authenticator_app' : null,
        recovery_codes_remaining: recovery.count ?? 0,
        last_verified_at: factor?.last_verified_at ?? null,
        enrolled_at: factor?.verified_at ?? null,
    };
}

async function createPendingEnrollment(actor: VendorMfaActor) {
    await adminClient
        .from('vendor_mfa_factors')
        .update({ status: 'replaced' })
        .eq('vendor_user_id', actor.actorId)
        .eq('status', 'pending');

    const secret = base32Encode(crypto.randomBytes(20));
    const { data, error } = await adminClient
        .from('vendor_mfa_factors')
        .insert({
            vendor_user_id: actor.actorId,
            auth_user_id: actor.userId,
            factor_type: 'totp',
            status: 'pending',
            secret_ciphertext: encryptSecret(secret),
        })
        .select('id')
        .single();
    if (error || !data) throw new VendorMfaError('Could not start 2FA setup.', 'mfa_setup_failed');

    return {
        factor_id: (data as any).id,
        secret,
        otpauth_uri: otpauthUri(secret, actor),
        issuer: 'Beverly Vendor',
        account_label: actor.email || actor.actorId,
        digits: TOTP_DIGITS,
        period_seconds: TOTP_STEP_SECONDS,
    };
}

async function verifyActiveMfaCode(actor: VendorMfaActor, code: string, reason: string, meta: VendorMfaRequestMeta = {}) {
    const factor = await activeFactor(actor.actorId);
    if (!factor) throw new VendorMfaError('Two-factor authentication is not enabled.', 'mfa_not_enabled');
    const secret = decryptSecret(factor.secret_ciphertext);
    const isTotp = verifyTotp(secret, code);
    const isRecovery = isTotp ? false : await consumeRecoveryCode(actor, code);
    if (!isTotp && !isRecovery) {
        await logSecurityEvent('mfa_failure', {
            actorUserId: actor.userId,
            severity: 'high',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { reason },
        });
        throw new VendorMfaError('Enter a valid security code.', 'invalid_otp');
    }
    return { factor, recoveryCodeUsed: isRecovery };
}

export async function beginVendorMfaEnrollment(actor: VendorMfaActor) {
    const existing = await activeFactor(actor.actorId);
    if (existing) throw new VendorMfaError('Two-factor authentication is already enabled.', 'mfa_already_enabled');
    return createPendingEnrollment(actor);
}

export async function beginVendorMfaReplacement(actor: VendorMfaActor, code: string, meta: VendorMfaRequestMeta = {}) {
    await verifyActiveMfaCode(actor, code, 'invalid_replacement_code', meta);
    return createPendingEnrollment(actor);
}

async function createVerifiedSession(actor: VendorMfaActor, accessToken: string): Promise<string> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await adminClient.from('vendor_mfa_sessions').upsert({
        auth_user_id: actor.userId,
        vendor_user_id: actor.actorId,
        token_hash: sessionHash(accessToken),
        expires_at: expiresAt,
        verified_at: new Date().toISOString(),
    }, { onConflict: 'token_hash' });
    return expiresAt;
}

export async function verifyVendorMfaEnrollment(actor: VendorMfaActor, accessToken: string, code: string, meta: VendorMfaRequestMeta = {}) {
    const factor = await pendingFactor(actor.actorId);
    if (!factor) throw new VendorMfaError('Start 2FA setup before verifying.', 'mfa_setup_not_started');
    const secret = decryptSecret(factor.secret_ciphertext);
    if (!verifyTotp(secret, code)) {
        await logSecurityEvent('mfa_failure', {
            actorUserId: actor.userId,
            severity: 'medium',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { reason: 'invalid_enrollment_code' },
        });
        throw new VendorMfaError('That authenticator code is not correct.', 'invalid_otp');
    }

    await adminClient.from('vendor_mfa_factors').update({
        status: 'replaced',
    }).eq('vendor_user_id', actor.actorId).eq('status', 'active');

    await adminClient.from('vendor_mfa_factors').update({
        status: 'active',
        verified_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
    }).eq('id', factor.id);

    await adminClient.from('vendor_users').update({ mfa_enrolled: true }).eq('id', actor.actorId);
    await adminClient.from('vendor_mfa_recovery_codes').delete().eq('vendor_user_id', actor.actorId);

    const recoveryCodes = generateRecoveryCodes();
    await adminClient.from('vendor_mfa_recovery_codes').insert(recoveryCodes.map((recoveryCode) => ({
        vendor_user_id: actor.actorId,
        auth_user_id: actor.userId,
        code_hash: recoveryHash(recoveryCode),
    })));
    const session_expires_at = await createVerifiedSession(actor, accessToken);

    await logSecurityEvent('mfa_enabled', {
        actorUserId: actor.userId,
        severity: 'info',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { method: 'authenticator_app' },
    });

    return { ok: true, recovery_codes: recoveryCodes, session_expires_at };
}

async function consumeRecoveryCode(actor: VendorMfaActor, code: string): Promise<boolean> {
    const { data } = await adminClient
        .from('vendor_mfa_recovery_codes')
        .select('id, code_hash')
        .eq('vendor_user_id', actor.actorId)
        .is('used_at', null);
    const match = (data || []).find((row: any) => row.code_hash === recoveryHash(code));
    if (!match) return false;
    await adminClient
        .from('vendor_mfa_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', (match as any).id);
    return true;
}

export async function verifyVendorMfaChallenge(actor: VendorMfaActor, accessToken: string, code: string, meta: VendorMfaRequestMeta = {}) {
    const { factor, recoveryCodeUsed } = await verifyActiveMfaCode(actor, code, 'invalid_login_code', meta);

    await adminClient.from('vendor_mfa_factors')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('id', factor.id);
    const session_expires_at = await createVerifiedSession(actor, accessToken);

    return { ok: true, recovery_code_used: recoveryCodeUsed, session_expires_at };
}

export async function disableVendorMfa(actor: VendorMfaActor, code: string, meta: VendorMfaRequestMeta = {}) {
    await verifyActiveMfaCode(actor, code, 'invalid_disable_code', meta);

    await adminClient.from('vendor_mfa_factors')
        .update({ status: 'disabled', disabled_at: new Date().toISOString() })
        .eq('vendor_user_id', actor.actorId)
        .eq('status', 'active');
    await adminClient.from('vendor_mfa_recovery_codes').delete().eq('vendor_user_id', actor.actorId);
    await adminClient.from('vendor_mfa_sessions').delete().eq('auth_user_id', actor.userId);
    await adminClient.from('vendor_users').update({ mfa_enrolled: false }).eq('id', actor.actorId);

    await logSecurityEvent('mfa_disabled', {
        actorUserId: actor.userId,
        severity: 'high',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { method: 'authenticator_app' },
    });

    return { ok: true };
}
