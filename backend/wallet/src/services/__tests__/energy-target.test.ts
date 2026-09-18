import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    resolveOemConfig: vi.fn(),
    resolveOemAuthHeader: vi.fn(),
}));

vi.mock('../oem-registry.js', () => ({
    DEFAULT_OEM_SLUG: 'calinmeter',
    resolveOemConfig: mocks.resolveOemConfig,
    resolveOemAuthHeader: mocks.resolveOemAuthHeader,
}));

vi.mock('../../config/env.js', () => ({
    env: {
        NODE_ENV: 'production',
        OEM_REGISTRY_DISABLED: false,
        ENERGY_BACKEND_URL: 'https://legacy-energy.test',
        ENERGY_BEARER_TOKEN: 'legacy-0001-token',
        ENERGY_AUTHORIZATION_PASSWORD: 'vend-secret',
        UPSTREAM_PASSWORD: 'login-secret',
        ENERGY_ENABLE_ARCHIVED_METER_FALLBACK: false,
        OEM_CONFIG_CACHE_TTL_MS: 30_000,
        VENDING_VAT_BASIS_POINTS: 750,
    },
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: vi.fn(),
    },
}));

describe('production energy identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the registry ADMIN bearer', async () => {
        const config = {
            oemId: 'calinmeter-id',
            slug: 'calinmeter',
            displayName: 'Calinmeter HES',
            isSeedDefault: true,
            vendingStrategy: 'sts_token',
            authStrategy: 'bearer_static',
            baseUrl: 'https://registry-energy.test',
            bearerToken: 'admin-unlimited-token',
            apiKeyHeaderName: '',
            tokenEndpointPath: '',
            username: 'admin',
            password: '',
        };
        mocks.resolveOemConfig.mockResolvedValue(config);
        mocks.resolveOemAuthHeader.mockReturnValue({
            name: 'Authorization',
            value: 'Bearer admin-unlimited-token',
        });

        const { resolveEnergyTarget } = await import('../token-engine.js');
        const target = await resolveEnergyTarget(undefined, 'UMAISHA');

        expect(mocks.resolveOemConfig).toHaveBeenCalledWith(undefined);
        expect(target).toEqual({
            baseUrl: 'https://registry-energy.test',
            authHeader: {
                name: 'Authorization',
                value: 'Bearer admin-unlimited-token',
            },
        });
    });

    it('rejects legacy 0001 fallback', async () => {
        mocks.resolveOemConfig.mockResolvedValue(null);
        mocks.resolveOemAuthHeader.mockReturnValue(null);

        const { resolveEnergyTarget } = await import('../token-engine.js');

        await expect(resolveEnergyTarget(undefined, 'UMAISHA')).rejects.toMatchObject({
            code: 'oem_energy_not_configured',
        });
    });
});
