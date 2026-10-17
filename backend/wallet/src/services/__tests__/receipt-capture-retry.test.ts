import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ lookup: vi.fn(), insert: vi.fn(), inserted: vi.fn(), rpc: vi.fn(), eq: vi.fn() }));
vi.mock('../../db/supabase.js', () => ({ adminClient: {
    rpc: db.rpc,
    from: (table: string) => {
        if (table !== 'receipts') throw new Error(`Unexpected table: ${table}`);
        return {
            select: () => ({ eq: (column: string, value: string) => {
                db.eq(column, value);
                return { maybeSingle: db.lookup };
            } }),
            insert: (payload: unknown) => {
                db.insert(payload);
                return { select: () => ({ single: db.inserted }) };
            },
        };
    },
} }));

import { captureHold } from '../ledger.js';
import { createReceipt } from '../vending.js';

beforeEach(() => {
    vi.resetAllMocks();
    db.inserted.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate receipt number' } });
});

describe('capture error contract', () => {
    it.each([
        ['hold expired', 'hold_expired'], ['hold has expired', 'hold_expired'],
        ['hold not active', 'hold_inactive'], ['hold is not active', 'hold_inactive'],
        ['connection unavailable', 'capture_error'],
    ])('classifies %s without another posting attempt', async (message, code) => {
        db.rpc.mockResolvedValue({ data: null, error: { message } });
        await expect(captureHold({ holdId: 'hold', entryType: 'purchase_debit',
            idempotencyKey: 'operation', createdBy: 'actor' })).rejects.toMatchObject({ code, message });
        expect(db.rpc).toHaveBeenCalledTimes(1);
    });
});

describe('immutable receipt reuse', () => {
    const receipt = { id: 'receipt', receipt_number: 'BV-ORDER', payload: { amountMinor: 100 } };
    const input = { purchaseOrderId: 'order', payload: { amountMinor: 200 } };

    it('returns a newly inserted receipt normally', async () => {
        db.lookup.mockResolvedValue({ data: null, error: null });
        db.inserted.mockResolvedValue({ data: receipt, error: null });
        expect(await createReceipt(input)).toEqual(receipt);
        expect(db.lookup).toHaveBeenCalledTimes(1);
    });

    it('does not retry unrelated insertion failures', async () => {
        db.lookup.mockResolvedValue({ data: null, error: null });
        db.inserted.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failed' } });
        await expect(createReceipt(input)).rejects.toMatchObject({ code: 'receipt_failed' });
        expect(db.lookup).toHaveBeenCalledTimes(1);
    });

    it('returns an existing receipt without rewriting its historical payload', async () => {
        db.lookup.mockResolvedValue({ data: receipt, error: null });
        expect(await createReceipt(input)).toEqual(receipt);
        expect(db.insert).not.toHaveBeenCalled();
    });

    it('reuses the same-order winner after a concurrent unique conflict', async () => {
        db.lookup.mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({ data: receipt, error: null });
        expect(await createReceipt(input)).toEqual(receipt);
        expect(db.insert).toHaveBeenCalledTimes(1);
        expect(db.eq.mock.calls).toEqual([
            ['purchase_order_id', 'order'], ['purchase_order_id', 'order'],
        ]);
    });

    it('does not reuse a receipt belonging to another order', async () => {
        db.lookup.mockResolvedValue({ data: null, error: null });
        await expect(createReceipt(input)).rejects.toMatchObject({ code: 'receipt_failed' });
    });

    it('propagates lookup failure rather than guessing a winner', async () => {
        db.lookup.mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
        await expect(createReceipt(input)).rejects.toMatchObject({ code: 'receipt_lookup_failed' });
    });
});
