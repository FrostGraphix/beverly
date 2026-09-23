import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn();
const passwordRecoveryEmail = vi.fn((input: { code: string }) => ({
    subject: 'Recovery code',
    html: `<p>${input.code}</p>`,
    text: input.code,
}));
const rows: any[] = [];

class Query {
    private operation = 'select';
    private payload: any;
    private filters: Record<string, any> = {};
    private columns = '';
    private selectingAfterUpdate = false;
    constructor(private table: string) {}
    select(columns = '*') { this.columns = columns; this.selectingAfterUpdate = this.operation === 'update'; return this; }
    insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.operation = 'update'; this.payload = payload; return this; }
    eq(column: string, value: any) { this.filters[column] = value; return this; }
    is(column: string, value: any) { this.filters[column] = value; return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return this.execute(); }
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        return this.execute().then(resolve, reject);
    }
    private async execute() {
        if (this.table === 'users') {
            if (this.columns.includes('role_key')) return { data: { auth_user_id: 'user-1', role_key: 'admin' }, error: null };
            return { data: { user_name: 'Ada' }, error: null };
        }
        if (this.table !== 'password_reset_tokens') return { data: null, error: null };
        const matching = rows.filter((row) => Object.entries(this.filters).every(([key, value]) => row[key] === value));
        if (this.operation === 'insert') {
            const row = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), used_at: null, attempts: 0, ...this.payload };
            rows.push(row);
            return { data: row, error: null };
        }
        if (this.operation === 'update') {
            matching.forEach((row) => Object.assign(row, this.payload));
            return { data: this.selectingAfterUpdate ? matching.at(-1) ?? null : null, error: null };
        }
        return { data: matching.at(-1) ?? null, error: null };
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: (table: string) => new Query(table) },
}));
vi.mock('../../config/env.js', () => ({ env: {
    CUSTOMER_APP_URL: 'https://customer.test',
    VENDOR_APP_URL: 'https://vendor.test',
    STAFF_PORTAL_URL: 'https://admin.test',
    PASSWORD_RESET_TTL_MINUTES: 30,
    RESEND_API_KEY: 'configured',
} }));
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));
vi.mock('../../emails/templates.js', () => ({ passwordRecoveryEmail }));

describe('password reset OTP pipeline', () => {
    beforeEach(() => {
        rows.splice(0);
        vi.clearAllMocks();
        sendEmail.mockResolvedValue({ messageId: 'mail-1' });
    });

    it('emails an OTP instead of credentials', async () => {
        const { requestPasswordReset } = await import('../password-reset.js');
        await requestPasswordReset('admin@example.test', 'staff');

        expect(passwordRecoveryEmail).toHaveBeenCalledWith(expect.objectContaining({ code: expect.stringMatching(/^\d{6}$/) }));
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'password-reset-otp' }));
        expect(rows).toContainEqual(expect.objectContaining({ token_kind: 'otp', attempts: 0 }));
    });

    it('exchanges one valid OTP', async () => {
        const service = await import('../password-reset.js');
        await service.requestPasswordReset('admin@example.test', 'staff');
        const otp = passwordRecoveryEmail.mock.calls[0][0].code;

        const grant = await service.verifyPasswordResetOtp('admin@example.test', otp, 'staff');

        expect(grant.token).toMatch(/^[a-f0-9]{64}$/);
        expect(rows.find((row) => row.token_kind === 'otp')?.used_at).toEqual(expect.any(String));
        expect(rows).toContainEqual(expect.objectContaining({ token_kind: 'reset_grant' }));
        await expect(service.verifyPasswordResetOtp('admin@example.test', otp, 'staff'))
            .rejects.toMatchObject({ code: 'otp_not_found' });
    });

    it('limits incorrect OTP attempts', async () => {
        const service = await import('../password-reset.js');
        await service.requestPasswordReset('admin@example.test', 'staff');

        for (let attempt = 1; attempt <= 5; attempt += 1) {
            await expect(service.verifyPasswordResetOtp('admin@example.test', '000000', 'staff'))
                .rejects.toMatchObject({ code: attempt === 5 ? 'otp_locked' : 'otp_incorrect' });
        }
    });
});
