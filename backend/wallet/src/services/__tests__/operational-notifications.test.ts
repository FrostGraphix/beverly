import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, sendWebPush } = vi.hoisted(() => ({
    from: vi.fn(),
    sendWebPush: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({ adminClient: { from } }));
vi.mock('../push-notifications.js', () => ({ sendWebPush }));

import { eligibleStaffRecipients, notifyOperationalStaff } from '../operational-notifications.js';

const superAdmin = '11111111-1111-4111-8111-111111111111';
const stationStaff = '22222222-2222-4222-8222-222222222222';
const otherStaff = '33333333-3333-4333-8333-333333333333';

describe('operational staff notifications', () => {
    beforeEach(() => {
        from.mockReset();
        sendWebPush.mockReset();
    });

    it('keeps super admins and matching station staff', () => {
        expect(eligibleStaffRecipients([
            { auth_user_id: superAdmin, role_key: 'super-admin' },
            { auth_user_id: stationStaff, role_key: 'operations-manager', station_ids: ['KYAKALE'] },
            { auth_user_id: otherStaff, role_key: 'operations-manager', station_ids: ['TUNGA'] },
            { auth_user_id: 'not-a-uuid', role_key: 'operations-manager', station_ids: ['KYAKALE'] },
        ], ['KYAKALE'])).toEqual([superAdmin, stationStaff]);
    });

    it('pushes only newly inserted rows', async () => {
        const permissionQuery = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role_key: 'operations-manager' }], error: null }),
        };
        const userQuery = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
                data: [{ auth_user_id: stationStaff, role_key: 'operations-manager', station_ids: ['KYAKALE'] }],
                error: null,
            }),
        };
        const notificationQuery = {
            upsert: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ recipient_id: stationStaff }], error: null }),
        };
        from.mockImplementation((table: string) => ({
            permissions: permissionQuery,
            users: userQuery,
            notifications: notificationQuery,
        }[table]));
        sendWebPush.mockResolvedValue({ sent: 1, failed: 0 });

        await expect(notifyOperationalStaff({
            permission: 'wallet.support.manage',
            type: 'support_chat',
            title: 'New chat',
            body: 'Customer replied.',
            path: '/support',
            stationId: 'KYAKALE',
            dedupeKey: 'support.chat.message.1',
        })).resolves.toBe(1);
        expect(sendWebPush).toHaveBeenCalledOnce();
        expect(sendWebPush).toHaveBeenCalledWith('staff', stationStaff, expect.objectContaining({ url: '/support' }), 'admin');
    });
});
