/**
 * Admin (staff) routes — /api/v1/admin/*
 *
 * Staff actions: vendor onboarding, funding approval, monitoring.
 * All actions audit-logged.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { assertClientIdempotencyKey } from '../services/idempotency.js';
import { adminClient } from '../db/supabase.js';
import {
    createVendorOrganization, setVendorStatus,
} from '../services/vendor-onboarding.js';
import {
    approveFundingRequest, rejectFundingRequest, listPendingFunding, reconcileApprovedFundingCredits, attachProofUrls,
} from '../services/funding.js';
import { getBalance } from '../services/ledger.js';
import { setOwnerWalletStatus, setWalletStatus, WalletStateError } from '../services/wallets.js';
import { logAction } from '../services/audit.js';
import { resolveAssessment } from '../services/fraud-engine.js';
import { listStations, invalidateStationsCache, TokenEngineError } from '../services/token-engine.js';
import { listAllDisputes, updateDisputeStatus, addMessage, getDispute } from '../services/disputes.js';
import {
    listFaqCategories, listFaqs, upsertFaqCategory, deleteFaqCategory, upsertFaq, deleteFaq,
    listTickets, getTicket, addTicketMessage, updateTicket, ticketStats,
    listChatSessions, getChatSession, getChatMessages, sendChatMessage, endChatSession, assignChatSession,
} from '../services/support.js';
import { listRefundRequests, createRefundRequest, approveRefund, rejectRefund, getRefundSummary } from '../services/refunds.js';
import { listSettlementBatches } from '../services/settlement.js';
import { listReconciliationRuns, runDailyReconciliation } from '../services/reconciliation.js';
import { listFlags, setFlag, createFlag } from '../services/feature-flags.js';
import { notifyStaffInvitation, notifyRoleAssignment, notifyStationAssignment, notifyAdminAnnouncement } from '../services/admin-notifications.js';
import { approveVatPolicy, listVatPolicies, submitVatPolicy } from '../services/vat-policy.js';
import { listDeletionRequests, reviewDeletionRequest } from '../services/data-privacy.js';
import {
    PERMISSION_CATALOG, DEFAULT_ROLE_PERMISSIONS,
    ensureAccessDefaults, permissionsForRole,
} from '../services/rbac.js';

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function toCsv<T extends object>(rows: T[], columns: string[]): string {
    return [
        columns.map(csvEscape).join(','),
        ...rows.map((row) => columns.map((column) => csvEscape((row as Record<string, unknown>)[column])).join(',')),
    ].join('\n');
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanSearchTerm(value: unknown): string {
    return String(value ?? '').trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

const OPEN_ADMIN_ROUTES = new Set(['GET /me']);

const ADMIN_ROUTE_PERMISSIONS: Record<string, string> = {
    'GET /access': 'wallet.access.manage',
    'POST /access/roles': 'wallet.access.manage',
    'PATCH /access/roles/:roleKey': 'wallet.access.manage',
    'DELETE /access/roles/:roleKey': 'wallet.access.manage',
    'PUT /access/roles/:roleKey/permissions': 'wallet.access.manage',
    'POST /access/users': 'wallet.access.manage',
    'PATCH /access/users/:userId/role': 'wallet.access.manage',
    'PATCH /access/users/:userId/station': 'wallet.access.manage',
    'PATCH /access/users/:userId/suspension': 'wallet.access.manage',
    'POST /access/users/:userId/reset-password': 'wallet.access.manage',
    'POST /access/users/:userId/revoke-sessions': 'wallet.access.manage',
    'GET /stations': 'wallet.vending.monitor',
    'POST /stations/refresh': 'wallet.vending.monitor',
    'GET /vendor-applications': 'wallet.vendors.review',
    'DELETE /vendor-applications/:id': 'wallet.vendors.manage',
    'POST /vendors': 'wallet.vendors.manage',
    'GET /vendors': 'wallet.vendors.review',
    'GET /vendors/summary': 'wallet.vendors.review',
    'DELETE /vendors/:id': 'wallet.vendors.manage',
    'PATCH /vendors/:id/status': 'wallet.vendors.manage',
    'PATCH /vendors/:id/station': 'wallet.vendors.manage',
    'PATCH /vendors/:id/profile-picture': 'wallet.vendors.manage',
    'GET /vendors/:id': 'wallet.vendors.review',
    'GET /vendors/:id/wallet': 'wallet.vendors.review',
    'GET /vendors/:id/transactions': 'wallet.vending.monitor',
    'GET /vendors/:id/funding': 'wallet.funding.view',
    'GET /vendors/:id/staff': 'wallet.vendors.review',
    'GET /vendors/:id/analytics': 'wallet.vending.monitor',
    'GET /funding/pending': 'wallet.funding.view',
    'GET /funding/history': 'wallet.funding.view',
    'POST /funding/reconcile-approved': 'wallet.funding.approve',
    'POST /funding/:id/approve': 'wallet.funding.approve',
    'POST /funding/:id/reject': 'wallet.funding.approve',
    'GET /wallets': 'wallet.funding.view',
    'GET /wallets/summary': 'wallet.funding.view',
    'GET /wallets/:id': 'wallet.funding.view',
    'GET /wallets/:id/ledger': 'wallet.funding.view',
    'PATCH /wallets/:id/status': 'wallet.funding.approve',
    'PATCH /wallets/:id/limits': 'wallet.funding.approve',
    'GET /customers': 'wallet.customers.view',
    'GET /customers/summary': 'wallet.customers.view',
    'GET /customers/:id': 'wallet.customers.view',
    'GET /customers/:id/wallet': 'wallet.customers.view',
    'GET /customers/:id/purchases': 'wallet.vending.monitor',
    'GET /customers/:id/funding': 'wallet.funding.view',
    'DELETE /customers/:id': 'wallet.funding.approve',
    'PATCH /customers/:id/status': 'wallet.funding.approve',
    'PATCH /customers/:id/profile-picture': 'wallet.funding.approve',
    'GET /purchases': 'wallet.vending.monitor',
    'GET /vending': 'wallet.vending.monitor',
    'GET /purchases/summary': 'wallet.vending.monitor',
    'GET /purchases/:id': 'wallet.vending.monitor',
    'POST /purchases/:id/resend-sms':    'wallet.vending.monitor',
    'POST /purchases/:id/resend-remote': 'wallet.vending.monitor',
    'GET /meter-orders': 'wallet.vendors.review',
    'GET /meter-orders/stats': 'wallet.vendors.review',
    'GET /meter-orders/:id': 'wallet.vendors.review',
    'POST /meter-orders': 'wallet.vendors.manage',
    'PATCH /meter-orders/:id': 'wallet.vendors.manage',
    'GET /fraud': 'wallet.fraud.review',
    'PATCH /fraud/:id/resolve': 'wallet.fraud.review',
    'GET /disputes': 'wallet.disputes.manage',
    'GET /disputes/:id': 'wallet.disputes.manage',
    'PATCH /disputes/:id': 'wallet.disputes.manage',
    'GET /support/faqs': 'wallet.support.manage',
    'GET /support/faq-categories': 'wallet.support.manage',
    'POST /support/faqs': 'wallet.support.manage',
    'PUT /support/faqs/:id': 'wallet.support.manage',
    'DELETE /support/faqs/:id': 'wallet.support.manage',
    'POST /support/faq-categories': 'wallet.support.manage',
    'PUT /support/faq-categories/:id': 'wallet.support.manage',
    'DELETE /support/faq-categories/:id': 'wallet.support.manage',
    'GET /support/tickets': 'wallet.support.manage',
    'GET /support/tickets/stats': 'wallet.support.manage',
    'GET /support/tickets/:id': 'wallet.support.manage',
    'PATCH /support/tickets/:id': 'wallet.support.manage',
    'POST /support/tickets/:id/messages': 'wallet.support.manage',
    'GET /support/chat/sessions': 'wallet.support.manage',
    'GET /support/chat/:id': 'wallet.support.manage',
    'GET /support/chat/:id/messages': 'wallet.support.manage',
    'POST /support/chat/:id/messages': 'wallet.support.manage',
    'POST /support/chat/:id/assign': 'wallet.support.manage',
    'POST /support/chat/:id/end': 'wallet.support.manage',
    'GET /announcements': 'wallet.announcements.manage',
    'GET /announcements/recipients': 'wallet.announcements.manage',
    'GET /announcements/recipients/export.csv': 'wallet.announcements.manage',
    'POST /announcements': 'wallet.announcements.manage',
    'GET /refunds': 'wallet.refunds.manage',
    'GET /refunds/summary': 'wallet.refunds.manage',
    'POST /refunds': 'wallet.refunds.manage',
    'POST /refunds/:id/approve': 'wallet.refunds.manage',
    'POST /refunds/:id/reject': 'wallet.refunds.manage',
    'GET /settlement': 'wallet.settlement.view',
    'GET /reconciliation': 'wallet.reconciliation.run',
    'POST /reconciliation/run': 'wallet.reconciliation.run',
    'GET /audit': 'wallet.audit.view',
    'GET /audit/:id': 'wallet.audit.view',
    'GET /audit/export.csv': 'wallet.audit.view',
    'GET /security-events': 'wallet.audit.view',
    'GET /audit/summary': 'wallet.audit.view',
    'GET /reports/overview': 'wallet.dashboard.view',
    'GET /reports/export.csv': 'wallet.dashboard.view',
    'GET /feature-flags': 'wallet.flags.manage',
    'POST /feature-flags': 'wallet.flags.manage',
    'PATCH /feature-flags/:key': 'wallet.flags.manage',
    'GET /vat-policies': 'wallet.vat.manage',
    'POST /vat-policies': 'wallet.vat.manage',
    'POST /vat-policies/:id/approve': 'wallet.vat.manage',
    'GET /privacy/deletions': 'wallet.privacy.review',
    'PATCH /privacy/deletions/:id': 'wallet.privacy.review',
    'GET /consumption': 'wallet.consumption.view',
    'GET /consumption/meters': 'wallet.consumption.view',
    'GET /abnormal-alarms': 'wallet.consumption.view',
    'POST /consumption/refresh': 'wallet.consumption.view',
    'GET /dev/api-keys': 'dev.console',
    'POST /dev/api-keys': 'dev.console',
    'DELETE /dev/api-keys/:id': 'dev.console',
    'POST /dev/api-keys/:id/rotate': 'dev.console',
    'GET /dev/webhooks': 'dev.console',
    'POST /dev/webhooks': 'dev.console',
    'PATCH /dev/webhooks/:id': 'dev.console',
    'DELETE /dev/webhooks/:id': 'dev.console',
    'GET /dev/webhooks/deliveries': 'dev.console',
    'POST /dev/webhooks/deliveries/:id/replay': 'dev.console',
    'GET /dev/api-log': 'dev.console',
    'GET /dev/sandbox/status': 'dev.console',
    'GET /dev/sandbox/activity': 'dev.console',
    'POST /dev/sandbox/mode': 'dev.console',
    'POST /dev/sandbox/seed-wallet': 'dev.console',
    'POST /dev/sandbox/mock-vend': 'dev.console',
    'GET /dev/health': 'dev.console',
    'GET /dev/health/incidents': 'dev.console',
    'GET /dev/queues': 'dev.console',
    'GET /dev/queues/jobs': 'dev.console',
    'POST /dev/queues/jobs/:id/retry': 'dev.console',
    'DELETE /dev/queues/jobs/:id': 'dev.console',
    'POST /dev/queues/retry-all-failed': 'dev.console',
    'GET /dev/errors': 'dev.console',
    'POST /dev/errors/:fingerprint/resolve': 'dev.console',
    'GET /dev/slow-queries': 'dev.console',
    'POST /dev/toolkit/simulate-vend': 'dev.console',
    'POST /dev/toolkit/eih-inspect': 'dev.console',
    'GET /dev/toolkit/ledger/:id': 'dev.console',
    'GET /dev/migrations': 'dev.console',
    'POST /dev/migrations/dry-run': 'dev.console',
    'GET /dev/sys-config': 'dev.console',
    'PUT /dev/sys-config/:key': 'dev.console',
    'GET /dev/notif-templates': 'dev.console',
    'PUT /dev/notif-templates/:id': 'dev.console',
    'POST /dev/notif-templates/:id/test-send': 'dev.console',
    'GET /dev/schema': 'dev.console',
    'GET /dev/role-matrix': 'dev.console',
    'GET /dev/deploy-log': 'dev.console',
};
function adminRouteKey(req: FastifyRequest): string {
    const routeUrl = (req.routeOptions?.url ?? req.url.split('?')[0] ?? '').replace(/^\/api\/v1\/admin/, '') || '/';
    return `${req.method.toUpperCase()} ${routeUrl}`;
}

async function requireAdminPermission(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const key = adminRouteKey(req);
    if (OPEN_ADMIN_ROUTES.has(key)) return true;
    const permission = ADMIN_ROUTE_PERMISSIONS[key];
    if (!permission) {
        reply.code(403).send({
            error: 'permission_not_mapped',
            message: `No access policy is mapped for ${key}.`,
        });
        return false;
    }
    const grants = await permissionsForRole(req.actor!.role);
    if (!grants.has(permission)) {
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'access.permission_denied',
            targetType: 'admin_route',
            targetId: key,
            metadata: { permission },
        }).catch(() => undefined);
        reply.code(403).send({
            error: 'permission_denied',
            message: `Missing permission: ${permission}.`,
            details: { permission },
        });
        return false;
    }
    return true;
}

function requireAccessManager(req: any, reply: any): boolean {
    if (req.actor?.role !== 'super-admin') {
        reply.code(403).send({
            error: 'forbidden',
            message: 'Only Super Admins can change roles and permissions.',
        });
        return false;
    }
    return true;
}

function staffStations(req: FastifyRequest): string[] | null {
    if (req.actor?.role === 'super-admin') return null;
    return [...new Set((req.actor?.stationIds ?? [req.actor?.stationId])
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean))];
}

function scopeStations(query: any, stationIds: string[] | null, column = 'station_id') {
    return stationIds ? query.in(column, stationIds) : query;
}

function missingColumn(error: { message?: string } | null, column: string) {
    const message = String(error?.message ?? '').toLowerCase();
    return message.includes(column.toLowerCase())
        && (message.includes('schema cache') || message.includes('does not exist'));
}

async function stationOwnerIds(stationIds: string[]): Promise<{ vendors: Set<string>; customers: Set<string> }> {
    const [{ data: vendors }, { data: meters }] = await Promise.all([
        adminClient.from('vendor_organizations').select('id').overlaps('operating_stations', stationIds),
        adminClient.from('customer_meters').select('customer_id').in('station_id', stationIds),
    ]);
    return {
        vendors: new Set((vendors ?? []).map((row: any) => row.id)),
        customers: new Set((meters ?? []).map((row: any) => row.customer_id)),
    };
}

async function listStoredStations(): Promise<Array<{ stationId: string; name: string; remark: null }>> {
    const [{ data: readings }, { data: vendors }] = await Promise.all([
        adminClient.from('daily_meter_readings').select('station_id').not('station_id', 'is', null).limit(5000),
        adminClient.from('vendor_organizations').select('operating_stations').limit(1000),
    ]);
    const ids = new Set<string>();
    for (const row of readings ?? []) if ((row as any).station_id) ids.add(String((row as any).station_id).trim().toUpperCase());
    for (const row of vendors ?? []) for (const id of (row as any).operating_stations ?? []) if (id) ids.add(String(id).trim().toUpperCase());
    return [...ids].filter(Boolean).sort().map((stationId) => ({ stationId, name: stationId, remark: null }));
}

async function enforceResourceStation(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (OPEN_ADMIN_ROUTES.has(adminRouteKey(req))) return true;
    const stationIds = staffStations(req);
    if (stationIds === null) return true;
    if (!stationIds.length) {
        reply.code(403).send({ error: 'station_required', message: 'Your staff account needs a station assignment.' });
        return false;
    }

    const routeUrl = req.routeOptions?.url ?? '';
    const id = (req.params as { id?: string })?.id;
    if (!id) return true;

    if (routeUrl.startsWith('/wallets/:id')) {
        const [{ data: wallet }, owners] = await Promise.all([
            adminClient.from('wallets').select('owner_type, owner_id').eq('id', id).maybeSingle(),
            stationOwnerIds(stationIds),
        ]);
        const allowed = wallet?.owner_type === 'vendor' ? owners.vendors.has(wallet.owner_id) : owners.customers.has(wallet?.owner_id);
        if (allowed) return true;
        reply.code(404).send({ error: 'not_found', message: 'Wallet not found for your assigned station.' });
        return false;
    }

    if (routeUrl.startsWith('/funding/:id')) {
        const [{ data: funding }, owners] = await Promise.all([
            adminClient.from('funding_requests').select('vendor_organization_id').eq('id', id).maybeSingle(),
            stationOwnerIds(stationIds),
        ]);
        if (funding && owners.vendors.has(funding.vendor_organization_id)) return true;
        reply.code(404).send({ error: 'not_found', message: 'Funding request not found for your assigned station.' });
        return false;
    }

    let query: any = null;
    if (routeUrl.startsWith('/vendors/:id')) {
        query = adminClient.from('vendor_organizations').select('id').eq('id', id).overlaps('operating_stations', stationIds);
    } else if (routeUrl.startsWith('/customers/:id')) {
        query = adminClient.from('customer_meters').select('id').eq('customer_id', id).in('station_id', stationIds);
    } else if (routeUrl.startsWith('/purchases/:id')) {
        query = adminClient.from('purchase_orders').select('id').eq('id', id).in('station_id', stationIds);
    } else if (routeUrl.startsWith('/meter-orders/:id')) {
        query = adminClient.from('meter_purchase_orders').select('id').eq('id', id).in('station_id', stationIds);
    }
    if (!query) return true;

    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) {
        reply.code(404).send({ error: 'not_found', message: 'Record not found for your assigned station.' });
        return false;
    }
    return true;
}

function requireWalletStatusManager(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.actor?.role !== 'super-admin') {
        reply.code(403).send({
            error: 'forbidden',
            message: 'Only Super Admins can freeze, unfreeze, close, or reactivate wallets.',
        });
        return false;
    }
    return true;
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('preHandler', fastify.requireStaff());
    fastify.addHook('preHandler', async (req, reply) => {
        const pathname = req.routeOptions?.url ?? req.url.split('?')[0] ?? '';
        if (pathname.startsWith('/dev/')) {
            if (!env.DEV_CONSOLE_ENABLED) {
                return reply.code(404).send({ error: 'not_found', message: 'Route not found.' });
            }
            if (!req.actor?.mfaVerified) {
                return reply.code(403).send({ error: 'reauth_required', message: 'Reauthenticate with two-factor authentication before using developer tools.' });
            }
            if (env.NODE_ENV !== 'development') {
                const token = req.headers['x-break-glass-token'];
                if (!env.DEV_CONSOLE_BREAK_GLASS_TOKEN || token !== env.DEV_CONSOLE_BREAK_GLASS_TOKEN) {
                    return reply.code(403).send({ error: 'break_glass_required', message: 'Break-glass authorization is required.' });
                }
            }
            await logAction({
                actorUserId: req.actor.userId,
                actorType: 'staff',
                actorRole: req.actor.role,
                action: 'dev_console.accessed',
                targetType: 'admin_route',
                targetId: `${req.method.toUpperCase()} ${pathname}`,
                metadata: { environment: env.NODE_ENV },
            });
        }
        // ensureAccessDefaults() is called inside requireAdminPermission → permissionsForRole
        // and is cached after the first run — no need to call it again here.
        if (!(await requireAdminPermission(req, reply))) return undefined;
        if (reply.sent || !(await enforceResourceStation(req, reply))) return undefined;
        return undefined;
    });

    fastify.get('/me', async (req) => {
        const permissions = Array.from(await permissionsForRole(req.actor!.role));
        let staffResult = await adminClient
            .from('users')
            .select('id, auth_user_id, user_id, user_name, email, role_key, station_id, station_ids, profile_picture_url, updated_at')
            .or(`auth_user_id.eq.${req.actor!.userId},user_id.eq.${req.actor!.userId}`)
            .maybeSingle();
        if (missingColumn(staffResult.error, 'station_ids')) {
            staffResult = await adminClient
                .from('users')
                .select('id, auth_user_id, user_id, user_name, email, role_key, station_id, profile_picture_url, updated_at')
                .or(`auth_user_id.eq.${req.actor!.userId},user_id.eq.${req.actor!.userId}`)
                .maybeSingle();
        }
        return {
            user: shapeStaffProfile(req.actor, staffResult.data),
            permissions,
            catalog: PERMISSION_CATALOG,
        };
    });

    fastify.post('/logout', async (req) => {
        await revokePortalSession(req.portalSessionKey);
        return { ok: true };
    });

    fastify.patch('/me', async (req, reply) => {
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'profile_picture_url')) {
            return reply.code(400).send({ error: 'profile_picture_url_forbidden', message: 'Use the verified profile-picture upload flow.' });
        }
        const schema = z.object({
            full_name: z.string().trim().min(1).max(120).optional(),
        });
        const body = schema.parse(req.body ?? {});
        const updates: Record<string, unknown> = {};
        if (body.full_name !== undefined) updates.user_name = body.full_name;
        if (!Object.keys(updates).length) {
            return reply.code(400).send({ error: 'no_fields', message: 'Nothing to update.' });
        }

        const { data: existing } = await adminClient
            .from('users')
            .select('id, auth_user_id, user_id, user_name, email, role_key, profile_picture_url, updated_at')
            .or(`auth_user_id.eq.${req.actor!.userId},user_id.eq.${req.actor!.userId}`)
            .maybeSingle();

        let data: any = null;
        let error: any = null;
        if (existing?.id) {
            const result = await adminClient
                .from('users')
                .update(updates)
                .eq('id', existing.id)
                .select('id, auth_user_id, user_id, user_name, email, role_key, profile_picture_url, updated_at')
                .single();
            data = result.data;
            error = result.error;
        } else {
            const result = await adminClient
                .from('users')
                .insert({
                    auth_user_id: req.actor!.userId,
                    user_id: req.actor!.userId,
                    user_name: body.full_name ?? null,
                    email: req.actor!.email,
                    role_key: req.actor!.role,
                    profile_picture_url: null,
                })
                .select('id, auth_user_id, user_id, user_name, email, role_key, profile_picture_url, updated_at')
                .single();
            data = result.data;
            error = result.error;
        }
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return {
            user: shapeStaffProfile(req.actor, data),
            permissions: Array.from(await permissionsForRole(req.actor!.role)),
        };
    });

    fastify.post('/profile-picture/upload-url', async (req, reply) => {
        let sop;
        try {
            sop = assertProfilePictureSop(req.body ?? {});
        } catch (error: any) {
            return reply.code(400).send({ error: 'invalid_profile_picture', message: error?.message ?? 'Invalid upload payload.' });
        }
        const path = toProfilePicturePath('staff', req.actor!.userId, sop.file_name);
        const { data, error } = await adminClient.storage.from(PROFILE_PICTURE_BUCKET).createSignedUploadUrl(path);
        if (error) return reply.code(500).send({ error: 'upload_url_failed', message: error.message });
        const { data: pub } = adminClient.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(path);
        return {
            bucket: PROFILE_PICTURE_BUCKET,
            path,
            token: data?.token,
            signed_url: data?.signedUrl,
            public_url: pub?.publicUrl ?? null,
            sop: { max_bytes: 2 * 1024 * 1024, allowed_types: ['image/jpeg', 'image/png', 'image/webp'] },
        };
    });

    fastify.post('/profile-picture/scan', async (req, reply) => {
        const schema = z.object({
            file_name: z.string().min(1).max(160),
            content_base64: z.string().min(8),
        });
        const body = schema.parse(req.body ?? {});
        const scan = await runMalwareScan(Buffer.from(body.content_base64, 'base64'), body.file_name);
        if (!scan.ok) return reply.code(422).send({ error: 'malware_scan_failed', details: scan.output ?? null });
        return { ok: true, mode: scan.mode };
    });

    fastify.post('/profile-picture/activate', async (req, reply) => {
        const { path } = z.object({ path: z.string().min(1).max(500) }).parse(req.body ?? {});
        try {
            const profilePictureUrl = await activateProfilePicture('staff', req.actor!.userId, path);
            await adminClient.from('users')
                .update({ profile_picture_url: profilePictureUrl })
                .or(`auth_user_id.eq.${req.actor!.userId},user_id.eq.${req.actor!.userId}`);
            return { profile_picture_url: profilePictureUrl };
        } catch {
            return reply.code(422).send({ error: 'profile_picture_activation_failed' });
        }
    });

    fastify.delete('/profile-picture', async (req) => {
        await adminClient
            .from('users')
            .update({ profile_picture_url: null })
            .or(`auth_user_id.eq.${req.actor!.userId},user_id.eq.${req.actor!.userId}`);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'staff.profile_picture.deleted',
            targetType: 'staff_user',
            targetId: req.actor!.userId,
        });
        return { ok: true };
    });

    fastify.get('/access', async () => {
        await ensureAccessDefaults();
        const [roleResult, permissionResult, initialStaffResult, authUsers] = await Promise.all([
            adminClient.from('roles').select('*').order('role_key', { ascending: true }),
            adminClient.from('permissions').select('*').order('role_key', { ascending: true }),
            adminClient.from('users').select('id, auth_user_id, user_id, user_name, email, role_key, station_id, station_ids, created_at, updated_at').order('updated_at', { ascending: false }).limit(300),
            adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
        const staffResult = missingColumn(initialStaffResult.error, 'station_ids')
            ? await adminClient.from('users').select('id, auth_user_id, user_id, user_name, email, role_key, station_id, created_at, updated_at').order('updated_at', { ascending: false }).limit(300)
            : initialStaffResult;
        const roles = roleResult.data;
        const permissions = permissionResult.data;
        const staffRows = staffResult.data;
        const authById = new Map((authUsers.data?.users ?? []).map((user) => [user.id, user]));
        const staff = (staffRows ?? []).map((row: any) => {
            const authUser = authById.get(row.auth_user_id ?? row.user_id);
            return {
                ...row,
                auth_user_id: row.auth_user_id ?? row.user_id ?? null,
                email: row.email ?? authUser?.email ?? null,
                user_name: row.user_name ?? authUser?.user_metadata?.full_name ?? authUser?.email ?? 'Staff user',
                last_sign_in_at: authUser?.last_sign_in_at ?? null,
                confirmed_at: authUser?.confirmed_at ?? null,
                suspended: Boolean(authUser?.banned_until && new Date(authUser.banned_until).getTime() > Date.now()),
                auth_role: authUser?.user_metadata?.role_key ?? authUser?.app_metadata?.role_key ?? authUser?.user_metadata?.role ?? null,
            };
        });
        return {
            catalog: PERMISSION_CATALOG,
            roles: roles ?? [],
            permissions: permissions ?? [],
            staff,
            defaults: DEFAULT_ROLE_PERMISSIONS,
        };
    });

    fastify.put('/access/roles/:roleKey/permissions', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const roleKey = (req.params as { roleKey: string }).roleKey;
        const schema = z.object({
            permissions: z.array(z.string()).default([]),
        });
        const body = schema.parse(req.body);
        const { data: role } = await adminClient.from('roles').select('role_key').eq('role_key', roleKey).maybeSingle();
        if (!role) return reply.code(404).send({ error: 'role_not_found', message: 'Role was not found.' });
        const valid = new Set(PERMISSION_CATALOG.map((p) => p.key));
        const next = Array.from(new Set(body.permissions.filter((p) => valid.has(p))));
        if (roleKey === 'super-admin' && next.length !== PERMISSION_CATALOG.length) {
            return reply.code(400).send({
                error: 'super_admin_locked',
                message: 'Super Admin must keep the full permission set.',
            });
        }
        await ensureAccessDefaults();
        await adminClient.from('permissions').delete().eq('role_key', roleKey);
        if (next.length) {
            const { error } = await adminClient.from('permissions').insert(
                next.map((permission) => ({ role_key: roleKey, route_hash: permission })),
            );
            if (error) return reply.code(400).send({ error: 'permission_update_failed', message: error.message });
        }
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'access.permissions.update',
            targetType: 'role',
            targetId: roleKey,
            after: { permissions: next },
        });
        return { ok: true, roleKey, permissions: next };
    });

    fastify.post('/access/roles', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const body = z.object({
            name: z.string().trim().min(2).max(64),
            description: z.string().trim().max(240).optional().default(''),
            permissions: z.array(z.string()).max(PERMISSION_CATALOG.length).default([]),
        }).parse(req.body);
        const slug = body.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const roleKey = `custom-${slug}`;
        if (slug.length < 2) {
            return reply.code(400).send({ error: 'invalid_role_name', message: 'Choose a unique custom role name.' });
        }
        const { data: existing } = await adminClient.from('roles').select('role_key').eq('role_key', roleKey).maybeSingle();
        if (existing) return reply.code(409).send({ error: 'role_exists', message: 'A role with this name already exists.' });
        const valid = new Set(PERMISSION_CATALOG.map((p) => p.key));
        const selectedPermissions = [...new Set(body.permissions.filter((p) => valid.has(p)))];
        const { data: role, error: roleError } = await adminClient.from('roles').insert({
            name: roleKey, role_key: roleKey, role_name: body.name, label: body.name, description: body.description || null,
        }).select('role_key, role_name, label, description').single();
        if (roleError || !role) return reply.code(400).send({ error: 'role_create_failed', message: roleError?.message ?? 'Could not create role.' });
        if (selectedPermissions.length) {
            const { error: permissionError } = await adminClient.from('permissions').insert(
                selectedPermissions.map((route_hash) => ({ role_key: roleKey, route_hash })),
            );
            if (permissionError) {
                await adminClient.from('roles').delete().eq('role_key', roleKey);
                return reply.code(400).send({ error: 'role_permission_create_failed', message: permissionError.message });
            }
        }
        await logAction({ actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: 'access.role.created', targetType: 'role', targetId: roleKey, after: { name: body.name, permissions: selectedPermissions } });
        return { ok: true, role, permissions: selectedPermissions };
    });

    fastify.patch('/access/roles/:roleKey', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const roleKey = (req.params as { roleKey: string }).roleKey;
        if (SYSTEM_ROLE_KEYS.has(roleKey)) return reply.code(400).send({ error: 'system_role_locked', message: 'System roles cannot be renamed.' });
        const body = z.object({ name: z.string().trim().min(2).max(64), description: z.string().trim().max(240).optional().default('') }).parse(req.body);
        const { data: role, error } = await adminClient.from('roles').update({ role_name: body.name, label: body.name, description: body.description || null, updated_at: new Date().toISOString() })
            .eq('role_key', roleKey).select('role_key, role_name, label, description').maybeSingle();
        if (error || !role) return reply.code(404).send({ error: 'role_not_found', message: error?.message ?? 'Role was not found.' });
        await logAction({ actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: 'access.role.updated', targetType: 'role', targetId: roleKey, after: body });
        return { ok: true, role };
    });

    fastify.delete('/access/roles/:roleKey', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const roleKey = (req.params as { roleKey: string }).roleKey;
        if (SYSTEM_ROLE_KEYS.has(roleKey)) return reply.code(400).send({ error: 'system_role_locked', message: 'System roles cannot be deleted.' });
        const { count, error: countError } = await adminClient.from('users').select('id', { count: 'exact', head: true }).eq('role_key', roleKey);
        if (countError) return reply.code(400).send({ error: 'role_usage_check_failed', message: countError.message });
        if (count) return reply.code(409).send({ error: 'role_in_use', message: 'Reassign staff before deleting this role.' });
        const { error } = await adminClient.from('roles').delete().eq('role_key', roleKey);
        if (error) return reply.code(400).send({ error: 'role_delete_failed', message: error.message });
        await logAction({ actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: 'access.role.deleted', targetType: 'role', targetId: roleKey });
        return { ok: true, roleKey };
    });

    fastify.post('/access/users', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const schema = z.object({
            email: z.string().email(),
            fullName: z.string().min(2),
            roleKey: z.string().trim().min(2).max(80),
            stationIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
            temporaryPassword: z.string().min(12).optional(),
        });
        const body = schema.parse(req.body);
        const stationIds = [...new Set(body.stationIds.map((value) => value.toUpperCase()))];
        const { data: assignedRole } = await adminClient.from('roles').select('role_key, role_name, label').eq('role_key', body.roleKey).maybeSingle();
        if (!assignedRole) return reply.code(400).send({ error: 'role_not_found', message: 'Choose an existing role.' });
        const password = body.temporaryPassword ?? `Beverly-${crypto.randomUUID().slice(0, 8)}aA1!`;
        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
            email: body.email.toLowerCase(),
            password,
            email_confirm: true,
            user_metadata: { role_key: body.roleKey, role: body.roleKey, full_name: body.fullName, station_id: stationIds[0], station_ids: stationIds },
        });
        if (authErr || !authData.user) {
            return reply.code(400).send({ error: 'user_create_failed', message: authErr?.message ?? 'Could not create staff user.' });
        }
        const { error: rowErr } = await adminClient.from('users').upsert({
            auth_user_id: authData.user.id,
            user_id: authData.user.id,
            user_name: body.fullName,
            email: body.email.toLowerCase(),
            role_key: body.roleKey,
            station_id: stationIds[0],
            station_ids: stationIds,
        }, { onConflict: 'user_id' });
        if (rowErr) {
            await adminClient.auth.admin.deleteUser(authData.user.id);
            return reply.code(400).send({ error: 'staff_profile_failed', message: rowErr.message });
        }
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'access.user.create',
            targetType: 'staff_user',
            targetId: authData.user.id,
            after: { email: body.email.toLowerCase(), roleKey: body.roleKey, stationIds },
        });
        await notifyStaffInvitation({ email: body.email.toLowerCase(), fullName: body.fullName, temporaryPassword: password, roleLabel: (assignedRole as any).label ?? (assignedRole as any).role_name ?? body.roleKey });

        return { ok: true, userId: authData.user.id, temporaryPassword: password };
    });

    fastify.patch('/access/users/:userId/role', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const schema = z.object({
            roleKey: z.string().trim().min(2).max(80),
        });
        const { roleKey } = schema.parse(req.body);
        const { data: assignedRole } = await adminClient.from('roles').select('role_key, role_name, label').eq('role_key', roleKey).maybeSingle();
        if (!assignedRole) return reply.code(400).send({ error: 'role_not_found', message: 'Choose an existing role.' });
        const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
        const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, {
            user_metadata: {
                ...(authUser.user?.user_metadata ?? {}),
                role_key: roleKey,
                role: roleKey,
            },
        });
        if (authErr) return reply.code(400).send({ error: 'auth_role_update_failed', message: authErr.message });
        const { error } = await adminClient.from('users')
            .update({ role_key: roleKey, updated_at: new Date().toISOString() })
            .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
        if (error) return reply.code(400).send({ error: 'role_update_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'access.user.role_update',
            targetType: 'staff_user',
            targetId: userId,
            after: { roleKey },
        });

        await notifyRoleAssignment(userId, (assignedRole as any).label ?? (assignedRole as any).role_name ?? roleKey);

        return { ok: true, userId, roleKey };
    });

    fastify.patch('/access/users/:userId/station', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const { stationIds } = z.object({ stationIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100) }).parse(req.body);
        const normalized = [...new Set(stationIds.map((value) => value.toUpperCase()))];
        const { data: before } = await adminClient.from('users').select('email, user_name, station_ids').or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
        const { error } = await adminClient.from('users')
            .update({ station_id: normalized[0], station_ids: normalized, updated_at: new Date().toISOString() })
            .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
        if (error) return reply.code(400).send({ error: 'station_update_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'access.user.station_update',
            targetType: 'staff_user',
            targetId: userId,
            after: { stationIds: normalized },
        });

        await notifyStationAssignment({ email: (before as any)?.email, name: (before as any)?.user_name, stationLabel: normalized.join(', '), previousStationLabel: ((before as any)?.station_ids as string[] | null)?.join(', ') || null });

        return { ok: true, userId, stationIds: normalized };
    });

    fastify.patch('/access/users/:userId/suspension', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const { suspended } = z.object({ suspended: z.boolean() }).parse(req.body);
        if (userId === req.actor!.userId) return reply.code(400).send({ error: 'self_suspension_denied', message: 'You cannot suspend your own account.' });
        const { error } = await adminClient.auth.admin.updateUserById(userId, {
            ban_duration: suspended ? '876000h' : 'none',
        });
        if (error) return reply.code(400).send({ error: 'suspension_update_failed', message: error.message });
        if (suspended) {
            const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global');
            if (signOutError) return reply.code(400).send({ error: 'session_revocation_failed', message: signOutError.message });
        }
        await logAction({
            actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: suspended ? 'access.user.suspended' : 'access.user.reactivated',
            targetType: 'staff_user', targetId: userId, after: { suspended },
        });
        return { ok: true, userId, suspended };
    });

    fastify.post('/access/users/:userId/reset-password', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const password = `Beverly-${crypto.randomUUID().slice(0, 8)}aA1!`;
        const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
        if (error) return reply.code(400).send({ error: 'password_reset_failed', message: error.message });
        await adminClient.auth.admin.signOut(userId, 'global');
        await logAction({
            actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: 'access.user.password_reset', targetType: 'staff_user', targetId: userId,
        });
        return { ok: true, userId, temporaryPassword: password };
    });

    fastify.post('/access/users/:userId/revoke-sessions', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const { error } = await adminClient.auth.admin.signOut(userId, 'global');
        if (error) return reply.code(400).send({ error: 'session_revocation_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: 'access.user.sessions_revoked', targetType: 'staff_user', targetId: userId,
        });
        return { ok: true, userId };
    });

    // ── stations directory (live from energy backend, 5-min cache) ──
    fastify.get('/stations', async (req, reply) => {
        const force = (req.query as { refresh?: string }).refresh === '1';
        try {
            const assignedStations = staffStations(req);
            const stored = await listStoredStations();
            const source = force || !stored.length ? await listStations({ force }) : stored;
            const stations = source.filter((station) => !assignedStations || assignedStations.includes(station.stationId.toUpperCase()));
            return { stations, count: stations.length };
        } catch (e: any) {
            if (e instanceof TokenEngineError) {
                return reply.code(503).send({
                    error: 'stations_unavailable',
                    message: 'Could not reach the energy backend to list stations.',
                    code: e.code,
                });
            }
            throw e;
        }
    });

    fastify.post('/stations/refresh', async () => {
        invalidateStationsCache();
        const stations = await listStations({ force: true });
        return { ok: true, count: stations.length };
    });

    // ── vendor applications queue ──
    fastify.get('/vendor-applications', async (req) => {
        const status = (req.query as { status?: string }).status ?? 'submitted';
        const { data } = await adminClient
            .from('vendor_applications')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: true })
            .limit(200);
        return { applications: data ?? [] };
    });

    fastify.delete('/vendor-applications/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data, error } = await adminClient
            .from('vendor_applications')
            .delete()
            .eq('id', id)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return reply.code(404).send({ error: 'application_not_found', message: 'Application not found.' });
        return { ok: true, id };
    });

    // ── create vendor organization ──
    fastify.post('/vendors', async (req) => {
        const schema = z.object({
            legalName: z.string().min(2),
            tradingName: z.string().optional(),
            cacNumber: z.string().optional(),
            tin: z.string().optional(),
            businessType: z.string().optional(),
            contactEmail: z.string().email(),
            contactPhone: z.string().min(8),
            operatingAddress: z.string().optional(),
            operatingStations: z.array(z.string()).optional(),
            primaryUserEmail: z.string().email(),
            primaryUserFullName: z.string().min(2),
            primaryUserPhone: z.string().optional(),
            dailyLimitMinor: z.number().int().min(100000).optional(),
            sourceApplicationId: z.string().uuid().optional(),
        });
        const body = schema.parse(req.body);
        const result = await createVendorOrganization({
            ...body,
            createdByStaffId: req.actor!.userId,
        });
        // NOTE: temporaryPassword is in the response ONCE. Caller must hand it off
        // through the approved secure channel and never store it server-side.
        return result;
    });

    // ── vendor list ──
    fastify.get('/vendors/summary', async (req) => {
        const assignedStations = staffStations(req);
        const countVendors = async (status?: string) => {
            let query = adminClient
                .from('vendor_organizations')
                .select('id', { count: 'exact', head: true })
                .is('deleted_at', null);
            if (status) query = query.eq('status', status);
            if (assignedStations) query = query.overlaps('operating_stations', assignedStations);
            let result = await query;
            if (result.error && String(result.error.message || '').includes('deleted_at')) {
                let fallback = adminClient
                    .from('vendor_organizations')
                    .select('id', { count: 'exact', head: true });
                if (status) fallback = fallback.eq('status', status);
                if (assignedStations) fallback = fallback.overlaps('operating_stations', assignedStations);
                result = await fallback;
            }
            if (result.error) throw result.error;
            return result.count ?? 0;
        };
        const statuses = ['pending', 'approved', 'suspended', 'frozen', 'closed'] as const;
        const [total, ...counts] = await Promise.all([
            countVendors(),
            ...statuses.map((vendorStatus) => countVendors(vendorStatus)),
        ]);
        return {
            total,
            byStatus: Object.fromEntries(statuses.map((vendorStatus, index) => [vendorStatus, counts[index]])),
        };
    });

    fastify.get('/vendors', async (req) => {
        const { status, q } = req.query as { status?: string; q?: string };
        let query = adminClient
            .from('vendor_organizations')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200);
        if (status) query = query.eq('status', status);
        if (q) query = query.ilike('legal_name', `%${q}%`);
        const assignedStations = staffStations(req);
        if (assignedStations) query = query.overlaps('operating_stations', assignedStations);
        let { data, error } = await query;
        if (error && String(error.message || '').includes('deleted_at')) {
            let fallback = adminClient.from('vendor_organizations').select('*').order('created_at', { ascending: false }).limit(200);
            if (status) fallback = fallback.eq('status', status);
            if (q) fallback = fallback.ilike('legal_name', `%${q}%`);
            if (assignedStations) fallback = fallback.overlaps('operating_stations', assignedStations);
            const retry = await fallback;
            data = retry.data;
            error = retry.error;
        }
        if (error) throw error;
        return { vendors: data ?? [] };
    });

    fastify.delete('/vendors/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ reason: z.string().trim().max(500).optional() });
        const body = schema.parse(req.body ?? {});
        const { data: vendor, error: readError } = await adminClient
            .from('vendor_organizations')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (readError) throw readError;
        if (!vendor || (vendor as any).deleted_at) {
            return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });
        }

        let { error } = await adminClient
            .from('vendor_organizations')
            .update({
                status: 'closed',
                deleted_at: new Date().toISOString(),
                deleted_by: req.actor!.userId,
                deletion_reason: body.reason ?? null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (error && String(error.message || '').includes('deleted_at')) {
            const fallback = await adminClient
                .from('vendor_organizations')
                .delete()
                .eq('id', id);
            error = fallback.error;
        }
        if (error) return reply.code(400).send({ error: 'delete_failed', message: error.message });
        return { ok: true, id };
    });

    // ── freeze / unfreeze ──
    fastify.patch('/vendors/:id/status', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['approved', 'suspended', 'frozen', 'closed']),
            reason: z.string().optional(),
        });
        const body = schema.parse(req.body);
        try {
            await setVendorStatus(id, body.status, req.actor!.userId, body.reason);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'update_failed', message: e.message });
        }
    });

    // ── vendor station assignment ──
    // A vendor holds exactly one station; this is the only way to change it.
    // The trigger on vendor_organizations keeps the legacy station_ids_json
    // array mirrored, so CRM-side readers stay consistent.
    fastify.patch('/vendors/:id/station', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            // null clears the assignment; the vendor then sees no consumption.
            stationId: z.string().trim().min(1).max(64).nullable(),
            reason: z.string().max(500).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const stationId = body.stationId ? body.stationId.toUpperCase() : null;

        const { data: vendor } = await adminClient
            .from('vendor_organizations')
            .select('id, station_id, contact_email, trading_name, legal_name')
            .eq('id', id)
            .maybeSingle();
        if (!vendor) return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });

        // Reject unknown stations rather than silently assigning a vendor to a
        // site that does not exist and showing them an empty dashboard.
        if (stationId) {
            const { listStations: listKnownStations } = await import('../services/token-engine.js');
            const known = await listKnownStations();
            const match = (known as any[]).some((station) =>
                String(station.stationId ?? station.id ?? station).toUpperCase() === stationId);
            if (!match) {
                return reply.code(400).send({ error: 'unknown_station', message: `Station ${stationId} does not exist.` });
            }
        }

        const previous = (vendor as any).station_id ?? null;
        const { error } = await adminClient
            .from('vendor_organizations')
            .update({ station_id: stationId, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'vendor.station_reassigned',
            targetType: 'vendor_organization',
            targetId: id,
            before: { station_id: previous },
            after: { station_id: stationId, reason: body.reason ?? null },
        });

        if (stationId) await notifyStationAssignment({ email: (vendor as any).contact_email, name: (vendor as any).trading_name ?? (vendor as any).legal_name, stationLabel: stationId, previousStationLabel: previous });
        return { ok: true, stationId, previousStationId: previous };
    });

    // ── vendor detail ──
    fastify.get('/vendors/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: vendor, error } = await adminClient
            .from('vendor_organizations').select('*').eq('id', id).maybeSingle();
        if (error || !vendor) return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });
        const { data: vendorUser } = await adminClient
            .from('vendor_users').select('profile_picture_url').eq('vendor_organization_id', id).limit(1).maybeSingle();

        const { data: wallet } = await adminClient
            .from('wallets').select('*').eq('owner_type', 'vendor').eq('owner_id', id).maybeSingle();
        const balance = wallet ? await getBalance((wallet as any).id).catch(() => null) : null;

        const [vendingAgg, fundingAgg] = await Promise.all([
            adminClient.from('purchase_orders').select('amount_minor', { count: 'exact' })
                .eq('actor_type', 'vendor').eq('actor_id', id),
            adminClient.from('payment_transactions').select('amount_minor', { count: 'exact' })
                .eq('actor_type', 'vendor').eq('actor_id', id).eq('purpose', 'wallet_funding')
                .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES)),
        ]);
        const sum = (arr: any[] | null | undefined) =>
            (arr ?? []).reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

        const stationCount = ((vendor as any).operating_stations ?? []).length;

        return {
            vendor: { ...vendor, profile_picture_url: (vendorUser as any)?.profile_picture_url ?? null },
            wallet: wallet ?? null,
            balance_minor:   balance?.ledgerBalanceMinor   ?? 0,
            holds_minor:     balance?.activeHoldsMinor     ?? 0,
            available_minor: balance?.availableMinor       ?? 0,
            stats: {
                vendingCount:      vendingAgg.count ?? 0,
                vendingValueMinor: sum(vendingAgg.data),
                fundingCount:      fundingAgg.count ?? 0,
                fundingValueMinor: sum(fundingAgg.data),
                stationCount,
            },
        };
    });

    fastify.patch('/vendors/:id/profile-picture', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ profile_picture_url: z.string().trim().url().max(1000).nullable() });
        const body = schema.parse(req.body);
        const { data: before } = await adminClient.from('vendor_users').select('profile_picture_url').eq('vendor_organization_id', id).limit(1).maybeSingle();
        const { error } = await adminClient.from('vendor_users').update({ profile_picture_url: body.profile_picture_url }).eq('vendor_organization_id', id);
        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'vendor.profile_picture.override',
            targetType: 'vendor_organization',
            targetId: id,
            before: { profile_picture_url: (before as any)?.profile_picture_url ?? null },
            after: { profile_picture_url: body.profile_picture_url ?? null },
        });
        return { ok: true };
    });

    // ── vendor wallet ledger ──
    fastify.get('/vendors/:id/wallet', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: wallet } = await adminClient
            .from('wallets').select('*').eq('owner_type', 'vendor').eq('owner_id', id).maybeSingle();
        if (!wallet) return reply.code(404).send({ error: 'wallet_not_found', message: 'No wallet for this vendor.' });
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const { getEntries } = await import('../services/ledger.js');
        const [balance, entries] = await Promise.all([
            getBalance((wallet as any).id).catch(() => null),
            getEntries((wallet as any).id, { limit: Math.min(Number(limit ?? 50), 200), cursorAt: cursor }),
        ]);
        return {
            wallet,
            balance_minor:   balance?.ledgerBalanceMinor ?? 0,
            holds_minor:     balance?.activeHoldsMinor   ?? 0,
            available_minor: balance?.availableMinor     ?? 0,
            entries,
        };
    });

    // ── vendor vending transactions ──
    fastify.get('/vendors/:id/transactions', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        let query = adminClient.from('purchase_orders').select('*')
            .eq('actor_type', 'vendor').eq('actor_id', id)
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 50), 200));
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { transactions: rows, nextCursor };
    });

    // ── vendor funding history ──
    fastify.get('/vendors/:id/funding', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        let query = adminClient.from('payment_transactions').select('*')
            .eq('actor_type', 'vendor').eq('actor_id', id).eq('purpose', 'wallet_funding')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 50), 200));
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { funding: rows, nextCursor };
    });

    // ── vendor staff accounts ──
    fastify.get('/vendors/:id/staff', async (req) => {
        const id = (req.params as { id: string }).id;
        const { data } = await adminClient.from('vendor_users').select('*')
            .eq('vendor_organization_id', id)
            .order('created_at', { ascending: false })
            .limit(100);
        return { staff: data ?? [] };
    });

    // ── vendor performance analytics ──
    fastify.get('/vendors/:id/analytics', async (req, reply) => {
        const id     = (req.params as { id: string }).id;
        const period = ((req.query as any).period as string | undefined) ?? '30d';

        const { data: vendor } = await adminClient
            .from('vendor_organizations').select('id').eq('id', id).maybeSingle();
        if (!vendor) return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });

        let since: string | null = null;
        if (period !== 'all') {
            const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
            const d = new Date();
            d.setDate(d.getDate() - days);
            since = d.toISOString();
        }

        let q = adminClient
            .from('purchase_orders')
            .select('id, status, purchase_mode, amount_minor, units_kwh, meter_id, station_id, created_at')
            .eq('actor_type', 'vendor')
            .eq('actor_id', id)
            .order('created_at', { ascending: true })
            .limit(10000);
        if (since) q = q.gte('created_at', since);

        const { data: rows } = await q;
        const orders = (rows ?? []) as {
            id: string; status: string; purchase_mode: string;
            amount_minor: number; units_kwh: number | null;
            meter_id: string; station_id: string | null; created_at: string;
        }[];

        const totalAmount = orders.reduce((s, o) => s + Number(o.amount_minor ?? 0), 0);
        const totalUnits  = orders.reduce((s, o) => s + Number(o.units_kwh  ?? 0), 0);
        const nDelivered  = orders.filter((o) => o.status === 'delivered').length;
        const nFailed     = orders.filter((o) => o.status === 'failed').length;

        // by_mode
        const byMode: Record<string, { count: number; amount_minor: number; units_kwh: number }> = {};
        for (const o of orders) {
            const m = o.purchase_mode ?? 'unknown';
            byMode[m] ??= { count: 0, amount_minor: 0, units_kwh: 0 };
            byMode[m].count++;
            byMode[m].amount_minor += Number(o.amount_minor ?? 0);
            byMode[m].units_kwh   += Number(o.units_kwh  ?? 0);
        }

        // daily breakdown
        const dailyMap: Record<string, { count: number; amount_minor: number; units_kwh: number; delivered: number; failed: number }> = {};
        for (const o of orders) {
            const date = o.created_at.slice(0, 10);
            dailyMap[date] ??= { count: 0, amount_minor: 0, units_kwh: 0, delivered: 0, failed: 0 };
            dailyMap[date].count++;
            dailyMap[date].amount_minor += Number(o.amount_minor ?? 0);
            dailyMap[date].units_kwh   += Number(o.units_kwh  ?? 0);
            if (o.status === 'delivered') dailyMap[date].delivered++;
            if (o.status === 'failed')    dailyMap[date].failed++;
        }
        const daily = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, v]) => ({ date, ...v }));

        // top stations
        const stationMap: Record<string, { count: number; amount_minor: number; delivered: number }> = {};
        for (const o of orders) {
            const s = o.station_id ?? 'unknown';
            stationMap[s] ??= { count: 0, amount_minor: 0, delivered: 0 };
            stationMap[s].count++;
            stationMap[s].amount_minor += Number(o.amount_minor ?? 0);
            if (o.status === 'delivered') stationMap[s].delivered++;
        }
        const topStations = Object.entries(stationMap)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 10)
            .map(([station_id, v]) => ({ station_id, ...v }));

        // top meters
        const meterMap: Record<string, { count: number; amount_minor: number }> = {};
        for (const o of orders) {
            const m = o.meter_id ?? 'unknown';
            meterMap[m] ??= { count: 0, amount_minor: 0 };
            meterMap[m].count++;
            meterMap[m].amount_minor += Number(o.amount_minor ?? 0);
        }
        const topMeters = Object.entries(meterMap)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 10)
            .map(([meter_id, v]) => ({ meter_id, ...v }));

        return {
            period,
            since,
            summary: {
                total:              orders.length,
                delivered:          nDelivered,
                failed:             nFailed,
                pending:            orders.length - nDelivered - nFailed,
                success_rate:       orders.length ? Math.round((nDelivered / orders.length) * 1000) / 10 : 0,
                total_amount_minor: totalAmount,
                total_units_kwh:    Math.round(totalUnits * 100) / 100,
                avg_amount_minor:   orders.length ? Math.round(totalAmount / orders.length) : 0,
            },
            by_mode:      byMode,
            daily,
            top_stations: topStations,
            top_meters:   topMeters,
        };
    });

    // ── funding approval queue ──
    fastify.get('/funding/pending', async (req) => {
        const list = await listPendingFunding(200);
        const assignedStations = staffStations(req);
        if (!assignedStations) return { funding: list };
        const { vendors } = await stationOwnerIds(assignedStations);
        return { funding: list.filter((row) => vendors.has(row.vendor_organization_id)) };
    });

    // ── funding history (all statuses, filterable) ──
    fastify.get('/funding/history', async (req) => {
        const { status, channel, from, to, limit, cursor } = req.query as {
            status?: string; channel?: string; from?: string; to?: string;
            limit?: string; cursor?: string;
        };
        const assignedStations = staffStations(req);
        const scopedVendors = assignedStations ? (await stationOwnerIds(assignedStations)).vendors : null;
        if (scopedVendors && !scopedVendors.size) return { funding: [], nextCursor: null, summary: null };
        const pageSize = Math.min(Number(limit ?? 50), 200);
        let query = adminClient
            .from('funding_requests')
            .select('*, vendor_organizations(legal_name, trading_name, contact_email, contact_phone)')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (scopedVendors) query = query.in('vendor_organization_id', [...scopedVendors]);
        if (status === 'pending') query = query.in('status', ['initiated', 'proof_uploaded', 'under_review']);
        else if (status && status !== 'all') query = query.eq('status', status);
        if (channel && channel !== 'all') query = query.eq('channel', channel);
        if (from)   query = query.gte('created_at', new Date(from).toISOString());
        if (to)     query = query.lte('created_at', new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = (data ?? []) as any[];
        const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;
        const withUrls = await attachProofUrls(rows);
        // KPI aggregates (only on first page / no cursor)
        let summary: Record<string, number> | null = null;
        if (!cursor) {
            let aggQ = adminClient.from('funding_requests').select('status, amount_minor');
            if (scopedVendors) aggQ = aggQ.in('vendor_organization_id', [...scopedVendors]);
            if (from)    aggQ = aggQ.gte('created_at', new Date(from).toISOString());
            if (to)      aggQ = aggQ.lte('created_at', new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());
            if (channel && channel !== 'all') aggQ = aggQ.eq('channel', channel);
            const { data: agg } = await aggQ.limit(10_000);
            const rows2 = (agg ?? []) as any[];
            const sumMinor = (s: string) => rows2.filter((r) => r.status === s).reduce((acc, r) => acc + Number(r.amount_minor ?? 0), 0);
            summary = {
                totalCount:    rows2.length,
                approvedCount: rows2.filter((r) => r.status === 'approved').length,
                pendingCount:  rows2.filter((r) => ['initiated', 'proof_uploaded', 'under_review'].includes(r.status)).length,
                rejectedCount: rows2.filter((r) => r.status === 'rejected').length,
                approvedMinor: sumMinor('approved'),
            };
        }
        return { funding: withUrls, nextCursor, summary };
    });

    fastify.post('/funding/reconcile-approved', async (req, reply) => {
        try {
            const result = await reconcileApprovedFundingCredits({
                repairedBy: req.actor!.userId,
                limit: 250,
            });
            return { ok: true, ...result };
        } catch (e: any) {
            return reply.code(400).send({
                error: e.code ?? 'funding_reconcile_failed',
                message: e.message,
            });
        }
    });

    fastify.post('/funding/:id/approve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            const r = await approveFundingRequest({ fundingRequestId: id, approvedBy: req.actor!.userId });
            const balance = await getBalance(r.funding.wallet_id);
            return {
                ...r,
                balance,
                receipt: {
                    fundingRequestId: r.funding.id,
                    walletId: r.funding.wallet_id,
                    ledgerEntryId: r.ledgerEntry.id,
                    creditedAmountMinor: r.ledgerEntry.amount_minor,
                    availableBalanceMinor: balance.availableMinor,
                    approvedAt: r.funding.approved_at,
                },
            };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'approve_failed', message: e.message });
        }
    });

    fastify.post('/funding/:id/reject', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ reason: z.string().min(2) });
        const body = schema.parse(req.body);
        try {
            const r = await rejectFundingRequest({ fundingRequestId: id, rejectedBy: req.actor!.userId, reason: body.reason });
            return r;
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'reject_failed', message: e.message });
        }
    });

    // ════════════════════════════════════════════════════════════
    // WALLETS — full admin experience
    // ════════════════════════════════════════════════════════════

    // List wallets with computed balance + owner name resolution.
    fastify.get('/wallets', async (req) => {
        const {
            ownerType, status, q, minBalance, maxBalance, limit, cursor,
        } = req.query as Record<string, string | undefined>;
        const assignedStations = staffStations(req);
        const hasComputedFilters = !!(q || minBalance || maxBalance);
        const pageSize = Math.min(Number(limit ?? 100), 500);
        const fetchSize = hasComputedFilters || assignedStations ? 5000 : pageSize;

        let query = adminClient
            .from('wallets')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(fetchSize);
        if (ownerType) query = query.eq('owner_type', ownerType);
        if (status)    query = query.eq('status',     status);
        if (cursor)    query = query.lt('created_at', cursor);
        const { data: wallets, error } = await query;
        if (error) return { wallets: [], error: error.message };
        let rows = wallets ?? [];
        if (assignedStations) {
            const owners = await stationOwnerIds(assignedStations);
            rows = rows.filter((wallet: any) => wallet.owner_type === 'vendor'
                ? owners.vendors.has(wallet.owner_id)
                : owners.customers.has(wallet.owner_id));
        }
        if (!rows.length) return { wallets: [], nextCursor: null };

        // Hydrate owner display name in batch
        const vendorIds = rows.filter((w: any) => w.owner_type === 'vendor').map((w: any) => w.owner_id);
        const customerIds = rows.filter((w: any) => w.owner_type === 'customer').map((w: any) => w.owner_id);
        const [vendorMap, customerMap] = await Promise.all([
            vendorIds.length
                ? adminClient.from('vendor_organizations').select('id, legal_name, trading_name').in('id', vendorIds)
                    .then((r) => new Map((r.data ?? []).map((v: any) => [v.id, v])))
                : Promise.resolve(new Map()),
            customerIds.length
                ? adminClient.from('customers').select('id, full_name, phone, email').in('id', customerIds)
                    .then((r) => new Map((r.data ?? []).map((c: any) => [c.id, c])))
                : Promise.resolve(new Map()),
        ]);

        const { getBalance } = await import('../services/ledger.js');
        const balances = await Promise.all(rows.map((w: any) => getBalance(w.id).catch(() => null)));

        let enriched = rows.map((w: any, i: number) => {
            const b = balances[i];
            const owner = w.owner_type === 'vendor' ? vendorMap.get(w.owner_id) : customerMap.get(w.owner_id);
            return {
                ...w,
                balance_minor:   b?.ledgerBalanceMinor   ?? 0,
                holds_minor:     b?.activeHoldsMinor     ?? 0,
                available_minor: b?.availableMinor       ?? 0,
                owner_name:      owner?.legal_name ?? owner?.trading_name ?? owner?.full_name ?? null,
                owner_phone:     owner?.phone ?? null,
                owner_email:     owner?.email ?? null,
            };
        });

        if (q) {
            const ql = cleanSearchTerm(q).toLowerCase();
            enriched = enriched.filter((w: any) =>
                w.id.toLowerCase().includes(ql) ||
                (w.owner_name ?? '').toLowerCase().includes(ql) ||
                (w.owner_phone ?? '').toLowerCase().includes(ql) ||
                (w.owner_email ?? '').toLowerCase().includes(ql),
            );
        }
        if (minBalance) enriched = enriched.filter((w: any) => w.balance_minor >= Number(minBalance));
        if (maxBalance) enriched = enriched.filter((w: any) => w.balance_minor <= Number(maxBalance));

        const paged = enriched.slice(0, pageSize);
        const nextCursor = !hasComputedFilters && rows.length === pageSize
            ? rows[rows.length - 1].created_at : null;

        return { wallets: paged, nextCursor };
    });

    // KPI summary across the entire wallet system.
    fastify.get('/wallets/summary', async (req) => {
        const { data: walletsRaw } = await adminClient.from('wallets').select('id, owner_type, status');
        let wallets = walletsRaw ?? [];
        const assignedStations = staffStations(req);
        if (assignedStations) {
            const owners = await stationOwnerIds(assignedStations);
            wallets = wallets.filter((wallet: any) => wallet.owner_type === 'vendor'
                ? owners.vendors.has(wallet.owner_id)
                : owners.customers.has(wallet.owner_id));
        }
        const { getBalance } = await import('../services/ledger.js');
        const balances = await Promise.all(wallets.map((w: any) => getBalance(w.id).catch(() => null)));

        let totalFloat = 0, totalHolds = 0, vendorFloat = 0, customerFloat = 0;
        const byStatus: Record<string, number> = {};
        const byOwnerType: Record<string, number> = {};
        for (let i = 0; i < wallets.length; i++) {
            const w = wallets[i] as any;
            const b = balances[i];
            const bal = b?.ledgerBalanceMinor ?? 0;
            totalFloat += bal;
            totalHolds += b?.activeHoldsMinor ?? 0;
            if (w.owner_type === 'vendor')   vendorFloat   += bal;
            if (w.owner_type === 'customer') customerFloat += bal;
            byStatus[w.status]         = (byStatus[w.status] ?? 0) + 1;
            byOwnerType[w.owner_type]  = (byOwnerType[w.owner_type] ?? 0) + 1;
        }
        return {
            walletCount: wallets.length,
            totalFloatMinor:    totalFloat,
            totalBalanceMinor:  totalFloat,
            totalHoldsMinor:    totalHolds,
            vendorFloatMinor:   vendorFloat,
            customerFloatMinor: customerFloat,
            activeWallets:      byStatus.active ?? 0,
            suspendedWallets:   byStatus.frozen ?? 0,
            closedWallets:      byStatus.closed ?? 0,
            byStatus,
            byOwnerType,
        };
    });

    // Single wallet detail (with owner block + computed balance).
    fastify.get('/wallets/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: wallet, error } = await adminClient.from('wallets').select('*').eq('id', id).maybeSingle();
        if (error || !wallet) return reply.code(404).send({ error: 'not_found', message: 'Wallet not found.' });

        const { getBalance } = await import('../services/ledger.js');
        const b = await getBalance(id).catch(() => null);

        let owner: any = null;
        if ((wallet as any).owner_type === 'vendor') {
            const { data } = await adminClient.from('vendor_organizations')
                .select('id, legal_name, trading_name, contact_email, contact_phone, status, risk_level').eq('id', (wallet as any).owner_id).maybeSingle();
            owner = data;
        } else if ((wallet as any).owner_type === 'customer') {
            const { data } = await adminClient.from('customers')
                .select('id, full_name, phone, email, kyc_tier, status').eq('id', (wallet as any).owner_id).maybeSingle();
            owner = data;
        }

        return {
            wallet,
            owner,
            balance_minor:   b?.ledgerBalanceMinor   ?? 0,
            holds_minor:     b?.activeHoldsMinor     ?? 0,
            available_minor: b?.availableMinor       ?? 0,
        };
    });

    // Wallet ledger entries (admin can read any wallet's history).
    fastify.get('/wallets/:id/ledger', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const { getEntries } = await import('../services/ledger.js');
        const entries = await getEntries(id, {
            limit: Math.min(Number(limit ?? 50), 200),
            cursorAt: cursor,
        });
        return { entries };
    });

    // Freeze / unfreeze wallet. Audit-logged with reason.
    fastify.patch('/wallets/:id/status', async (req, reply) => {
        if (!requireWalletStatusManager(req, reply)) return undefined;
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['active', 'frozen', 'closed']),
            reason: z.string().min(4).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'invalid_request', message: e.message }); }

        if ((body.status === 'frozen' || body.status === 'closed') && !body.reason) {
            return reply.code(400).send({
                error: 'reason_required',
                message: `A reason is required to ${body.status} a wallet.`,
            });
        }

        const { data: before } = await adminClient.from('wallets').select('*').eq('id', id).maybeSingle();
        if (!before) return reply.code(404).send({ error: 'not_found', message: 'Wallet not found.' });

        const ownerType = (before as any).owner_type as 'vendor' | 'customer';
        const ownerId = (before as any).owner_id as string;
        const ownerStatus =
            ownerType === 'vendor'
                ? body.status === 'active' ? 'approved' : body.status
                : body.status === 'active' ? 'active' : body.status === 'frozen' ? 'suspended' : 'closed';
        const ownerTable = ownerType === 'vendor' ? 'vendor_organizations' : 'customers';
        const { data: owner } = await adminClient
            .from(ownerTable)
            .select('status')
            .eq('id', ownerId)
            .maybeSingle();
        if ((owner as any)?.status === 'closed' && ownerStatus !== 'closed') {
            return reply.code(409).send({
                error: `${ownerType}_closed_final`,
                message: `Closed ${ownerType} accounts cannot be reactivated. Create a replacement account instead.`,
            });
        }

        let updated;
        try {
            updated = await setWalletStatus(id, body.status);
        } catch (error: any) {
            const status = error instanceof WalletStateError ? error.status : 400;
            return reply.code(status).send({
                error: error.code ?? 'wallet_status_failed',
                message: error.message,
            });
        }

        if (ownerType === 'vendor') {
            const { error } = await adminClient
                .from('vendor_organizations')
                .update({ status: ownerStatus })
                .eq('id', ownerId);
            if (error) return reply.code(400).send({ error: 'owner_status_failed', message: error.message });
        } else if (ownerType === 'customer') {
            const { error } = await adminClient
                .from('customers')
                .update({ status: ownerStatus })
                .eq('id', ownerId);
            if (error) return reply.code(400).send({ error: 'owner_status_failed', message: error.message });
        }
        await logAction({
            actorUserId: req.actor!.userId,
            actorType:   'staff',
            actorRole:   req.actor!.role,
            action:      `wallet.status.${body.status}`,
            targetType:  'wallet',
            targetId:    id,
            before:      { status: (before as any).status },
            after:       { status: body.status, ownerType, ownerStatus, reason: body.reason ?? null },
        });
        return { ok: true, wallet: updated };
    });

    // Update daily / monthly debit caps. Audit-logged.
    fastify.patch('/wallets/:id/limits', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            dailyCapMinor:   z.number().int().nonnegative().nullable().optional(),
            monthlyCapMinor: z.number().int().nonnegative().nullable().optional(),
            reason:          z.string().min(4),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'invalid_request', message: e.message }); }

        const { data: before } = await adminClient.from('wallets').select('*').eq('id', id).maybeSingle();
        if (!before) return reply.code(404).send({ error: 'not_found', message: 'Wallet not found.' });

        const patch: Record<string, unknown> = {};
        if (body.dailyCapMinor   !== undefined) patch.daily_debit_cap_minor   = body.dailyCapMinor;
        if (body.monthlyCapMinor !== undefined) patch.monthly_debit_cap_minor = body.monthlyCapMinor;
        if (!Object.keys(patch).length) {
            return reply.code(400).send({ error: 'no_changes', message: 'Provide at least one limit field.' });
        }

        const { data: updated, error: updErr } = await adminClient
            .from('wallets').update(patch).eq('id', id).select('*').single();
        if (updErr) return reply.code(400).send({ error: 'update_failed', message: updErr.message });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType:   'staff',
            actorRole:   req.actor!.role,
            action:      'wallet.limits.update',
            targetType:  'wallet',
            targetId:    id,
            before: {
                daily_debit_cap_minor:   (before as any).daily_debit_cap_minor,
                monthly_debit_cap_minor: (before as any).monthly_debit_cap_minor,
            },
            after: { ...patch, reason: body.reason },
        });
        return { ok: true, wallet: updated };
    });

    // ════════════════════════════════════════════════════════════
    // CUSTOMERS — admin oversight of customer accounts + wallets
    // ════════════════════════════════════════════════════════════

    // List customers with wallet balance + filters.
    fastify.get('/customers', async (req) => {
        const { status, kycTier, q, limit, cursor } = req.query as Record<string, string | undefined>;
        const pageSize = Math.min(Number(limit ?? 100), 500);
        const { data: walletRows, error: walletErr } = await adminClient
            .from('wallets')
            .select('id, owner_id, status')
            .eq('owner_type', 'customer');
        if (walletErr) return { customers: [], error: walletErr.message };
        const walletByOwner = new Map((walletRows ?? []).map((w: any) => [w.owner_id, w]));
        let walletOwnerIds = Array.from(walletByOwner.keys()).filter(Boolean);
        const assignedStations = staffStations(req);
        if (assignedStations) {
            const { data: scopedMeters } = await adminClient.from('customer_meters').select('customer_id').in('station_id', assignedStations);
            const scopedIds = new Set((scopedMeters ?? []).map((row: any) => row.customer_id));
            walletOwnerIds = walletOwnerIds.filter((id) => scopedIds.has(id));
        }
        if (!walletOwnerIds.length) return { customers: [], nextCursor: null };

        let query = adminClient
            .from('customers')
            .select('id, auth_user_id, full_name, phone, email, kyc_tier, kyc_status, status, created_at')
            .in('id', walletOwnerIds)
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (status)  query = query.eq('status', status);
        if (kycTier) query = query.eq('kyc_tier', Number(kycTier));
        if (cursor)  query = query.lt('created_at', cursor);
        if (q) {
            const safeQ = cleanSearchTerm(q);
            if (safeQ) query = query.or(`full_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`);
        }
        const { data, error } = await query;
        if (error) return { customers: [], error: error.message };
        const rows = data ?? [];
        if (!rows.length) return { customers: [], nextCursor: null };

        // Batch wallet balances
        const { getBalance } = await import('../services/ledger.js');
        const balances = await Promise.all(
            rows.map((c: any) => {
                const w = walletByOwner.get(c.id);
                return w ? getBalance(w.id).catch(() => null) : Promise.resolve(null);
            }),
        );

        const enriched = rows.map((c: any, i: number) => {
            const w = walletByOwner.get(c.id);
            const b = balances[i];
            return {
                ...c,
                wallet_id:       w?.id ?? null,
                wallet_status:   w?.status ?? null,
                balance_minor:   b?.ledgerBalanceMinor ?? 0,
                available_minor: b?.availableMinor ?? 0,
            };
        });
        const nextCursor = rows.length === pageSize
            ? rows[rows.length - 1].created_at : null;
        return { customers: enriched, nextCursor };
    });

    // Customer KPI summary.
    fastify.get('/customers/summary', async (req) => {
        const { data: wallets } = await adminClient.from('wallets').select('id, owner_id').eq('owner_type', 'customer');
        let walletOwnerIds = Array.from(new Set((wallets ?? []).map((w: any) => w.owner_id).filter(Boolean)));
        const assignedStations = staffStations(req);
        if (assignedStations) {
            const { data: scopedMeters } = await adminClient.from('customer_meters').select('customer_id').in('station_id', assignedStations);
            const scopedIds = new Set((scopedMeters ?? []).map((row: any) => row.customer_id));
            walletOwnerIds = walletOwnerIds.filter((id) => scopedIds.has(id));
        }
        if (!walletOwnerIds.length) {
            return { total: 0, byTier: {}, byStatus: {}, totalFloatMinor: 0 };
        }
        const { data: rows } = await adminClient.from('customers').select('id, kyc_tier, status').in('id', walletOwnerIds);
        const customers = rows ?? [];
        const byTier: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const c of customers as any[]) {
            byTier[`tier_${c.kyc_tier ?? 0}`] = (byTier[`tier_${c.kyc_tier ?? 0}`] ?? 0) + 1;
            byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        }
        // Total customer float
        const { getBalance } = await import('../services/ledger.js');
        const balances = await Promise.all((wallets ?? []).filter((w: any) => walletOwnerIds.includes(w.owner_id)).map((w: any) => getBalance(w.id).catch(() => null)));
        const totalFloat = balances.reduce((s, b) => s + (b?.ledgerBalanceMinor ?? 0), 0);
        return { total: customers.length, byTier, byStatus, totalFloatMinor: totalFloat };
    });

    // Single customer profile + aggregates.
    fastify.get('/customers/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: customer, error } = await adminClient
            .from('customers')
            .select('id, auth_user_id, full_name, phone, email, kyc_tier, kyc_status, status, created_at')
            .eq('id', id).maybeSingle();
        if (error || !customer) return reply.code(404).send({ error: 'not_found', message: 'Customer not found.' });

        const { data: wallet } = await adminClient
            .from('wallets').select('*').eq('owner_type', 'customer').eq('owner_id', id).maybeSingle();
        const { getBalance } = await import('../services/ledger.js');
        const balance = wallet ? await getBalance((wallet as any).id).catch(() => null) : null;

        const [meterCount, purchaseAgg, fundingAgg] = await Promise.all([
            adminClient.from('customer_meters').select('id', { count: 'exact', head: true }).eq('customer_id', id),
            adminClient.from('purchase_orders').select('amount_minor', { count: 'exact' }).eq('customer_id', id),
            adminClient.from('payment_transactions').select('amount_minor', { count: 'exact' })
                .eq('actor_type', 'customer').eq('actor_id', id).eq('purpose', 'wallet_funding')
                .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES)),
        ]);
        const sum = (arr: any[] | null | undefined) => (arr ?? []).reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

        return {
            customer,
            wallet: wallet ?? null,
            balance_minor:   balance?.ledgerBalanceMinor ?? 0,
            holds_minor:     balance?.activeHoldsMinor ?? 0,
            available_minor: balance?.availableMinor ?? 0,
            stats: {
                meterCount:        meterCount.count ?? 0,
                purchaseCount:     purchaseAgg.count ?? 0,
                purchaseValueMinor: sum(purchaseAgg.data),
                fundingCount:      fundingAgg.count ?? 0,
                fundingValueMinor: sum(fundingAgg.data),
            },
        };
    });

    // Customer wallet ledger.
    fastify.get('/customers/:id/wallet', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: wallet } = await adminClient
            .from('wallets').select('*').eq('owner_type', 'customer').eq('owner_id', id).maybeSingle();
        if (!wallet) return reply.code(404).send({ error: 'wallet_not_found', message: 'No wallet for this customer.' });
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const { getBalance, getEntries } = await import('../services/ledger.js');
        const [balance, entries] = await Promise.all([
            getBalance((wallet as any).id).catch(() => null),
            getEntries((wallet as any).id, { limit: Math.min(Number(limit ?? 50), 200), cursorAt: cursor }),
        ]);
        return {
            wallet,
            balance_minor:   balance?.ledgerBalanceMinor ?? 0,
            holds_minor:     balance?.activeHoldsMinor ?? 0,
            available_minor: balance?.availableMinor ?? 0,
            entries,
        };
    });

    // Customer purchase history.
    fastify.get('/customers/:id/purchases', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        let query = adminClient.from('purchase_orders').select('*')
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 50), 200));
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { purchases: rows, nextCursor };
    });

    // Customer funding history (Paystack top-ups via payment_transactions).
    fastify.get('/customers/:id/funding', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        let query = adminClient.from('payment_transactions').select('*')
            .eq('actor_type', 'customer').eq('actor_id', id).eq('purpose', 'wallet_funding')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 50), 200));
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { funding: rows, nextCursor };
    });

    fastify.delete('/customers/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ reason: z.string().trim().min(4).max(500).optional() });
        const body = schema.parse(req.body ?? {});
        const { data: before, error: beforeErr } = await adminClient
            .from('customers')
            .select('id, auth_user_id, full_name, phone, email, status')
            .eq('id', id)
            .maybeSingle();
        if (beforeErr) throw beforeErr;
        if (!before) return reply.code(404).send({ error: 'not_found', message: 'Customer not found.' });

        const { data: wallets } = await adminClient
            .from('wallets')
            .select('id')
            .eq('owner_type', 'customer')
            .eq('owner_id', id);
        const walletIds = (wallets ?? []).map((w: any) => w.id).filter(Boolean);

        for (const walletId of walletIds) {
            await adminClient.from('wallet_holds').delete().eq('wallet_id', walletId);
            await adminClient.from('wallet_ledger_entries').delete().eq('wallet_id', walletId);
        }

        await adminClient.from('notifications').delete().eq('customer_id', id);
        await adminClient.from('customer_meters').delete().eq('customer_id', id);
        await adminClient.from('customer_risk_baselines').delete().eq('customer_id', id);
        await adminClient.from('customer_known_ips').delete().eq('customer_id', id);
        await adminClient.from('customer_known_devices').delete().eq('customer_id', id);
        await adminClient.from('fraud_assessments').delete().eq('customer_id', id);
        await adminClient.from('account_deletion_requests').delete().eq('customer_id', id);
        await adminClient.from('data_export_requests').delete().eq('customer_id', id);
        await adminClient.from('support_chat_sessions').delete().eq('customer_id', id);
        await adminClient.from('support_tickets').delete().eq('customer_id', id);
        await adminClient.from('disputes').delete().eq('customer_id', id);
        await adminClient.from('payment_transactions').delete().eq('actor_type', 'customer').eq('actor_id', id);
        await adminClient.from('purchase_orders').delete().eq('customer_id', id);
        await adminClient.from('wallets').delete().eq('owner_type', 'customer').eq('owner_id', id);

        const { error } = await adminClient.from('customers').delete().eq('id', id);
        if (error) return reply.code(400).send({ error: 'delete_failed', message: error.message });

        const authUserId = (before as any).auth_user_id;
        if (authUserId) {
            await adminClient.auth.admin.deleteUser(authUserId).catch(() => null);
        }

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'customer.delete',
            targetType: 'customer',
            targetId: id,
            before,
            after: { deleted: true, reason: body.reason ?? null },
        });

        return { ok: true, id };
    });

    // Suspend / reactivate a customer. Audit-logged.
    fastify.patch('/customers/:id/status', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['active', 'suspended', 'closed']),
            reason: z.string().min(4).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'invalid_request', message: e.message }); }

        if ((body.status === 'suspended' || body.status === 'closed') && !body.reason) {
            return reply.code(400).send({ error: 'reason_required', message: `A reason is required to ${body.status} a customer.` });
        }

        const { data: before } = await adminClient.from('customers').select('status').eq('id', id).maybeSingle();
        if (!before) return reply.code(404).send({ error: 'not_found', message: 'Customer not found.' });
        if ((before as any).status === 'closed' && body.status !== 'closed') {
            return reply.code(409).send({
                error: 'customer_closed_final',
                message: 'Closed customer accounts cannot be reactivated. Create a replacement account instead.',
            });
        }

        const walletStatus =
            body.status === 'active' ? 'active'
            : body.status === 'closed' ? 'closed'
            : 'frozen';
        try {
            await setOwnerWalletStatus('customer', id, walletStatus);
        } catch (error: any) {
            const status = error instanceof WalletStateError ? error.status : 400;
            return reply.code(status).send({
                error: error.code ?? 'wallet_status_failed',
                message: error.message,
            });
        }

        const { data: updated, error: updErr } = await adminClient
            .from('customers').update({ status: body.status }).eq('id', id)
            .select('id, full_name, status').single();
        if (updErr) return reply.code(400).send({ error: 'update_failed', message: updErr.message });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType:   'staff',
            actorRole:   req.actor!.role,
            action:      `customer.status.${body.status}`,
            targetType:  'customer',
            targetId:    id,
            before:      { status: (before as any).status },
            after:       { status: body.status, walletStatus, reason: body.reason ?? null },
        });
        return { ok: true, customer: updated };
    });

    // ════════════════════════════════════════════════════════════
    // PURCHASES — full admin experience (renamed from /vending)
    // ════════════════════════════════════════════════════════════

    fastify.get('/purchases', async (req) => {
        const {
            status, station, actorType, meterType, q, since, until, limit, cursor,
        } = req.query as Record<string, string | undefined>;

        let query = adminClient.from('purchase_orders').select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (status)    query = query.eq('status', status);
        const assignedStations = staffStations(req);
        if (assignedStations) query = query.in('station_id', assignedStations);
        else if (station) query = query.eq('station_id', station);
        if (actorType) query = query.eq('actor_type', actorType);
        if (meterType) query = query.eq('meter_type', meterType);
        if (since)     query = query.gte('created_at', since);
        if (until)     query = query.lte('created_at', until);
        if (cursor)    query = query.lt('created_at', cursor);
        if (q) {
            const safeQ = cleanSearchTerm(q);
            if (safeQ) {
                const filters = [`meter_id.ilike.%${safeQ}%`, `customer_name.ilike.%${safeQ}%`];
                if (isUuid(safeQ)) filters.push(`id.eq.${safeQ}`);
                query = query.or(filters.join(','));
            }
        }
        const { data, error } = await query;
        if (error) return { purchases: [], error: error.message };
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 100), 500)
            ? rows[rows.length - 1].created_at : null;
        return { purchases: rows, nextCursor };
    });

    // Back-compat alias for old /vending consumers.
    fastify.get('/vending', async (req) => {
        const { status, station, meterType, q, cursor, limit } = req.query as Record<string, string | undefined>;
        let query = adminClient.from('purchase_orders').select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 200), 500));
        if (status)  query = query.eq('status', status);
        const assignedStations = staffStations(req);
        if (assignedStations) query = query.in('station_id', assignedStations);
        else if (station) query = query.eq('station_id', station);
        if (meterType) query = query.eq('meter_type', meterType);
        if (cursor)  query = query.lt('created_at', cursor);
        if (q) {
            const safeQ = cleanSearchTerm(q);
            if (safeQ) {
                const filters = [`meter_id.ilike.%${safeQ}%`, `customer_name.ilike.%${safeQ}%`];
                if (isUuid(safeQ)) filters.push(`id.eq.${safeQ}`);
                query = query.or(filters.join(','));
            }
        }
        const { data, error } = await query;
        if (error) {
            return {
                purchases: [],
                nextCursor: null,
                error: error.message,
            };
        }
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 200), 500)
            ? rows[rows.length - 1].created_at
            : null;
        return { purchases: rows, nextCursor };
    });

    // KPI summary for purchases dashboard.
    fastify.get('/purchases/summary', async (req) => {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

        const assignedStations = staffStations(req);
        const scope = (query: any) => scopeStations(query, assignedStations);
        const [today, last24h, failed24h, refunded] = await Promise.all([
            scope(adminClient.from('purchase_orders').select('id, amount_minor', { count: 'exact' }).gte('created_at', sod)),
            scope(adminClient.from('purchase_orders').select('id, amount_minor', { count: 'exact' }).gte('created_at', dayAgo)),
            scope(adminClient.from('purchase_orders').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo).eq('status', 'failed')),
            scope(adminClient.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'refunded')),
        ]);

        const sumMinor = (arr: any[] | null | undefined) =>
            (arr ?? []).reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

        return {
            todayCount:       today.count ?? 0,
            todayValueMinor:  sumMinor(today.data),
            last24hCount:     last24h.count ?? 0,
            last24hValueMinor: sumMinor(last24h.data),
            failed24hCount:   failed24h.count ?? 0,
            refundedCount:    refunded.count ?? 0,
        };
    });

    // Full purchase detail — joins related hold, ledger entries, receipt.
    fastify.get('/purchases/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: po, error } = await adminClient.from('purchase_orders').select('*').eq('id', id).maybeSingle();
        if (error || !po) return reply.code(404).send({ error: 'not_found', message: 'Purchase not found.' });

        const [hold, entries, receipt] = await Promise.all([
            (po as any).hold_id
                ? adminClient.from('wallet_holds').select('*').eq('id', (po as any).hold_id).maybeSingle().then((r) => r.data)
                : Promise.resolve(null),
            adminClient.from('wallet_ledger_entries').select('*')
                .eq('reference_type', 'purchase_order')
                .eq('reference_id', id)
                .order('created_at', { ascending: true })
                .then((r: any) => r.data ?? []),
            (po as any).receipt_id
                ? adminClient.from('receipts').select('*').eq('id', (po as any).receipt_id).maybeSingle().then((r) => r.data)
                : Promise.resolve(null),
        ]);

        return { purchase: po, hold, ledger_entries: entries, receipt };
    });

    // Resend the token SMS via Twilio. Audit + security event.
    fastify.post('/purchases/:id/resend-sms', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: po } = await adminClient.from('purchase_orders').select('*').eq('id', id).maybeSingle();
        if (!po) return reply.code(404).send({ error: 'not_found', message: 'Purchase not found.' });
        if (!(po as any).token) {
            return reply.code(400).send({ error: 'no_token', message: 'This purchase has no token to resend.' });
        }
        if ((po as any).actor_type !== 'customer') {
            return reply.code(400).send({ error: 'not_supported', message: 'SMS resend is only supported for customer purchases.' });
        }
        try {
            const { sendTokenSmsToCustomer } = await import('../services/customer-purchase.js');
            const result = await sendTokenSmsToCustomer({
                customerId:  (po as any).customer_id,
                token:       (po as any).token,
                meterId:     (po as any).meter_id,
                amountMinor: (po as any).amount_minor,
                units:       Number((po as any).units_kwh ?? 0),
                receiptId:   (po as any).receipt_id,
                trafficKind: 'token_resend',
                actorUserId: req.actor!.userId,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                actorRole:   req.actor!.role,
                action:      'purchase.token.resend_sms',
                targetType:  'purchase_order',
                targetId:    id,
                metadata:    { result },
            });
            if (!result.sent) {
                const status = String(result.reason ?? '').includes('rate') || String(result.reason ?? '').includes('cooldown') ? 429 : 422;
                return reply.code(status).send({ error: result.reason ?? 'sms_not_sent', message: 'Token SMS could not be sent.' });
            }
            return { ok: true, result };
        } catch (e: any) {
            return reply.code(400).send({ error: 'resend_failed', message: e.message ?? 'Could not resend.' });
        }
    });

    // Resend a stuck remote-send order using its stored token (no re-generation).
    fastify.post('/purchases/:id/resend-remote', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            const { resendRemoteSendOrder } = await import('../services/vending.js');
            const result = await resendRemoteSendOrder(id, req.actor!.userId);
            return { ok: true, taskId: result.taskId };
        } catch (e: any) {
            const status =
                e.code === 'not_found'     ? 404 :
                e.code === 'invalid_state' ? 409 :
                e.code === 'no_token'      ? 422 : 400;
            return reply.code(status).send({ error: e.code ?? 'resend_failed', message: e.message ?? 'Could not resend.' });
        }
    });


    // ── meter purchase orders ──
    fastify.post('/meter-orders', async (req, reply) => {
        const body = z.object({
            customer_id: z.string().uuid(),
            meter_type: z.enum(['single_phase', 'three_phase']),
            property_address: z.string().trim().min(5).max(240),
            service_area: z.string().trim().min(2).max(120),
            contact_phone: z.string().trim().min(8).max(32),
            sponsor_mode: z.enum(['manual_paid', 'vendor_wallet']),
            vendor_organization_id: z.string().uuid().optional(),
            notes: z.string().trim().max(500).optional(),
        }).parse(req.body ?? {});
        const idempotencyKey = requireIdempotencyKey(req, reply);
        if (!idempotencyKey) return reply;
        try {
            const order = await createAdminMeterOrder({
                staffUserId: req.actor!.userId,
                customerId: body.customer_id,
                meterType: body.meter_type,
                propertyAddress: body.property_address,
                serviceArea: body.service_area,
                contactPhone: body.contact_phone,
                sponsorMode: body.sponsor_mode,
                vendorOrganizationId: body.vendor_organization_id ?? null,
                notes: body.notes,
                idempotencyKey,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                actorRole: req.actor!.role,
                action: 'meter_order.created',
                targetType: 'meter_order',
                targetId: order.id,
                metadata: {
                    meter_type: body.meter_type,
                    sponsor_mode: body.sponsor_mode,
                    source_channel: 'admin_portal',
                    vendor_organization_id: body.vendor_organization_id ?? null,
                },
            });
            return { order };
        } catch (error: any) {
            return reply.code(error?.status ?? 422).send({
                error: error?.code ?? 'meter_order_create_failed',
                message: error?.message ?? 'Could not create meter order.',
            });
        }
    });

    fastify.get('/meter-orders/stats', async (req) => {
        let query = adminClient
            .from('meter_purchase_orders')
            .select('status, amount_minor, updated_at, created_at, source_channel')
            .limit(10000);
        const assignedStations = staffStations(req);
        query = scopeStations(query, assignedStations);
        const { data } = await query;
        const rows: any[] = data ?? [];
        const count = (status: string) => rows.filter((row) => row.status === status).length;
        const bySource = rows.reduce<Record<string, number>>((acc, row: any) => {
            const key = String(row.source_channel ?? 'customer_portal');
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});
        const inProgress = ['paid', 'assigned', 'dispatched'].reduce((n, status) => n + count(status), 0);
        const todayKey = new Date().toISOString().slice(0, 10);
        const installedToday = rows.filter((row) =>
            row.status === 'installed' && String(row.updated_at ?? row.created_at).slice(0, 10) === todayKey
        ).length;
        return {
            total: rows.length,
            pending_payment: count('pending_payment'),
            in_progress: inProgress,
            installed: count('installed'),
            installed_today: installedToday,
            cancelled: count('cancelled'),
            by_source: bySource,
        };
    });

    fastify.get('/meter-orders', async (req) => {
        const { status, q, limit, cursor } = req.query as { status?: string; q?: string; limit?: string; cursor?: string };
        const pageSize = Math.min(Number(limit ?? 100), 200);
        let query = adminClient
            .from('meter_purchase_orders')
            .select('*, customers(full_name, email, phone), vendor_organizations(legal_name, trading_name)')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (status) query = query.eq('status', status);
        const assignedStations = staffStations(req);
        query = scopeStations(query, assignedStations);
        if (q) {
            const safeQ = cleanSearchTerm(q);
            if (safeQ) query = query.or(`property_address.ilike.%${safeQ}%,service_area.ilike.%${safeQ}%,contact_phone.ilike.%${safeQ}%,customer_name_snapshot.ilike.%${safeQ}%`);
        }
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === pageSize ? (rows[rows.length - 1] as any).created_at : null;
        return { orders: rows, nextCursor };
    });

    fastify.get('/meter-orders/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data, error } = await adminClient
            .from('meter_purchase_orders')
            .select('*, customers(full_name, email, phone), vendor_organizations(legal_name, trading_name)')
            .eq('id', id)
            .single();
        if (error || !data) return reply.code(404).send({ error: 'not_found' });
        return data;
    });

    fastify.patch('/meter-orders/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['paid', 'assigned', 'dispatched', 'installed', 'cancelled']).optional(),
            technician_name: z.string().optional(),
            notes: z.string().optional(),
        }).refine((value) => value.status || value.technician_name !== undefined || value.notes !== undefined, {
            message: 'Provide a status, technician, or note.',
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const { data: current, error: currentError } = await adminClient
            .from('meter_purchase_orders')
            .select('id, status')
            .eq('id', id)
            .maybeSingle();
        if (currentError) return reply.code(500).send({ error: 'db_error', message: currentError.message });
        if (!current) return reply.code(404).send({ error: 'not_found' });
        const nextStatus = body.status ?? (current as any).status;
        try {
            if (body.status && body.status !== (current as any).status) {
                assertMeterOrderTransition((current as any).status, body.status);
            }
        }
        catch (transitionError: any) {
            return reply.code(transitionError?.status ?? 409).send({ error: transitionError?.code ?? 'invalid_status_transition', message: transitionError?.message });
        }

        const { data: order, error } = await adminClient
            .from('meter_purchase_orders')
            .update({ ...body, status: nextStatus, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', (current as any).status)
            .select()
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });
        if (!order) return reply.code(404).send({ error: 'not_found' });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            action: body.status ? `meter_order.${body.status}` : 'meter_order.updated',
            targetId: id,
            metadata: { technician_name: body.technician_name, notes: body.notes },
        });

        if (body.status && ['assigned', 'dispatched', 'installed', 'cancelled'].includes(body.status)) {
            const customerId = order.customer_id;
            if (customerId) {
                const { notifyMeterOrderUpdate } = await import('../services/notifications.js');
                notifyMeterOrderUpdate(customerId, {
                    orderId: id,
                    status: body.status,
                    technicianName: body.technician_name ?? null,
                }).catch(() => undefined);
            }
        }

        return order;
    });

    fastify.get('/fraud', async (req) => {
        const { resolved, min_score, limit } = req.query as { resolved?: string; min_score?: string; limit?: string };
        const minScore = Number(min_score ?? 50);
        let query = adminClient
            .from('fraud_assessments')
            .select('*, fraud_signals(*), customers(users(full_name, phone))')
            .gte('score', minScore)
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 200), 500));
        if (resolved === 'true')  query = query.eq('resolved', true);
        if (resolved === 'false') query = query.eq('resolved', false);
        const { data } = await query;
        return { assessments: data ?? [] };
    });

    fastify.patch('/fraud/:id/resolve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ note: z.string().optional() });
        const body = schema.parse(req.body);
        try {
            await resolveAssessment(id, req.actor!.userId, body.note);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                action:      'fraud.assessment.resolved',
                targetId:    id,
                metadata:    { note: body.note },
            });
            return { ok: true };
        } catch (e: any) {
            return reply.code(500).send({ error: 'resolve_failed', message: e.message });
        }
    });

    // ── disputes ──
    fastify.get('/disputes', async (req) => {
        const { status } = req.query as { status?: string };
        return { disputes: await listAllDisputes({ status, limit: 200 }) };
    });

    fastify.get('/disputes/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const d = await getDispute(id);
        if (!d) return reply.code(404).send({ error: 'not_found' });
        return d;
    });

    fastify.patch('/disputes/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status:          z.enum(['open','under_review','resolved','rejected','refund_issued']).optional(),
            resolution_note: z.string().optional(),
            message:         z.string().optional(),
        }).refine((body) => body.status || body.message, {
            message: 'Provide status or message.',
        });
        const body = schema.parse(req.body);
        if (body.status) {
            await updateDisputeStatus({
                disputeId:        id,
                status:           body.status,
                resolutionNote:   body.resolution_note,
                resolvedByUserId: req.actor!.userId,
            });
        } else if (body.resolution_note) {
            return reply.code(400).send({
                error: 'status_required',
                message: 'Resolution notes require a status update.',
            });
        }
        if (body.message) {
            await addMessage({ disputeId: id, senderActorType: 'staff', senderActorId: req.actor!.userId, body: body.message });
        }
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: body.status ? `dispute.${body.status}` : 'dispute.message',
            targetType: 'dispute',
            targetId: id,
        });
        return { ok: true };
    });

    // ── support: FAQ knowledge base ──
    fastify.get('/support/faq-categories', async () => {
        return { categories: await listFaqCategories('all') };
    });

    fastify.get('/support/faqs', async (req) => {
        const { category, search } = req.query as { category?: string; search?: string };
        return { faqs: await listFaqs({ audience: 'all', categoryId: category, search, includeUnpublished: true }) };
    });

    fastify.post('/support/faq-categories', async (req, reply) => {
        const schema = z.object({
            slug: z.string().min(2).max(60), title: z.string().min(2).max(120),
            description: z.string().max(500).optional(), icon: z.string().max(40).optional(),
            audience: z.enum(['all', 'customer', 'vendor']).optional(), sort_order: z.number().int().optional(),
        });
        const body = schema.parse(req.body);
        const result = await upsertFaqCategory({ ...body, sortOrder: body.sort_order });
        return reply.code(201).send(result);
    });

    fastify.put('/support/faq-categories/:id', async (req) => {
        const { id } = req.params as { id: string };
        const schema = z.object({
            slug: z.string().min(2).max(60), title: z.string().min(2).max(120),
            description: z.string().max(500).optional(), icon: z.string().max(40).optional(),
            audience: z.enum(['all', 'customer', 'vendor']).optional(), sort_order: z.number().int().optional(),
        });
        const body = schema.parse(req.body);
        return upsertFaqCategory({ id, ...body, sortOrder: body.sort_order });
    });

    fastify.delete('/support/faq-categories/:id', async (req) => {
        const { id } = req.params as { id: string };
        await deleteFaqCategory(id);
        return { ok: true };
    });

    fastify.post('/support/faqs', async (req, reply) => {
        const schema = z.object({
            category_id: z.string().uuid().nullable().optional(),
            question: z.string().min(5).max(500), answer: z.string().min(5).max(8000),
            audience: z.enum(['all', 'customer', 'vendor']).optional(),
            tags: z.array(z.string()).optional(), sort_order: z.number().int().optional(),
            published: z.boolean().optional(),
        });
        const body = schema.parse(req.body);
        const result = await upsertFaq({ categoryId: body.category_id, question: body.question, answer: body.answer, audience: body.audience, tags: body.tags, sortOrder: body.sort_order, published: body.published });
        return reply.code(201).send(result);
    });

    fastify.put('/support/faqs/:id', async (req) => {
        const { id } = req.params as { id: string };
        const schema = z.object({
            category_id: z.string().uuid().nullable().optional(),
            question: z.string().min(5).max(500), answer: z.string().min(5).max(8000),
            audience: z.enum(['all', 'customer', 'vendor']).optional(),
            tags: z.array(z.string()).optional(), sort_order: z.number().int().optional(),
            published: z.boolean().optional(),
        });
        const body = schema.parse(req.body);
        return upsertFaq({ id, categoryId: body.category_id, question: body.question, answer: body.answer, audience: body.audience, tags: body.tags, sortOrder: body.sort_order, published: body.published });
    });

    fastify.delete('/support/faqs/:id', async (req) => {
        const { id } = req.params as { id: string };
        await deleteFaq(id);
        return { ok: true };
    });

    // ── support: tickets ──
    fastify.get('/support/tickets/stats', async () => {
        return ticketStats();
    });

    fastify.get('/support/tickets', async (req) => {
        const { status, search, assigned } = req.query as { status?: string; search?: string; assigned?: string };
        return { tickets: await listTickets({ status, search, assignedToUserId: assigned === 'me' ? req.actor!.userId : undefined, limit: 300 }) };
    });

    fastify.get('/support/tickets/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const t = await getTicket(id);
        if (!t) return reply.code(404).send({ error: 'not_found' });
        return t;
    });

    fastify.patch('/support/tickets/:id', async (req) => {
        const { id } = req.params as { id: string };
        const schema = z.object({
            status: z.enum(['open', 'pending', 'awaiting_customer', 'resolved', 'closed']).optional(),
            priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
            category: z.string().max(60).optional(),
            assign_to_me: z.boolean().optional(),
            unassign: z.boolean().optional(),
        });
        const body = schema.parse(req.body);
        await updateTicket({
            ticketId: id,
            status: body.status, priority: body.priority, category: body.category,
            assignedToUserId: body.assign_to_me ? req.actor!.userId : body.unassign ? null : undefined,
        });
        await logAction({
            actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
            action: body.status ? `support.ticket.${body.status}` : 'support.ticket.update',
            targetType: 'support_ticket', targetId: id,
        }).catch(() => undefined);
        return { ok: true };
    });

    fastify.post('/support/tickets/:id/messages', async (req, reply) => {
        const { id } = req.params as { id: string };
        const schema = z.object({ body: z.string().min(1).max(4000), internal: z.boolean().optional() });
        const body = schema.parse(req.body);
        const t = await getTicket(id);
        if (!t) return reply.code(404).send({ error: 'not_found' });
        await addTicketMessage({
            ticketId: id, senderActorType: 'staff', senderActorId: req.actor!.userId,
            senderName: req.actor!.role, body: body.body, isInternal: body.internal,
        });
        return { ok: true };
    });

    // ── support: chat console ──
    fastify.get('/support/chat/sessions', async (req) => {
        const { status } = req.query as { status?: string };
        return { sessions: await listChatSessions({ status, limit: 150 }) };
    });

    fastify.get('/support/chat/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const s = await getChatSession(id);
        if (!s) return reply.code(404).send({ error: 'not_found' });
        return s;
    });

    fastify.get('/support/chat/:id/messages', async (req) => {
        const { id } = req.params as { id: string };
        const { since } = req.query as { since?: string };
        return { messages: await getChatMessages(id, { since, viewer: 'staff' }) };
    });

    fastify.post('/support/chat/:id/messages', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { body: msgBody } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
        const s = await getChatSession(id);
        if (!s) return reply.code(404).send({ error: 'not_found' });
        await sendChatMessage({
            sessionId: id, senderActorType: 'staff', senderActorId: req.actor!.userId,
            senderName: 'Beverly Support', body: msgBody,
        });
        return { ok: true };
    });

    fastify.post('/support/chat/:id/assign', async (req) => {
        const { id } = req.params as { id: string };
        await assignChatSession(id, req.actor!.userId);
        return { ok: true };
    });

    fastify.post('/support/chat/:id/end', async (req) => {
        const { id } = req.params as { id: string };
        await endChatSession(id);
        return { ok: true };
    });

    // ── announcements: admin broadcast console ──
    fastify.get('/announcements/recipients', async (req) => {
        const query = z.object({
            audience: z.enum(['customers', 'vendors', 'system']).optional(),
            search: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(1000).optional(),
        }).parse(req.query);
        const audiences: AnnouncementRecipientType[] =
            query.audience === 'vendors' ? ['vendor']
                : query.audience === 'customers' ? ['customer']
                    : ['customer', 'vendor'];
        const [recipients, summary] = await Promise.all([
            listAnnouncementRecipients({
                audiences,
                search: query.search,
                limit: query.limit ?? 100,
            }),
            countAnnouncementRecipients({ audiences, search: query.search }),
        ]);
        return {
            recipients,
            summary: {
                customers: summary.customers,
                vendors: summary.vendors,
                total: summary.total,
            },
        };
    });

    fastify.get('/announcements/recipients/export.csv', async (req, reply) => {
        const query = z.object({
            audience: z.enum(['customers', 'vendors', 'system']).optional(),
            search: z.string().optional(),
        }).parse(req.query);
        const audiences: AnnouncementRecipientType[] =
            query.audience === 'vendors' ? ['vendor']
                : query.audience === 'customers' ? ['customer']
                    : ['customer', 'vendor'];
        const recipients = await listAnnouncementRecipients({
            audiences,
            search: query.search,
            limit: 1000,
        });
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="announcement-recipients.csv"');
        return toCsv(recipients, ['type', 'name', 'email', 'phone', 'status', 'id']);
    });

    fastify.get('/announcements', async (req) => {
        const query = z.object({
            limit: z.coerce.number().int().min(1).max(200).optional(),
        }).parse(req.query);
        const { data, error } = await adminClient
            .from('admin_announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(query.limit ?? 50);
        if (error) throw error;
        return { announcements: data ?? [] };
    });

    fastify.post('/announcements', async (req, reply) => {
        const schema = z.object({
            title: z.string().trim().min(3).max(120),
            body: z.string().trim().min(5).max(2000),
            audiences: z.array(z.enum(['customers', 'vendors'])).min(1),
            send_to_all: z.boolean().optional(),
            recipient_keys: z.array(z.string().regex(/^(customer|vendor):[0-9a-f-]{36}$/i)).optional(),
        });
        const body = schema.parse(req.body ?? {});
        const audiences = Array.from(new Set(body.audiences.map((v) => v === 'customers' ? 'customer' : 'vendor'))) as AnnouncementRecipientType[];
        const requestedKeys = new Set(body.recipient_keys ?? []);
        let recipients = body.send_to_all
            ? await listAllAnnouncementRecipients(audiences)
            : await listAnnouncementRecipients({ audiences, limit: 1000 });
        if (!body.send_to_all) recipients = recipients.filter((r) => requestedKeys.has(r.key));
        if (!recipients.length) return reply.code(400).send({ error: 'no_recipients', message: 'Select at least one recipient.' });

        const audienceLabel = audiences.length === 2 ? 'system' : audiences[0] === 'customer' ? 'customers' : 'vendors';
        const { data: announcement, error: annError } = await adminClient
            .from('admin_announcements')
            .insert({
                title: body.title,
                body: body.body,
                audience: audienceLabel,
                target_mode: body.send_to_all ? 'all' : 'selected',
                channel: 'in_app',
                created_by_staff_id: req.actor!.userId,
                recipient_count: recipients.length,
            })
            .select('*')
            .single();
        if (annError) throw annError;

        const notificationRows = recipients.map((r) => ({
            customer_id: r.type === 'customer' ? r.id : null,
            vendor_organization_id: r.type === 'vendor' ? r.id : null,
            recipient_type: r.type,
            recipient_id: r.id,
            announcement_id: announcement.id,
            type: 'admin_announcement',
            title: body.title,
            body: body.body,
            metadata: { announcement_id: announcement.id, audience: audienceLabel, recipient_key: r.key },
            read: false,
        }));
        try {
            const notifications = await insertAnnouncementNotifications(notificationRows);
            const notificationsByRecipient = new Map(
                (notifications ?? []).map((n: any) => [`${n.recipient_type}:${n.recipient_id}`, n])
            );

            const deliveryRows = recipients.map((r) => {
                const notification = notificationsByRecipient.get(r.key);
                return {
                    announcement_id: announcement.id,
                    recipient_type: r.type,
                    recipient_id: r.id,
                    customer_id: r.type === 'customer' ? r.id : null,
                    vendor_organization_id: r.type === 'vendor' ? r.id : null,
                    notification_id: notification?.id ?? null,
                    status: notification?.id ? 'delivered' : 'queued',
                };
            });
            await insertAnnouncementDeliveries(deliveryRows);

            await notifyAdminAnnouncement(recipients, { title: body.title, body: body.body }, (emailError) => req.log.error({ emailError }, 'Announcement email fan-out failed'));
        } catch (deliveryError) {
            const { error: notificationCleanupError } = await adminClient
                .from('notifications')
                .delete()
                .eq('announcement_id', announcement.id);
            const { error: announcementCleanupError } = notificationCleanupError
                ? { error: null }
                : await adminClient.from('admin_announcements').delete().eq('id', announcement.id);
            const cleanupFailed = Boolean(notificationCleanupError || announcementCleanupError);
            req.log.error({ deliveryError, notificationCleanupError, announcementCleanupError }, 'Announcement delivery failed');
            return reply.code(503).send({
                error: 'announcement_delivery_failed',
                message: cleanupFailed
                    ? 'Announcement delivery failed and needs administrator review.'
                    : 'Announcement delivery failed. No recipients were notified. Please retry.',
            });
        }

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'admin.announcement.sent',
            targetType: 'admin_announcement',
            targetId: announcement.id,
            after: { audience: audienceLabel, target_mode: body.send_to_all ? 'all' : 'selected', recipient_count: recipients.length },
        }).catch(() => undefined);

        return reply.code(201).send({ ok: true, announcement, delivered: recipients.length });
    });

    // ── refunds ──
    fastify.get('/refunds/summary', async () => ({ summary: await getRefundSummary() }));

    fastify.get('/refunds', async (req) => {
        const { status } = req.query as { status?: string };
        const normalizedStatus = status === 'requested' || status === 'under_review'
            ? 'pending'
            : status;
        return { refunds: await listRefundRequests({ status: normalizedStatus, limit: 200 }) };
    });

    fastify.post('/refunds', async (req, reply) => {
        const schema = z.object({
            dispute_id:   z.string().uuid().optional(),
            wallet_id:    z.string().uuid(),
            amount_minor: z.number().int().positive(),
            reason:       z.string().min(5),
        });
        const body = schema.parse(req.body);
        try {
            const id = await createRefundRequest({ disputeId: body.dispute_id, walletId: body.wallet_id, amountMinor: body.amount_minor, reason: body.reason, requestedByUserId: req.actor!.userId });
            return { id };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'refund_error', message: e.message });
        }
    });

    fastify.post('/refunds/:id/approve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            await approveRefund(id, req.actor!.userId);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'approve_failed', message: e.message });
        }
    });

    fastify.post('/refunds/:id/reject', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { reason } = z.object({ reason: z.string().min(2) }).parse(req.body);
        try {
            await rejectRefund(id, req.actor!.userId, reason);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'reject_failed', message: e.message });
        }
    });

    // ── settlement ──
    fastify.get('/settlement', async (req) => {
        const { vendor_id } = req.query as { vendor_id?: string };
        return { batches: await listSettlementBatches({ vendorOrganizationId: vendor_id, limit: 200 }) };
    });

    // ── reconciliation ──
    fastify.get('/reconciliation', async () => {
        const runs = await listReconciliationRuns(30);
        return {
            runs: runs.map((run: any) => ({
                ...run,
                db_total_minor: run.db_total_minor ?? run.total_amount_minor ?? 0,
            })),
        };
    });

    fastify.post('/reconciliation/run', async (_req, reply) => {
        try {
            await runDailyReconciliation();
            const runs = await listReconciliationRuns(1);
            return { ok: true, run: runs[0] ?? null };
        } catch (e: any) {
            return reply.code(500).send({ error: 'reconciliation_failed', message: e.message });
        }
    });

    // ── audit log viewer ──
    async function resolveRegisteredActorNames(actorIds: string[]): Promise<Map<string, string>> {
        const ids = [...new Set(actorIds.map((value) => String(value || '').trim()).filter(Boolean))];
        if (!ids.length) return new Map();
        const [byAuth, byUser] = await Promise.all([
            adminClient
                .from('users')
                .select('auth_user_id, user_name, email')
                .in('auth_user_id', ids),
            adminClient
                .from('users')
                .select('user_id, user_name, email')
                .in('user_id', ids),
        ]);
        const out = new Map<string, string>();
        for (const row of (byAuth.data ?? []) as any[]) {
            const id = String(row.auth_user_id ?? '').trim();
            const name = String(row.user_name ?? row.email ?? '').trim();
            if (id && name) out.set(id, name);
        }
        for (const row of (byUser.data ?? []) as any[]) {
            const id = String(row.user_id ?? '').trim();
            const name = String(row.user_name ?? row.email ?? '').trim();
            if (id && name) out.set(id, name);
        }
        return out;
    }

    function enrichAuditActors(rows: any[], actorNames: Map<string, string>): any[] {
        return rows.map((row) => {
            const actorId = String(row.actor_user_id ?? '').trim();
            const registrationName = actorNames.get(actorId);
            if (!registrationName) return row;
            const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return {
                ...row,
                actor_name: registrationName,
                metadata: {
                    ...metadata,
                    actor_name: registrationName,
                    registration_name: registrationName,
                },
            };
        });
    }

    fastify.get('/audit', async (req, reply) => {
        const { actor, actorType, action, targetType, target, since, until, limit, cursor } =
            req.query as Record<string, string | undefined>;
        let query = adminClient
            .from('wallet_audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (actor)      query = query.eq('actor_user_id', actor);
        if (actorType)  query = query.eq('actor_type', actorType);
        if (action)     query = query.ilike('action', `${action}%`);
        if (targetType) query = query.eq('target_type', targetType);
        if (target)     query = query.eq('target_id', target);
        if (since)      query = query.gte('created_at', since);
        if (until)      query = query.lte('created_at', until);
        if (cursor)     query = query.lt('created_at', cursor);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'audit_log_unavailable',
                message: 'Audit log failed to load.',
                details: error.message,
            });
        }
        const rows = data ?? [];
        const actorNames = await resolveRegisteredActorNames(rows.map((entry: any) => String(entry.actor_user_id ?? '')).filter(Boolean));
        const entries = enrichAuditActors(rows as any[], actorNames);
        const nextCursor = entries.length === Math.min(Number(limit ?? 100), 500)
            ? entries[entries.length - 1].created_at
            : null;
        return { entries, nextCursor };
    });

    // ── single audit row (for detail drawer) ──
    fastify.get('/audit/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { data, error } = await adminClient.from('wallet_audit_log').select('*').eq('id', id).maybeSingle();
        if (error || !data) return reply.code(404).send({ error: 'not_found', message: 'Audit entry not found.' });
        const actorNames = await resolveRegisteredActorNames([String((data as any).actor_user_id ?? '')].filter(Boolean));
        const [entry] = enrichAuditActors([data as any], actorNames);
        return entry;
    });

    // ── CSV export (capped at 10k rows for safety) ──
    fastify.get('/audit/export.csv', async (req, reply) => {
        const { actor, actorType, action, targetType, target, since, until } =
            req.query as Record<string, string | undefined>;
        let query = adminClient.from('wallet_audit_log').select('*')
            .order('created_at', { ascending: false }).limit(10_000);
        if (actor)      query = query.eq('actor_user_id', actor);
        if (actorType)  query = query.eq('actor_type', actorType);
        if (action)     query = query.ilike('action', `${action}%`);
        if (targetType) query = query.eq('target_type', targetType);
        if (target)     query = query.eq('target_id', target);
        if (since)      query = query.gte('created_at', since);
        if (until)      query = query.lte('created_at', until);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'audit_export_unavailable',
                message: 'Audit export failed.',
                details: error.message,
            });
        }
        const rowsRaw = data ?? [];
        const actorNames = await resolveRegisteredActorNames(rowsRaw.map((entry: any) => String(entry.actor_user_id ?? '')).filter(Boolean));
        const rows = enrichAuditActors(rowsRaw as any[], actorNames);
        const header = ['created_at', 'actor_type', 'actor_user_id', 'actor_role', 'action',
                        'target_type', 'target_id', 'ip', 'correlation_id'];
        const csv = [
            header.join(','),
            ...rows.map((r: any) => header.map((h) => csvEscape(r[h])).join(',')),
        ].join('\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
        return csv;
    });

    // ── security events viewer ──
    fastify.get('/security-events', async (req, reply) => {
        const { eventType, severity, actor, since, until, limit } =
            req.query as Record<string, string | undefined>;
        let query = adminClient
            .from('wallet_security_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (eventType) query = query.eq('event_type', eventType);
        if (severity)  query = query.eq('severity', severity);
        if (actor)     query = query.eq('actor_user_id', actor);
        if (since)     query = query.gte('created_at', since);
        if (until)     query = query.lte('created_at', until);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'security_events_unavailable',
                message: 'Security events failed to load.',
                details: error.message,
            });
        }
        return { events: data ?? [] };
    });

    // ── audit summary: counts by action over the last N days ──
    fastify.get('/audit/summary', async (req, reply) => {
        const days = Math.min(Math.max(Number((req.query as { days?: string }).days ?? 7), 1), 90);
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const { data, error } = await adminClient
            .from('wallet_audit_log')
            .select('action, actor_type')
            .gte('created_at', since)
            .limit(10_000);
        if (error) {
            return reply.code(502).send({
                error: 'audit_summary_unavailable',
                message: 'Audit summary failed to load.',
                details: error.message,
            });
        }
        const byAction: Record<string, number> = {};
        const byActorType: Record<string, number> = {};
        for (const row of data ?? []) {
            const a = (row as any).action;
            const t = (row as any).actor_type;
            byAction[a]     = (byAction[a]     ?? 0) + 1;
            byActorType[t]  = (byActorType[t]  ?? 0) + 1;
        }
        return { days, total: (data ?? []).length, byAction, byActorType };
    });

    // ════════════════════════════════════════════════════════════
    // REPORTS — analytics aggregation across the wallet system
    // ════════════════════════════════════════════════════════════

    function resolveRange(query: Record<string, string | undefined>) {
        const now = new Date();
        const until = query.until ? new Date(query.until) : now;
        const since = query.since
            ? new Date(query.since)
            : new Date(until.getTime() - 29 * 86400_000);
        const sinceIso = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())).toISOString();
        const untilIso = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate(), 23, 59, 59, 999)).toISOString();
        const days = Math.max(1, Math.round((new Date(untilIso).getTime() - new Date(sinceIso).getTime()) / 86400_000));
        return { sinceIso, untilIso, days };
    }

    function dayKey(iso: string): string {
        return String(iso).slice(0, 10);
    }

    async function gatherReportData(sinceIso: string, untilIso: string, stationIds?: string[]) {
        const inRange = (q: any) => q.gte('created_at', sinceIso).lte('created_at', untilIso);
        const purchasesQuery = inRange(adminClient.from('purchase_orders').select('amount_minor, energy_amount_minor, vat_amount_minor, fee_minor, status, created_at, actor_type, station_id'));
        if (stationIds) purchasesQuery.in('station_id', stationIds);
        const [purchases, funding, fundingRequests, refunds, disputes, newCustomers, settlements, auditLogs, securityEvents] = await Promise.all([
            purchasesQuery.limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('payment_transactions').select('amount_minor, created_at').eq('purpose', 'wallet_funding').in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES))).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('funding_requests').select('amount_minor, channel, status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('refund_requests').select('amount_minor, status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('disputes').select('status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('customers').select('created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('settlement_batches').select('gross_amount_minor, fee_minor, net_amount_minor, status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('wallet_audit_log').select('action, actor_type, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('wallet_security_events').select('event_type, severity, created_at')).limit(50_000).then((r: any) => r.data ?? []),
        ]);
        return { purchases, funding, fundingRequests, refunds, disputes, newCustomers, settlements, auditLogs, securityEvents } as Record<string, any[]>;
    }

    function buildReport(sinceIso: string, untilIso: string, days: number, d: Record<string, any[]>) {
        const num = (v: unknown) => Number(v ?? 0);
        const delivered = d.purchases.filter((p) => p.status === 'delivered');
        const failed = d.purchases.filter((p) => p.status === 'failed');
        const revenueMinor = delivered.reduce((s, p) => s + num(p.amount_minor), 0);
        const energyRevenueMinor = delivered.reduce((s, p) => s + num(p.energy_amount_minor ?? p.amount_minor), 0);
        const vatMinor = delivered.reduce((s, p) => s + num(p.vat_amount_minor), 0);
        const feeMinor = delivered.reduce((s, p) => s + num(p.fee_minor), 0);
        const fundingApprovedMinor = d.funding.reduce((s, p) => s + num(p.amount_minor), 0);
        const approvedRefunds = d.refunds.filter((r) => r.status === 'approved');
        const refundApprovedMinor = approvedRefunds.reduce((s, r) => s + num(r.amount_minor), 0);
        const settlementNetMinor = d.settlements.reduce((s, b) => s + num(b.net_amount_minor), 0);
        const settlementGrossMinor = d.settlements.reduce((s, b) => s + num(b.gross_amount_minor), 0);
        const processed = delivered.length + failed.length;

        // Daily buckets (zero-filled across the range)
        const buckets = new Map<string, { date: string; revenueMinor: number; energyRevenueMinor: number; vatMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; refundMinor: number; auditLogsCount: number; securityEventsCount: number }>();
        const startMs = new Date(sinceIso).getTime();
        for (let i = 0; i < days; i++) {
            const key = dayKey(new Date(startMs + i * 86400_000).toISOString());
            buckets.set(key, { date: key, revenueMinor: 0, energyRevenueMinor: 0, vatMinor: 0, purchaseCount: 0, fundingMinor: 0, newCustomers: 0, refundMinor: 0, auditLogsCount: 0, securityEventsCount: 0 });
        }
        const touch = (iso: string) => buckets.get(dayKey(iso));
        for (const p of delivered) {
            const b = touch(p.created_at);
            if (b) {
                b.revenueMinor += num(p.amount_minor);
                b.energyRevenueMinor += num(p.energy_amount_minor ?? p.amount_minor);
                b.vatMinor += num(p.vat_amount_minor);
                b.purchaseCount += 1;
            }
        }
        for (const f of d.funding) { const b = touch(f.created_at); if (b) b.fundingMinor += num(f.amount_minor); }
        for (const c of d.newCustomers) { const b = touch(c.created_at); if (b) b.newCustomers += 1; }
        for (const r of approvedRefunds) { const b = touch(r.created_at); if (b) b.refundMinor += num(r.amount_minor); }
        for (const log of (d.auditLogs || [])) { const b = touch(log.created_at); if (b) b.auditLogsCount += 1; }
        for (const e of (d.securityEvents || [])) { const b = touch(e.created_at); if (b) b.securityEventsCount += 1; }

        const purchasesByStatus: Record<string, number> = {};
        for (const p of d.purchases) purchasesByStatus[p.status] = (purchasesByStatus[p.status] ?? 0) + 1;

        const revenueByActorType: Record<string, number> = {};
        for (const p of delivered) revenueByActorType[p.actor_type ?? 'unknown'] = (revenueByActorType[p.actor_type ?? 'unknown'] ?? 0) + num(p.amount_minor);

        const fundingByChannel: Record<string, number> = {};
        const fundingRequestsByStatus: Record<string, number> = {};
        for (const f of d.fundingRequests || []) {
            fundingByChannel[f.channel ?? 'unknown'] = (fundingByChannel[f.channel ?? 'unknown'] ?? 0) + num(f.amount_minor);
            fundingRequestsByStatus[f.status ?? 'unknown'] = (fundingRequestsByStatus[f.status ?? 'unknown'] ?? 0) + 1;
        }

        const disputesByStatus: Record<string, number> = {};
        for (const dispute of d.disputes) disputesByStatus[dispute.status ?? 'unknown'] = (disputesByStatus[dispute.status ?? 'unknown'] ?? 0) + 1;

        const refundsByStatus: Record<string, number> = {};
        for (const refund of d.refunds) refundsByStatus[refund.status ?? 'unknown'] = (refundsByStatus[refund.status ?? 'unknown'] ?? 0) + 1;

        const settlementByStatus: Record<string, number> = {};
        for (const settlement of d.settlements) settlementByStatus[settlement.status ?? 'unknown'] = (settlementByStatus[settlement.status ?? 'unknown'] ?? 0) + 1;

        const stationMap = new Map<string, { station_id: string; count: number; revenueMinor: number }>();
        for (const p of delivered) {
            const sid = p.station_id ?? 'unknown';
            const row = stationMap.get(sid) ?? { station_id: sid, count: 0, revenueMinor: 0 };
            row.count += 1; row.revenueMinor += num(p.amount_minor);
            stationMap.set(sid, row);
        }
        const topStations = [...stationMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 8);

        const auditActionsBreakdown: Record<string, number> = {};
        for (const log of (d.auditLogs || [])) {
            auditActionsBreakdown[log.action] = (auditActionsBreakdown[log.action] ?? 0) + 1;
        }
        const securitySeveritiesBreakdown: Record<string, number> = {};
        for (const e of (d.securityEvents || [])) {
            securitySeveritiesBreakdown[e.severity] = (securitySeveritiesBreakdown[e.severity] ?? 0) + 1;
        }

        return {
            range: { since: sinceIso, until: untilIso, days },
            kpis: {
                revenueMinor,
                energyRevenueMinor,
                vatMinor,
                feeMinor,
                purchaseCount: d.purchases.length,
                deliveredCount: delivered.length,
                failedCount: failed.length,
                successRate: processed ? Math.round((delivered.length / processed) * 1000) / 10 : 0,
                avgOrderValueMinor: delivered.length ? Math.round(revenueMinor / delivered.length) : 0,
                fundingApprovedMinor,
                fundingCount: d.funding.length,
                settlementNetMinor,
                settlementGrossMinor,
                settlementBatches: d.settlements.length,
                refundApprovedMinor,
                refundCount: d.refunds.length,
                disputesOpened: d.disputes.length,
                newCustomers: d.newCustomers.length,
                auditLogsCount: (d.auditLogs || []).length,
                securityEventsCount: (d.securityEvents || []).length,
                securityAlertsHigh: (d.securityEvents || []).filter((e: any) => e.severity === 'high' || e.severity === 'critical').length,
            },
            series: { daily: [...buckets.values()] },
            breakdowns: {
                purchasesByStatus,
                revenueByActorType,
                topStations,
                auditActionsBreakdown,
                securitySeveritiesBreakdown,
                fundingByChannel,
                fundingRequestsByStatus,
                disputesByStatus,
                refundsByStatus,
                settlementByStatus,
            },
            sources: {
                purchases: d.purchases.length,
                paymentTransactions: d.funding.length,
                fundingRequests: (d.fundingRequests || []).length,
                refunds: d.refunds.length,
                disputes: d.disputes.length,
                customers: d.newCustomers.length,
                settlements: d.settlements.length,
                auditLogs: (d.auditLogs || []).length,
                securityEvents: (d.securityEvents || []).length,
            },
        };
    }

    fastify.get('/reports/overview', async (req) => {
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        const data = await gatherReportData(sinceIso, untilIso, staffStations(req) ?? undefined);
        return buildReport(sinceIso, untilIso, days, data);
    });

    fastify.get('/reports/export.csv', async (req, reply) => {
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        const data = await gatherReportData(sinceIso, untilIso, staffStations(req) ?? undefined);
        const report = buildReport(sinceIso, untilIso, days, data);
        const header = ['date', 'revenue_minor', 'energy_revenue_minor', 'vat_minor', 'purchase_count', 'funding_minor', 'refund_minor', 'new_customers'];
        const csv = [
            header.join(','),
            ...report.series.daily.map((r) => [r.date, r.revenueMinor, r.energyRevenueMinor, r.vatMinor, r.purchaseCount, r.fundingMinor, r.refundMinor, r.newCustomers].map(csvEscape).join(',')),
        ].join('\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="report-${sinceIso.slice(0, 10)}_${untilIso.slice(0, 10)}.csv"`);
        return csv;
    });

    // ── feature flags ──
    fastify.get('/feature-flags', async () => {
        return { flags: await listFlags() };
    });

    fastify.post('/feature-flags', async (req, reply) => {
        const schema = z.object({
            key:             z.string().min(2).regex(/^[a-z0-9._-]+$/),
            description:     z.string().min(2),
            enabled:         z.boolean().optional(),
            rollout_percent: z.number().int().min(0).max(100).optional(),
            regions:         z.array(z.string()).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        try {
            await createFlag(body);
            await logAction({ actorUserId: req.actor!.userId, actorType: 'staff', action: 'feature_flag.created', targetId: body.key });
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: 'create_failed', message: e.message });
        }
    });

    fastify.patch('/feature-flags/:key', async (req, reply) => {
        const key = (req.params as { key: string }).key;
        const schema = z.object({
            enabled:         z.boolean().optional(),
            rollout_percent: z.number().int().min(0).max(100).optional(),
            regions:         z.array(z.string()).optional(),
            description:     z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        await setFlag(key, body);
        await logAction({ actorUserId: req.actor!.userId, actorType: 'staff', action: 'feature_flag.updated', targetId: key, metadata: body });
        return { ok: true };
    });

    // ── NDPR: account deletion queue ──
    fastify.get('/vat-policies', async () => ({
        policies: await listVatPolicies(),
    }));

    fastify.post('/vat-policies', async (req, reply) => {
        const body = z.object({
            label: z.string().trim().min(3).max(120),
            rate_basis_points: z.number().int().min(0).max(10_000),
            effective_at: z.string().datetime(),
        }).parse(req.body ?? {});
        const policy = await submitVatPolicy({
            label: body.label,
            rateBasisPoints: body.rate_basis_points,
            effectiveAt: body.effective_at,
            actorUserId: req.actor!.userId,
        });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'vat_policy.submitted',
            targetType: 'vat_policy',
            targetId: policy.id,
            after: { ...policy },
        });
        return reply.code(201).send({ policy });
    });

    fastify.post('/vat-policies/:id/approve', async (req, reply) => {
        const id = z.string().uuid().parse((req.params as { id: string }).id);
        const policy = await approveVatPolicy(id, req.actor!.userId);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'vat_policy.approved',
            targetType: 'vat_policy',
            targetId: policy.id,
            after: { ...policy },
        });
        return reply.send({ policy });
    });

    fastify.get('/privacy/deletions', async (req) => {
        const { status } = req.query as { status?: string };
        return { requests: await listDeletionRequests({ status, limit: 200 }) };
    });

    // ── Consumption analytics ────────────────────────────────────────────────

    fastify.get('/consumption', async (req, reply) => {
        const qs = req.query as Record<string, string>;
        const assignedStations = staffStations(req);
        const scope      = (assignedStations ? 'station' : qs.scope) as 'meter' | 'station' | 'cumulative' ?? 'station';
        const period     = qs.period as 'day' | 'week' | 'month' | 'year' ?? 'month';
        const scope_id   = qs.scope_id || undefined;
        const from       = qs.from ?? undefined;
        const to         = qs.to ?? undefined;
        const limit      = Math.min(Number(qs.limit ?? 120), 500);

        if (!['meter','station','cumulative'].includes(scope)) {
            return reply.code(400).send({ error: 'bad_scope', message: 'scope must be meter | station | cumulative' });
        }
        if (!['day','week','month','year'].includes(period)) {
            return reply.code(400).send({ error: 'bad_period', message: 'period must be day | week | month | year' });
        }

        // super-admin -> every station; any other staff role -> only their
        // assignment. staffStations() returns [] for an unassigned staffer,
        // which stationsAuthority treats as "see nothing".
        const { queryConsumption, allStations, stationsAuthority } = await import('../services/consumption.js');
        const authority = assignedStations ? stationsAuthority(assignedStations) : allStations();
        const rows = await queryConsumption(
            { scope, scope_id, period_type: period, from, to, limit, withSpend: qs.spend === 'true' },
            authority,
        );
        return { rows, count: rows.length };
    });

    fastify.get('/consumption/meters', async (req, reply) => {
        const qs         = req.query as Record<string, string>;
        const assignedStations = staffStations(req);
        const station_id = qs.station_id;
        const period     = qs.period as 'day' | 'week' | 'month' | 'year' ?? 'month';
        const from       = qs.from ?? undefined;
        const to         = qs.to ?? undefined;

        if (!station_id) {
            return reply.code(400).send({ error: 'missing_station_id', message: 'station_id is required' });
        }
        if (assignedStations && !assignedStations.includes(station_id.toUpperCase())) {
            return reply.code(404).send({ error: 'not_found', message: 'Station not found for your assignment.' });
        }
        if (!['day','week','month','year'].includes(period)) {
            return reply.code(400).send({ error: 'bad_period', message: 'period must be day | week | month | year' });
        }

        const { queryMeterBreakdown, allStations, stationsAuthority } = await import('../services/consumption.js');
        const authority = assignedStations ? stationsAuthority(assignedStations) : allStations();
        const rows = await queryMeterBreakdown(station_id, period, authority, from, to);
        return { rows, count: rows.length };
    });

    fastify.post('/consumption/refresh', async (req, reply) => {
        try {
            const body = (req.body ?? {}) as { stationId?: string; station_id?: string; stationIds?: string[]; station_ids?: string[] };
            const assignedStations = staffStations(req);
            const stationIds = assignedStations ?? body.stationIds ?? body.station_ids ?? (body.stationId || body.station_id ? [body.stationId ?? body.station_id ?? ''] : undefined);
            const { refreshConsumptionAggregates } = await import('../services/consumption.js');
            const result = await refreshConsumptionAggregates(stationIds);
            return { ...result, ok: true };
        } catch (e: any) {
            return reply.code(500).send({ error: 'refresh_failed', message: e.message, result: e.result });
        }
    });

    fastify.get('/abnormal-alarms', async (req, reply) => {
        const qs = req.query as Record<string, string>;
        const alarm = String(qs.alarm ?? '').trim();
        const stationId = String(qs.station_id ?? '').trim();
        const from = String(qs.from ?? '').trim();
        const to = String(qs.to ?? '').trim();
        const limit = Math.min(Number(qs.limit ?? qs.pageLimit ?? 200), 1000);
        const offset = Math.max(0, Number(qs.offset ?? 0));
        let query = adminClient
            .from('daily_meter_readings')
            .select('meter_id, customer_id, customer_name, station_id, gateway_id, current_date, total1, usage1, battery_low, magnetic_interference, terminal_cover_open, cover_open, current_reverse, current_unbalance, update_date')
            .order('current_date', { ascending: false })
            .range(offset, offset + limit - 1);
        if (stationId) query = query.eq('station_id', stationId);
        if (from) query = query.gte('current_date', from);
        if (to) query = query.lte('current_date', to);
        const { data, error } = await query;
        if (error) return reply.code(500).send({ error: 'read_failed', message: error.message });
        const rows = (data ?? []).flatMap((r: any) => {
            const signals = [
                { key: 'noData', label: 'No Data Report', hit: Number(r.usage1 ?? 0) === 0 },
                { key: 'magneticInterference', label: 'Magnetic Interference', hit: Number(r.magnetic_interference ?? 0) > 0 },
                { key: 'batteryLow', label: 'Battery Low', hit: Number(r.battery_low ?? 0) > 0 },
                { key: 'terminalCoverOpen', label: 'Terminal Cover Open', hit: Number(r.terminal_cover_open ?? 0) > 0 },
                { key: 'coverOpen', label: 'Upper Open', hit: Number(r.cover_open ?? 0) > 0 },
                { key: 'currentReverse', label: 'Current Reverse', hit: Number(r.current_reverse ?? 0) > 0 },
                { key: 'currentUnbalance', label: 'Current Unbalance', hit: Number(r.current_unbalance ?? 0) > 0 },
            ].filter((s) => s.hit).map((s) => ({
                alarmKey: s.key, alarmLabel: s.label,
                meterId: r.meter_id, customerId: r.customer_id, customerName: r.customer_name, stationId: r.station_id, gatewayId: r.gateway_id,
                total1: r.total1, usage1: r.usage1, batteryLow: r.battery_low, magneticInterference: r.magnetic_interference,
                terminalCoverOpen: r.terminal_cover_open, coverOpen: r.cover_open, currentReverse: r.current_reverse, currentUnbalance: r.current_unbalance,
                currentDate: r.current_date, updateDate: r.update_date,
            }));
            return signals;
        }).filter((row: any) => !alarm || row.alarmKey === alarm);
        return { rows, total: rows.length, count: rows.length };
    });

    fastify.patch('/customers/:id/profile-picture', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ profile_picture_url: z.string().trim().url().max(1000).nullable() });
        const body = schema.parse(req.body);
        const { data: before } = await adminClient.from('customers').select('profile_picture_url').eq('id', id).maybeSingle();
        const { error } = await adminClient.from('customers').update({ profile_picture_url: body.profile_picture_url }).eq('id', id);
        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'customer.profile_picture.override',
            targetType: 'customer',
            targetId: id,
            before: { profile_picture_url: (before as any)?.profile_picture_url ?? null },
            after: { profile_picture_url: body.profile_picture_url ?? null },
        });
        return { ok: true };
    });

    // Developer console routes live in admin-dev.ts; they inherit this
    // plugin's preHandler chain (dev.console permission, MFA, break-glass).
    await fastify.register(adminDevRoutes);

    fastify.patch('/privacy/deletions/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            approve: z.boolean(),
            note:    z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        try {
            await reviewDeletionRequest(id, req.actor!.userId, body.approve, body.note);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: 'review_failed', message: e.message });
        }
    });

    // ── Bulk wallet operations (super-admin only) ───────────────────────────────

    fastify.post('/wallets/bulk-status', async (req, reply) => {
        if (!requireWalletStatusManager(req, reply)) return undefined;
        const schema = z.object({
            walletIds: z.array(z.string().uuid()).min(1).max(100),
            status:    z.enum(['active', 'frozen', 'closed']),
            reason:    z.string().min(4),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const walletId of body.walletIds) {
            try {
                await setWalletStatus(walletId, body.status);
                await logAction({
                    actorUserId: req.actor!.userId,
                    actorType:   'staff',
                    actorRole:   req.actor!.role,
                    action:      `wallet.bulk.${body.status}`,
                    targetType:  'wallet',
                    targetId:    walletId,
                    metadata:    { reason: body.reason },
                }).catch(() => undefined);
                results.push({ id: walletId, ok: true });
            } catch (e: any) {
                results.push({ id: walletId, ok: false, error: e.message });
            }
        }
        return { results };
    });

    fastify.post('/wallets/bulk-limits', async (req, reply) => {
        if (!requireWalletStatusManager(req, reply)) return undefined;
        const schema = z.object({
            walletIds:         z.array(z.string().uuid()).min(1).max(100),
            dailyCapMinor:     z.number().int().positive().optional(),
            monthlyCapMinor:   z.number().int().positive().optional(),
            reason:            z.string().min(4),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        if (!body.dailyCapMinor && !body.monthlyCapMinor) {
            return reply.code(400).send({ error: 'no_changes', message: 'Provide at least one cap value.' });
        }

        const patch: Record<string, number> = {};
        if (body.dailyCapMinor)   patch.daily_debit_cap_minor   = body.dailyCapMinor;
        if (body.monthlyCapMinor) patch.monthly_debit_cap_minor = body.monthlyCapMinor;

        const { error } = await adminClient
            .from('wallets')
            .update(patch)
            .in('id', body.walletIds);

        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType:   'staff',
            actorRole:   req.actor!.role,
            action:      'wallet.bulk.limits_update',
            targetType:  'wallet',
            targetId:    body.walletIds.join(','),
            metadata:    { ...patch, reason: body.reason, count: body.walletIds.length },
        }).catch(() => undefined);
        return { ok: true, updated: body.walletIds.length };
    });

    // ── Compliance — CTR ────────────────────────────────────────────────────────

    fastify.get('/compliance/ctrs', async (req) => {
        const q = req.query as Record<string, string>;
        const { listCtrs } = await import('../services/compliance-ctr.js');
        const rows = await listCtrs({
            status:     q.status,
            walletId:   q.wallet_id,
            customerId: q.customer_id,
            since:      q.since,
            until:      q.until,
            limit:      q.limit ? Math.min(Number(q.limit), 500) : 100,
            cursor:     q.cursor,
        });
        return { ctrs: rows, count: rows.length };
    });

    fastify.get('/compliance/ctrs/stats', async () => {
        const { getCtrStats } = await import('../services/compliance-ctr.js');
        return getCtrStats();
    });

    fastify.post('/compliance/ctrs/:id/file', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ filing_reference: z.string().optional() });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        const { fileCtr } = await import('../services/compliance-ctr.js');
        try {
            await fileCtr(id, req.actor!.userId, body.filing_reference);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                actorRole:   req.actor!.role,
                action:      'compliance.ctr.file',
                targetType:  'ctr',
                targetId:    id,
                metadata:    { filing_reference: body.filing_reference },
            }).catch(() => undefined);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'file_failed', message: e.message });
        }
    });

    fastify.get('/compliance/ctrs/report', async (req, reply) => {
        const q = req.query as Record<string, string>;
        const since = q.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const until = q.until ?? new Date().toISOString();
        const { buildCbnReport } = await import('../services/compliance-ctr.js');
        const report = await buildCbnReport(since, until);
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="cbn-ctr-report-${since.slice(0, 10)}.json"`);
        return report;
    });

    // ── Compliance — AML / Sanctions ───────────────────────────────────────────

    fastify.get('/compliance/aml', async (req) => {
        const q = req.query as Record<string, string>;
        const { listScreenings } = await import('../services/aml-screening.js');
        const rows = await listScreenings({
            entityType: q.entity_type,
            status:     q.status,
            since:      q.since,
            limit:      q.limit ? Math.min(Number(q.limit), 500) : 100,
        });
        return { screenings: rows, count: rows.length };
    });

    fastify.post('/compliance/aml/:id/review', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['whitelisted', 'blocked', 'clear']),
            note:   z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        const { reviewScreening } = await import('../services/aml-screening.js');
        try {
            await reviewScreening(id, req.actor!.userId, body.status, body.note);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                actorRole:   req.actor!.role,
                action:      'compliance.aml.review',
                targetType:  'aml_screening',
                targetId:    id,
                metadata:    { new_status: body.status, note: body.note },
            }).catch(() => undefined);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'review_failed', message: e.message });
        }
    });

    fastify.get('/compliance/sanctions', async (req) => {
        const q = req.query as Record<string, string>;
        const { listSanctionsEntries } = await import('../services/aml-screening.js');
        const rows = await listSanctionsEntries({
            active: q.active !== undefined ? q.active === 'true' : true,
            limit:  q.limit ? Math.min(Number(q.limit), 500) : 200,
        });
        return { entries: rows, count: rows.length };
    });

    fastify.post('/compliance/sanctions', async (req, reply) => {
        const schema = z.object({
            full_name:    z.string().min(2),
            aliases:      z.array(z.string()).optional(),
            bvn_partial:  z.string().length(4).optional(),
            nin_partial:  z.string().length(4).optional(),
            nationality:  z.string().optional(),
            source:       z.enum(['EFCC', 'INTERPOL', 'OFAC', 'CBN', 'internal']),
            list_date:    z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        const { addSanctionsEntry } = await import('../services/aml-screening.js');
        try {
            const id = await addSanctionsEntry({
                fullName:        body.full_name,
                aliases:         body.aliases,
                bvnPartial:      body.bvn_partial,
                ninPartial:      body.nin_partial,
                nationality:     body.nationality,
                source:          body.source,
                listDate:        body.list_date,
                addedByUserId:   req.actor!.userId,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                actorRole:   req.actor!.role,
                action:      'compliance.sanctions.add',
                targetType:  'sanctions_entry',
                targetId:    id,
                metadata:    { full_name: body.full_name, source: body.source },
            }).catch(() => undefined);
            return { ok: true, id };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'insert_failed', message: e.message });
        }
    });

    // ── KYC document admin ──────────────────────────────────────────────────────

    fastify.get('/kyc/documents/pending', async (req) => {
        const q = req.query as { limit?: string };
        const { listPendingDocuments } = await import('../services/kyc-documents.js');
        const docs = await listPendingDocuments({ limit: q.limit ? Number(q.limit) : 100 });
        return { documents: docs, count: docs.length };
    });

    fastify.get('/kyc/documents/:customerId', async (req) => {
        const customerId = (req.params as { customerId: string }).customerId;
        const { listDocuments } = await import('../services/kyc-documents.js');
        const docs = await listDocuments(customerId);
        return { documents: docs };
    });

    fastify.get('/kyc/documents/:customerId/:docId/url', async (req, reply) => {
        const { docId } = req.params as { customerId: string; docId: string };
        const { getDownloadUrl, KycDocumentError } = await import('../services/kyc-documents.js');
        try {
            const url = await getDownloadUrl(docId);
            return { url };
        } catch (e: any) {
            const code = e instanceof KycDocumentError && e.code === 'not_found' ? 404 : 400;
            return reply.code(code).send({ error: e.code ?? 'url_failed', message: e.message });
        }
    });

    fastify.post('/kyc/documents/:docId/review', async (req, reply) => {
        const docId = (req.params as { docId: string }).docId;
        const schema = z.object({
            approve:         z.boolean(),
            rejection_note:  z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        const { reviewDocument } = await import('../services/kyc-documents.js');
        try {
            await reviewDocument({
                docId,
                reviewedByUserId: req.actor!.userId,
                approve:          body.approve,
                rejectionNote:    body.rejection_note,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                actorRole:   req.actor!.role,
                action:      body.approve ? 'kyc.document.approve' : 'kyc.document.reject',
                targetType:  'kyc_document',
                targetId:    docId,
                metadata:    { rejection_note: body.rejection_note },
            }).catch(() => undefined);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'review_failed', message: e.message });
        }
    });
};

export default route;
