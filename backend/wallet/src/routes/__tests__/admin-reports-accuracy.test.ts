import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/supabase.js', () => ({ adminClient: {} }));

import { reportTestUtils } from '../admin-reports.js';

const at = (day: number) => `2026-09-0${day}T12:00:00.000Z`;

function fixture() {
    return {
        purchases: [
            { status: 'delivered', amount_minor: 1000, energy_amount_minor: 930, vat_amount_minor: 70, units_kwh: 2, actor_type: 'vendor', station_id: 'TUNGA', created_at: at(1) },
            { status: 'failed', amount_minor: 2000, energy_amount_minor: 1860, vat_amount_minor: 140, units_kwh: 4, actor_type: 'vendor', station_id: 'TUNGA', created_at: at(1) },
            { status: 'created', amount_minor: 3000, energy_amount_minor: 2790, vat_amount_minor: 210, units_kwh: 6, actor_type: 'customer', station_id: 'UMAISHA', created_at: at(1) },
        ],
        funding: [{ amount_minor: 5000, created_at: at(1) }],
        fundingRequests: [
            { amount_minor: 5000, channel: 'bank_transfer', status: 'approved', created_at: at(1) },
            { amount_minor: 9000, channel: 'bank_transfer', status: 'rejected', created_at: at(1) },
        ],
        refunds: [
            { amount_minor: 1000, approved_amount_minor: 500, status: 'approved', created_at: at(1) },
            { amount_minor: 700, status: 'pending', created_at: at(1) },
        ],
        disputes: [{ status: 'open', created_at: at(1) }],
        newCustomers: [],
        newVendors: [],
        settlements: [
            { status: 'settled', gross_amount_minor: 1000, fee_minor: 100, net_amount_minor: 900 },
            { status: 'pending', gross_amount_minor: 2000, fee_minor: 200, net_amount_minor: 1800 },
        ],
        auditLogs: [],
        securityEvents: [],
        ledgerEntries: [],
        activeHolds: [],
        reconciliationRuns: [
            { status: 'ok', mismatch_minor: 0 },
            { status: 'mismatch', mismatch_minor: 10 },
            { status: 'failed', mismatch_minor: 999 },
        ],
        entityPerformance: [],
    };
}

describe('admin report calculations', () => {
    it('counts every selected transaction daily', () => {
        const report = reportTestUtils.buildReport(at(1), '2026-09-01T23:59:59.999Z', 1, 'all', fixture());
        expect(report.kpis.purchaseCount).toBe(3);
        expect(report.series.daily[0].purchaseCount).toBe(3);
        expect(report.kpis.deliveredCount).toBe(1);
        expect(report.kpis.failedCount).toBe(1);
        expect(report.kpis.successRate).toBe(50);
    });

    it('uses delivered financial values', () => {
        const report = reportTestUtils.buildReport(at(1), '2026-09-01T23:59:59.999Z', 1, 'all', fixture());
        expect(report.kpis.revenueMinor).toBe(1000);
        expect(report.kpis.energyRevenueMinor).toBe(930);
        expect(report.kpis.vatMinor).toBe(70);
        expect(report.kpis.unitsKwh).toBe(2);
    });

    it('uses actual approved refunds', () => {
        const report = reportTestUtils.buildReport(at(1), '2026-09-01T23:59:59.999Z', 1, 'all', fixture());
        expect(report.kpis.refundApprovedMinor).toBe(500);
        expect(report.series.daily[0].refundMinor).toBe(500);
    });

    it('excludes unsettled settlement values', () => {
        const report = reportTestUtils.buildReport(at(1), '2026-09-01T23:59:59.999Z', 1, 'all', fixture());
        expect(report.kpis.settlementGrossMinor).toBe(1000);
        expect(report.kpis.settlementNetMinor).toBe(900);
        expect(report.kpis.feeMinor).toBe(100);
        expect(report.kpis.settlementBatches).toBe(1);
    });

    it('counts only mismatch runs', () => {
        const report = reportTestUtils.buildReport(at(1), '2026-09-01T23:59:59.999Z', 1, 'all', fixture());
        expect(report.kpis.reconciliationMismatches).toBe(1);
        expect(report.kpis.reconciliationMismatchMinor).toBe(10);
    });
});
