import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
    previewPurchase, resolveTariffPricing, TokenEngineError,
    listStations, invalidateStationsCache, buildRemoteTokenTaskPayload,
    lookupArchivedMeterSample,
} from '../token-engine.js';

describe('token engine pricing', () => {
    it('resolves residential tariff with no tax', () => {
        const t = resolveTariffPricing('RESIDENTIAL');
        expect(t.basePricePerKwh).toBe(350);
        expect(t.taxRate).toBe(0);
        expect(t.effectivePricePerKwh).toBe(350);
    });

    it('applies KOLO 7.5% tax', () => {
        const t = resolveTariffPricing('KOLO');
        expect(t.effectivePricePerKwh).toBeCloseTo(483.75, 4);
    });

    it('falls back to residential pricing for unknown legacy tariff ids', () => {
        const t = resolveTariffPricing('UNKNOWN');
        expect(t.basePricePerKwh).toBe(350);
        expect(t.taxRate).toBe(0);
        expect(t.effectivePricePerKwh).toBe(350);
        expect(t.tariffId).toBe('UNKNOWN');
    });

    it('previewPurchase computes units correctly for residential', () => {
        // ₦5,000 = 500000 kobo at ₦350/kWh = 14.2857 kWh
        const p = previewPurchase(500000, 'RESIDENTIAL');
        expect(p.amountMinor).toBe(500000);
        expect(p.units).toBeCloseTo(14.2857, 3);
        expect(p.tariffId).toBe('RESIDENTIAL');
        expect(p.taxAmountMinor).toBe(0);
    });

    it('previewPurchase computes tax embedded in kobo amount for KOLO', () => {
        // KOLO has 7.5% tax: of ₦1000 paid, ~₦69.77 is tax
        const p = previewPurchase(100000, 'KOLO');
        expect(p.taxAmountMinor).toBeGreaterThan(6000);
        expect(p.taxAmountMinor).toBeLessThan(8000);
    });

    it('rejects non-positive amounts', () => {
        expect(() => previewPurchase(0, 'RESIDENTIAL')).toThrow(TokenEngineError);
        expect(() => previewPurchase(-100, 'RESIDENTIAL')).toThrow(TokenEngineError);
    });
});

describe('listStations', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        invalidateStationsCache();
        // ENERGY_BACKEND_URL + ENERGY_BEARER_TOKEN come from vitest.setup.ts
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    it('filters out the legacy "admin" sentinel row and sorts by name', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                code: 0,
                result: {
                    total: 4,
                    data: [
                        { stationId: 'TUNGA',   name: 'TUNGA',   remark: null },
                        { stationId: 'admin',   name: 'admin',   remark: null },
                        { stationId: 'KYAKALE', name: 'KYAKALE', remark: null },
                        { stationId: 'UMAISHA', name: 'UMAISHA', remark: null },
                    ],
                },
            }),
        }) as any;

        const stations = await listStations({ force: true });
        expect(stations).toHaveLength(3);
        expect(stations.map((s) => s.stationId)).toEqual(['KYAKALE', 'TUNGA', 'UMAISHA']);
    });

    it('caches results within TTL', async () => {
        const mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, result: { total: 1, data: [{ stationId: 'X', name: 'X' }] } }),
        });
        globalThis.fetch = mock as any;

        await listStations({ force: true });
        await listStations(); // cached
        await listStations(); // cached
        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('refetches when force=true', async () => {
        const mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, result: { total: 1, data: [{ stationId: 'X', name: 'X' }] } }),
        });
        globalThis.fetch = mock as any;

        await listStations({ force: true });
        await listStations({ force: true });
        expect(mock).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when upstream returns no data', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, result: { total: 0, data: [] } }),
        }) as any;
        const stations = await listStations({ force: true });
        expect(stations).toEqual([]);
    });

    it('throws TokenEngineError when upstream returns 5xx', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            text: async () => 'upstream unavailable',
        }) as any;
        await expect(listStations({ force: true })).rejects.toThrow(TokenEngineError);
    });
});

describe('live token integration payloads', () => {
    it('can resolve archived read-only meter metadata without vending', () => {
        const meter = lookupArchivedMeterSample('47005373957');
        expect(meter).toMatchObject({
            meterId: '47005373957',
            customerId: '47005373957',
            customerName: 'JONATHAN AZIGE',
            stationId: 'KYAKALE',
            tariffId: 'RESIDENTIAL',
            resolutionSource: 'archived_contract_sample',
            liveVerified: false,
        });
    });

    it('builds the upstream CreateTokenTask payload for remote sends', () => {
        const payload = buildRemoteTokenTaskPayload({
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            stationId: 'KYAKALE',
            protocolVersion: '2.2',
            token: '0021 2636 8628 4408 6688',
            reference: 'PO-1',
        });

        expect(payload).toEqual([{
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            version: '2.2',
            flag: 'A120',
            name: 'Send Token',
            dataItem: 'Send Token',
            dataDefault: '',
            dataPrefix: '',
            data: '00212636862844086688',
            stationId: 'KYAKALE',
            remark: 'Beverly remote token PO-1',
        }]);
    });
});

