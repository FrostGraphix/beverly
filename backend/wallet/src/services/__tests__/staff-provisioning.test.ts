import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const deleteUser = vi.fn();
const generateLink = vi.fn();
const signOut = vi.fn();
const getUserById = vi.fn();
const updateUserById = vi.fn();
const notifyStaffInvitation = vi.fn();
const staffInvitationReadiness = vi.fn();
const notifyRoleAssignment = vi.fn();
const notifyStationAssignment = vi.fn();
const notifyStaffAccountChange = vi.fn();
const logAction = vi.fn();
const upsertProfile = vi.fn();
const deleteProfile = vi.fn();
const updateProfile = vi.fn();
let profileToRead: any = null;

vi.mock('../../config/env.js', () => ({ env: { STAFF_PORTAL_URL: 'https://staff.example.test' } }));
vi.mock('../audit.js', () => ({ logAction }));
vi.mock('../admin-notifications.js', () => ({ notifyStaffInvitation, staffInvitationReadiness, notifyRoleAssignment, notifyStationAssignment, notifyStaffAccountChange }));
vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { admin: { createUser, deleteUser, generateLink, signOut, getUserById, updateUserById } },
        from: (table: string) => {
            if (table === 'roles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role_key: 'account', role_name: 'Account' }, error: null }) }) }) };
            if (table === 'permissions') return { select: () => ({ eq: async () => ({ data: [{ route_hash: 'wallet.dashboard.view' }], error: null }) }) };
            if (table === 'users') return {
                upsert: upsertProfile,
                select: () => ({ or: () => ({ maybeSingle: async () => ({ data: profileToRead, error: null }) }) }),
                update: updateProfile,
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
        notifyRoleAssignment.mockResolvedValue(undefined);
        notifyStationAssignment.mockResolvedValue(undefined);
        notifyStaffAccountChange.mockResolvedValue(undefined);
        deleteProfile.mockResolvedValue({ error: null });
        deleteUser.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
        getUserById.mockResolvedValue({ data: { user: { id: 'staff-1', user_metadata: {} } }, error: null });
        updateUserById.mockResolvedValue({ error: null });
        updateProfile.mockImplementation(() => ({ or: async () => ({ error: null }) }));
        logAction.mockResolvedValue(undefined);
        profileToRead = null;
    });

    it('normalizes once and completes auth, profile, verification, invitation, and audit', async () => {
        const { provisionStaff } = await import('../staff-provisioning.js');
        const result = await provisionStaff({
            email: ' ADA@ACOBLIGHTING.COM ', fullName: ' Ada Lovelace ', roleKey: 'account', stationIds: [' station-1 ', 'station-1'], allStations: false,
        }, { userId: 'admin-1', role: 'super-admin' }, { error: vi.fn() });

        expect(result).toMatchObject({ ok: true, userId: 'staff-1' });
        expect(result).not.toHaveProperty('temporaryPassword');
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@acoblighting.com', email_confirm: true, user_metadata: expect.objectContaining({ full_name: 'Ada Lovelace', station_ids: ['STATION-1'] }) }));
        expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'recovery' }));
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

    it('saves role and station scope through one update pipeline', async () => {
        profileToRead = { email: 'ada@acoblighting.com', user_name: 'Ada', role_key: 'account', station_id: 'TUNGA', station_ids: ['TUNGA'] };
        const { updateStaff } = await import('../staff-provisioning.js');

        await expect(updateStaff('staff-1', {
            roleKey: 'super-admin', stationIds: [], allStations: true,
        }, { userId: 'admin-1', role: 'super-admin' }, { error: vi.fn() })).resolves.toMatchObject({
            ok: true, roleKey: 'super-admin', stationIds: ['*'], allStations: true,
        });
        expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ role_key: 'super-admin', station_id: null, station_ids: ['*'] }));
        expect(updateUserById).toHaveBeenCalledWith('staff-1', expect.objectContaining({ user_metadata: expect.objectContaining({ role_key: 'super-admin', station_ids: ['*'], all_stations: true }) }));
    });
});
