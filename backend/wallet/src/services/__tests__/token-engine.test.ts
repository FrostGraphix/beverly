import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
    previewPurchase, resolveTariffPricing, TokenEngineError,
    listStations, invalidateStationsCache, buildCreditTokenPayload, buildRemoteTaskConfirmPayload,
    buildRemoteTokenStandbyConfirmPayload, buildRemoteTokenTaskLookupPayload, buildRemoteTokenTaskPayload,
    lookupArchivedMeterSample, createRemoteSendTask,
} from '../token-engine.js';

describe('token engine pricing', () => {
    it('resolves residential tariff pricing', () => {
        const t = resolveTariffPricing('RESIDENTIAL');
        expect(t.basePricePerKwh).toBe(350);
        expect(t.effectivePricePerKwh).toBe(350);
    });

    it('resolves KOLO base pricing before VAT split', () => {
        const t = resolveTariffPricing('KOLO');
        expect(t.basePricePerKwh).toBe(450);
        expect(t.effectivePricePerKwh).toBe(450);
    });

    it('falls back to residential pricing for unknown legacy tariff ids', () => {
        const t = resolveTariffPricing('UNKNOWN');
        expect(t.basePricePerKwh).toBe(350);
        expect(t.effectivePricePerKwh).toBe(350);
        expect(t.tariffId).toBe('UNKNOWN');
    });

    it('previewPurchase computes inclusive VAT from the gross amount', () => {
        // ₦5,000 gross: energy = round(500000×10000/10750) = 465116, VAT = 34884.
        const p = previewPurchase(500000, 'RESIDENTIAL');
        expect(p.amountMinor).toBe(500000);
        expect(p.energyAmountMinor).toBe(465116);
        expect(p.taxAmountMinor).toBe(34884);
        expect(p.vatRateBasisPoints).toBe(750);
        expect(p.units).toBeCloseTo(13.289, 2);
        expect(p.tariffId).toBe('RESIDENTIAL');
    });

    it('uses inclusive fallback VAT for a NGN 1,000 purchase', () => {
        // ₦1,000 gross: energy = round(100000×10000/10750) = 93023, VAT = 6977.
        const p = previewPurchase(100000, 'RESIDENTIAL');
        expect(p.taxAmountMinor).toBe(6977);
        expect(p.amountMinor).toBe(100000);
        expect(p.energyAmountMinor).toBe(93023);
        expect(p.vatRateBasisPoints).toBe(750);
        expect(p.units).toBeCloseTo(2.6578, 4);
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
    it('uses S2 token generation for three-phase meters', () => {
        const payload = buildCreditTokenPayload({
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            stationId: 'KYAKALE',
            amountMinor: 500000,
            units: 14.2857,
            tariffId: 'RESIDENTIAL',
            isThreePhase: true,
            reference: 'PO-3P',
        });

        expect(payload.isS2).toBe(true);
    });

    it('keeps archived meter samples disabled by default', () => {
        expect(lookupArchivedMeterSample('47005373957')).toBeNull();
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

    it('builds the upstream UpdateTokenTask confirm payload', () => {
        const payload = buildRemoteTaskConfirmPayload({
            result: {
                data: [
                    { id: 8361 },
                    { id: 8361 },
                    { taskId: 8362 },
                ],
            },
        });

        expect(payload).toEqual([{ id: 8361 }, { id: 8362 }]);
    });

    it('finds a standby token task when create returns no id', () => {
        expect(buildRemoteTokenTaskLookupPayload({ meterId: '47300481810' })).toEqual({
            lang: 'en',
            meterId: '47300481810',
            pageNumber: 1,
            pageSize: 10,
            orderBy: 'createDate desc',
        });

        const payload = buildRemoteTokenStandbyConfirmPayload({
            result: {
                data: [
                    { id: 8364, meterId: '47300481810', data: '61688642353365376881', status: 0 },
                    { id: 8291, meterId: '47300481810', data: '48811717073300952793', status: 2 },
                ],
            },
        }, {
            meterId: '47300481810',
            token: '6168 8642 3533 6537 6881',
        });

        expect(payload).toEqual([{ id: 8364 }]);
    });

    it('rejects a remote send when the meter returns TokenReject', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn(async (url: any, init: any) => {
            const path = String(url);
            if (path.includes('/API/RemoteMeterTask/CreateTokenTask')) {
                return {
                    ok: true,
                    json: async () => ({ code: 0, result: [{ id: 8370, meterId: '47300481810', data: '63751343398450415494', status: 0 }] }),
                } as any;
            }
            if (path.includes('/API/RemoteMeterTask/UpdateTokenTask')) {
                return {
                    ok: true,
                    json: async () => ({ code: 99, reason: 'No data has been changed', result: null }),
                } as any;
            }
            if (path.includes('/API/RemoteMeterTask/GetTokenTask')) {
                return {
                    ok: true,
                    json: async () => ({
                        code: 0,
                        result: {
                            data: [{ id: 8370, meterId: '47300481810', data: '63751343398450415494', status: 2, remark: 'TokenReject' }],
                        },
                    }),
                } as any;
            }
            throw new Error(`unexpected url ${path}`);
        }) as any;

        await expect(createRemoteSendTask({
            customerId: '47300481810',
            customerName: 'GLO_MAST',
            meterId: '47300481810',
            stationId: 'OGUFA',
            protocolVersion: '2.2',
            token: '6375 1343 3984 5041 5494',
            reference: 'PO-REJECT',
        })).rejects.toMatchObject({ code: 'remote_token_rejected' });

        globalThis.fetch = originalFetch;
    });
});

