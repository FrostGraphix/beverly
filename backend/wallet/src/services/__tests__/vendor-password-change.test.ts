import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUserById = vi.fn();
const signOut = vi.fn();
const claimAttempt = vi.fn();
const vendorUpdateResults: Array<{ error: null | { message: string } }> = [];

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { admin: { updateUserById, signOut } },
        rpc: claimAttempt,
        from: vi.fn(() => ({
            update: vi.fn(() => ({
                eq: vi.fn(async () => vendorUpdateResults.shift() ?? { error: null }),
            })),
        })),
    },
}));

const logSecurityEvent = vi.fn(async () => true);
vi.mock('../audit.js', () => ({ logSecurityEvent }));

const actor = {
    actorId: 'vendor-user-1',
    userId: 'auth-user-1',
    email: 'vendor@example.test',
    passwordResetRequired: true,
};

const tokenResponse = (token: string) => new Response(JSON.stringify({
    access_token: token,
    refresh_token: `${token}-refresh`,
    expires_in: 3600,
    expires_at: 2_000_000_000,
    user: { id: actor.userId },
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('vendor password replacement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vendorUpdateResults.splice(0);
        updateUserById.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
        claimAttempt.mockResolvedValue({ data: true, error: null });
    });

    it('revokes every old refresh session and returns a deliberately rotated session', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(tokenResponse('old-session-proof'))
            .mockResolvedValueOnce(tokenResponse('new-session')));
        const { replaceVendorPassword } = await import('../vendor-password-change.js');

        const result = await replaceVendorPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        });

        expect(updateUserById).toHaveBeenCalledWith(actor.userId, { password: 'River!Quartz92' });
        expect(signOut).toHaveBeenCalledWith(actor.userId, 'global');
        expect(result).toMatchObject({ access_token: 'new-session', refresh_token: 'new-session-refresh' });
    });

    it('restores the old password and revokes sessions when reset-state persistence fails', async () => {
        vendorUpdateResults.push({ error: { message: 'database unavailable' } });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(tokenResponse('old-session-proof'))
            .mockResolvedValueOnce(tokenResponse('new-session')));
        const { replaceVendorPassword } = await import('../vendor-password-change.js');

        await expect(replaceVendorPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        })).rejects.toMatchObject({ code: 'password_state_update_failed' });

        expect(updateUserById).toHaveBeenLastCalledWith(actor.userId, { password: 'Temporary!Pass92' });
        expect(signOut).toHaveBeenCalledTimes(2);
    });

    it('reports failed compensation without claiming cancellation safety', async () => {
        signOut.mockResolvedValueOnce({ error: { message: 'revocation unavailable' } });
        updateUserById
            .mockResolvedValueOnce({ error: null })
            .mockResolvedValueOnce({ error: { message: 'restore failed' } });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(tokenResponse('old-session-proof')));
        const { replaceVendorPassword } = await import('../vendor-password-change.js');

        await expect(replaceVendorPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        })).rejects.toMatchObject({ code: 'password_recovery_required', status: 503 });
    });

    it('does not fail committed changes when audit storage is unavailable', async () => {
        logSecurityEvent.mockRejectedValueOnce(new Error('audit unavailable'));
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(tokenResponse('old-session-proof'))
            .mockResolvedValueOnce(tokenResponse('new-session')));
        const { replaceVendorPassword } = await import('../vendor-password-change.js');

        await expect(replaceVendorPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        })).resolves.toMatchObject({ ok: true, access_token: 'new-session' });
    });

    it('blocks the account after its password-change attempt budget is exhausted', async () => {
        claimAttempt.mockResolvedValue({ data: false, error: null });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { replaceVendorPassword } = await import('../vendor-password-change.js');

        await expect(replaceVendorPassword({
            actor,
            currentPassword: 'Temporary!Pass92',
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        })).rejects.toMatchObject({ code: 'password_change_rate_limited', status: 429 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('identifies access tokens issued before the credential transition', async () => {
        const { tokenPredatesPasswordChange, tokenAllowedAfterPasswordChange } = await import('../vendor-password-change.js');
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const token = `${encode({ alg: 'none' })}.${encode({ iat: 1_700_000_000 })}.signature`;
        expect(tokenPredatesPasswordChange(token, '2023-11-14T22:13:21.000Z')).toBe(true);
        expect(tokenPredatesPasswordChange(token, '2023-11-14T22:13:19.000Z')).toBe(false);
        const rotated = `${encode({ alg: 'none' })}.${encode({ iat: 1_700_000_000, session_id: 'session-new' })}.signature`;
        const concurrentOld = `${encode({ alg: 'none' })}.${encode({ iat: 1_700_000_000, session_id: 'session-old' })}.signature`;
        expect(tokenAllowedAfterPasswordChange(rotated, '2023-11-14T22:13:20.000Z', 'session-new')).toBe(true);
        expect(tokenAllowedAfterPasswordChange(concurrentOld, '2023-11-14T22:13:20.000Z', 'session-new')).toBe(false);
    });
});
