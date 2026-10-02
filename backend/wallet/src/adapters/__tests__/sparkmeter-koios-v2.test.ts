import { describe, expect, it, vi } from 'vitest';
import { fetchSparkMeterTelemetryPage } from '../sparkmeter-koios-v2.js';

describe('SparkMeter Koios v2 telemetry client', () => {
    it('validates its origin and sends bounded authenticated reads', async () => {
        const validate = vi.fn().mockResolvedValue('https://www.sparkmeter.cloud/');
        const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: [], pagination: { count: 0, has_more: false, cursor: null },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const page = await fetchSparkMeterTelemetryPage({
            baseUrl: 'https://www.sparkmeter.cloud', approvedHostnames: ['www.sparkmeter.cloud'],
            organizationId: '64bfd8cd-d361-4368-98c9-c0ea3730559d', apiKey: 'key', apiSecret: 'secret',
            sites: ['11111111-1111-4111-8111-111111111111'], mode: 'live', age: '15m', fetchFn, validateEndpoint: validate,
        });
        expect(page.hasMore).toBe(false);
        expect(validate).toHaveBeenCalledOnce();
        expect(fetchFn).toHaveBeenCalledWith(
            'https://www.sparkmeter.cloud/api/v2/organizations/64bfd8cd-d361-4368-98c9-c0ea3730559d/data/live',
            expect.objectContaining({ method: 'POST', redirect: 'error' }),
        );
        const headers = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;
        expect(headers).toMatchObject({ 'X-API-KEY': 'key', 'X-API-SECRET': 'secret' });
    });

    it('retries only throttled read requests', async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], pagination: { count: 0, has_more: false, cursor: null } }), { status: 200 }));
        await fetchSparkMeterTelemetryPage({
            baseUrl: 'https://www.sparkmeter.cloud', approvedHostnames: ['www.sparkmeter.cloud'],
            organizationId: 'org', apiKey: 'key', apiSecret: 'secret', sites: ['11111111-1111-4111-8111-111111111111'],
            mode: 'live', fetchFn, validateEndpoint: vi.fn().mockResolvedValue('https://www.sparkmeter.cloud/'),
            wait: vi.fn().mockResolvedValue(undefined),
        });
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});
