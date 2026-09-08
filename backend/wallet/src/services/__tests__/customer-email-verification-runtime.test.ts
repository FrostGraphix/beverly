import { beforeEach, describe, expect, it, vi } from 'vitest';

let updateCustomerError: { message: string } | null = null;
const writes: Array<{ operation: string; table: string; payload?: any }> = [];

class Query {
    private operation = '';
    private payload: any;
    private filters: Record<string, unknown> = {};
    constructor(private table: string) {}
    select() { return this; }
    insert(payload: any) { this.operation = 'insert'; this.payload = payload; writes.push({ operation: 'insert', table: this.table, payload }); return this; }
    update(payload: any) { this.operation = 'update'; this.payload = payload; writes.push({ operation: 'update', table: this.table, payload }); return this; }
    delete() { this.operation = 'delete'; writes.push({ operation: 'delete', table: this.table }); return this; }
    eq(column: string, value: unknown) { this.filters[column] = value; return this; }
    is() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return this.execute(); }
    single() { return this.execute(); }
    then(resolve: (value: any) => any, reject: (reason: any) => any) { return this.execute().then(resolve, reject); }
    private async execute() {
        if (this.table === 'customer_email_otp' && this.operation === 'insert') {
            return { data: { id: 'challenge-1', ...this.payload }, error: null };
        }
        if (this.table === 'customer_email_otp' && this.operation === 'delete') return { data: null, error: null };
        if (this.table === 'customer_email_otp' && this.operation === 'update') return { data: null, error: null };
        if (this.table === 'customer_email_otp' && this.filters.purpose === 'verify') {
            return {
                data: {
                    id: 'challenge-1',
                    otp_hash: 'unused-by-this-test',
                    attempts: 0,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    consumed_at: null,
                    created_at: '2026-09-01T00:00:00.000Z',
                },
                error: null,
            };
        }
        if (this.table === 'customers' && this.operation === 'update') {
            return { data: null, error: updateCustomerError };
        }
        if (this.table === 'customers') return { data: { id: 'customer-1' }, error: null };
        return { data: null, error: null };
    }
}

const sendEmail = vi.fn();
vi.mock('../../db/supabase.js', () => ({ adminClient: { from: (table: string) => new Query(table) } }));
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));
vi.mock('../audit.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: vi.fn(async () => true) }));

describe('customer email verification runtime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        writes.splice(0);
        updateCustomerError = null;
    });

    it('removes an unusable challenge and reports delivery failure', async () => {
        sendEmail.mockRejectedValue(new Error('provider unavailable'));
        const { sendEmailVerification } = await import('../customer-email-otp.js');

        await expect(sendEmailVerification('ada@example.com', 'Ada Example'))
            .rejects.toMatchObject({ code: 'otp_send_failed' });
        expect(writes).toEqual(expect.arrayContaining([
            expect.objectContaining({ operation: 'delete', table: 'customer_email_otp' }),
        ]));
    });
});
