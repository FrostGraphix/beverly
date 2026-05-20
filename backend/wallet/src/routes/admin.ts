/**
 * Admin (staff) routes — /api/v1/admin/*
 *
 * Staff actions: vendor onboarding, funding approval, monitoring.
 * All actions audit-logged.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import {
    createVendorOrganization, setVendorStatus,
} from '../services/vendor-onboarding.js';
import {
    approveFundingRequest, rejectFundingRequest, listPendingFunding, reconcileApprovedFundingCredits,
} from '../services/funding.js';
import { getBalance } from '../services/ledger.js';
import { logAction } from '../services/audit.js';
import { resolveAssessment } from '../services/fraud-engine.js';
import { listStations, invalidateStationsCache, TokenEngineError } from '../services/token-engine.js';
import { listAllDisputes, updateDisputeStatus, addMessage, getDispute } from '../services/disputes.js';
import { listRefundRequests, createRefundRequest, approveRefund, rejectRefund } from '../services/refunds.js';
import { listSettlementBatches } from '../services/settlement.js';
import { listReconciliationRuns, runDailyReconciliation } from '../services/reconciliation.js';
import { listFlags, setFlag, createFlag } from '../services/feature-flags.js';
import { listDeletionRequests, reviewDeletionRequest } from '../services/data-privacy.js';

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const PERMISSION_CATALOG = [
    { key: 'wallet.dashboard.view', label: 'View operations dashboard', group: 'Overview', risk: 'low' },
    { key: 'wallet.vendors.review', label: 'Review vendor applications', group: 'Vendors', risk: 'medium' },
    { key: 'wallet.vendors.manage', label: 'Create and manage vendors', group: 'Vendors', risk: 'high' },
    { key: 'wallet.funding.view', label: 'View funding queue', group: 'Money', risk: 'medium' },
    { key: 'wallet.funding.approve', label: 'Approve vendor funding', group: 'Money', risk: 'critical' },
    { key: 'wallet.vending.monitor', label: 'Monitor vending activity', group: 'Money', risk: 'medium' },
    { key: 'wallet.refunds.manage', label: 'Approve refunds', group: 'Operations', risk: 'critical' },
    { key: 'wallet.disputes.manage', label: 'Resolve disputes', group: 'Operations', risk: 'medium' },
    { key: 'wallet.settlement.view', label: 'View settlement batches', group: 'Operations', risk: 'medium' },
    { key: 'wallet.reconciliation.run', label: 'Run reconciliation', group: 'Operations', risk: 'high' },
    { key: 'wallet.fraud.review', label: 'Resolve fraud reviews', group: 'Compliance', risk: 'high' },
    { key: 'wallet.privacy.review', label: 'Review privacy requests', group: 'Compliance', risk: 'high' },
    { key: 'wallet.audit.view', label: 'View audit and security events', group: 'Compliance', risk: 'high' },
    { key: 'wallet.flags.manage', label: 'Manage feature flags', group: 'Launch', risk: 'critical' },
    { key: 'wallet.access.manage', label: 'Manage roles and permissions', group: 'Access', risk: 'critical' },
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    'super-admin': PERMISSION_CATALOG.map((p) => p.key),
    'operations-manager': [
        'wallet.dashboard.view', 'wallet.vendors.review', 'wallet.vending.monitor',
        'wallet.disputes.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.fraud.review', 'wallet.audit.view',
    ],
    'finance-checker': [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.funding.approve',
        'wallet.refunds.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.audit.view',
    ],
    account: [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.vending.monitor',
        'wallet.settlement.view', 'wallet.reconciliation.run',
    ],
};

const ROLE_LABELS: Record<string, string> = {
    'super-admin': 'Super Admin',
    'operations-manager': 'Operations Manager',
    'finance-checker': 'Finance Checker',
    account: 'Account Officer',
};

const ROLE_LEGACY_NAMES: Record<string, string> = {
    'super-admin': 'admin',
    'operations-manager': 'ops',
    'finance-checker': 'analyst',
    account: 'finance',
};

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

async function ensureAccessDefaults() {
    for (const [roleKey, label] of Object.entries(ROLE_LABELS)) {
        await adminClient.from('roles').upsert({
            name: ROLE_LEGACY_NAMES[roleKey] ?? roleKey,
            role_key: roleKey,
            role_name: label,
            label,
            description: roleKey === 'super-admin'
                ? 'Full wallet administration and access control.'
                : 'Wallet administration role managed by Beverly access policy.',
        }, { onConflict: 'role_key' });
    }
    for (const [roleKey, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        for (const permission of permissions) {
            await adminClient.from('permissions').upsert({
                role_key: roleKey,
                route_hash: permission,
            }, { onConflict: 'role_key,route_hash' });
        }
    }
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('preHandler', fastify.requireStaff());

    fastify.get('/access', async () => {
        await ensureAccessDefaults();
        const [{ data: roles }, { data: permissions }, { data: staffRows }, authUsers] = await Promise.all([
            adminClient.from('roles').select('*').order('role_key', { ascending: true }),
            adminClient.from('permissions').select('*').order('role_key', { ascending: true }),
            adminClient.from('users').select('id, auth_user_id, user_id, user_name, email, role_key, created_at, updated_at').order('updated_at', { ascending: false }).limit(300),
            adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
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

    fastify.post('/access/users', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const schema = z.object({
            email: z.string().email(),
            fullName: z.string().min(2),
            roleKey: z.enum(['super-admin', 'operations-manager', 'finance-checker', 'account']),
            temporaryPassword: z.string().min(12).optional(),
        });
        const body = schema.parse(req.body);
        const password = body.temporaryPassword ?? `Beverly-${crypto.randomUUID().slice(0, 8)}aA1!`;
        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
            email: body.email.toLowerCase(),
            password,
            email_confirm: true,
            user_metadata: { role_key: body.roleKey, role: body.roleKey, full_name: body.fullName },
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
            after: { email: body.email.toLowerCase(), roleKey: body.roleKey },
        });
        return { ok: true, userId: authData.user.id, temporaryPassword: password };
    });

    fastify.patch('/access/users/:userId/role', async (req, reply) => {
        if (!requireAccessManager(req, reply)) return undefined;
        const userId = (req.params as { userId: string }).userId;
        const schema = z.object({
            roleKey: z.enum(['super-admin', 'operations-manager', 'finance-checker', 'account']),
        });
        const { roleKey } = schema.parse(req.body);
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
        return { ok: true, userId, roleKey };
    });

    // ── stations directory (live from energy backend, 5-min cache) ──
    fastify.get('/stations', async (req, reply) => {
        const force = (req.query as { refresh?: string }).refresh === '1';
        try {
            const stations = await listStations({ force });
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
    fastify.get('/vendors', async (req) => {
        const { status, q } = req.query as { status?: string; q?: string };
        let query = adminClient.from('vendor_organizations').select('*').order('created_at', { ascending: false }).limit(200);
        if (status) query = query.eq('status', status);
        if (q) query = query.ilike('legal_name', `%${q}%`);
        const { data } = await query;
        return { vendors: data ?? [] };
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

    // ── vendor detail ──
    fastify.get('/vendors/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: vendor, error } = await adminClient
            .from('vendor_organizations').select('*').eq('id', id).maybeSingle();
        if (error || !vendor) return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });

        const { data: wallet } = await adminClient
            .from('wallets').select('*').eq('owner_type', 'vendor').eq('owner_id', id).maybeSingle();
        const balance = wallet ? await getBalance((wallet as any).id).catch(() => null) : null;

        const [vendingAgg, fundingAgg] = await Promise.all([
            adminClient.from('purchase_orders').select('amount_minor', { count: 'exact' })
                .eq('actor_type', 'vendor').eq('actor_id', id),
            adminClient.from('payment_transactions').select('amount_minor', { count: 'exact' })
                .eq('actor_type', 'vendor').eq('actor_id', id).eq('purpose', 'wallet_funding').eq('status', 'success'),
        ]);
        const sum = (arr: any[] | null | undefined) =>
            (arr ?? []).reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

        const stationCount = ((vendor as any).operating_stations ?? []).length;

        return {
            vendor,
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

    // ── funding approval queue ──
    fastify.get('/funding/pending', async () => {
        const list = await listPendingFunding(200);
        return { funding: list };
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

        let query = adminClient
            .from('wallets')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (ownerType) query = query.eq('owner_type', ownerType);
        if (status)    query = query.eq('status',     status);
        if (cursor)    query = query.lt('created_at', cursor);
        const { data: wallets, error } = await query;
        if (error) return { wallets: [], error: error.message };
        const rows = wallets ?? [];
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
            const ql = q.toLowerCase();
            enriched = enriched.filter((w: any) =>
                w.id.toLowerCase().includes(ql) ||
                (w.owner_name ?? '').toLowerCase().includes(ql) ||
                (w.owner_phone ?? '').toLowerCase().includes(ql) ||
                (w.owner_email ?? '').toLowerCase().includes(ql),
            );
        }
        if (minBalance) enriched = enriched.filter((w: any) => w.balance_minor >= Number(minBalance));
        if (maxBalance) enriched = enriched.filter((w: any) => w.balance_minor <= Number(maxBalance));

        const nextCursor = rows.length === Math.min(Number(limit ?? 100), 500)
            ? rows[rows.length - 1].created_at : null;

        return { wallets: enriched, nextCursor };
    });

    // KPI summary across the entire wallet system.
    fastify.get('/wallets/summary', async () => {
        const { data: walletsRaw } = await adminClient.from('wallets').select('id, owner_type, status');
        const wallets = walletsRaw ?? [];
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
            totalHoldsMinor:    totalHolds,
            vendorFloatMinor:   vendorFloat,
            customerFloatMinor: customerFloat,
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

        const { setWalletStatus } = await import('../services/wallets.js');
        const updated = await setWalletStatus(id, body.status);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType:   'staff',
            actorRole:   req.actor!.role,
            action:      `wallet.status.${body.status}`,
            targetType:  'wallet',
            targetId:    id,
            before:      { status: (before as any).status },
            after:       { status: body.status, reason: body.reason ?? null },
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
        let query = adminClient
            .from('customers')
            .select('id, auth_user_id, full_name, phone, email, kyc_tier, kyc_status, status, created_at')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (status)  query = query.eq('status', status);
        if (kycTier) query = query.eq('kyc_tier', Number(kycTier));
        if (cursor)  query = query.lt('created_at', cursor);
        if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
        const { data, error } = await query;
        if (error) return { customers: [], error: error.message };
        const rows = data ?? [];
        if (!rows.length) return { customers: [], nextCursor: null };

        // Batch wallet balances
        const ids = rows.map((c: any) => c.id);
        const { data: wallets } = await adminClient
            .from('wallets').select('id, owner_id, status').eq('owner_type', 'customer').in('owner_id', ids);
        const walletByOwner = new Map((wallets ?? []).map((w: any) => [w.owner_id, w]));
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
        const nextCursor = rows.length === Math.min(Number(limit ?? 100), 500)
            ? rows[rows.length - 1].created_at : null;
        return { customers: enriched, nextCursor };
    });

    // Customer KPI summary.
    fastify.get('/customers/summary', async () => {
        const { data: rows } = await adminClient.from('customers').select('id, kyc_tier, status');
        const customers = rows ?? [];
        const byTier: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const c of customers as any[]) {
            byTier[`tier_${c.kyc_tier ?? 0}`] = (byTier[`tier_${c.kyc_tier ?? 0}`] ?? 0) + 1;
            byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        }
        // Total customer float
        const { data: wallets } = await adminClient.from('wallets').select('id').eq('owner_type', 'customer');
        const { getBalance } = await import('../services/ledger.js');
        const balances = await Promise.all((wallets ?? []).map((w: any) => getBalance(w.id).catch(() => null)));
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
                .eq('actor_type', 'customer').eq('actor_id', id).eq('purpose', 'wallet_funding').eq('status', 'success'),
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
            after:       { status: body.status, reason: body.reason ?? null },
        });
        return { ok: true, customer: updated };
    });

    // ════════════════════════════════════════════════════════════
    // PURCHASES — full admin experience (renamed from /vending)
    // ════════════════════════════════════════════════════════════

    fastify.get('/purchases', async (req) => {
        const {
            status, station, actorType, q, since, until, limit, cursor,
        } = req.query as Record<string, string | undefined>;

        let query = adminClient.from('purchase_orders').select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (status)    query = query.eq('status', status);
        if (station)   query = query.eq('station_id', station);
        if (actorType) query = query.eq('actor_type', actorType);
        if (since)     query = query.gte('created_at', since);
        if (until)     query = query.lte('created_at', until);
        if (cursor)    query = query.lt('created_at', cursor);
        if (q) {
            const filters = [`meter_id.ilike.%${q}%`, `customer_name.ilike.%${q}%`];
            if (isUuid(q)) filters.push(`id.eq.${q}`);
            query = query.or(filters.join(','));
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
        const { status, station, q, cursor, limit } = req.query as Record<string, string | undefined>;
        let query = adminClient.from('purchase_orders').select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 200), 500));
        if (status)  query = query.eq('status', status);
        if (station) query = query.eq('station_id', station);
        if (cursor)  query = query.lt('created_at', cursor);
        if (q) {
            const filters = [`meter_id.ilike.%${q}%`, `customer_name.ilike.%${q}%`];
            if (isUuid(q)) filters.push(`id.eq.${q}`);
            query = query.or(filters.join(','));
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
    fastify.get('/purchases/summary', async () => {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

        const [today, last24h, failed24h, refunded] = await Promise.all([
            adminClient.from('purchase_orders').select('id, amount_minor', { count: 'exact' }).gte('created_at', sod),
            adminClient.from('purchase_orders').select('id, amount_minor', { count: 'exact' }).gte('created_at', dayAgo),
            adminClient.from('purchase_orders').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo).eq('status', 'failed'),
            adminClient.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'refunded'),
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


    // ── meter purchase orders ──
    fastify.get('/meter-orders', async (req) => {
        const { status, q } = req.query as { status?: string; q?: string };
        let query = adminClient
            .from('meter_purchase_orders')
            .select('*, customers(users(full_name, email, phone))')
            .order('created_at', { ascending: false })
            .limit(200);
        if (status) query = query.eq('status', status);
        if (q) query = query.or(`property_address.ilike.%${q}%,service_area.ilike.%${q}%`);
        const { data } = await query;
        return { orders: data ?? [] };
    });

    fastify.patch('/meter-orders/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['paid', 'assigned', 'dispatched', 'installed', 'cancelled']),
            technician_name: z.string().optional(),
            notes: z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const { data: order, error } = await adminClient
            .from('meter_purchase_orders')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });
        if (!order) return reply.code(404).send({ error: 'not_found' });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            action: `meter_order.${body.status}`,
            targetId: id,
            metadata: { technician_name: body.technician_name, notes: body.notes },
        });
        return order;
    });

    // ── fraud review queue ──
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

    // ── refunds ──
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
        const entries = data ?? [];
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
        return data;
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
        const rows = data ?? [];
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

    async function gatherReportData(sinceIso: string, untilIso: string) {
        const inRange = (q: any) => q.gte('created_at', sinceIso).lte('created_at', untilIso);
        const [purchases, funding, refunds, disputes, newCustomers, settlements] = await Promise.all([
            inRange(adminClient.from('purchase_orders').select('amount_minor, fee_minor, status, created_at, actor_type, station_id')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('payment_transactions').select('amount_minor, created_at').eq('purpose', 'wallet_funding').eq('status', 'success')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('refund_requests').select('amount_minor, status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('disputes').select('status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('customers').select('created_at')).limit(50_000).then((r: any) => r.data ?? []),
            inRange(adminClient.from('settlement_batches').select('gross_amount_minor, fee_minor, net_amount_minor, status, created_at')).limit(50_000).then((r: any) => r.data ?? []),
        ]);
        return { purchases, funding, refunds, disputes, newCustomers, settlements } as Record<string, any[]>;
    }

    function buildReport(sinceIso: string, untilIso: string, days: number, d: Record<string, any[]>) {
        const num = (v: unknown) => Number(v ?? 0);
        const delivered = d.purchases.filter((p) => p.status === 'delivered');
        const failed = d.purchases.filter((p) => p.status === 'failed');
        const revenueMinor = delivered.reduce((s, p) => s + num(p.amount_minor), 0);
        const feeMinor = delivered.reduce((s, p) => s + num(p.fee_minor), 0);
        const fundingApprovedMinor = d.funding.reduce((s, p) => s + num(p.amount_minor), 0);
        const approvedRefunds = d.refunds.filter((r) => r.status === 'approved');
        const refundApprovedMinor = approvedRefunds.reduce((s, r) => s + num(r.amount_minor), 0);
        const settlementNetMinor = d.settlements.reduce((s, b) => s + num(b.net_amount_minor), 0);
        const settlementGrossMinor = d.settlements.reduce((s, b) => s + num(b.gross_amount_minor), 0);
        const processed = delivered.length + failed.length;

        // Daily buckets (zero-filled across the range)
        const buckets = new Map<string, { date: string; revenueMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; refundMinor: number }>();
        const startMs = new Date(sinceIso).getTime();
        for (let i = 0; i < days; i++) {
            const key = dayKey(new Date(startMs + i * 86400_000).toISOString());
            buckets.set(key, { date: key, revenueMinor: 0, purchaseCount: 0, fundingMinor: 0, newCustomers: 0, refundMinor: 0 });
        }
        const touch = (iso: string) => buckets.get(dayKey(iso));
        for (const p of delivered) { const b = touch(p.created_at); if (b) { b.revenueMinor += num(p.amount_minor); b.purchaseCount += 1; } }
        for (const f of d.funding) { const b = touch(f.created_at); if (b) b.fundingMinor += num(f.amount_minor); }
        for (const c of d.newCustomers) { const b = touch(c.created_at); if (b) b.newCustomers += 1; }
        for (const r of approvedRefunds) { const b = touch(r.created_at); if (b) b.refundMinor += num(r.amount_minor); }

        const purchasesByStatus: Record<string, number> = {};
        for (const p of d.purchases) purchasesByStatus[p.status] = (purchasesByStatus[p.status] ?? 0) + 1;

        const revenueByActorType: Record<string, number> = {};
        for (const p of delivered) revenueByActorType[p.actor_type ?? 'unknown'] = (revenueByActorType[p.actor_type ?? 'unknown'] ?? 0) + num(p.amount_minor);

        const stationMap = new Map<string, { station_id: string; count: number; revenueMinor: number }>();
        for (const p of delivered) {
            const sid = p.station_id ?? 'unknown';
            const row = stationMap.get(sid) ?? { station_id: sid, count: 0, revenueMinor: 0 };
            row.count += 1; row.revenueMinor += num(p.amount_minor);
            stationMap.set(sid, row);
        }
        const topStations = [...stationMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 8);

        return {
            range: { since: sinceIso, until: untilIso, days },
            kpis: {
                revenueMinor,
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
            },
            series: { daily: [...buckets.values()] },
            breakdowns: { purchasesByStatus, revenueByActorType, topStations },
        };
    }

    fastify.get('/reports/overview', async (req) => {
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        const data = await gatherReportData(sinceIso, untilIso);
        return buildReport(sinceIso, untilIso, days, data);
    });

    fastify.get('/reports/export.csv', async (req, reply) => {
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        const data = await gatherReportData(sinceIso, untilIso);
        const report = buildReport(sinceIso, untilIso, days, data);
        const header = ['date', 'revenue_minor', 'purchase_count', 'funding_minor', 'refund_minor', 'new_customers'];
        const csv = [
            header.join(','),
            ...report.series.daily.map((r) => [r.date, r.revenueMinor, r.purchaseCount, r.fundingMinor, r.refundMinor, r.newCustomers].map(csvEscape).join(',')),
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
    fastify.get('/privacy/deletions', async (req) => {
        const { status } = req.query as { status?: string };
        return { requests: await listDeletionRequests({ status, limit: 200 }) };
    });

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
};

export default route;
