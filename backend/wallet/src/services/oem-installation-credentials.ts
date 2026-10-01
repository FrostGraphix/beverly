import { adminClient } from '../db/supabase.js';
import { CredentialKeyringError, decryptInstallationBundle, rotateInstallationBundle } from './oem-credential-keyring.js';
import type { InstallationCandidate } from './oem-installations.js';

export type InstallationAuthStrategy =
    | 'bearer_static'
    | 'bearer_login'
    | 'api_key_header'
    | 'api_key_pair'
    | 'oauth2_client_credentials';

export interface InstallationCredentialRow {
    oemInstallationId: string;
    authStrategy: InstallationAuthStrategy;
    encryptedSecretBundle: string;
    encryptionKeyVersion: number;
    tokenEndpoint: string | null;
    tokenExpiryPolicy: Readonly<Record<string, unknown>>;
}

export interface InstallationCredentialStore {
    findByInstallationId(installationId: string): Promise<InstallationCredentialRow | null>;
    compareAndSwap?(input: {
        installationId: string;
        expectedEncryptedSecretBundle: string;
        expectedEncryptionKeyVersion: number;
        newEncryptedSecretBundle: string;
        newEncryptionKeyVersion: number;
        updatedBy: string;
    }): Promise<boolean>;
}

export interface ApiKeyInstallationCredentials {
    oemInstallationId: string;
    authStrategy: 'api_key_header';
    apiKey: string;
    headerName: string;
    encryptionKeyVersion: number;
    tokenEndpoint: string | null;
    tokenExpiryPolicy: Readonly<Record<string, unknown>>;
}

export interface ApiKeyPairInstallationCredentials {
    oemInstallationId: string;
    authStrategy: 'api_key_pair';
    apiKey: string;
    apiSecret: string;
    keyHeaderName: 'X-API-KEY';
    secretHeaderName: 'X-API-SECRET';
    encryptionKeyVersion: number;
    tokenEndpoint: string | null;
    tokenExpiryPolicy: Readonly<Record<string, unknown>>;
}

export type InstallationCredentials = ApiKeyInstallationCredentials | ApiKeyPairInstallationCredentials;

export class InstallationCredentialError extends Error {
    constructor(
        public readonly code:
            | 'OEM_CREDENTIALS_MISSING'
            | 'OEM_CREDENTIALS_INVALID'
            | 'OEM_CREDENTIALS_UNSUPPORTED',
        message: string,
    ) {
        super(message);
        this.name = 'InstallationCredentialError';
    }
}

interface CredentialDatabaseRow {
    oem_installation_id: string;
    auth_strategy: InstallationAuthStrategy;
    encrypted_secret_bundle: string;
    encryption_key_version: number;
    token_endpoint: string | null;
    token_expiry_policy: Record<string, unknown> | null;
}

const supabaseCredentialStore: InstallationCredentialStore = {
    async findByInstallationId(installationId): Promise<InstallationCredentialRow | null> {
        const { data, error } = await adminClient
            .from('oem_installation_credentials')
            .select('oem_installation_id, auth_strategy, encrypted_secret_bundle, encryption_key_version, token_endpoint, token_expiry_policy')
            .eq('oem_installation_id', installationId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const row = data as CredentialDatabaseRow;
        return {
            oemInstallationId: row.oem_installation_id,
            authStrategy: row.auth_strategy,
            encryptedSecretBundle: row.encrypted_secret_bundle,
            encryptionKeyVersion: row.encryption_key_version,
            tokenEndpoint: row.token_endpoint,
            tokenExpiryPolicy: row.token_expiry_policy ?? {},
        };
    },
    async compareAndSwap(input): Promise<boolean> {
        const { data, error } = await adminClient.rpc('rotate_oem_installation_credentials', {
            p_oem_installation_id: input.installationId,
            p_expected_encrypted_secret_bundle: input.expectedEncryptedSecretBundle,
            p_expected_encryption_key_version: input.expectedEncryptionKeyVersion,
            p_new_encrypted_secret_bundle: input.newEncryptedSecretBundle,
            p_new_encryption_key_version: input.newEncryptionKeyVersion,
            p_updated_by: input.updatedBy,
        });
        if (error) throw error;
        return data === true;
    },
};

function requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', `${field} is required`);
    }
    return value.trim();
}

function parseSecretBundle(row: InstallationCredentialRow): Record<string, unknown> {
    let plaintext: string;
    try {
        plaintext = decryptInstallationBundle(row.encryptedSecretBundle, row.oemInstallationId, row.encryptionKeyVersion);
    } catch (error) {
        throw new InstallationCredentialError(error instanceof CredentialKeyringError ? error.code : 'OEM_CREDENTIALS_INVALID', 'Credential bundle cannot be decrypted');
    }
    if (!plaintext) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Credential bundle cannot be decrypted');
    }
    try {
        const parsed: unknown = JSON.parse(plaintext);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object');
        return parsed as Record<string, unknown>;
    } catch {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Credential bundle is malformed');
    }
}

/** Load credentials only after installation authorization succeeds. */
export async function loadInstallationCredentials(
    installation: InstallationCandidate,
    store: InstallationCredentialStore = supabaseCredentialStore,
): Promise<InstallationCredentials> {
    if (installation.status !== 'active') {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Installation is not active');
    }
    const row = await store.findByInstallationId(installation.id);
    if (!row) throw new InstallationCredentialError('OEM_CREDENTIALS_MISSING', 'Installation credentials are missing');
    if (row.oemInstallationId !== installation.id) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Credential installation mismatch');
    }
    const bundle = parseSecretBundle(row);
    if (row.authStrategy === 'api_key_pair') {
        return {
            oemInstallationId: row.oemInstallationId,
            authStrategy: row.authStrategy,
            apiKey: requireNonEmptyString(bundle.apiKey, 'apiKey'),
            apiSecret: requireNonEmptyString(bundle.apiSecret, 'apiSecret'),
            keyHeaderName: 'X-API-KEY',
            secretHeaderName: 'X-API-SECRET',
            encryptionKeyVersion: row.encryptionKeyVersion,
            tokenEndpoint: row.tokenEndpoint,
            tokenExpiryPolicy: row.tokenExpiryPolicy,
        };
    }
    if (row.authStrategy !== 'api_key_header') {
        throw new InstallationCredentialError('OEM_CREDENTIALS_UNSUPPORTED', 'Credential strategy is unsupported');
    }
    return {
        oemInstallationId: row.oemInstallationId,
        authStrategy: row.authStrategy,
        apiKey: requireNonEmptyString(bundle.apiKey, 'apiKey'),
        headerName: requireNonEmptyString(bundle.headerName, 'headerName'),
        encryptionKeyVersion: row.encryptionKeyVersion,
        tokenEndpoint: row.tokenEndpoint,
        tokenExpiryPolicy: row.tokenExpiryPolicy,
    };
}

/** Re-encrypt and persist one credential row using atomic compare-and-swap. */
export async function rotateStoredInstallationCredentials(
    installation: InstallationCandidate,
    toVersion: number,
    updatedBy: string,
    store: InstallationCredentialStore = supabaseCredentialStore,
): Promise<number> {
    if (installation.status !== 'active') {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Installation is not active');
    }
    if (!store.compareAndSwap) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_UNSUPPORTED', 'Credential store cannot rotate credentials');
    }
    const row = await store.findByInstallationId(installation.id);
    if (!row) throw new InstallationCredentialError('OEM_CREDENTIALS_MISSING', 'Installation credentials are missing');
    if (row.oemInstallationId !== installation.id) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Credential installation mismatch');
    }
    let encryptedSecretBundle: string;
    try {
        encryptedSecretBundle = rotateInstallationBundle(
            row.encryptedSecretBundle,
            installation.id,
            row.encryptionKeyVersion,
            toVersion,
        );
    } catch (error) {
        throw new InstallationCredentialError(
            error instanceof CredentialKeyringError ? error.code : 'OEM_CREDENTIALS_INVALID',
            'Credential rotation failed',
        );
    }
    const updated = await store.compareAndSwap({
        installationId: installation.id,
        expectedEncryptedSecretBundle: row.encryptedSecretBundle,
        expectedEncryptionKeyVersion: row.encryptionKeyVersion,
        newEncryptedSecretBundle: encryptedSecretBundle,
        newEncryptionKeyVersion: toVersion,
        updatedBy,
    });
    if (!updated) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', 'Credential rotation conflicted');
    }
    return toVersion;
}
