/**
 * Shared TOTP / MFA primitives (RFC 6238 / RFC 4226).
 *
 * Pure crypto helpers used by app-level MFA services. Secrets are encrypted
 * with AES-256-GCM before they ever touch the database. Recovery codes are
 * stored only as salted SHA-256 hashes.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class TotpError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'TotpError';
    }
}

function encryptionKey(): Buffer {
    const seed = env.APP_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    return crypto.createHash('sha256').update(seed).digest();
}

export function encryptSecret(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
    const [ivText, tagText, cipherText] = payload.split('.');
    if (!ivText || !tagText || !cipherText) throw new TotpError('Authenticator secret is unreadable.', 'mfa_secret_invalid');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(cipherText, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}

export function base32Encode(bytes: Buffer): string {
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
        if (index === -1) throw new TotpError('Authenticator secret has invalid characters.', 'mfa_secret_invalid');
        current = (current << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((current >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

export function generateSecret(): string {
    return base32Encode(crypto.randomBytes(20));
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

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
    const normalized = normalizeCode(code);
    if (normalized.length !== TOTP_DIGITS) return false;
    const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
    for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift += 1) {
        if (hotp(secret, counter + drift) === normalized) return true;
    }
    return false;
}

export function hashValue(value: string, salt: string): string {
    return crypto.createHash('sha256').update(`${value}:${salt}`).digest('hex');
}

function formatRecoveryCode(value: string): string {
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

export function generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode(crypto.randomBytes(6).toString('hex').toUpperCase()));
}

export function normalizeRecoveryCode(code: string): string {
    return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function otpauthUri(secret: string, opts: { issuer: string; label: string }): string {
    const label = encodeURIComponent(`${opts.issuer}:${opts.label}`);
    const issuer = encodeURIComponent(opts.issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
