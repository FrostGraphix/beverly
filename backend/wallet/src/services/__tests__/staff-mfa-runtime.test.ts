import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
type Filter = { key: string; op: 'eq' | 'is' | 'gt'; value: any };

const tables: Record<string, Row[]> = {
    staff_mfa_factors: [],
    staff_mfa_recovery_codes: [],
    staff_mfa_sessions: [],
};

const auditEvents: Row[] = [];
let nextId = 1;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.key] === filter.value;
        // Treat undefined like NULL so `.is('used_at', null)` behaves like Postgres.
        if (filter.op === 'is') return (row[filter.key] ?? null) === filter.value;
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
    insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    upsert(payload: any, options?: { onConflict?: string }) {
        this.operation = 'upsert'; this.payload = payload; this.conflictKey = options?.onConflict ?? null; return this;
    }
    eq(key: string, value: any) { this.filters.push({ key, op: 'eq', value }); return this; }
    is(key: string, value: any) { this.filters.push({ key, op: 'is', value }); return this; }
    gt(key: string, value: any) { this.filters.push({ key, op: 'gt', value }); return this; }
    order(key: string, options?: { ascending?: boolean }) { this.sortKey = key; this.sortAscending = options?.ascending !== false; return this; }
    limit(value: number) { this.maxRows = value; return this; }
    single() { this.wantsSingle = true; return this.execute(); }
    maybeSingle() { this.wantsMaybeSingle = true; return this.execute(); }

    then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
        return this.execute().then(onfulfilled, onrejected);
    }

    private table() { tables[this.tableName] ??= []; return tables[this.tableName]; }

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
                    used_at: this.tableName.endsWith('_recovery_codes') ? (row.used_at ?? null) : row.used_at,
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
            tables[this.tableName] = table.filter((row) => !matches(row, this.filters));
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
    adminClient: { from: (tableName: string) => new QueryBuilder(tableName) },
}));

vi.mock('../audit.js', () => ({
    logSecurityEvent: vi.fn(async (eventType: string, payload: Row) => { auditEvents.push({ eventType, ...payload }); }),
}));

function base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0; let current = 0; const bytes: number[] = [];
    for (const char of value) {
        const index = alphabet.indexOf(char);
        current = (current << 5) | index; bits += 5;
        if (bits >= 8) { bytes.push((current >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Buffer.from(bytes);
}

function totp(secret: string, now = Date.now()): string {
    const counter = Math.floor(now / 1000 / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return String(binary % 1_000_000).padStart(6, '0');
}

describe('staff MFA runtime flow', () => {
    beforeEach(() => {
        Object.values(tables).forEach((rows) => rows.splice(0));
        auditEvents.splice(0);
        nextId = 1;
    });

    it('runs setup, session enforcement, recovery, regeneration, replacement, and disable end to end', async () => {
        const service = await import('../staff-mfa.js');
        const actor = { userId: 'auth-staff-1', email: 'admin@beverly.test' };

        // Not enrolled initially.
        expect(await service.staffMfaEnrolled(actor.userId)).toBe(false);
        const status0 = await service.staffMfaStatus(actor.userId, 'token-a');
        expect(status0.enrolled).toBe(false);
        expect(status0.verified).toBe(false);

        // Enroll: start -> verify with a real TOTP.
        const setup = await service.beginStaffMfaEnrollment(actor);
        expect(setup.otpauth_uri).toContain('otpauth://totp/');
        const enrollment = await service.verifyStaffMfaEnrollment(actor, 'token-a', totp(setup.secret), { ip: '127.0.0.1' });
        expect(enrollment.ok).toBe(true);
        expect(enrollment.recovery_codes).toHaveLength(10);

        // Session bound to the access token used at verify.
        expect(await service.staffMfaSessionVerified(actor.userId, 'token-a')).toBe(true);
        expect(await service.staffMfaSessionVerified(actor.userId, 'token-b')).toBe(false);
        expect(await service.staffMfaEnrolled(actor.userId)).toBe(true);
        expect(tables.staff_mfa_factors.filter((r) => r.status === 'active')).toHaveLength(1);

        // Cannot enroll again while active.
        await expect(service.beginStaffMfaEnrollment(actor)).rejects.toMatchObject({ code: 'mfa_already_enabled' });

        // Bad challenge rejected; recovery code accepted and creates a session for token-b.
        await expect(service.verifyStaffMfaChallenge(actor, 'token-b', '000000')).rejects.toMatchObject({ code: 'invalid_otp' });
        const recoveryUsed = enrollment.recovery_codes[0];
        const recoveryChallenge = await service.verifyStaffMfaChallenge(actor, 'token-b', recoveryUsed);
        expect(recoveryChallenge.recovery_code_used).toBe(true);
        expect(await service.staffMfaSessionVerified(actor.userId, 'token-b')).toBe(true);

        // A used recovery code cannot be reused.
        await expect(service.verifyStaffMfaChallenge(actor, 'token-x', recoveryUsed)).rejects.toMatchObject({ code: 'invalid_otp' });

        // Regenerate recovery codes -> old remaining codes are invalidated.
        const otherOldCode = enrollment.recovery_codes[1];
        const regen = await service.regenerateStaffRecoveryCodes(actor, totp(setup.secret));
        expect(regen.recovery_codes).toHaveLength(10);
        expect(regen.recovery_codes).not.toContain(otherOldCode);
        await expect(service.verifyStaffMfaChallenge(actor, 'token-y', otherOldCode)).rejects.toMatchObject({ code: 'invalid_otp' });
        // New code works.
        const newChallenge = await service.verifyStaffMfaChallenge(actor, 'token-y', regen.recovery_codes[0]);
        expect(newChallenge.recovery_code_used).toBe(true);

        // Replacement: old factor stays active until the new one is verified.
        const replacement = await service.beginStaffMfaReplacement(actor, totp(setup.secret));
        expect(tables.staff_mfa_factors.filter((r) => r.status === 'active')).toHaveLength(1);
        await service.verifyStaffMfaEnrollment(actor, 'token-c', totp(replacement.secret));
        expect(tables.staff_mfa_factors.filter((r) => r.status === 'active')).toHaveLength(1);
        expect(tables.staff_mfa_factors.filter((r) => r.status === 'replaced')).toHaveLength(1);
        expect(await service.staffMfaSessionVerified(actor.userId, 'token-c')).toBe(true);
        // Old authenticator no longer validates challenges.
        await expect(service.verifyStaffMfaChallenge(actor, 'token-z', totp(setup.secret))).rejects.toMatchObject({ code: 'invalid_otp' });

        // Disable with a current code from the active (replacement) authenticator.
        await service.disableStaffMfa(actor, totp(replacement.secret), { ip: '127.0.0.1' });
        expect(await service.staffMfaEnrolled(actor.userId)).toBe(false);
        expect(tables.staff_mfa_factors.filter((r) => r.status === 'active')).toHaveLength(0);
        expect(await service.staffMfaSessionVerified(actor.userId, 'token-c')).toBe(false);
        expect(tables.staff_mfa_recovery_codes).toHaveLength(0);

        expect(auditEvents.map((e) => e.eventType)).toEqual(
            expect.arrayContaining(['mfa_enabled', 'mfa_failure', 'mfa_disabled']),
        );
    });
});
