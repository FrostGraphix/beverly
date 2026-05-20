import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
type Filter = { key: string; op: 'eq' | 'is' | 'gt'; value: any };

const tables: Record<string, Row[]> = {
    vendor_mfa_factors: [],
    vendor_mfa_recovery_codes: [],
    vendor_mfa_sessions: [],
    vendor_users: [],
};

const auditEvents: Row[] = [];
let nextId = 1;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.key] === filter.value;
        if (filter.op === 'is') return row[filter.key] === filter.value;
        if (filter.op === 'gt') return new Date(row[filter.key]).getTime() > new Date(filter.value).getTime();
        return false;
    });
}

class QueryBuilder {
    private filters: Filter[] = [];
    private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null;
    private payload: any = null;
    private wantsSingle = false;
    private wantsMaybeSingle = false;
    private wantsCount = false;
    private maxRows: number | null = null;
    private sortKey: string | null = null;
    private sortAscending = true;
    private conflictKey: string | null = null;

    constructor(private tableName: string) {}

    select(_columns = '*', options?: { count?: 'exact'; head?: boolean }) {
        this.operation = this.operation ?? 'select';
        this.wantsCount = options?.count === 'exact';
        return this;
    }

    insert(payload: any) {
        this.operation = 'insert';
        this.payload = payload;
        return this;
    }

    update(payload: any) {
        this.operation = 'update';
        this.payload = payload;
        return this;
    }

    delete() {
        this.operation = 'delete';
        return this;
    }

    upsert(payload: any, options?: { onConflict?: string }) {
        this.operation = 'upsert';
        this.payload = payload;
        this.conflictKey = options?.onConflict ?? null;
        return this;
    }

    eq(key: string, value: any) {
        this.filters.push({ key, op: 'eq', value });
        return this;
    }

    is(key: string, value: any) {
        this.filters.push({ key, op: 'is', value });
        return this;
    }

    gt(key: string, value: any) {
        this.filters.push({ key, op: 'gt', value });
        return this;
    }

    order(key: string, options?: { ascending?: boolean }) {
        this.sortKey = key;
        this.sortAscending = options?.ascending !== false;
        return this;
    }

    limit(value: number) {
        this.maxRows = value;
        return this;
    }

    single() {
        this.wantsSingle = true;
        return this.execute();
    }

    maybeSingle() {
        this.wantsMaybeSingle = true;
        return this.execute();
    }

    then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
        return this.execute().then(onfulfilled, onrejected);
    }

    private table() {
        tables[this.tableName] ??= [];
        return tables[this.tableName];
    }

    private matchingRows() {
        let rows = this.table().filter((row) => matches(row, this.filters));
        if (this.sortKey) {
            rows = [...rows].sort((a, b) => {
                const left = String(a[this.sortKey!] ?? '');
                const right = String(b[this.sortKey!] ?? '');
                return this.sortAscending ? left.localeCompare(right) : right.localeCompare(left);
            });
        }
        if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
        return rows;
    }

    private async execute() {
        const table = this.table();
        if (this.operation === 'insert') {
            const input = Array.isArray(this.payload) ? this.payload : [this.payload];
            const inserted = input.map((row) => {
                const record = {
                    id: row.id ?? `row-${nextId++}`,
                    created_at: row.created_at ?? new Date().toISOString(),
                    used_at: this.tableName === 'vendor_mfa_recovery_codes' ? null : row.used_at,
                    ...row,
                };
                table.push(record);
                return record;
            });
            const data = Array.isArray(this.payload) ? inserted : inserted[0];
            return { data: clone(data), error: null };
        }

        if (this.operation === 'update') {
            const rows = this.matchingRows();
            rows.forEach((row) => Object.assign(row, this.payload));
            return { data: clone(rows), error: null };
        }

        if (this.operation === 'delete') {
            const keep = table.filter((row) => !matches(row, this.filters));
            tables[this.tableName] = keep;
            return { data: null, error: null };
        }

        if (this.operation === 'upsert') {
            const key = this.conflictKey;
            const existing = key ? table.find((row) => row[key] === this.payload[key]) : null;
            if (existing) Object.assign(existing, this.payload);
            else table.push({ id: this.payload.id ?? `row-${nextId++}`, created_at: new Date().toISOString(), ...this.payload });
            return { data: clone(existing ?? this.payload), error: null };
        }

        const rows = this.matchingRows();
        if (this.wantsCount) return { data: null, count: rows.length, error: null };
        if (this.wantsSingle) return { data: clone(rows[0] ?? null), error: rows[0] ? null : { message: 'missing row' } };
        if (this.wantsMaybeSingle) return { data: clone(rows[0] ?? null), error: null };
        return { data: clone(rows), error: null };
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (tableName: string) => new QueryBuilder(tableName),
    },
}));

vi.mock('../audit.js', () => ({
    logSecurityEvent: vi.fn(async (eventType: string, payload: Row) => {
        auditEvents.push({ eventType, ...payload });
    }),
}));

function base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let current = 0;
    const bytes: number[] = [];
    for (const char of value) {
        const index = alphabet.indexOf(char);
        current = (current << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((current >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function totp(secret: string, now = Date.now()): string {
    const counter = Math.floor(now / 1000 / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
        | (digest[offset + 1] << 16)
        | (digest[offset + 2] << 8)
        | digest[offset + 3];
    return String(binary % 1_000_000).padStart(6, '0');
}

describe('vendor MFA runtime flow', () => {
    beforeEach(() => {
        Object.values(tables).forEach((rows) => rows.splice(0));
        auditEvents.splice(0);
        nextId = 1;
    });

    it('runs setup, enforcement session, recovery, replacement, and disable end to end', async () => {
        const service = await import('../vendor-mfa.js');
        const actor = { actorId: 'vendor-user-1', userId: 'auth-user-1', email: 'vendor@example.test' };
        tables.vendor_users.push({ id: actor.actorId, auth_user_id: actor.userId, mfa_enrolled: false });

        const setup = await service.beginVendorMfaEnrollment(actor);
        const setupCode = totp(setup.secret);
        const enrollment = await service.verifyVendorMfaEnrollment(actor, 'access-token-a', setupCode, { ip: '127.0.0.1' });

        expect(enrollment.ok).toBe(true);
        expect(enrollment.recovery_codes).toHaveLength(10);
        expect(await service.vendorMfaSessionVerified(actor.userId, 'access-token-a')).toBe(true);
        expect(await service.vendorMfaSessionVerified(actor.userId, 'access-token-b')).toBe(false);
        expect(tables.vendor_users[0].mfa_enrolled).toBe(true);
        expect(tables.vendor_mfa_factors.filter((row) => row.status === 'active')).toHaveLength(1);

        const badChallenge = service.verifyVendorMfaChallenge(actor, 'access-token-b', '000000');
        await expect(badChallenge).rejects.toMatchObject({ code: 'invalid_otp' });

        const recoveryChallenge = await service.verifyVendorMfaChallenge(actor, 'access-token-b', enrollment.recovery_codes[0]);
        expect(recoveryChallenge.recovery_code_used).toBe(true);
        expect(await service.vendorMfaSessionVerified(actor.userId, 'access-token-b')).toBe(true);

        const replacement = await service.beginVendorMfaReplacement(actor, totp(setup.secret));
        expect(tables.vendor_mfa_factors.filter((row) => row.status === 'active')).toHaveLength(1);
        expect(tables.vendor_users[0].mfa_enrolled).toBe(true);

        await service.verifyVendorMfaEnrollment(actor, 'access-token-c', totp(replacement.secret));
        expect(tables.vendor_mfa_factors.filter((row) => row.status === 'active')).toHaveLength(1);
        expect(tables.vendor_mfa_factors.filter((row) => row.status === 'replaced')).toHaveLength(1);
        expect(await service.vendorMfaSessionVerified(actor.userId, 'access-token-c')).toBe(true);

        const activeReplacementSecret = replacement.secret;
        await service.disableVendorMfa(actor, totp(activeReplacementSecret), { ip: '127.0.0.1' });
        expect(tables.vendor_users[0].mfa_enrolled).toBe(false);
        expect(tables.vendor_mfa_factors.filter((row) => row.status === 'active')).toHaveLength(0);
        expect(await service.vendorMfaSessionVerified(actor.userId, 'access-token-c')).toBe(false);
        expect(auditEvents.map((event) => event.eventType)).toEqual(
            expect.arrayContaining(['mfa_enabled', 'mfa_failure', 'mfa_disabled']),
        );
    });
});
