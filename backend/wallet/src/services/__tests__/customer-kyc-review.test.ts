import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../../db/supabase.js', () => ({ adminClient: { rpc } }));

const validInput = {
    customerId: 'customer-1', actorUserId: 'user-1', full_name: 'Ada Beverly',
    date_of_birth: '1990-01-01', address: '1 Beverly Street', state: 'Lagos', lga: 'Ikeja',
};

describe('customer Tier 0 basic information', () => {
    beforeEach(() => {
        rpc.mockReset();
        rpc.mockResolvedValue({ data: { completed_at: '2026-09-09T00:00:00Z' }, error: null });
    });

    it('saves basic information without requesting approval', async () => {
        const { saveCustomerBasicInfo } = await import('../customer-kyc.js');
        await expect(saveCustomerBasicInfo(validInput)).resolves.toEqual({ completedAt: '2026-09-09T00:00:00Z' });
        expect(rpc).toHaveBeenCalledWith('save_customer_kyc_basic_info', expect.objectContaining({
            p_customer_id: 'customer-1', p_actor_user_id: 'user-1',
        }));
        expect(rpc).not.toHaveBeenCalledWith('submit_kyc_evidence_review', expect.anything());
    });

    it('rejects incomplete names before storage', async () => {
        const { saveCustomerBasicInfo } = await import('../customer-kyc.js');
        await expect(saveCustomerBasicInfo({ ...validInput, full_name: 'Ada' })).rejects.toMatchObject({ code: 'invalid_name' });
        expect(rpc).not.toHaveBeenCalled();
    });
});
