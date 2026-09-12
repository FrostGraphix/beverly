import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: any; error: null | { message: string } };

const updateUserById = vi.fn();
const signOut = vi.fn();
const tokenUpdates: Array<Record<string, unknown>> = [];
const vendorUpdates: Array<Record<string, unknown>> = [];
let vendorStateError: { message: string } | null = null;

class Query {
    private operation = 'select';
    private payload: Record<string, unknown> | undefined;
    private selectingAfterUpdate = false;

    constructor(private table: string) {}
    select() { if (this.operation === 'update') this.selectingAfterUpdate = true; return this; }
    update(payload: Record<string, unknown>) {
        this.operation = 'update';
        this.payload = payload;
        if (this.table === 'password_reset_tokens') tokenUpdates.push(payload);
        if (this.table === 'vendor_users') vendorUpdates.push(payload);
        return this;
    }
    eq() { return this; }
    is() { return this; }
    maybeSingle() { return this.execute(); }
    then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) {
        return this.execute().then(resolve, reject);
    }
    private async execute(): Promise<Result> {
        if (this.table === 'password_reset_tokens' && this.operation === 'select') {
            return {
                data: {
                    id: 'reset-1',
                    auth_user_id: 'auth-user-1',
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                },
                error: null,
            };
        }
        if (this.table === 'password_reset_tokens' && this.selectingAfterUpdate) {
            return { data: { id: 'reset-1' }, error: null };
        }
        if (this.table === 'vendor_users' && this.operation === 'select') {
            return {
                data: {
                    password_reset_required: true,
                    password_changed_at: null,
                    password_session_id: null,
                },
                error: null,
            };
        }
        if (this.table === 'vendor_users' && this.operation === 'update') {
            return { data: null, error: vendorStateError };
        }
        return { data: null, error: null };
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        auth: { admin: { updateUserById, signOut } },
    },
}));
vi.mock('../../config/env.js', () => ({
    env: {
        CUSTOMER_APP_URL: 'https://customer.example.test',
        VENDOR_APP_URL: 'https://vendor.example.test',
        PASSWORD_RESET_TTL_MINUTES: 30,
        RESEND_API_KEY: 'configured',
    },
}));
vi.mock('../../adapters/resend.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../emails/templates.js', () => ({ passwordResetLinkEmail: vi.fn() }));

describe('vendor password recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tokenUpdates.splice(0);
        vendorUpdates.splice(0);
        vendorStateError = null;
        updateUserById.mockResolvedValue({ error: null });
        signOut.mockResolvedValue({ error: null });
    });

    it('releases the claimed token when the password update fails', async () => {
        updateUserById.mockResolvedValue({ error: { message: 'auth unavailable' } });
        const { confirmPasswordReset } = await import('../password-reset.js');

        await expect(confirmPasswordReset(
            'a'.repeat(64),
            'River!Quartz92',
            'vendor_user',
        )).rejects.toMatchObject({ code: 'password_update_failed' });

        expect(tokenUpdates).toContainEqual({ used_at: null });
    });

    it('blocks old sessions before completing vendor recovery', async () => {
        const { confirmPasswordReset } = await import('../password-reset.js');

        await confirmPasswordReset('b'.repeat(64), 'River!Quartz92', 'vendor_user');

        expect(vendorUpdates[0]).toEqual(expect.objectContaining({
            password_reset_required: true,
            password_changed_at: expect.any(String),
            password_session_id: expect.stringMatching(/^password-reset:/),
        }));
        expect(vendorUpdates).toContainEqual(expect.objectContaining({
            password_reset_required: false,
        }));
        expect(signOut).toHaveBeenCalledWith('auth-user-1', 'global');
    });

    it('does not change credentials when fail-closed state cannot persist', async () => {
        vendorStateError = { message: 'database unavailable' };
        const { confirmPasswordReset } = await import('../password-reset.js');

        await expect(confirmPasswordReset(
            'c'.repeat(64),
            'River!Quartz92',
            'vendor_user',
        )).rejects.toMatchObject({ code: 'password_state_update_failed', status: 503 });

        expect(updateUserById).not.toHaveBeenCalled();
        expect(tokenUpdates).toContainEqual({ used_at: null });
    });
});
