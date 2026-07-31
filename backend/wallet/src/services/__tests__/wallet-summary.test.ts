import { describe, it, expect } from 'vitest';
import {
    scopeWalletsToStations,
    summarizeWallets,
    startOfBusinessDay,
    sumMinor,
    type WalletRow,
    type WalletBalanceRow,
} from '../wallet-summary.js';

const wallets: WalletRow[] = [
    { id: 'w-vendor-a', owner_type: 'vendor', owner_id: 'vendor-a', status: 'active' },
    { id: 'w-vendor-b', owner_type: 'vendor', owner_id: 'vendor-b', status: 'frozen' },
    { id: 'w-cust-a', owner_type: 'customer', owner_id: 'cust-a', status: 'active' },
    { id: 'w-cust-b', owner_type: 'customer', owner_id: 'cust-b', status: 'closed' },
];

const balances = new Map<string, WalletBalanceRow>([
    ['w-vendor-a', { wallet_id: 'w-vendor-a', ledger_balance_minor: 500_00, active_holds_minor: 100_00 }],
    ['w-vendor-b', { wallet_id: 'w-vendor-b', ledger_balance_minor: 250_00, active_holds_minor: 0 }],
    ['w-cust-a', { wallet_id: 'w-cust-a', ledger_balance_minor: 75_00, active_holds_minor: 25_00 }],
    // w-cust-b intentionally absent — a wallet with no ledger rows yet.
]);

describe('scopeWalletsToStations', () => {
    it('returns every wallet when the actor is estate-wide (super-admin)', () => {
        expect(scopeWalletsToStations(wallets, null)).toHaveLength(4);
    });

    it('keeps only wallets owned by parties at the assigned stations', () => {
        const scoped = scopeWalletsToStations(wallets, {
            vendors: new Set(['vendor-a']),
            customers: new Set(['cust-a']),
        });
        expect(scoped.map((w) => w.id)).toEqual(['w-vendor-a', 'w-cust-a']);
    });

    it('regression: scoping needs owner_id — a row missing it must not silently drop out', () => {
        // The summary handler previously selected `id, owner_type, status` and
        // then filtered on owner_id. Every comparison was against undefined, so
        // a station-scoped admin saw an empty wallet set and a zero float.
        const withoutOwnerId = wallets.map(({ owner_id: _ignored, ...rest }) => rest) as unknown as WalletRow[];
        const scoped = scopeWalletsToStations(withoutOwnerId, {
            vendors: new Set(['vendor-a']),
            customers: new Set(['cust-a']),
        });
        expect(scoped).toHaveLength(0);

        // With the column present the same actor sees their wallets.
        const correct = scopeWalletsToStations(wallets, {
            vendors: new Set(['vendor-a']),
            customers: new Set(['cust-a']),
        });
        expect(correct.length).toBeGreaterThan(0);
    });

    it('matches customers by the customer set, never the vendor set', () => {
        const scoped = scopeWalletsToStations(wallets, {
            vendors: new Set(['cust-a']),
            customers: new Set(),
        });
        expect(scoped).toHaveLength(0);
    });
});

describe('summarizeWallets', () => {
    it('totals ledger balances and holds across the scoped set', () => {
        const summary = summarizeWallets(wallets, balances);
        expect(summary.walletCount).toBe(4);
        expect(summary.totalFloatMinor).toBe(825_00);
        expect(summary.totalBalanceMinor).toBe(summary.totalFloatMinor);
        expect(summary.totalHoldsMinor).toBe(125_00);
    });

    it('splits float by owner type', () => {
        const summary = summarizeWallets(wallets, balances);
        expect(summary.vendorFloatMinor).toBe(750_00);
        expect(summary.customerFloatMinor).toBe(75_00);
    });

    it('counts wallets by status and exposes the dashboard aliases', () => {
        const summary = summarizeWallets(wallets, balances);
        expect(summary.byStatus).toEqual({ active: 2, frozen: 1, closed: 1 });
        expect(summary.activeWallets).toBe(2);
        expect(summary.suspendedWallets).toBe(1);
        expect(summary.closedWallets).toBe(1);
    });

    it('treats a wallet with no balance row as zero rather than NaN', () => {
        const summary = summarizeWallets(wallets, balances);
        expect(Number.isNaN(summary.totalFloatMinor)).toBe(false);
        expect(summary.byOwnerType).toEqual({ vendor: 2, customer: 2 });
    });

    it('coerces string numerics (bigint columns arrive as strings)', () => {
        const stringy = new Map<string, WalletBalanceRow>([
            ['w-vendor-a', { wallet_id: 'w-vendor-a', ledger_balance_minor: '1000', active_holds_minor: '250' }],
        ]);
        const summary = summarizeWallets([wallets[0]], stringy);
        expect(summary.totalFloatMinor).toBe(1000);
        expect(summary.totalHoldsMinor).toBe(250);
    });

    it('returns zeroes for an empty scope without throwing', () => {
        const summary = summarizeWallets([], balances);
        expect(summary).toMatchObject({ walletCount: 0, totalFloatMinor: 0, activeWallets: 0 });
    });
});

describe('startOfBusinessDay', () => {
    it('is the same instant regardless of the process timezone', () => {
        const at = new Date('2026-07-28T09:30:00Z');
        const original = process.env.TZ;
        try {
            process.env.TZ = 'UTC';
            const utc = startOfBusinessDay(at).toISOString();
            process.env.TZ = 'America/New_York';
            const newYork = startOfBusinessDay(at).toISOString();
            process.env.TZ = 'Asia/Tokyo';
            const tokyo = startOfBusinessDay(at).toISOString();
            expect(utc).toBe(newYork);
            expect(utc).toBe(tokyo);
        } finally {
            process.env.TZ = original;
        }
    });

    it('resolves to Lagos midnight (23:00Z the previous day)', () => {
        expect(startOfBusinessDay(new Date('2026-07-28T09:30:00Z')).toISOString())
            .toBe('2026-07-27T23:00:00.000Z');
    });

    it('rolls to the next business day once Lagos passes midnight', () => {
        // 23:30Z on the 27th is 00:30 on the 28th in Lagos.
        expect(startOfBusinessDay(new Date('2026-07-27T23:30:00Z')).toISOString())
            .toBe('2026-07-27T23:00:00.000Z');
        // 22:30Z on the 27th is still the 27th in Lagos.
        expect(startOfBusinessDay(new Date('2026-07-27T22:30:00Z')).toISOString())
            .toBe('2026-07-26T23:00:00.000Z');
    });
});

describe('sumMinor', () => {
    it('sums numeric and string amounts', () => {
        expect(sumMinor([{ amount_minor: 100 }, { amount_minor: '250' }])).toBe(350);
    });

    it('treats null and missing amounts as zero', () => {
        expect(sumMinor([{ amount_minor: null }, {}, { amount_minor: 5 }])).toBe(5);
    });

    it('is zero for an empty set', () => {
        expect(sumMinor([])).toBe(0);
    });
});
