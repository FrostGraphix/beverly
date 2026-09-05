import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isFlagEnabled: vi.fn(),
    isResendConfigured: vi.fn(),
    sendEmail: vi.fn(),
    sendBatch: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: { STAFF_PORTAL_URL: 'https://example.com/wallet-admin/' } }));
vi.mock('../../db/supabase.js', () => ({ adminClient: { from: vi.fn() } }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: mocks.isFlagEnabled }));
vi.mock('../../adapters/resend.js', () => ({
    isResendConfigured: mocks.isResendConfigured,
    sendEmail: mocks.sendEmail,
    sendBatch: mocks.sendBatch,
}));

import { notifyStaffInvitation, staffInvitationReadiness } from '../admin-notifications.js';

describe('staff invitation delivery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isFlagEnabled.mockResolvedValue(true);
        mocks.isResendConfigured.mockReturnValue(true);
        mocks.sendEmail.mockResolvedValue({ messageId: 'email-123' });
        mocks.sendBatch.mockResolvedValue([{ messageId: 'verify-123' }, { messageId: 'welcome-123' }]);
    });

    it('blocks account creation preflight when delivery is disabled', async () => {
        mocks.isFlagEnabled.mockResolvedValue(false);
        await expect(staffInvitationReadiness()).resolves.toEqual({ ready: false, reason: 'disabled' });
    });

    it('reports a provider-confirmed invitation with the admin portal link', async () => {
        await expect(notifyStaffInvitation({
            email: 'ada@acoblighting.com',
            fullName: 'Ada Okonkwo',
            temporaryPassword: 'Beverly-test-A1!',
            roleLabel: 'Operations Manager',
            verificationUrl: 'https://example.com/verify',
            permissionLabels: ['Monitor vending activity'],
            stationScope: 'All current and future stations',
            idempotencyKey: 'staff-invite-user-1',
        })).resolves.toEqual({ status: 'sent', messageId: 'verify-123', messageIds: ['verify-123', 'welcome-123'] });

        expect(mocks.sendBatch).toHaveBeenCalledWith([
            expect.objectContaining({ to: 'ada@acoblighting.com', tag: 'staff-verification', html: expect.stringContaining('https://example.com/verify') }),
            expect.objectContaining({ to: 'ada@acoblighting.com', tag: 'staff-welcome', html: expect.stringContaining('https://example.com/wallet-admin/') }),
        ], 'staff-invite-user-1');
    });

    it('never claims delivery after a provider error', async () => {
        mocks.sendBatch.mockRejectedValue(new Error('provider unavailable'));
        await expect(notifyStaffInvitation({
            email: 'ada@acoblighting.com',
            fullName: 'Ada Okonkwo',
            temporaryPassword: 'Beverly-test-A1!',
            roleLabel: 'Operations Manager',
            verificationUrl: 'https://example.com/verify',
            permissionLabels: [],
            stationScope: 'TUNGA',
            idempotencyKey: 'staff-invite-user-2',
        })).resolves.toEqual({ status: 'not_sent', reason: 'provider_error' });
    });
});
