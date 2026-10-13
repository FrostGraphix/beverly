import { describe, expect, it, vi } from 'vitest';
import { normalizeSparkMeterTelemetryPage, persistTelemetryPage } from '../oem-telemetry.js';

describe('OEM telemetry', () => {
    it('normalizes observed Koios v2 historical readings', () => {
        const page = normalizeSparkMeterTelemetryPage({
            data: [{
                site: 'site-1', meter: { id: 'provider-uuid', serial_number: 'SM-1', customer: { id: 'customer-1' } },
                timestamp: '2026-10-06T21:00:00+00:00', energy: 12.5, voltage_avg: 230,
                current_avg: 1.2, power_factor_avg: 0.9, state: 'ElectricalMeterStateOn', type: 'reading',
            }],
            pagination: { count: 1, has_more: false, cursor: null },
        });
        expect(page.quarantine).toHaveLength(0);
        expect(page.readings[0]).toMatchObject({
            externalSiteId: 'site-1', externalMeterId: 'SM-1', externalCustomerId: 'customer-1',
            state: 'on', type: 'customer', energyKwh: 12.5,
        });
    });

    it('quarantines undocumented meter states', () => {
        const page = normalizeSparkMeterTelemetryPage({
            data: [{ site: 'site-1', meter: { serial_number: 'SM-1', customer: { id: 'customer-1' } },
                timestamp: '2026-10-06T21:00:00+00:00', state: 'ElectricalMeterStateTamper', type: 'reading' }],
            pagination: { count: 1, has_more: false, cursor: null },
        });
        expect(page.readings).toHaveLength(0);
        expect(page.quarantine).toHaveLength(1);
    });
    it('normalizes verified fields and quarantines malformed rows', () => {
        const page = normalizeSparkMeterTelemetryPage({
            data: [
                { site_id: 'site-1', meter_id: 'SM-1', customer_id: null, timestamp: '2026-09-27T18:45:00Z', energy: 12.5, voltage_avg: 230, current_avg: 1.2, power_factor_avg: 0.9, credit_wallet_balance: 0, state: 'on', type: 'customer' },
                { site_id: 'site-1', meter_id: '', timestamp: 'bad', state: 'unknown', type: 'customer' },
            ],
            pagination: { count: 2, has_more: false, cursor: null },
        });
        expect(page.readings).toHaveLength(1);
        expect(page.readings[0]).toMatchObject({
            externalSiteId: 'site-1', externalMeterId: 'SM-1', energyKwh: 12.5,
            energyInterpretation: 'provider_total_unknown_semantics', providerCreditBalance: 0,
        });
        expect(page.readings[0]?.providerPayload).toMatchObject({ meter_id: 'SM-1' });
        expect(page.quarantine).toEqual([{ reason: 'invalid_provider_reading', providerPayload: expect.any(Object) }]);
    });

    it('persists readings and checkpoint atomically', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { readings: 1, quarantine: 0 }, error: null });
        const result = await persistTelemetryPage('11111111-1111-4111-8111-111111111111', 'live', 'site-1', {
            readings: [{ externalSiteId: 'site-1', externalMeterId: 'SM-1', timestamp: '2026-09-27T18:45:00Z', energyKwh: 12.5, state: 'on', type: 'customer', energyInterpretation: 'provider_total_unknown_semantics', providerPayload: { meter_id: 'SM-1' } }],
            quarantine: [], nextCursor: null, hasMore: false,
        }, { rpc });
        expect(result).toEqual({ readings: 1, quarantine: 0 });
        expect(rpc).toHaveBeenCalledOnce();
        expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_mode: 'live', p_scope_key: 'site-1' });
    });
});
