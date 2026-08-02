import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/supabase.js', () => ({ adminClient: {} }));

import { buildVendorAnalytics } from '../vendor-analytics.js';

describe('vendor analytics', () => {
    it('builds scoped totals and rankings', () => {
        const result = buildVendorAnalytics({
            period: '30d',
            vendors: [
                { id: 'v1', legal_name: 'Alpha', trading_name: null, status: 'approved', risk_level: 'low' },
                { id: 'v2', legal_name: 'Beta', trading_name: null, status: 'suspended', risk_level: 'high' },
            ],
            orders: [
                { actor_id: 'v1', station_id: 'TUNGA', amount_minor: 20_000, created_at: '2026-08-01T10:00:00Z' },
                { actor_id: 'v1', station_id: 'TUNGA', amount_minor: 30_000, created_at: '2026-08-02T10:00:00Z' },
                { actor_id: 'v2', station_id: 'MUSHA', amount_minor: 10_000, created_at: '2026-08-01T11:00:00Z' },
            ],
            funding: [
                { actor_id: 'v1', amount_minor: 75_000 },
                { actor_id: 'v2', amount_minor: 25_000 },
            ],
            wallets: [
                { id: 'w1', owner_id: 'v1' },
                { id: 'w2', owner_id: 'v2' },
            ],
            balances: [
                { wallet_id: 'w1', ledger_balance_minor: 40_000 },
                { wallet_id: 'w2', ledger_balance_minor: 10_000 },
            ],
        });

        expect(result.summary).toMatchObject({
            total: 2,
            active: 1,
            suspended: 1,
            total_vended_minor: 60_000,
            total_funded_minor: 100_000,
            avg_wallet_minor: 40_000,
            total_transactions: 3,
        });
        expect(result.leaderboard.map((vendor) => vendor.id)).toEqual(['v1', 'v2']);
        expect(result.leaderboard[0]).toMatchObject({ rank: 1, vend_count: 2, avg_tx_minor: 25_000 });
        expect(result.top_stations[0]).toMatchObject({ station_id: 'TUNGA', vendor_count: 1, vend_volume_minor: 50_000 });
    });
});
