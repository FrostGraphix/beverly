import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isFlagEnabled: vi.fn(),
    isResendConfigured: vi.fn(),
    sendEmail: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: { STAFF_PORTAL_URL: 'https://example.com/wallet-admin/' } }));
vi.mock('../../db/supabase.js', () => ({ adminClient: { from: vi.fn() } }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: mocks.isFlagEnabled }));
vi.mock('../../adapters/resend.js', () => ({
    isResendConfigured: mocks.isResendConfigured,
    sendEmail: mocks.sendEmail,
    sendBatch: vi.fn(),
}));

import { notifyStaffInvitation, staffInvitationReadiness } from '../admin-notifications.js';

describe('staff invitation delivery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isFlagEnabled.mockResolvedValue(true);
        mocks.isResendConfigured.mockReturnValue(true);
        mocks.sendEmail.mockResolvedValue({ messageId: 'email-123' });
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
        })).resolves.toEqual({ status: 'sent', messageId: 'email-123' });

        expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'ada@acoblighting.com',
            tag: 'staff-invitation',
            html: expect.stringContaining('https://example.com/wallet-admin/'),
        }));
    });

    it('never claims delivery after a provider error', async () => {
        mocks.sendEmail.mockRejectedValue(new Error('provider unavailable'));
        await expect(notifyStaffInvitation({
            email: 'ada@acoblighting.com',
            fullName: 'Ada Okonkwo',
            temporaryPassword: 'Beverly-test-A1!',
            roleLabel: 'Operations Manager',
        })).resolves.toEqual({ status: 'not_sent', reason: 'provider_error' });
    });
});
