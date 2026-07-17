import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
    createDevApiKey,
    createDevWebhook,
    deleteDevJob,
    deleteDevWebhook,
    dryRunDevMigration,
    inspectDevEih,
    inspectLedgerEntry,
    listDevApiKeys,
    listDevApiLog,
    listDevDeployLog,
    listDevErrors,
    listDevHealth,
    listDevIncidents,
    listDevJobs,
    listDevMigrations,
    listDevNotificationTemplates,
    listDevQueues,
    listDevSchema,
    listDevSlowQueries,
    listDevSysConfig,
    listDevWebhookDeliveries,
    listDevWebhooks,
    listRoleMatrix,
    listSandboxActivity,
    getSandboxStatus,
    replayDevWebhookDelivery,
    resolveDevError,
    retryAllFailedDevJobs,
    retryDevJob,
    revokeDevApiKey,
    rotateDevApiKey,
    runMockVend,
    seedSandboxWallet,
    setSandboxMode,
    simulateDevVend,
    testDevNotificationTemplate,
    updateDevNotificationTemplate,
    updateDevSysConfig,
    updateDevWebhook,
} from '../services/dev-console.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG, ROLE_LABELS } from './admin-access-constants.js';

// Developer console routes. Registered inside the admin plugin, so every
// route inherits the admin preHandler chain: requireStaff, the /dev/* gate
// (DEV_CONSOLE_ENABLED + MFA + break-glass), requireAdminPermission
// ('dev.console' via ADMIN_ROUTE_PERMISSIONS), and station enforcement.
const adminDevRoutes: FastifyPluginAsync = async (fastify) => {
    // Developer console: all routes require dev.console via ADMIN_ROUTE_PERMISSIONS.
    fastify.get('/dev/api-keys', async () => ({ keys: await listDevApiKeys() }));

    fastify.post('/dev/api-keys', async (req) => {
        const schema = z.object({
            name: z.string().trim().min(2).max(120),
            org_id: z.string().trim().min(1).nullable().optional(),
            org_type: z.enum(['vendor', 'customer', 'system']).nullable().optional(),
            scopes: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
        });
        const body = schema.parse(req.body);
        return createDevApiKey({
            name: body.name,
            orgId: body.org_id ?? null,
            orgType: body.org_type ?? (body.org_id ? 'vendor' : null),
            scopes: body.scopes,
            actorUserId: req.actor!.userId,
        });
    });

    fastify.delete('/dev/api-keys/:id', async (req) => {
        await revokeDevApiKey((req.params as { id: string }).id, req.actor!.userId);
        return { ok: true };
    });

    fastify.post('/dev/api-keys/:id/rotate', async (req) => (
        rotateDevApiKey((req.params as { id: string }).id, req.actor!.userId)
    ));

    fastify.get('/dev/webhooks', async () => ({ webhooks: await listDevWebhooks() }));

    fastify.get('/dev/webhooks/deliveries', async (req) => {
        const query = req.query as { limit?: string };
        return { deliveries: await listDevWebhookDeliveries(Math.min(Number(query.limit ?? 100), 250)) };
    });

    fastify.post('/dev/webhooks', async (req) => {
        const schema = z.object({
            url: z.string().trim().url().max(1000),
            events: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
            secret: z.string().trim().min(10).max(300).optional(),
        });
        const body = schema.parse(req.body);
        await createDevWebhook({ ...body, actorUserId: req.actor!.userId });
        return { ok: true };
    });

    fastify.patch('/dev/webhooks/:id', async (req) => {
        const schema = z.object({
            url: z.string().trim().url().max(1000),
            events: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
            enabled: z.boolean(),
        });
        await updateDevWebhook((req.params as { id: string }).id, schema.parse(req.body));
        return { ok: true };
    });

    fastify.delete('/dev/webhooks/:id', async (req) => {
        await deleteDevWebhook((req.params as { id: string }).id);
        return { ok: true };
    });

    fastify.post('/dev/webhooks/deliveries/:id/replay', async (req) => {
        await replayDevWebhookDelivery((req.params as { id: string }).id, req.actor!.userId);
        return { ok: true };
    });

    fastify.get('/dev/api-log', async (req) => {
        const query = req.query as { limit?: string; cursor?: string; from?: string };
        return listDevApiLog({
            limit: Math.min(Number(query.limit ?? 50), 200),
            cursor: query.cursor,
            from: query.from,
        });
    });

    fastify.get('/dev/sandbox/status', async () => getSandboxStatus());
    fastify.get('/dev/sandbox/activity', async () => ({ activity: await listSandboxActivity() }));

    fastify.post('/dev/sandbox/mode', async (req) => {
        const body = z.object({ mode: z.literal('test') }).parse(req.body);
        await setSandboxMode(body.mode, req.actor!.userId);
        return { ok: true };
    });

    fastify.post('/dev/sandbox/seed-wallet', async (req) => {
        const body = z.object({
            org_id: z.string().trim().min(1),
            org_type: z.enum(['vendor', 'customer']),
            amount_kobo: z.number().int().positive().max(1_000_000_000),
        }).parse(req.body);
        return seedSandboxWallet({
            orgId: body.org_id,
            orgType: body.org_type,
            amountMinor: body.amount_kobo,
            actorUserId: req.actor!.userId,
        });
    });

    fastify.post('/dev/sandbox/mock-vend', async (req) => {
        const body = z.object({
            meter_number: z.string().trim().min(4).max(80),
            amount_kobo: z.number().int().positive().max(100_000_000),
            mock_response: z.enum(['success', 'disco_error', 'timeout', 'invalid_meter']),
        }).parse(req.body);
        return runMockVend({
            meterNumber: body.meter_number,
            amountMinor: body.amount_kobo,
            mockResponse: body.mock_response,
            actorUserId: req.actor!.userId,
        });
    });

    fastify.get('/dev/health', async () => ({ services: await listDevHealth() }));
    fastify.get('/dev/health/incidents', async () => ({ incidents: await listDevIncidents() }));
    fastify.get('/dev/queues', async () => ({ queues: await listDevQueues() }));

    fastify.get('/dev/queues/jobs', async (req) => {
        const query = req.query as { queue?: string; status?: 'pending' | 'processing' | 'failed' | 'completed'; limit?: string };
        return { jobs: await listDevJobs({ queue: query.queue, status: query.status, limit: Math.min(Number(query.limit ?? 100), 250) }) };
    });

    fastify.post('/dev/queues/jobs/:id/retry', async (req) => {
        await retryDevJob((req.params as { id: string }).id);
        return { ok: true };
    });

    fastify.delete('/dev/queues/jobs/:id', async (req) => {
        await deleteDevJob((req.params as { id: string }).id);
        return { ok: true };
    });

    fastify.post('/dev/queues/retry-all-failed', async () => {
        await retryAllFailedDevJobs();
        return { ok: true };
    });

    fastify.get('/dev/errors', async () => ({ groups: await listDevErrors() }));

    fastify.post('/dev/errors/:fingerprint/resolve', async (req) => {
        await resolveDevError((req.params as { fingerprint: string }).fingerprint, req.actor!.userId);
        return { ok: true };
    });

    fastify.get('/dev/slow-queries', async (req) => {
        const query = req.query as { threshold_ms?: string };
        return { queries: await listDevSlowQueries(Math.max(Number(query.threshold_ms ?? 500), 0)) };
    });

    fastify.post('/dev/toolkit/simulate-vend', async (req) => {
        const body = z.object({
            meter_number: z.string().trim().min(4).max(80),
            amount_kobo: z.number().int().positive().max(100_000_000),
            environment: z.enum(['test', 'live']),
        }).parse(req.body);
        return simulateDevVend({
            meterNumber: body.meter_number,
            amountMinor: body.amount_kobo,
            environment: body.environment,
            actorUserId: req.actor!.userId,
        });
    });

    fastify.post('/dev/toolkit/eih-inspect', async (req) => {
        const body = z.object({ transaction_id: z.string().trim().min(1).max(120) }).parse(req.body);
        return inspectDevEih(body.transaction_id);
    });

    fastify.get('/dev/toolkit/ledger/:id', async (req) => inspectLedgerEntry((req.params as { id: string }).id));
    fastify.get('/dev/migrations', async () => ({ migrations: await listDevMigrations() }));

    fastify.post('/dev/migrations/dry-run', async (req) => {
        const body = z.object({ version: z.string().trim().regex(/^\d{14}$/) }).parse(req.body);
        return dryRunDevMigration(body.version);
    });

    fastify.get('/dev/sys-config', async (req) => ({ configs: await listDevSysConfig(req.actor!.userId) }));

    fastify.put('/dev/sys-config/:key', async (req) => {
        const body = z.object({ value: z.string().max(20_000) }).parse(req.body);
        await updateDevSysConfig((req.params as { key: string }).key, body.value, req.actor!.userId);
        return { ok: true };
    });

    fastify.get('/dev/notif-templates', async (req) => ({ templates: await listDevNotificationTemplates(req.actor!.userId) }));

    fastify.put('/dev/notif-templates/:id', async (req) => {
        const body = z.object({ subject: z.string().max(300).nullable(), body: z.string().min(1).max(20_000) }).parse(req.body);
        await updateDevNotificationTemplate((req.params as { id: string }).id, body);
        return { ok: true };
    });

    fastify.post('/dev/notif-templates/:id/test-send', async (req) => {
        const body = z.object({
            target: z.string().trim().min(3).max(300),
            variables: z.record(z.string()).default({}),
        }).parse(req.body);
        await testDevNotificationTemplate((req.params as { id: string }).id, {
            target: body.target,
            variables: body.variables,
            actorUserId: req.actor!.userId,
        });
        return { ok: true };
    });

    fastify.get('/dev/schema', async () => ({ tables: await listDevSchema() }));
    fastify.get('/dev/role-matrix', async () => listRoleMatrix({
        catalog: PERMISSION_CATALOG,
        roleLabels: ROLE_LABELS,
        defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
    }));
    fastify.get('/dev/deploy-log', async () => ({ deploys: await listDevDeployLog() }));
};

export default adminDevRoutes;
