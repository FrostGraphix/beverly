import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUserById = vi.fn();
const signOut = vi.fn();
const generateLink = vi.fn();
const sendEmail = vi.fn();
const vendorUpdates: Array<Record<string, unknown>> = [];

class Query {
    private operation = 'select';
    private payload: Record<string, unknown> | undefined;
    constructor(private table: string) {}
    select() { return this; }
    update(payload: Record<string, unknown>) {
        this.operation = 'update';
        this.payload = payload;
        if (this.table === 'vendor_users') vendorUpdates.push(payload);
        return this;
    }
    eq() { return this; }
    limit() { return this; }
    maybeSingle() {
        if (this.table === 'vendor_organizations') {
            return Promise.resolve({ data: { id: 'org-1', legal_name: 'Example Energy', status: 'approved' }, error: null });
        }
        if (this.table === 'vendor_users') {
            return Promise.resolve({
                data: {
                    id: 'vendor-user-1',
                    auth_user_id: 'auth-user-1',
                    email: 'owner@example.test',
                    full_name: 'Ada Vendor',
                    password_reset_required: true,
                    password_changed_at: null,
                    password_session_id: null,
                },
                error: null,
            });
        }
        return Promise.resolve({ data: null, error: null });
    }
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        auth: { admin: { updateUserById, signOut, generateLink } },
    },
}));
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));
vi.mock('../../config/env.js', () => ({ env: { VENDOR_PORTAL_URL: 'https://vendor.example.test' } }));
vi.mock('../../emails/templates.js', () => ({
    vendorOnboardingEmail: vi.fn(() => ({ subject: 'Invite', html: '<p>Invite</p>', text: 'Invite' })),
}));
vi.mock('../wallets.js', () => ({
    getOrCreateWallet: vi.fn(),
    setOwnerWalletStatus: vi.fn(),
    WalletStateError: class extends Error {},
}));
vi.mock('../audit.js', () => ({
    logAction: vi.fn(async () => undefined),
    logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: vi.fn(async () => true) }));

describe('vendor invitation resend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vendorUpdates.splice(0);
        updateUserById.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
        generateLink.mockResolvedValue({
            data: { properties: { action_link: 'https://example.test/verify' } },
            error: null,
        });
        sendEmail.mockResolvedValue({ messageId: 'email-1' });
    });

    it('returns the active temporary password when delivery fails', async () => {
        sendEmail.mockRejectedValue(new Error('provider unavailable'));
        const { resendVendorInvitation } = await import('../vendor-onboarding.js');

        const result = await resendVendorInvitation('org-1');

        expect(result.temporaryPassword).toEqual(expect.any(String));
        expect(result.invitationDelivery).toMatchObject({ status: 'failed', reason: 'provider unavailable' });
        expect(vendorUpdates).toContainEqual(expect.objectContaining({ invitation_status: 'failed' }));
    });

    it('does not rotate credentials when link generation fails', async () => {
        generateLink.mockResolvedValue({ data: null, error: { message: 'link unavailable' } });
        const { resendVendorInvitation } = await import('../vendor-onboarding.js');

        await expect(resendVendorInvitation('org-1')).rejects.toMatchObject({ code: 'verification_link_failed' });

        expect(updateUserById).not.toHaveBeenCalled();
    });

    it('blocks old sessions before rotating invitation credentials', async () => {
        signOut.mockResolvedValue({ error: { message: 'revocation unavailable' } });
        const { resendVendorInvitation } = await import('../vendor-onboarding.js');

        await expect(resendVendorInvitation('org-1')).resolves.toMatchObject({
            invitationDelivery: { status: 'sent' },
        });

        expect(vendorUpdates[0]).toMatchObject({
            password_reset_required: true,
            password_changed_at: expect.any(String),
            password_session_id: expect.stringMatching(/^invitation:/),
        });
        expect(updateUserById.mock.invocationCallOrder[0]).toBeGreaterThan(generateLink.mock.invocationCallOrder[0]);
    });
});
