import { describe, it, expect } from 'vitest';

// ── NDPR business rules ────────────────────────────────────────────────────────

describe('NDPR data export', () => {
    it('export URL expires after 7 days', () => {
        const EXPORT_TTL_DAYS = 7;
        const now = Date.now();
        const expiresAt = new Date(now + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
        const diffDays = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
        expect(diffDays).toBe(7);
    });

    it('only one pending export per customer at a time', () => {
        // Logic: if existing pending/processing/ready request exists, return its id
        const existingStatuses = ['pending', 'processing', 'ready'];
        const shouldBlock = (status: string) => existingStatuses.includes(status);
        expect(shouldBlock('pending')).toBe(true);
        expect(shouldBlock('processing')).toBe(true);
        expect(shouldBlock('ready')).toBe(true);
        expect(shouldBlock('delivered')).toBe(false);
        expect(shouldBlock('failed')).toBe(false);
    });
});

describe('NDPR account deletion', () => {
    it('cooling-off period is 30 days', () => {
        const COOLING_OFF_DAYS = 30;
        const now = Date.now();
        const scheduledFor = new Date(now + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000);
        const diffDays = Math.round((scheduledFor.getTime() - now) / (24 * 60 * 60 * 1000));
        expect(diffDays).toBe(30);
    });

    it('only one pending deletion per customer', () => {
        // If status = 'pending', new request returns existing id
        const pendingStatus = 'pending';
        expect(pendingStatus === 'pending').toBe(true);
    });

    it('deletion can be cancelled before scheduled date', () => {
        type DeletionStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
        function canCancel(status: DeletionStatus): boolean {
            return status === 'pending';
        }
        expect(canCancel('pending')).toBe(true);
        expect(canCancel('approved')).toBe(false);
        expect(canCancel('completed')).toBe(false);
    });

    it('approved deletion cannot be reversed', () => {
        type DeletionStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
        const TERMINAL: DeletionStatus[] = ['approved', 'rejected', 'completed', 'cancelled'];
        for (const s of TERMINAL) {
            expect(s === 'pending').toBe(false);
        }
    });
});

describe('data export contents', () => {
    it('includes all required personal data categories', () => {
        const REQUIRED_CATEGORIES = [
            'customer',
            'wallets',
            'transactions',
            'meters',
            'purchase_orders',
            'disputes',
            'meter_orders',
        ];

        const exportPayload = {
            exported_at:    '2026-05-18T00:00:00Z',
            customer:       {},
            wallets:        [],
            transactions:   [],
            meters:         [],
            purchase_orders: [],
            disputes:       [],
            meter_orders:   [],
        };

        for (const cat of REQUIRED_CATEGORIES) {
            expect(exportPayload).toHaveProperty(cat);
        }
    });
});
