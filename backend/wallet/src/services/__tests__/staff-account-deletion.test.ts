import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMutationRoutePolicy } from '../../contracts/route-policy.js';
import { StaffDeletionError, deleteStaffAccount } from '../staff-account-deletion.js';

const targetUserId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const deletionMigration = readFileSync(new URL('../../../../../supabase/migrations/20261013120000_staff_account_deletion_cascade.sql', import.meta.url), 'utf8');

const targetProfile = {
    auth_user_id: targetUserId,
    user_id: targetUserId,
    user_name: 'Ada Okonkwo',
    email: 'ada@acoblighting.com',
    role_key: 'operations-manager',
    station_id: 'TUNGA',
    station_ids: ['TUNGA'],
};

function query(result: { data?: unknown; error?: unknown }) {
    const chain: any = {
        select: vi.fn(() => chain),
        update: vi.fn(() => chain),
        or: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
        then: (resolve: any, reject: any) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject),
    };
    return chain;
}

describe('staff account deletion service', () => {
    const deleteUser = vi.fn();
    const writeAudit = vi.fn();
    let profiles: Record<string, ReturnType<typeof query>>;

    const client: any = {
        auth: { admin: { deleteUser } },
        from: vi.fn((table: string) => profiles[table]),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        profiles = {
            users: query({ data: targetProfile }),
        };
        deleteUser.mockResolvedValue({ error: null });
        writeAudit.mockResolvedValue(true);
    });

    it('registers the HTTP deletion endpoint as a non-cacheable mutation', () => {
        expect(resolveMutationRoutePolicy('DELETE', `/api/v1/admin/access/users/${targetUserId}`)).toMatchObject({
            method: 'DELETE',
            path: '/api/v1/admin/access/users/:userId',
            mutation: true,
            cacheable: false,
        });
    });

    it('cascades access records while preserving financial history without a deleted identity', () => {
        expect(deletionMigration).toContain('users_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade');
        expect(deletionMigration).toContain('oem_actor_installation_access_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade');
        expect(deletionMigration).toContain('oem_tenant_memberships_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete cascade');
        expect(deletionMigration).toContain('meter_purchase_orders_cancelled_by_fkey foreign key (cancelled_by) references auth.users(id) on delete set null');
        expect(deletionMigration).toContain('meter_purchase_orders_rejected_by_fkey foreign key (rejected_by) references auth.users(id) on delete set null');
    });

    it('refuses to delete the acting Super Admin before touching any account', async () => {
        await expect(deleteStaffAccount({ client, writeAudit, actorUserId: targetUserId, targetUserId }))
            .rejects.toMatchObject({ code: 'self_deletion_denied' });

        expect(client.from).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('requires a durable pre-deletion audit record before removing an account', async () => {
        writeAudit.mockResolvedValue(false);

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId }))
            .rejects.toMatchObject({ code: 'audit_unavailable' });

        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('rejects a staff profile that points to a different authentication account', async () => {
        profiles.users = query({ data: { ...targetProfile, auth_user_id: actorUserId } });

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId }))
            .rejects.toMatchObject({ code: 'staff_identity_mismatch' });

        expect(writeAudit).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('repairs a legacy profile link before hard deletion so the profile cascades too', async () => {
        const legacyProfile = { ...targetProfile, auth_user_id: null };
        const profileQuery = query({ data: legacyProfile });
        profiles.users = profileQuery;

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId })).resolves.toEqual({
            userId: targetUserId,
            deleted: true,
        });

        expect(profileQuery.update).toHaveBeenCalledWith({ auth_user_id: targetUserId });
        expect(profileQuery.eq).toHaveBeenCalledWith('user_id', targetUserId);
        expect(profileQuery.is).toHaveBeenCalledWith('auth_user_id', null);
        expect(deleteUser).toHaveBeenCalledWith(targetUserId, false);
    });

    it('does not delete auth when a legacy profile cannot be linked for cascading', async () => {
        const profileQuery = query({ data: { ...targetProfile, auth_user_id: null } });
        const linkQuery = query({ error: { message: 'profile link failed' } });
        profileQuery.update.mockReturnValue(linkQuery);
        profiles.users = profileQuery;

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId }))
            .rejects.toMatchObject({ code: 'staff_profile_link_failed' });

        expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'access.user.deletion_failed',
            metadata: { reason: 'profile link failed' },
        }));
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('protects the final Super Admin from deletion', async () => {
        const superAdmin = { ...targetProfile, role_key: 'super-admin' };
        const profileQuery = query({ data: superAdmin });
        const superAdminQuery: any = query({ data: [{ auth_user_id: targetUserId }] });
        client.from.mockImplementationOnce(() => profileQuery).mockImplementationOnce(() => superAdminQuery);

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId }))
            .rejects.toMatchObject({ code: 'last_super_admin_denied' });

        expect(writeAudit).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('hard-deletes the auth identity only after preserving an account snapshot in the audit trail', async () => {
        await expect(deleteStaffAccount({
            client,
            writeAudit,
            actorUserId,
            targetUserId,
            auditContext: { ip: '203.0.113.9', userAgent: 'Beverly test', correlationId: 'delete-test' },
        })).resolves.toEqual({
            userId: targetUserId,
            deleted: true,
        });

        expect(writeAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
            action: 'access.user.deletion_requested',
            targetType: 'staff_user',
            targetId: targetUserId,
            before: targetProfile,
            ip: '203.0.113.9',
            userAgent: 'Beverly test',
            correlationId: 'delete-test',
        }));
        expect(deleteUser).toHaveBeenCalledWith(targetUserId, false);
        expect(writeAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({
            action: 'access.user.deleted',
            targetType: 'staff_user',
            targetId: targetUserId,
        }));
    });

    it('surfaces a provider failure without claiming that the account was removed', async () => {
        deleteUser.mockResolvedValue({ error: { message: 'cannot delete user' } });

        await expect(deleteStaffAccount({ client, writeAudit, actorUserId, targetUserId }))
            .rejects.toEqual(new StaffDeletionError('staff_delete_failed', 'cannot delete user'));

        expect(writeAudit).toHaveBeenCalledTimes(2);
        expect(writeAudit).toHaveBeenLastCalledWith(expect.objectContaining({
            action: 'access.user.deletion_failed',
            targetId: targetUserId,
        }));
    });
});
