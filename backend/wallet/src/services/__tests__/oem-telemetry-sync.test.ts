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
            order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValueOnce(installations as never).mockReturnValue(meters as never);
        await expect(syncActiveSparkMeterTelemetry()).rejects.toThrow('OEM telemetry sites unavailable');
    });

    it('checks every scoped inventory page before selecting sites', async () => {
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
            order: vi.fn().mockReturnThis(), range: vi.fn()
                .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ site_id: target.sites[0] })), error: null })
                .mockResolvedValueOnce({ data: null, error: new Error('page unavailable') }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValueOnce(installations as never).mockReturnValue(meters as never);
        await expect(syncActiveSparkMeterTelemetry()).rejects.toThrow('OEM telemetry sites unavailable');
        expect(meters.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it('rejects active meters without site ownership', async () => {
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
            order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [
                { site_id: target.sites[0] }, { site_id: null },
            ], error: null }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValueOnce(installations as never).mockReturnValue(meters as never);
        await expect(syncActiveSparkMeterTelemetry()).rejects.toThrow('OEM telemetry sites unavailable');
    });

    it('skips unrelated credentials during site replay', async () => {
        const installations = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{
                id: target.installationId, base_url: target.baseUrl, approved_hostnames: target.approvedHostnames,
                config_version: 1, tenants: { status: 'active' }, oem_manufacturers: { slug: 'sparkmeter' },
                oem_config_revisions: [{ revision: 1, configuration: { organization_id: '64bfd8cd-d361-4368-98c9-c0ea3730559d' } }],
            }], error: null }),
        };
        const meters = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: [{ site_id: target.sites[0] }], error: null }),
        };
        vi.spyOn(adminClient, 'from').mockReturnValueOnce(installations as never).mockReturnValue(meters as never);
        await expect(syncActiveSparkMeterTelemetry({ site: '44444444-4444-4444-8444-444444444444' }))
            .rejects.toThrow('OEM telemetry site outside installation');
    });

    it('queries the previous UTC date by default', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-07T04:00:00.000Z'));
        try {
            const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
            const persistPage = vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 });
            await runSparkMeterTelemetrySync([target], { fetchPage, persistPage });
            expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-10-06', dateTo: '2026-10-06' }));
            expect(persistPage).toHaveBeenCalledWith(
                target.installationId, 'historical',
                `2026-10-06:2026-10-06:${target.sites[0]}`,
                expect.objectContaining({ hasMore: false }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('supports bounded date and site replay', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-07T04:00:00.000Z'));
        try {
            const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
            await runSparkMeterTelemetrySync([target], {
                fetchPage, persistPage: vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 }),
            }, { date: '2026-10-05', site: target.sites[0] });
            expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
                dateFrom: '2026-10-05', dateTo: '2026-10-05', sites: [target.sites[0]],
            }));
            await expect(runSparkMeterTelemetrySync([target], { fetchPage, persistPage: vi.fn() },
                { date: '2026-09-01' })).rejects.toThrow('OEM telemetry date outside replay window');
            await expect(runSparkMeterTelemetrySync([target], { fetchPage, persistPage: vi.fn() },
                { site: '33333333-3333-4333-8333-333333333333' })).rejects.toThrow('OEM telemetry site outside installation');
        } finally {
            vi.useRealTimers();
        }
    });

    it('replays one site without failing unrelated installations', async () => {
        const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
        const unrelated = { ...target, installationId: '33333333-3333-4333-8333-333333333333',
            sites: ['44444444-4444-4444-8444-444444444444'] };
        const result = await runSparkMeterTelemetrySync([target, unrelated], {
            fetchPage, persistPage: vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 }),
        }, { site: target.sites[0] });
        expect(result.installations).toBe(1);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('persists every page and stops', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: 'next', hasMore: true })
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
        const persistPage = vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 });
        const wait = vi.fn().mockResolvedValue(undefined);
        const result = await runSparkMeterTelemetrySync([target], { fetchPage, persistPage, wait });
        expect(result).toEqual({ installations: 1, pages: 2, readings: 0, quarantine: 0, failures: [] });
        expect(persistPage).toHaveBeenCalledTimes(2);
        expect(wait).toHaveBeenCalledWith(1700);
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
            [{ ...target, sites: Array.from({ length: 91 }, (_, index) => `site-${index}`) }],
            { fetchPage, persistPage: vi.fn() },
        )).rejects.toMatchObject({ failures: [{ installationId: target.installationId, reason: 'telemetry_site_day_budget_exceeded' }] });
        expect(fetchPage).not.toHaveBeenCalled();
    });
});
