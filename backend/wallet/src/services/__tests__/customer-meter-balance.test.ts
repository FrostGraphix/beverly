import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../db/supabase.js', () => ({ adminClient: { rpc } }));

import { getCustomerMeterBalances } from '../customer-meter-balance.js';

describe('customer meter balance', () => {
    beforeEach(() => rpc.mockReset());

    it('returns an owned meter\'s last reported credit', async () => {
        rpc.mockResolvedValue({
            data: [{
                meter_id: '47005376315',
                station_id: 'TUNGA',
                balance_kwh: '12.75',
                reading_date: '2026-09-29',
                captured_at: '2026-09-29T08:00:00.000Z',
            }],
            error: null,
        });

        await expect(getCustomerMeterBalances('customer-1')).resolves.toEqual([{
            meterId: '47005376315',
            stationId: 'TUNGA',
            balanceKwh: 12.75,
            status: 'available',
            readingDate: '2026-09-29',
            reportedAt: '2026-09-29T08:00:00.000Z',
        }]);
        expect(rpc).toHaveBeenCalledWith('get_customer_meter_balances', {
            p_customer_id: 'customer-1',
            p_meter_id: null,
        });
    });

    it('marks an owned meter unavailable without a source reading', async () => {
        rpc.mockResolvedValue({
            data: [{
                meter_id: '47005376315',
                station_id: 'TUNGA',
                balance_kwh: null,
                reading_date: null,
                captured_at: null,
            }],
            error: null,
        });

        await expect(getCustomerMeterBalances('customer-1')).resolves.toEqual([{
            meterId: '47005376315',
            stationId: 'TUNGA',
            balanceKwh: null,
            status: 'unavailable',
            readingDate: null,
            reportedAt: null,
        }]);
    });

    it('does not expose an unowned meter', async () => {
        rpc.mockResolvedValue({ data: [], error: null });

        await expect(getCustomerMeterBalances('customer-1', '47005376315')).resolves.toEqual([]);
    });

    it('does not present invalid source data as a balance', async () => {
        rpc.mockResolvedValue({
            data: [{
                meter_id: '47005376315', station_id: 'TUNGA', balance_kwh: 'not-a-number',
                reading_date: '2026-09-29', captured_at: '2026-09-29T08:00:00.000Z',
            }],
            error: null,
        });

        await expect(getCustomerMeterBalances('customer-1')).resolves.toMatchObject([{
            balanceKwh: null,
            status: 'unavailable',
        }]);
    });
});

describe('customer meter balance database boundary', () => {
    const migration = readFileSync(resolve(process.cwd(), '../..', 'supabase/migrations/20260929180000_customer_meter_balances.sql'), 'utf8');
    const routes = readFileSync(resolve(process.cwd(), 'src/routes/customer.ts'), 'utf8');
    const metersView = readFileSync(resolve(process.cwd(), '../..', 'apps/customer/src/views/Meters.vue'), 'utf8');

    it('limits readings to approved meters owned by the requesting customer', () => {
        expect(migration).toContain('cm.customer_id = p_customer_id');
        expect(migration).toContain("cm.status = 'approved'");
        expect(migration).toContain('and (p_meter_id is null or cm.meter_id = btrim(p_meter_id))');
    });

    it('labels data as sourced and protects the function from direct clients', () => {
        expect(migration).toContain('left join lateral');
        expect(migration).toContain('captured_at desc, reading_date desc');
        expect(migration).toContain('revoke all on function public.get_customer_meter_balances(uuid, text) from public, anon, authenticated');
        expect(migration).toContain('grant execute on function public.get_customer_meter_balances(uuid, text) to service_role');
    });

    it('exposes reported time without claiming a realtime balance', () => {
        expect(routes).toContain("fastify.get('/meters/balances', { preHandler: fastify.requireCustomer() }");
        expect(routes).toContain('getCustomerMeterBalances');
        expect(metersView).toContain('Last reported credit');
        expect(metersView).toContain('Reported {{ shortDate');
        expect(metersView).toContain('Refreshing…');
        expect(metersView.toLowerCase()).not.toContain('realtime balance');
    });
});
