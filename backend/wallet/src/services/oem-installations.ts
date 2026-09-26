import { authorizeInstallation, OemContractError, resolveInstallation } from '@beverly/oem-contracts';
import { adminClient } from '../db/supabase.js';

export type ExternalResourceType = 'station' | 'meter' | 'customer' | 'tariff' | 'account' | 'gateway' | 'command';

export interface InstallationCandidate {
    id: string;
    tenantId: string;
    status: string;
}

export interface InstallationResolutionRequest {
    tenantId: string;
    allowedInstallationIds: readonly string[];
    installationId?: string;
    resourceType?: ExternalResourceType;
    internalResourceId?: string;
}

export interface InstallationStore {
    findCandidates(request: InstallationResolutionRequest): Promise<readonly InstallationCandidate[]>;
}

interface InstallationRow {
    id: string;
    tenant_id: string;
    status: string;
}

interface MappingRow {
    oem_installations: InstallationRow | InstallationRow[] | null;
}

function normalizeInstallationRow(row: InstallationRow): InstallationCandidate {
    return { id: row.id, tenantId: row.tenant_id, status: row.status };
}

const supabaseInstallationStore: InstallationStore = {
    async findCandidates(request): Promise<readonly InstallationCandidate[]> {
        if (request.installationId) {
            const { data, error } = await adminClient
                .from('oem_installations')
                .select('id, tenant_id, status')
                .eq('tenant_id', request.tenantId)
                .in('id', [...request.allowedInstallationIds])
                .eq('id', request.installationId);
            if (error) throw error;
            return ((data ?? []) as InstallationRow[]).map(normalizeInstallationRow);
        }

        if (!request.resourceType || !request.internalResourceId) return [];
        const { data, error } = await adminClient
            .from('external_resource_mappings')
            .select('oem_installations!inner(id, tenant_id, status)')
            .eq('oem_installations.tenant_id', request.tenantId)
            .in('oem_installation_id', [...request.allowedInstallationIds])
            .eq('resource_type', request.resourceType)
            .eq('internal_id', request.internalResourceId)
            .eq('status', 'active');
        if (error) throw error;
        return ((data ?? []) as unknown as MappingRow[]).flatMap((mapping) => {
            const rows = Array.isArray(mapping.oem_installations)
                ? mapping.oem_installations
                : mapping.oem_installations ? [mapping.oem_installations] : [];
            return rows.map(normalizeInstallationRow);
        });
    },
};

/** Resolve exactly one active installation belonging to the server-owned tenant. */
export async function resolveAuthorizedInstallation(
    request: InstallationResolutionRequest,
    store: InstallationStore = supabaseInstallationStore,
): Promise<InstallationCandidate> {
    if (!request.tenantId?.trim() || !Array.isArray(request.allowedInstallationIds)
        || request.allowedInstallationIds.length === 0
        || request.allowedInstallationIds.some((id) => typeof id !== 'string' || !id.trim())
        || (request.installationId !== undefined && !request.allowedInstallationIds.includes(request.installationId))) {
        throw new OemContractError('OEM_TENANT_FORBIDDEN', 'Trusted tenant and installation scope are required');
    }
    const candidates = await store.findCandidates(request);
    const installation = resolveInstallation(candidates);
    if (request.installationId !== undefined && installation.id !== request.installationId) {
        throw new OemContractError('OEM_INSTALLATION_INVALID', 'Resolved installation does not match request');
    }
    if (!request.allowedInstallationIds.includes(installation.id)) {
        throw new OemContractError('OEM_TENANT_FORBIDDEN', 'Actor cannot access installation');
    }
    return authorizeInstallation(installation, request.tenantId);
}
