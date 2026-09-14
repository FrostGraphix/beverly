import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, sendWebPush } = vi.hoisted(() => ({ from: vi.fn(), sendWebPush: vi.fn() }));
vi.mock('../../db/supabase.js', () => ({ adminClient: { from } }));
vi.mock('../push-notifications.js', () => ({ sendWebPush }));

import { notifyVendor } from '../vendor-notifications.js';

const input = {
    vendorOrganizationId: '11111111-1111-4111-8111-111111111111',
    type: 'funding_update', title: 'Funding approved', body: 'Wallet credited.',
    path: '/wallet/funding', dedupeKey: 'funding.approved.1',
};

describe('vendor device notification', () => {
    beforeEach(() => { from.mockReset(); sendWebPush.mockReset(); });

    it('pushes after a newly inserted inbox row', async () => {
        const query = { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'notification-1' }, error: null }) };
        from.mockReturnValue(query);
        sendWebPush.mockResolvedValue({ sent: 1, failed: 0 });
        await expect(notifyVendor(input)).resolves.toBe(true);
        expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ recipient_type: 'vendor', recipient_id: input.vendorOrganizationId, dedupe_key: input.dedupeKey }), expect.objectContaining({ ignoreDuplicates: true }));
        expect(sendWebPush).toHaveBeenCalledWith('vendor', input.vendorOrganizationId, expect.objectContaining({ url: input.path }), 'vendor');
    });

    it('never pushes a duplicate', async () => {
        const query = { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
        from.mockReturnValue(query);
        await expect(notifyVendor(input)).resolves.toBe(false);
        expect(sendWebPush).not.toHaveBeenCalled();
    });

    it('never pushes a failed inbox write', async () => {
        const query = { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('database unavailable') }) };
        from.mockReturnValue(query);
        await expect(notifyVendor(input)).rejects.toThrow('database unavailable');
        expect(sendWebPush).not.toHaveBeenCalled();
    });
});
