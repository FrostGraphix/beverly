import { describe, expect, it } from 'vitest';
import { resolveAuthorizedInstallation, type InstallationStore } from '../oem-installations.js';

const tenantId = '21a935d4-1a02-4bb2-999a-02914f025f48';

describe('OEM installation resolution', () => {
    it('rejects an ambiguous external resource', async () => {
        const store: InstallationStore = {
            async findCandidates() {
                return [
                    { id: '1494dc89-c52d-4757-9354-75bde004dc04', tenantId, status: 'active' },
                    { id: '79ddcc36-c630-486c-942c-12ff762d7e42', tenantId, status: 'active' },
                ];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [
                '1494dc89-c52d-4757-9354-75bde004dc04',
                '79ddcc36-c630-486c-942c-12ff762d7e42',
            ],
            resourceType: 'meter',
            internalResourceId: '75aa4ff3-c8d4-465e-a927-b6dc760d2d56',
        }, store)).rejects.toMatchObject({ code: 'OEM_INSTALLATION_AMBIGUOUS' });
    });

    it('rejects an installation outside actor scope', async () => {
        const store: InstallationStore = {
            async findCandidates() {
                return [{ id: '1494dc89-c52d-4757-9354-75bde004dc04', tenantId, status: 'active' }];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [],
            installationId: '1494dc89-c52d-4757-9354-75bde004dc04',
        }, store)).rejects.toMatchObject({ code: 'OEM_TENANT_FORBIDDEN' });
    });
});
