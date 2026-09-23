import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn();
let lookupError: { message: string } | null = null;
let invalidationError: { message: string } | null = null;

class Query {
    private operation = 'select';
    private selected = '';
    constructor(private table: string) {}
    select(columns: string) { this.selected = columns; return this; }
    update() { this.operation = 'update'; return this; }
    insert() { this.operation = 'insert'; return this; }
    eq() { return this; }
    is() { return this; }
    limit() { return this; }
    maybeSingle() {
        if (this.table === 'vendor_users' && this.selected.includes('auth_user_id')) {
            return Promise.resolve({
                data: lookupError ? null : { auth_user_id: 'auth-user-1', status: 'active' },
                error: lookupError,
            });
        }
        if (this.table === 'vendor_users') {
            return Promise.resolve({ data: { full_name: 'Ada Vendor' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
    }
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        let result = { data: null, error: null as { message: string } | null };
        if (this.table === 'password_reset_tokens' && this.operation === 'update') {
            result = { data: null, error: invalidationError };
        }
        return Promise.resolve(result).then(resolve, reject);
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: (table: string) => new Query(table) },
}));
vi.mock('../../config/env.js', () => ({
    env: {
        CUSTOMER_APP_URL: 'https://customer.example.test',
        VENDOR_APP_URL: 'https://vendor.example.test',
        PASSWORD_RESET_TTL_MINUTES: 30,
        RESEND_API_KEY: 'configured',
    },
}));
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));
vi.mock('../../emails/templates.js', () => ({
    passwordRecoveryEmail: vi.fn(() => ({ subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' })),
}));

describe('password recovery requests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lookupError = null;
        invalidationError = null;
        sendEmail.mockResolvedValue({ messageId: 'email-1' });
    });

    it('fails closed when account lookup fails', async () => {
        lookupError = { message: 'directory unavailable' };
        const { requestPasswordReset } = await import('../password-reset.js');

        await expect(requestPasswordReset('owner@example.test', 'vendor_user'))
            .rejects.toMatchObject({ code: 'user_directory_unavailable', status: 503 });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('stops when older tokens cannot invalidate', async () => {
        invalidationError = { message: 'update unavailable' };
        const { requestPasswordReset } = await import('../password-reset.js');

        await expect(requestPasswordReset('owner@example.test', 'vendor_user'))
            .rejects.toMatchObject({ code: 'token_invalidation_failed', status: 503 });
        expect(sendEmail).not.toHaveBeenCalled();
    });
});
