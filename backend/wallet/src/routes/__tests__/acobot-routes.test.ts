import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auditLogs: [] as unknown[],
    auditPermission: false,
    roleHasPermission: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: mocks.auditLogs, error: null })) })),
            })),
            insert: vi.fn(async () => ({ error: null })),
        })),
    },
}));

vi.mock('../../services/acobot-context.js', () => ({
    buildAcobotContext: vi.fn(async () => ({
        contextText: '', detectedIntents: [], deniedIntents: [], permissionStatus: 'granted',
    })),
}));

vi.mock('../../services/acobot-prompt.js', () => ({
    buildBeverlySystemPrompt: vi.fn(() => 'test prompt'),
}));

vi.mock('../../services/acobot-rbac.js', () => ({
    getPermittedIntentsForActor: vi.fn(async () => []),
}));

vi.mock('../../services/rbac.js', () => ({
    roleHasPermission: mocks.roleHasPermission,
}));

import acobotRoutes from '../acobot.js';

async function appFor(role: string) {
    const app = Fastify();
    (app as any).decorate('requireAuth', () => async () => undefined);
    app.addHook('preHandler', async (req) => {
        req.actor = {
            userId: 'actor-1', actorId: 'actor-1', email: 'operator@example.com',
            type: 'staff', role, mfaEnrolled: true, mfaVerified: true,
        };
    });
    await app.register(acobotRoutes);
    return app;
}

describe('Acobot audit-log authorization', () => {
    beforeEach(() => {
        mocks.auditLogs = [{ id: 'log-1', user_prompt: 'private customer request' }];
        mocks.roleHasPermission.mockReset();
    });

    it('denies staff without the audit permission', async () => {
        mocks.roleHasPermission.mockResolvedValue(false);
        const app = await appFor('account');
        const response = await app.inject({ method: 'GET', url: '/logs' });
        await app.close();

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: 'permission_denied' });
        expect(mocks.roleHasPermission).toHaveBeenCalledWith('account', 'wallet.audit.view');
    });

    it('returns logs only with audit permission', async () => {
        mocks.roleHasPermission.mockResolvedValue(true);
        const app = await appFor('super-admin');
        const response = await app.inject({ method: 'GET', url: '/logs' });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ logs: mocks.auditLogs });
    });
});
