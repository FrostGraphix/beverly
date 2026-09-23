import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUserById = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
const stateResults: Array<{ error: null | { message: string } }> = [];

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { admin: { updateUserById, signOut } },
        rpc,
        from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(async () => stateResults.shift() ?? { error: null }) })) })),
    },
}));
vi.mock('../audit.js', () => ({ logSecurityEvent: vi.fn(async () => true) }));

const actor = { userId: 'auth-customer-1', actorId: 'customer-1', email: 'customer@example.com' };
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (sessionId: string) => `${encode({ alg: 'none' })}.${encode({ session_id: sessionId })}.sig`;
const response = (sessionId: string) => new Response(JSON.stringify({
    access_token: token(sessionId), refresh_token: `${sessionId}-refresh`, user: { id: actor.userId },
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('customer profile password replacement', () => {
    beforeEach(() => {
        vi.clearAllMocks(); stateResults.splice(0);
        rpc.mockResolvedValue({ data: true, error: null });
        updateUserById.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
    });

    it('verifies current credentials and rotates every session', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response('new')));
        const { replaceCustomerPassword } = await import('../customer-password-change.js');
        const result = await replaceCustomerPassword({ actor, currentPassword: 'Current!Pass92', nextPassword: 'River!Quartz92' });
        expect(updateUserById).toHaveBeenCalledWith(actor.userId, { password: 'River!Quartz92' });
        expect(signOut).toHaveBeenCalledWith(actor.userId, 'global');
        expect(result).toMatchObject({ access_token: token('new'), refresh_token: 'new-refresh' });
    });

    it('restores the old password when session state cannot persist', async () => {
        stateResults.push({ error: { message: 'unavailable' } });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response('new')));
        const { replaceCustomerPassword } = await import('../customer-password-change.js');
        await expect(replaceCustomerPassword({ actor, currentPassword: 'Current!Pass92', nextPassword: 'River!Quartz92' }))
            .rejects.toMatchObject({ code: 'password_state_update_failed' });
        expect(updateUserById).toHaveBeenLastCalledWith(actor.userId, { password: 'Current!Pass92' });
        expect(signOut).toHaveBeenCalledTimes(2);
    });
});
