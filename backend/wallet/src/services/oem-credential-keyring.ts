import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { decryptSecret } from './oem-registry.js';

export type CredentialKeyEnvironment = Readonly<{ OEM_INSTALLATION_ENCRYPTION_KEYS?: string }>;

/** Sanitized failures never include key material or decrypted payloads. */
export class CredentialKeyringError extends Error {
    constructor(public readonly code: 'OEM_CREDENTIALS_INVALID' | 'OEM_CREDENTIALS_UNSUPPORTED', message: string) {
        super(message);
        this.name = 'CredentialKeyringError';
    }
}

function context(installationId: string, version: number): Buffer {
    if (!installationId || !Number.isSafeInteger(version) || version < 2) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Installation encryption context is invalid');
    }
    return Buffer.from(JSON.stringify(['beverly-installation-credentials', installationId, version]), 'utf8');
}

function resolveKey(version: number, environment: CredentialKeyEnvironment): Buffer {
    let keys: unknown;
    try {
        keys = JSON.parse(environment.OEM_INSTALLATION_ENCRYPTION_KEYS ?? '{}');
    } catch {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Installation encryption keyring is malformed');
    }
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Installation encryption keyring is malformed');
    }
    const encoded = (keys as Record<string, unknown>)[String(version)];
    if (encoded === undefined) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_UNSUPPORTED', 'Installation encryption key version is unavailable');
    }
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Installation encryption key must be 32-byte base64');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Installation encryption key must be 32-byte base64');
    }
    return key;
}

/** New envelopes bind ciphertext to its installation and encryption version. */
export function encryptInstallationBundle(
    plaintext: string, installationId: string, version: number,
    environment: CredentialKeyEnvironment = process.env,
): string {
    const aad = context(installationId, version);
    const key = resolveKey(version, environment);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Read existing legacy envelopes or authenticated versioned envelopes. */
export function decryptInstallationBundle(
    encoded: string, installationId: string, version: number,
    environment: CredentialKeyEnvironment = process.env,
): string {
    if (version === 1) {
        const plaintext = decryptSecret(encoded);
        if (!plaintext) throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Credential bundle cannot be decrypted');
        return plaintext;
    }
    const aad = context(installationId, version);
    const key = resolveKey(version, environment);
    try {
        const envelope = Buffer.from(encoded, 'base64');
        if (envelope.length < 28 || envelope.toString('base64') !== encoded) throw new Error('invalid envelope');
        const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(0, 12));
        decipher.setAAD(aad);
        decipher.setAuthTag(envelope.subarray(12, 28));
        return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Credential bundle authentication failed');
    }
}

/** Prepare a rotation; persistence must compare the old envelope/version atomically. */
export function rotateInstallationBundle(
    encoded: string, installationId: string, fromVersion: number, toVersion: number,
    environment: CredentialKeyEnvironment = process.env,
): string {
    if (!Number.isSafeInteger(toVersion) || toVersion <= fromVersion || toVersion < 2) {
        throw new CredentialKeyringError('OEM_CREDENTIALS_INVALID', 'Credential rotation must advance the key version');
    }
    const plaintext = decryptInstallationBundle(encoded, installationId, fromVersion, environment);
    return encryptInstallationBundle(plaintext, installationId, toVersion, environment);
}
