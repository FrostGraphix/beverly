import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuthRecord = { id: string; email: string; password: string };
let authRecord: AuthRecord | null = null;
let revokedSessionGeneration = 0;
const sentEmails: any[] = [];

class Query {
    private operation = 'select';
    private payload: any;
    constructor(private table: string) {}
    insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    select() { return this; }
    eq() { return this; }
    limit() { return this; }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve: (value: any) => any, reject: (reason: any) => any) { return this.execute(false).then(resolve, reject); }
    private async execute(single: boolean) {
        if (this.operation === 'insert' && single) {
            const id = this.table === 'vendor_organizations' ? 'org-e2e' : this.table === 'vendor_users' ? 'vendor-user-e2e' : 'row-e2e';
            return { data: { id, ...this.payload }, error: null };
        }
        return { data: single ? null : [], error: null };
    }
}

const createUser = vi.fn(async (input: any) => {
    authRecord = { id: 'auth-e2e', email: input.email, password: input.password };
    return { data: { user: { id: authRecord.id } }, error: null };
});
const updateUserById = vi.fn(async (_id: string, input: { password: string }) => {
    if (!authRecord) return { error: { message: 'missing auth user' } };
    authRecord.password = input.password;
    return { error: null };
});
const signOut = vi.fn(async () => {
    revokedSessionGeneration += 1;
    return { error: null };
});
const generateLink = vi.fn(async (input: any) => {
    if (input.type === 'signup') {
        authRecord = { id: 'auth-e2e', email: input.email, password: input.password };
    }
    return { data: { user: { id: authRecord?.id ?? 'auth-e2e' }, properties: { action_link: 'https://example.test/verify' } }, error: null };
});

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        rpc: vi.fn(async () => ({ data: true, error: null })),
        auth: { admin: {
            createUser,
            updateUserById,
            signOut,
            deleteUser: vi.fn(async () => ({ error: null })),
            generateLink,
        } },
    },
}));
vi.mock('../wallets.js', () => ({
    getOrCreateWallet: vi.fn(async () => ({ id: 'wallet-e2e' })),
    setOwnerWalletStatus: vi.fn(),
    WalletStateError: class extends Error {},
}));
vi.mock('../audit.js', () => ({ logAction: vi.fn(), logSecurityEvent: vi.fn() }));
vi.mock('../feature-flags.js', () => ({ isFlagEnabled: vi.fn(async () => true) }));
vi.mock('../../adapters/resend.js', () => ({
    sendEmail: vi.fn(async (message: any) => {
        sentEmails.push(message);
        return { messageId: 'email-e2e' };
    }),
}));

function passwordGrantResponse(email: string, password: string) {
    const valid = authRecord?.email === email && authRecord?.password === password;
    return new Response(JSON.stringify(valid ? {
        access_token: `session-${revokedSessionGeneration}`,
        refresh_token: `refresh-${revokedSessionGeneration}`,
        user: { id: authRecord!.id },
    } : { error: 'invalid_credentials' }), {
        status: valid ? 200 : 400,
        headers: { 'content-type': 'application/json' },
    });
}

describe('vendor creation-to-new-password pipeline', () => {
    beforeEach(() => {
        authRecord = null;
        revokedSessionGeneration = 0;
        sentEmails.splice(0);
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            return passwordGrantResponse(body.email, body.password);
        }));
    });

    it('creates, invites, replaces the temporary password, rejects the old secret, and revokes concurrent sessions', async () => {
        const { createVendorOrganization } = await import('../vendor-onboarding.js');
        const { replaceVendorPassword } = await import('../vendor-password-change.js');
        const created = await createVendorOrganization({
            legalName: 'Pipeline Vendor Limited',
            contactEmail: 'owner@example.test',
            contactPhone: '+2348000000000',
            stationId: 'TUNGA',
            primaryUserEmail: 'owner@example.test',
            primaryUserFullName: 'Pipeline Owner',
            createdByStaffId: 'staff-e2e',
            provisioningKey: 'pipeline-e2e-0001',
        });

        expect(created.temporaryPassword).toBeTruthy();
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].html).toContain('https://example.test/verify');
        const temporaryPassword = created.temporaryPassword!;
        expect((await passwordGrantResponse('owner@example.test', temporaryPassword)).ok).toBe(true);

        const concurrentSessionGeneration = revokedSessionGeneration;
        const changed = await replaceVendorPassword({
            actor: {
                actorId: created.primaryVendorUserId,
                userId: created.authUserId,
                email: 'owner@example.test',
                passwordResetRequired: true,
            },
            currentPassword: temporaryPassword,
            nextPassword: 'River!Quartz92',
            ip: '127.0.0.1',
        });

        expect(changed.access_token).toBe(`session-${concurrentSessionGeneration + 1}`);
        expect((await passwordGrantResponse('owner@example.test', temporaryPassword)).ok).toBe(false);
        expect((await passwordGrantResponse('owner@example.test', 'River!Quartz92')).ok).toBe(true);
        expect(signOut).toHaveBeenCalledWith(created.authUserId, 'global');
        expect(revokedSessionGeneration).toBeGreaterThan(concurrentSessionGeneration);
    });
});
