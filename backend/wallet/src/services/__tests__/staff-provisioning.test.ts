import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const deleteUser = vi.fn();
const generateLink = vi.fn();
const signOut = vi.fn();
const notifyStaffInvitation = vi.fn();
const staffInvitationReadiness = vi.fn();
const logAction = vi.fn();
const upsertProfile = vi.fn();
const deleteProfile = vi.fn();
let profileToRead: any = null;

vi.mock('../../config/env.js', () => ({ env: { STAFF_PORTAL_URL: 'https://staff.example.test' } }));
vi.mock('../temporary-password.js', () => ({ generateTemporaryPassword: () => 'Generated-Password-123!' }));
vi.mock('../audit.js', () => ({ logAction }));
vi.mock('../admin-notifications.js', () => ({ notifyStaffInvitation, staffInvitationReadiness }));
vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { admin: { createUser, deleteUser, generateLink, signOut } },
        from: (table: string) => {
            if (table === 'roles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role_key: 'account', role_name: 'Account' }, error: null }) }) }) };
            if (table === 'permissions') return { select: () => ({ eq: async () => ({ data: [{ route_hash: 'wallet.dashboard.view' }], error: null }) }) };
            if (table === 'users') return {
                upsert: upsertProfile,
                select: () => ({ or: () => ({ maybeSingle: async () => ({ data: profileToRead, error: null }) }) }),
                delete: () => ({ eq: deleteProfile, or: deleteProfile }),
            };
            throw new Error(`Unexpected table ${table}`);
        },
    },
}));

describe('staff provisioning pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        staffInvitationReadiness.mockResolvedValue({ ready: true });
        createUser.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null });
        upsertProfile.mockResolvedValue({ error: null });
        generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://verify.example.test' } }, error: null });
        notifyStaffInvitation.mockResolvedValue({ status: 'sent', messageId: 'message-1' });
        deleteProfile.mockResolvedValue({ error: null });
        deleteUser.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
        logAction.mockResolvedValue(undefined);
        profileToRead = null;
    });

    it('normalizes once and completes auth, profile, verification, invitation, and audit', async () => {
        const { provisionStaff } = await import('../staff-provisioning.js');
        const result = await provisionStaff({
            email: ' ADA@ACOBLIGHTING.COM ', fullName: ' Ada Lovelace ', roleKey: 'account', stationIds: [' station-1 ', 'station-1'], allStations: false,
        }, { userId: 'admin-1', role: 'super-admin' }, { error: vi.fn() });

        expect(result).toMatchObject({ ok: true, userId: 'staff-1', temporaryPassword: 'Generated-Password-123!' });
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@acoblighting.com', user_metadata: expect.objectContaining({ full_name: 'Ada Lovelace', station_ids: ['STATION-1'] }) }));
        expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@acoblighting.com', user_name: 'Ada Lovelace', station_ids: ['STATION-1'] }), { onConflict: 'user_id' });
        expect(notifyStaffInvitation).toHaveBeenCalledOnce();
        expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.user.create', targetId: 'staff-1' }));
    });

    it('removes both records when verification-link generation fails', async () => {
        generateLink.mockResolvedValue({ data: null, error: new Error('provider failed') });
        const { provisionStaff, StaffProvisioningError } = await import('../staff-provisioning.js');

        await expect(provisionStaff({
            email: 'ada@acoblighting.com', fullName: 'Ada Lovelace', roleKey: 'account', stationIds: ['station-1'], allStations: false,
        }, { userId: 'admin-1' }, { error: vi.fn() })).rejects.toMatchObject<Partial<InstanceType<typeof StaffProvisioningError>>>({ code: 'staff_verification_link_failed', statusCode: 502 });
        expect(deleteProfile).toHaveBeenCalledWith('user_id', 'staff-1');
        expect(deleteUser).toHaveBeenCalledWith('staff-1');
        expect(notifyStaffInvitation).not.toHaveBeenCalled();
    });

    it('deletes the profile, sessions, and auth identity before reporting success', async () => {
        profileToRead = { id: 'profile-1', auth_user_id: 'staff-1', email: 'ada@acoblighting.com', role_key: 'account' };
        const { deleteStaff } = await import('../staff-provisioning.js');

        await expect(deleteStaff('staff-1', { userId: 'admin-1', role: 'super-admin' }, { error: vi.fn() }))
            .resolves.toEqual({ ok: true, userId: 'staff-1' });
        expect(deleteProfile).toHaveBeenCalledWith('auth_user_id.eq.staff-1,user_id.eq.staff-1');
        expect(signOut).toHaveBeenCalledWith('staff-1', 'global');
        expect(deleteUser).toHaveBeenCalledWith('staff-1', true);
        expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.user.deleted', targetId: 'staff-1' }));
    });
});
