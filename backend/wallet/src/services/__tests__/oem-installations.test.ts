import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthorizedInstallation, type InstallationStore } from '../oem-installations.js';

const tenantId = '21a935d4-1a02-4bb2-999a-02914f025f48';

describe('OEM installation resolution', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each(['explicit', 'mapped'] as const)('restricts %s database reads to authorized tenant scope', async (lookup) => {
        const installationId = '1494dc89-c52d-4757-9354-75bde004dc04';
        const candidate = { id: installationId, tenant_id: tenantId, status: 'active' };
        vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            const tenantFilter = lookup === 'explicit' ? 'tenant_id' : 'oem_installations.tenant_id';
            const scopeFilter = lookup === 'explicit' ? 'id' : 'oem_installation_id';
            if (url.searchParams.get(tenantFilter) !== `eq.${tenantId}`
                || !url.searchParams.getAll(scopeFilter).includes(`in.(${installationId})`)) {
                return new Response(JSON.stringify({ message: 'Unscoped database request rejected' }), { status: 403 });
            }
            return new Response(JSON.stringify(lookup === 'explicit' ? [candidate] : [{ oem_installations: candidate }]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [installationId],
            ...(lookup === 'explicit' ? { installationId } : {
                resourceType: 'meter' as const,
                internalResourceId: '75aa4ff3-c8d4-465e-a927-b6dc760d2d56',
            }),
        })).resolves.toEqual({ id: installationId, tenantId, status: 'active' });
    });

    it.each([
        { tenantId: '', allowedInstallationIds: ['allowed'], installationId: 'allowed' },
        { tenantId: ' ', allowedInstallationIds: ['allowed'], installationId: 'allowed' },
        { tenantId, allowedInstallationIds: [], installationId: 'allowed' },
        { tenantId, allowedInstallationIds: ['allowed'], installationId: 'forbidden' },
    ])('rejects missing or forbidden authority before storage access: %j', async (request) => {
        const inaccessibleStore: InstallationStore = {
            async findCandidates() {
                throw new Error('Unauthorized requests must not reach storage');
            },
        };
        await expect(resolveAuthorizedInstallation(request, inaccessibleStore))
            .rejects.toMatchObject({ code: 'OEM_TENANT_FORBIDDEN' });
    });

    it('returns one active in-scope installation', async () => {
        const candidate = { id: '1494dc89-c52d-4757-9354-75bde004dc04', tenantId, status: 'active' };
        const store: InstallationStore = {
            async findCandidates() {
                return [candidate];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [candidate.id],
            installationId: candidate.id,
        }, store)).resolves.toEqual(candidate);
    });

    it('rejects substitution with another allowed installation', async () => {
        const requested = '1494dc89-c52d-4757-9354-75bde004dc04';
        const substituted = '79ddcc36-c630-486c-942c-12ff762d7e42';
        const store: InstallationStore = {
            async findCandidates() {
                return [{ id: substituted, tenantId, status: 'active' }];
            },
        };
        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [requested, substituted],
            installationId: requested,
        }, store)).rejects.toMatchObject({ code: 'OEM_INSTALLATION_INVALID' });
    });

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

    it('rejects an installation belonging to another tenant', async () => {
        const installationId = '1494dc89-c52d-4757-9354-75bde004dc04';
        const store: InstallationStore = {
            async findCandidates() {
                return [{
                    id: installationId,
                    tenantId: '11111111-1111-4111-8111-111111111111',
                    status: 'active',
                }];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [installationId],
            installationId,
        }, store)).rejects.toMatchObject({ code: 'OEM_TENANT_FORBIDDEN' });
    });

    it('rejects inactive installations', async () => {
        const installationId = '1494dc89-c52d-4757-9354-75bde004dc04';
        const store: InstallationStore = {
            async findCandidates() {
                return [{ id: installationId, tenantId, status: 'draft' }];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: [installationId],
            installationId,
        }, store)).rejects.toMatchObject({ code: 'OEM_INSTALLATION_INACTIVE' });
    });

    it('rejects missing installations', async () => {
        const store: InstallationStore = {
            async findCandidates() {
                return [];
            },
        };

        await expect(resolveAuthorizedInstallation({
            tenantId,
            allowedInstallationIds: ['1494dc89-c52d-4757-9354-75bde004dc04'],
            installationId: '1494dc89-c52d-4757-9354-75bde004dc04',
        }, store)).rejects.toMatchObject({ code: 'OEM_INSTALLATION_MISSING' });
    });
});
