import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const writes: Array<{ operation: string; table: string; payload?: any }> = [];
let failInsertTable: string | null = null;
let failInsertMessage = '';
let existingProvision = false;

class Query {
    private operation = '';
    private payload: any;
    constructor(private table: string) {}
    insert(payload: any) { this.operation = 'insert'; this.payload = payload; writes.push({ operation: 'insert', table: this.table, payload }); return this; }
    update(payload: any) { this.operation = 'update'; this.payload = payload; writes.push({ operation: 'update', table: this.table, payload }); return this; }
    delete() { this.operation = 'delete'; writes.push({ operation: 'delete', table: this.table }); return this; }
    select() { return this; }
    eq() { return this; }
    limit() { return this; }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve: (value: any) => any, reject: (reason: any) => any) { return this.execute(false).then(resolve, reject); }
    private async execute(single: boolean) {
        if (this.operation === 'insert' && failInsertTable === this.table) return { data: null, error: { message: failInsertMessage || `${this.table} failed` } };
        if (this.operation === 'insert' && single) {
            const id = this.table === 'vendor_organizations' ? 'org-1' : this.table === 'vendor_users' ? 'vendor-user-1' : 'row-1';
            return { data: { id, ...this.payload }, error: null };
        }
        if (this.operation === '' && single && existingProvision) {
            if (this.table === 'vendor_organizations') return { data: { id: 'org-existing', provisioning_status: 'active' }, error: null };
            if (this.table === 'vendor_users') return { data: { id: 'vendor-user-existing', auth_user_id: 'auth-existing', invitation_status: 'sent', invitation_message_id: 'email-existing' }, error: null };
            if (this.table === 'wallets') return { data: { id: 'wallet-existing' }, error: null };
        }
        return { data: null, error: null };
    }
}

const createUser = vi.fn();
const generateLink = vi.fn();
const deleteUser = vi.fn();
vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        auth: { admin: { createUser, generateLink, deleteUser } },
    },
}));
vi.mock('../wallets.js', () => ({
    getOrCreateWallet: vi.fn(async () => ({ id: 'wallet-1' })),
    setOwnerWalletStatus: vi.fn(),
    WalletStateError: class extends Error {},
}));
vi.mock('../audit.js', () => ({ logAction: vi.fn(), logSecurityEvent: vi.fn() }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: vi.fn(async () => true) }));
const sendEmail = vi.fn();
vi.mock('../../adapters/resend.js', () => ({ sendEmail }));

const input = {
    legalName: 'Example Energy Limited',
    contactEmail: 'business@example.test',
    contactPhone: '+2348000000000',
    stationId: 'tunga',
    primaryUserEmail: 'owner@example.test',
    primaryUserFullName: 'Ada Vendor',
    createdByStaffId: 'staff-1',
    provisioningKey: 'vendor-create-key-0001',
};

describe('vendor onboarding runtime workflow', () => {
    beforeEach(() => {
        writes.splice(0);
        failInsertTable = null;
        failInsertMessage = '';
        existingProvision = false;
        vi.clearAllMocks();
        createUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
        generateLink.mockResolvedValue({ data: { user: { id: 'auth-user-1' }, properties: { action_link: 'https://example.test/verify-vendor' } }, error: null });
        deleteUser.mockResolvedValue({ error: null });
        sendEmail.mockResolvedValue({ messageId: 'email-1' });
    });

    it('creates one-station pending identity and records provider-confirmed invitation delivery', async () => {
        const { createVendorOrganization } = await import('../vendor-onboarding.js');
        const result = await createVendorOrganization(input);

        expect(result.invitationDelivery).toEqual({ status: 'sent', messageId: 'email-1' });
        expect(createUser).not.toHaveBeenCalled();
        expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', password: expect.any(String) }));
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('verify-vendor') }));
        expect(writes).not.toEqual(expect.arrayContaining([expect.objectContaining({ table: 'oem_credentials' })]));
        expect(writes).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'vendor_organizations', operation: 'insert', payload: expect.objectContaining({ station_id: 'TUNGA', operating_stations: ['TUNGA'], provisioning_status: 'pending' }) }),
            expect.objectContaining({ table: 'vendor_organizations', operation: 'update', payload: expect.objectContaining({ provisioning_status: 'active' }) }),
            expect.objectContaining({ table: 'vendor_users', payload: expect.objectContaining({ status: 'invited', invitation_status: 'pending' }) }),
            expect.objectContaining({ table: 'vendor_users', operation: 'update', payload: expect.objectContaining({ invitation_status: 'sent', invitation_message_id: 'email-1' }) }),
        ]));
        expect(result).toMatchObject({ invitationDelivery: { status: 'sent', messageId: 'email-1' } });
    });

    it('compensates completed organization and auth writes after provisioning fails', async () => {
        failInsertTable = 'vendor_users';
        const { createVendorOrganization } = await import('../vendor-onboarding.js');

        await expect(createVendorOrganization(input)).rejects.toMatchObject({ code: 'create_vendor_user_failed' });
        expect(deleteUser).toHaveBeenCalledWith('auth-user-1');
        expect(writes).toEqual(expect.arrayContaining([
            expect.objectContaining({ operation: 'delete', table: 'vendor_organizations' }),
        ]));
    });

    it('does not expose database details when organization creation fails', async () => {
        failInsertTable = 'vendor_organizations';
        failInsertMessage = 'new row violates check constraint vendor_organizations_status_check';
        const { createVendorOrganization } = await import('../vendor-onboarding.js');

        await expect(createVendorOrganization(input)).rejects.toMatchObject({
            code: 'create_org_failed',
            message: 'Vendor organization could not be created.',
            statusCode: 503,
        });
    });

    it('replays an already completed domain provisioning without creating or exposing another password', async () => {
        existingProvision = true;
        const { createVendorOrganization } = await import('../vendor-onboarding.js');

        const result = await createVendorOrganization(input);

        expect(result).toEqual({
            organizationId: 'org-existing',
            primaryVendorUserId: 'vendor-user-existing',
            authUserId: 'auth-existing',
            walletId: 'wallet-existing',
            temporaryPassword: null,
            invitationDelivery: { status: 'sent', messageId: 'email-existing' },
        });
        expect(createUser).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
        expect(writes).not.toEqual(expect.arrayContaining([expect.objectContaining({ operation: 'insert' })]));
    });
});
