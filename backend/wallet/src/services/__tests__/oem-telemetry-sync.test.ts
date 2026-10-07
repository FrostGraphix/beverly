import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '../../db/supabase.js';
import { runSparkMeterTelemetrySync, syncActiveSparkMeterTelemetry } from '../oem-telemetry-sync.js';

const target = {
    installationId: '11111111-1111-4111-8111-111111111111', baseUrl: 'https://www.sparkmeter.cloud',
    approvedHostnames: ['www.sparkmeter.cloud'], organizationId: 'org',
    apiKey: 'key', apiSecret: 'secret', sites: ['22222222-2222-4222-8222-222222222222'],
};

describe('OEM telemetry synchronization', () => {
    afterEach(() => vi.restoreAllMocks());

    it('rejects an active installation without verified organization configuration', async () => {
        const query = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{
                id: target.installationId, base_url: target.baseUrl, approved_hostnames: target.approvedHostnames,
                config_version: 1, tenants: { status: 'active' }, oem_manufacturers: { slug: 'sparkmeter' },
                oem_config_revisions: [{ revision: 1, configuration: {} }],
            }], error: null }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValue(query as never);
        await expect(syncActiveSparkMeterTelemetry()).rejects.toThrow('OEM telemetry target configuration invalid');
    });

    it('rejects an active installation without scoped meter sites', async () => {
        const installations = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{
                id: target.installationId, base_url: target.baseUrl, approved_hostnames: target.approvedHostnames,
                config_version: 1, tenants: { status: 'active' }, oem_manufacturers: { slug: 'sparkmeter' },
                oem_config_revisions: [{ revision: 1, configuration: { organization_id: '64bfd8cd-d361-4368-98c9-c0ea3730559d' } }],
            }], error: null }),
        };
        const meters = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValueOnce(installations as never).mockReturnValueOnce(meters as never);
        await expect(syncActiveSparkMeterTelemetry()).rejects.toThrow('OEM telemetry sites unavailable');
    });

    it('covers the seven UTC dates before each daily run', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-07T04:00:00.000Z'));
        try {
            const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
            const persistPage = vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 });
            await runSparkMeterTelemetrySync([target], { fetchPage, persistPage });
            expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-10-01', dateTo: '2026-10-07' }));
            expect(persistPage).toHaveBeenCalledWith(
                target.installationId, 'historical',
                `2026-10-01:2026-10-07:${target.sites[0]}`,
                expect.objectContaining({ hasMore: false }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('persists every page and stops', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: 'next', hasMore: true })
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
        const persistPage = vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 });
        const result = await runSparkMeterTelemetrySync([target], { fetchPage, persistPage });
        expect(result).toEqual({ installations: 1, pages: 2, readings: 0, quarantine: 0, failures: [] });
        expect(persistPage).toHaveBeenCalledTimes(2);
    });

    it('fails the scheduled run when provider reads fail', async () => {
        await expect(runSparkMeterTelemetrySync([target], {
            fetchPage: vi.fn().mockRejectedValue(new Error('transport unavailable')),
            persistPage: vi.fn(),
        })).rejects.toThrow('OEM telemetry synchronization failed');
    });

    it('rejects repeated cursors', async () => {
        const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: 'same', hasMore: true });
        await expect(runSparkMeterTelemetrySync([target], {
            fetchPage, persistPage: vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 }),
        })).rejects.toMatchObject({ failures: [{ installationId: target.installationId, reason: 'telemetry_cursor_repeated' }] });
    });

    it('rejects historical requests exceeding the provider site-day limit', async () => {
        const fetchPage = vi.fn();
        await expect(runSparkMeterTelemetrySync(
            [{ ...target, sites: Array.from({ length: 13 }, (_, index) => `site-${index}`) }],
            { fetchPage, persistPage: vi.fn() },
        )).rejects.toMatchObject({ failures: [{ installationId: target.installationId, reason: 'telemetry_site_day_budget_exceeded' }] });
        expect(fetchPage).not.toHaveBeenCalled();
    });
});
