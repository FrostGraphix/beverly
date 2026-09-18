import { adminClient } from '../db/supabase.js';
import { decryptSecret } from './oem-registry.js';
import type { InstallationCandidate } from './oem-installations.js';

export type InstallationAuthStrategy =
    | 'bearer_static'
    | 'bearer_login'
    | 'api_key_header'
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

export type InstallationCredentials = ApiKeyInstallationCredentials;

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
};

function requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new InstallationCredentialError('OEM_CREDENTIALS_INVALID', `${field} is required`);
    }
    return value.trim();
}

function parseSecretBundle(encryptedSecretBundle: string): Record<string, unknown> {
    const plaintext = decryptSecret(encryptedSecretBundle);
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
    if (row.authStrategy !== 'api_key_header') {
        throw new InstallationCredentialError('OEM_CREDENTIALS_UNSUPPORTED', 'Credential strategy is unsupported');
    }
    const bundle = parseSecretBundle(row.encryptedSecretBundle);
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
