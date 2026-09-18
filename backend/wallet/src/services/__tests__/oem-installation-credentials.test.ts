import { describe, expect, it } from 'vitest';
import { encryptSecret } from '../oem-registry.js';
import {
    InstallationCredentialError,
    loadInstallationCredentials,
    type InstallationCredentialStore,
} from '../oem-installation-credentials.js';

const installation = {
    id: 'ed0eefb2-f017-43ad-a52e-82169684803b',
    tenantId: 'd43a9029-8002-4015-a272-b9c835c8909f',
    status: 'active',
};

describe('OEM installation credential loading', () => {
    it('returns decrypted API-key credentials for an authorized installation', async () => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: installation.id,
                    authStrategy: 'api_key_header',
                    encryptedSecretBundle: encryptSecret(JSON.stringify({
                        apiKey: 'sandbox-api-key',
                        headerName: 'X-API-Key',
                    })),
                    encryptionKeyVersion: 1,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store)).resolves.toEqual({
            oemInstallationId: installation.id,
            authStrategy: 'api_key_header',
            apiKey: 'sandbox-api-key',
            headerName: 'X-API-Key',
            encryptionKeyVersion: 1,
            tokenEndpoint: null,
            tokenExpiryPolicy: {},
        });
    });

    it('returns decrypted API-key pair credentials', async () => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: installation.id,
                    authStrategy: 'api_key_pair',
                    encryptedSecretBundle: encryptSecret(JSON.stringify({
                        apiKey: 'public-key',
                        apiSecret: 'private-secret',
                    })),
                    encryptionKeyVersion: 1,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store)).resolves.toEqual({
            oemInstallationId: installation.id,
            authStrategy: 'api_key_pair',
            apiKey: 'public-key',
            apiSecret: 'private-secret',
            keyHeaderName: 'X-API-KEY',
            secretHeaderName: 'X-API-SECRET',
            encryptionKeyVersion: 1,
            tokenEndpoint: null,
            tokenExpiryPolicy: {},
        });
    });

    it('rejects inactive installations before reading credentials', async () => {
        let storeCalled = false;
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                storeCalled = true;
                return null;
            },
        };

        await expect(loadInstallationCredentials({ ...installation, status: 'draft' }, store))
            .rejects.toMatchObject({ code: 'OEM_CREDENTIALS_INVALID' });
        expect(storeCalled).toBe(false);
    });

    it('rejects malformed encrypted bundles', async () => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: installation.id,
                    authStrategy: 'api_key_header',
                    encryptedSecretBundle: 'not-valid-ciphertext',
                    encryptionKeyVersion: 1,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store))
            .rejects.toBeInstanceOf(InstallationCredentialError);
    });

    it('rejects credentials from another installation', async () => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: '11111111-1111-4111-8111-111111111111',
                    authStrategy: 'api_key_header',
                    encryptedSecretBundle: encryptSecret(JSON.stringify({
                        apiKey: 'sandbox-api-key',
                        headerName: 'X-API-Key',
                    })),
                    encryptionKeyVersion: 1,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store))
            .rejects.toMatchObject({ code: 'OEM_CREDENTIALS_INVALID' });
    });

    it.each([
        [{ headerName: 'X-API-Key' }, 'apiKey'],
        [{ apiKey: 'sandbox-api-key' }, 'headerName'],
    ])('rejects bundles missing %s', async (bundle, missingField) => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: installation.id,
                    authStrategy: 'api_key_header',
                    encryptedSecretBundle: encryptSecret(JSON.stringify(bundle)),
                    encryptionKeyVersion: 1,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store))
            .rejects.toThrow(`${missingField} is required`);
    });

    it('rejects unsupported encryption key versions', async () => {
        const store: InstallationCredentialStore = {
            async findByInstallationId() {
                return {
                    oemInstallationId: installation.id,
                    authStrategy: 'api_key_header',
                    encryptedSecretBundle: encryptSecret(JSON.stringify({
                        apiKey: 'sandbox-api-key',
                        headerName: 'X-API-Key',
                    })),
                    encryptionKeyVersion: 2,
                    tokenEndpoint: null,
                    tokenExpiryPolicy: {},
                };
            },
        };

        await expect(loadInstallationCredentials(installation, store))
            .rejects.toMatchObject({ code: 'OEM_CREDENTIALS_UNSUPPORTED' });
    });
});
