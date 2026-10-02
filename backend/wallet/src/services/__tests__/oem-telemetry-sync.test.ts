import { describe, expect, it, vi } from 'vitest';
import { runSparkMeterTelemetrySync } from '../oem-telemetry-sync.js';

const target = {
    installationId: '11111111-1111-4111-8111-111111111111', baseUrl: 'https://www.sparkmeter.cloud',
    approvedHostnames: ['www.sparkmeter.cloud'], organizationId: 'org',
    apiKey: 'key', apiSecret: 'secret', sites: ['22222222-2222-4222-8222-222222222222'],
};

describe('OEM telemetry synchronization', () => {
    it('persists every page and stops', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: 'next', hasMore: true })
            .mockResolvedValueOnce({ readings: [], quarantine: [], nextCursor: null, hasMore: false });
        const persistPage = vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 });
        const result = await runSparkMeterTelemetrySync([target], { fetchPage, persistPage });
        expect(result).toEqual({ installations: 1, pages: 2, readings: 0, quarantine: 0, failures: [] });
        expect(persistPage).toHaveBeenCalledTimes(2);
    });

    it('rejects repeated cursors', async () => {
        const fetchPage = vi.fn().mockResolvedValue({ readings: [], quarantine: [], nextCursor: 'same', hasMore: true });
        const result = await runSparkMeterTelemetrySync([target], { fetchPage, persistPage: vi.fn().mockResolvedValue({ readings: 0, quarantine: 0 }) });
        expect(result.failures).toEqual([{ installationId: target.installationId, reason: 'telemetry_cursor_repeated' }]);
    });
});
