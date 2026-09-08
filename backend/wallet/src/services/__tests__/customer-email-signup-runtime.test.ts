import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

let existingCustomer: Row | null = null;
let existingPhoneCustomer: Row | null = null;
let passwordTokenUserId = 'auth-new';
let insertedCustomer: Row | null = null;
const writes: Array<{ operation: string; table: string; payload?: any }> = [];
const events: string[] = [];

class Query {
    private operation = '';
    private payload: any;
    private filters: Record<string, unknown> = {};

    constructor(private table: string) {}
    select() { return this; }
    insert(payload: any) {
        this.operation = 'insert';
        this.payload = payload;
        writes.push({ operation: 'insert', table: this.table, payload });
        events.push(`insert:${this.table}`);
        return this;
    }
    update(payload: any) {
        this.operation = 'update';
        this.payload = payload;
        writes.push({ operation: 'update', table: this.table, payload });
        return this;
    }
    delete() {
        this.operation = 'delete';
        writes.push({ operation: 'delete', table: this.table });
        return this;
    }
    eq(column: string, value: unknown) { this.filters[column] = value; return this; }
    limit() { return this; }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve: (value: any) => any, reject: (reason: any) => any) {
        return this.execute(false).then(resolve, reject);
    }

    private async execute(single: boolean) {
        if (this.operation === 'insert' && this.table === 'customers' && single) {
            insertedCustomer = { id: 'customer-new', created_at: '2026-09-07T00:00:00.000Z', ...this.payload };
            return { data: insertedCustomer, error: null };
        }
        if (this.operation === 'delete') return { data: null, error: null };
        if (this.operation === 'update' && this.table === 'customers' && single) {
            const current = existingPhoneCustomer ?? existingCustomer;
            return { data: current ? { ...current, ...this.payload } : null, error: null };
        }
        if (this.table === 'customers' && this.filters.email) {
            return { data: existingCustomer, error: null };
        }
        if (this.table === 'customers' && this.filters.phone) {
            return { data: existingPhoneCustomer, error: null };
        }
        if (this.table === 'customers' && single) {
            return { data: existingCustomer, error: null };
        }
        return { data: null, error: null };
    }
}

const createUser = vi.fn();
const deleteUser = vi.fn();
const updateUserById = vi.fn();
const getOrCreateWallet = vi.fn();
const sendEmailVerification = vi.fn();
const sendEmail = vi.fn();

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        auth: { admin: { createUser, deleteUser, updateUserById } },
    },
}));
vi.mock('../wallets.js', () => ({ getOrCreateWallet }));
vi.mock('../audit.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: vi.fn(async () => false) }));
vi.mock('../customer-email-otp.js', () => ({ sendEmailVerification }));
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));
vi.mock('../../adapters/twilio.js', () => ({
    checkVerification: vi.fn(), sendSms: vi.fn(), sendVerification: vi.fn(),
}));
vi.mock('../sms-guardrails.js', () => ({
    assertCustomerOtpTrafficAllowed: vi.fn(),
    normalizeSmsPhone: (phone: string) => phone,
    SmsGuardrailError: class extends Error {},
}));
vi.mock('../email-validation.js', () => ({
    validateEmailFormatAndDomain: async (email: string) => email.trim().toLowerCase(),
    isDisposableEmail: () => false,
    EmailValidationError: class extends Error {},
}));

describe('customer email signup runtime workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        writes.splice(0);
        events.splice(0);
        existingCustomer = null;
        existingPhoneCustomer = null;
        passwordTokenUserId = 'auth-new';
        insertedCustomer = null;
        createUser.mockResolvedValue({ data: { user: { id: 'auth-new' } }, error: null });
        deleteUser.mockResolvedValue({ error: null });
        updateUserById.mockResolvedValue({ data: { user: { id: 'auth-phone' } }, error: null });
        getOrCreateWallet.mockResolvedValue({ id: 'wallet-new' });
        vi.stubGlobal('fetch', vi.fn(async () => {
            events.push('password-token');
            return new Response(JSON.stringify({
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                expires_at: 1_800_000_000,
                expires_in: 3600,
                user: { id: passwordTokenUserId },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
    });

    it('resumes an unverified account after proving its password', async () => {
        existingCustomer = {
            id: 'customer-existing',
            auth_user_id: 'auth-existing',
            user_id: 'auth-existing',
            email: 'ada@example.com',
            phone: null,
            full_name: 'Ada Example',
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
            email_verified_at: null,
            created_at: '2026-09-07T00:00:00.000Z',
        };
        passwordTokenUserId = 'auth-existing';
        const { signupWithEmail } = await import('../customer-auth.js');

        const result = await signupWithEmail({
            email: 'ada@example.com', password: 'correct-pass', full_name: 'Ada Example',
        });

        expect(result).toMatchObject({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            customer: { id: 'customer-existing', email_verified_at: null },
            isNew: false,
        });
        expect(getOrCreateWallet).toHaveBeenCalledWith('customer', 'customer-existing', expect.any(Object));
        expect(createUser).not.toHaveBeenCalled();
    });

    it('creates the login session before durable profile writes', async () => {
        const { signupWithEmail } = await import('../customer-auth.js');

        await signupWithEmail({
            email: 'new@example.com', password: 'correct-pass', full_name: 'New Customer',
        });

        expect(events.indexOf('password-token')).toBeLessThan(events.indexOf('insert:customers'));
        expect(sendEmailVerification).not.toHaveBeenCalled();
    });

    it('resumes an existing phone account after proving its password', async () => {
        existingPhoneCustomer = {
            id: 'customer-phone',
            auth_user_id: 'auth-phone',
            user_id: 'auth-phone',
            email: 'ada@example.com',
            phone: '+2349158738352',
            full_name: 'Ada Example',
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
            auth_provider: 'phone_password',
            created_at: '2026-09-07T00:00:00.000Z',
        };
        passwordTokenUserId = 'auth-phone';
        const { signupWithPhone } = await import('../customer-auth.js');

        const result = await signupWithPhone({
            phone: '+2349158738352',
            password: 'correct-pass',
            full_name: 'Ada Example',
            email: 'ada@example.com',
        });

        expect(result).toMatchObject({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            customer: { id: 'customer-phone' },
            isNew: false,
        });
        expect(createUser).not.toHaveBeenCalled();
        expect(getOrCreateWallet).toHaveBeenCalledWith('customer', 'customer-phone', expect.any(Object));
    });

    it('converts a controlled phone account into the requested email account', async () => {
        existingPhoneCustomer = {
            id: 'customer-phone',
            auth_user_id: 'auth-phone',
            user_id: 'auth-phone',
            email: 'old@example.com',
            phone: '+2349158738352',
            full_name: 'Ada Example',
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
            auth_provider: 'phone_password',
            email_verified_at: null,
            created_at: '2026-09-07T00:00:00.000Z',
        };
        passwordTokenUserId = 'auth-phone';
        const { signupWithEmail } = await import('../customer-auth.js');

        const result = await signupWithEmail({
            email: 'new@example.com',
            phone: '+2349158738352',
            password: 'correct-pass',
            full_name: 'Ada Example',
        });

        expect(updateUserById).toHaveBeenCalledWith('auth-phone', expect.objectContaining({
            email: 'new@example.com',
            email_confirm: true,
        }));
        expect(writes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'update',
                table: 'customers',
                payload: expect.objectContaining({ email: 'new@example.com', auth_provider: 'email_password' }),
            }),
        ]));
        expect(result).toMatchObject({
            customer: { id: 'customer-phone', email: 'new@example.com', auth_provider: 'email_password' },
            isNew: false,
        });
        expect(createUser).not.toHaveBeenCalled();
    });

    it('accepts a new optional email while resuming phone signup', async () => {
        existingPhoneCustomer = {
            id: 'customer-phone',
            auth_user_id: 'auth-phone',
            user_id: 'auth-phone',
            email: 'old@example.com',
            phone: '+2349158738352',
            full_name: 'Ada Example',
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
            auth_provider: 'phone_password',
            email_verified_at: null,
            created_at: '2026-09-07T00:00:00.000Z',
        };
        passwordTokenUserId = 'auth-phone';
        const { signupWithPhone } = await import('../customer-auth.js');

        const result = await signupWithPhone({
            phone: '+2349158738352',
            password: 'correct-pass',
            full_name: 'Ada Example',
            email: 'new@example.com',
        });

        expect(writes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'update',
                table: 'customers',
                payload: expect.objectContaining({ email: 'new@example.com' }),
            }),
        ]));
        expect(result).toMatchObject({ customer: { email: 'new@example.com' }, isNew: false });
    });

    it('creates the phone session before durable profile writes', async () => {
        const { signupWithPhone } = await import('../customer-auth.js');

        await signupWithPhone({
            phone: '+2348060000000',
            password: 'correct-pass',
            full_name: 'New Phone Customer',
        });

        expect(events.indexOf('password-token')).toBeLessThan(events.indexOf('insert:customers'));
    });
});
