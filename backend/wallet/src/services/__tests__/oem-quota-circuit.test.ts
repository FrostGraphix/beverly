import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ row: null as Record<string, any> | null }));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        rpc: async (_name: string, input: Record<string, string>) => {
            const blockedUntil = new Date(state.row?.blocked_until ?? 0).getTime();
            const now = new Date(input.p_now).getTime();
            if (!state.row || state.row.status === 'ready') return { data: true, error: null };
            if (blockedUntil > now) return { data: false, error: null };
            state.row.blocked_until = input.p_probe_until;
            return { data: true, error: null };
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: state.row, error: null }),
                }),
            }),
            upsert: async (row: Record<string, any>) => {
                state.row = { ...row };
                return { data: state.row, error: null };
            },
            update: (patch: Record<string, any>) => ({
                eq: async () => {
                    state.row = state.row ? { ...state.row, ...patch } : null;
                    return { error: null };
                },
            }),
        }),
    },
}));

describe('OEM quota circuit', () => {
    beforeEach(() => {
        state.row = null;
    });

    it('blocks repeated vends until the probe window opens', async () => {
        const circuit = await import('../oem-quota-circuit.js');
        const failedAt = new Date('2026-09-17T12:00:00.000Z');
        await circuit.recordOemQuotaFailure(
            'oem-1',
            'OEM quota is exhausted.',
            failedAt,
        );

        await expect(circuit.assertOemVendAvailable(
            'oem-1',
            new Date('2026-09-17T12:01:00.000Z'),
        )).rejects.toMatchObject({
            code: 'oem_insufficient_quota',
            retryAfterSeconds: 240,
        });

        await expect(circuit.assertOemVendAvailable(
            'oem-1',
            new Date('2026-09-17T12:05:00.000Z'),
        )).resolves.toBeUndefined();
    });

    it('allows only one expired-circuit probe', async () => {
        const circuit = await import('../oem-quota-circuit.js');
        const failedAt = new Date('2026-09-17T12:00:00.000Z');
        await circuit.recordOemQuotaFailure('oem-1', 'OEM quota is exhausted.', failedAt);
        const probeAt = new Date('2026-09-17T12:05:00.000Z');

        await expect(circuit.claimOemVendProbe('oem-1', probeAt)).resolves.toBeUndefined();
        await expect(circuit.claimOemVendProbe('oem-1', probeAt)).rejects.toMatchObject({
            code: 'oem_insufficient_quota',
            retryAfterSeconds: 300,
        });
    });
});
