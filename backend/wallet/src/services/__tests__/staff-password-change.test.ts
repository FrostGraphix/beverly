import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUserById = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
const stateResults: Array<{ error: null | { message: string } }> = [];

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { admin: { updateUserById, signOut } },
        rpc,
        from: vi.fn(() => ({
            update: vi.fn(() => ({
                or: vi.fn(async () => stateResults.shift() ?? { error: null }),
            })),
        })),
    },
}));
vi.mock('../audit.js', () => ({ logSecurityEvent: vi.fn(async () => true) }));

const actor = {
    userId: 'auth-staff-1',
    email: 'staff@acoblighting.com',
    passwordResetRequired: true,
};
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (sessionId: string) => `${encode({ alg: 'none' })}.${encode({ iat: 1_700_000_000, session_id: sessionId })}.sig`;
const response = (sessionId: string) => new Response(JSON.stringify({
    access_token: token(sessionId),
    refresh_token: `${sessionId}-refresh`,
    user: { id: actor.userId },
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('staff temporary-password replacement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stateResults.splice(0);
        rpc.mockResolvedValue({ data: true, error: null });
        updateUserById.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
    });

    it('replaces the temporary password and rotates every session', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response('new')));
        const { replaceStaffPassword } = await import('../staff-password-change.js');
        const result = await replaceStaffPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
        });
        expect(updateUserById).toHaveBeenCalledWith(actor.userId, { password: 'River!Quartz92' });
        expect(signOut).toHaveBeenCalledWith(actor.userId, 'global');
        expect(result).toMatchObject({ access_token: token('new'), refresh_token: 'new-refresh' });
    });

    it('restores access when state persistence fails', async () => {
        stateResults.push({ error: { message: 'unavailable' } });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response('new')));
        const { replaceStaffPassword } = await import('../staff-password-change.js');
        await expect(replaceStaffPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
        })).rejects.toMatchObject({ code: 'password_state_update_failed' });
        expect(updateUserById).toHaveBeenLastCalledWith(actor.userId, { password: 'Temporary!Pass92' });
        expect(signOut).toHaveBeenCalledTimes(2);
    });
});
