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
import { createVendorOrganization, setVendorStatus } from '../services/vendor-onboarding.js';
import { approveFundingRequest, rejectFundingRequest, listPendingFunding, reconcileApprovedFundingCredits, attachProofUrls } from '../services/funding.js';
import { getBalance, captureHold, releaseHold } from '../services/ledger.js';
import { setOwnerWalletStatus, setWalletStatus, WalletStateError } from '../services/wallets.js';
import { auditFromRequest, logAction } from '../services/audit.js';
import { resolveAssessment } from '../services/fraud-engine.js';
import { listStationDirectory, invalidateStationsCache, TokenEngineError, generateCreditToken, lookupMeter } from '../services/token-engine.js';
import { resendRemoteSendOrder } from '../services/vending.js';
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
import { activateProfilePicture, assertProfilePictureSop, PROFILE_PICTURE_BUCKET, toProfilePicturePath } from '../services/profile-picture.js';
import { runMalwareScan } from '../services/file-scan.js';
import { PAYMENT_SUCCEEDED_STATUSES } from '../services/payment-status.js';
import { createAdminMeterOrder, assertMeterOrderTransition, getMeterPrices, rejectMeterOrder, updateMeterPrices } from '../services/meter-orders.js';
import { revokePortalSession } from '../services/portal-session.js';
import { pushConfig, removePushSubscription, savePushSubscription, sendWebPush } from '../services/push-notifications.js';
import adminVendorAnalyticsRoutes from './admin-vendor-analytics.js';
import adminVendorTransferRoutes from './admin-vendor-transfers.js';
import adminDevRoutes from './admin-dev.js';
import adminReportsRoutes from './admin-reports.js';
import adminMeterApprovalsRoutes from './admin-meter-approvals.js';
import adminPaymentRecoveryRoutes from './admin-payment-recovery.js';
import { adminConsumptionRoutes } from './admin-consumption.js';
import { isCorporateStaffEmail } from '../services/email-validation.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG, ROLE_LABELS, ROLE_LEGACY_NAMES, SYSTEM_ROLE_KEYS } from './admin-access-constants.js';
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

function requireIdempotencyKey(req: FastifyRequest, reply: FastifyReply): string | null {
    try {
        return assertClientIdempotencyKey(req.headers['idempotency-key']);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'A valid Idempotency-Key header is required.';
        reply.code(400).send({ error: 'invalid_idempotency_key', message });
        return null;
    }
}

type AnnouncementRecipientType = 'customer' | 'vendor';

interface AnnouncementRecipient {
    key: string;
    type: AnnouncementRecipientType;
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string | null;
}

interface WalletOwnerRow {
    owner_id: string | null;
}

function recipientKey(type: AnnouncementRecipientType, id: string): string {
    return `${type}:${id}`;
}

function normalizeAnnouncementRecipient(row: any, type: AnnouncementRecipientType): AnnouncementRecipient {
    if (type === 'customer') {
        const name = row.full_name || row.email || row.phone || 'Unnamed customer';
        return {
            key: recipientKey('customer', row.id),
            type: 'customer',
            id: row.id,
            name,
            email: row.email ?? null,
            phone: row.phone ?? null,
            status: row.status ?? null,
        };
    }
    const name = row.trading_name || row.legal_name || row.contact_email || 'Unnamed vendor';
    return {
        key: recipientKey('vendor', row.id),
        type: 'vendor',
        id: row.id,
        name,
        email: row.contact_email ?? null,
        phone: row.contact_phone ?? null,
        status: row.status ?? null,
    };
}

async function listWalletCustomerIds(): Promise<string[]> {
    const { data, error } = await adminClient
        .from('wallets')
        .select('owner_id')
        .eq('owner_type', 'customer');
    if (error) throw error;
    return Array.from(new Set(((data ?? []) as WalletOwnerRow[]).map((wallet) => wallet.owner_id).filter((id): id is string => Boolean(id))));
}

async function listWalletVendorIds(): Promise<string[]> {
    const { data, error } = await adminClient
        .from('wallets')
        .select('owner_id')
        .eq('owner_type', 'vendor');
    if (error) throw error;
    return Array.from(new Set(((data ?? []) as WalletOwnerRow[]).map((wallet) => wallet.owner_id).filter((id): id is string => Boolean(id))));
}

async function listAnnouncementRecipients(opts: {
    audiences: AnnouncementRecipientType[];
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<AnnouncementRecipient[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1_000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const term = cleanSearchTerm(opts.search);
    const recipients: AnnouncementRecipient[] = [];

    if (opts.audiences.includes('customer')) {
        const walletCustomerIds = await listWalletCustomerIds();
        if (walletCustomerIds.length) {
            let query = adminClient
                .from('customers')
                .select('id, full_name, email, phone, status')
                .in('id', walletCustomerIds)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
            const { data, error } = await query;
            if (error) throw error;
            recipients.push(...(data ?? []).map((row: any) => normalizeAnnouncementRecipient(row, 'customer')));
        }
    }

    if (opts.audiences.includes('vendor')) {
        const walletVendorIds = await listWalletVendorIds();
        if (walletVendorIds.length) {
            let query = adminClient
                .from('vendor_organizations')
                .select('id, legal_name, trading_name, contact_email, contact_phone, status')
                .in('id', walletVendorIds)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (term) query = query.or(`legal_name.ilike.%${term}%,trading_name.ilike.%${term}%,contact_email.ilike.%${term}%,contact_phone.ilike.%${term}%`);
            const { data, error } = await query;
            if (error) throw error;
            recipients.push(...(data ?? []).map((row: any) => normalizeAnnouncementRecipient(row, 'vendor')));
        }
    }

    return recipients;
}

async function countAnnouncementRecipients(opts: { audiences: AnnouncementRecipientType[]; search?: string }) {
    const term = cleanSearchTerm(opts.search);
    let customers = 0;
    let vendors = 0;
    if (opts.audiences.includes('customer')) {
        const walletCustomerIds = await listWalletCustomerIds();
        if (walletCustomerIds.length) {
            let query = adminClient.from('customers').select('id', { count: 'exact', head: true }).in('id', walletCustomerIds).neq('status', 'deleted');
            if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
            const { count, error } = await query;
            if (error) throw error;
            customers = count ?? 0;
        }
    }
    if (opts.audiences.includes('vendor')) {
        const walletVendorIds = await listWalletVendorIds();
        if (walletVendorIds.length) {
            let query = adminClient.from('vendor_organizations').select('id', { count: 'exact', head: true }).in('id', walletVendorIds).neq('status', 'deleted');
            if (term) query = query.or(`legal_name.ilike.%${term}%,trading_name.ilike.%${term}%,contact_email.ilike.%${term}%,contact_phone.ilike.%${term}%`);
            const { count, error } = await query;
            if (error) throw error;
            vendors = count ?? 0;
        }
    }
    return { customers, vendors, total: customers + vendors };
}

async function listAllAnnouncementRecipients(audiences: AnnouncementRecipientType[]): Promise<AnnouncementRecipient[]> {
    const pageSize = 1_000;
    const byKey = new Map<string, AnnouncementRecipient>();
    for (const audience of audiences) {
        for (let offset = 0; ; offset += pageSize) {
            const rows = await listAnnouncementRecipients({ audiences: [audience], limit: pageSize, offset });
            for (const row of rows) byKey.set(row.key, row);
            if (rows.length < pageSize) break;
        }
    }
    return Array.from(byKey.values());
}

async function insertAnnouncementNotifications(rows: any[]) {
    const inserted: any[] = [];
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        let { data, error } = await adminClient
            .from('notifications')
            .insert(chunk)
            .select('id, recipient_type, recipient_id');
        const errorText = [error?.message, error?.details].filter(Boolean).join(' ');
        if (error && /notifications/i.test(errorText) && /column "?message"?/i.test(errorText) && /not-null|null value/i.test(errorText)) {
            ({ data, error } = await adminClient
                .from('notifications')
                .insert(chunk.map((row) => ({ ...row, message: row.body })))
                .select('id, recipient_type, recipient_id'));
        }
        if (error) throw error;
        inserted.push(...(data ?? []));
    }
    return inserted;
}

async function insertAnnouncementDeliveries(rows: any[]) {
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const { error } = await adminClient
            .from('admin_announcement_deliveries')
            .insert(rows.slice(i, i + chunkSize));
        if (error) throw error;
    }
}


const OPEN_ADMIN_ROUTES = new Set([
    'GET /me',
    'PATCH /me',
    'POST /logout',
    'POST /profile-picture/upload-url',
    'POST /profile-picture/scan',
    'POST /profile-picture/activate',
    'DELETE /profile-picture',
    'GET /notifications',
    'POST /notifications/read-all',
    'PATCH /notifications/:id/read',
    'GET /push/config',
    'POST /push/subscription',
    'DELETE /push/subscription',
    'POST /push/test',
]);

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
    'GET /vendors/analytics': 'wallet.vendors.review',
    'DELETE /vendors/:id': 'wallet.vendors.manage',
    'PATCH /vendors/:id': 'wallet.vendors.manage',
    'PATCH /vendors/:id/status': 'wallet.vendors.manage',
    'PATCH /vendors/:id/station': 'wallet.vendors.manage',
    'PATCH /vendors/:id/profile-picture': 'wallet.vendors.manage',
    'GET /vendors/:id': 'wallet.vendors.review',
    'GET /vendors/:id/wallet': 'wallet.vendors.review',
    'GET /vendors/:id/transactions': 'wallet.vending.monitor',
    'GET /vendors/:id/funding': 'wallet.funding.view',
    'GET /vendors/:id/staff': 'wallet.vendors.review',
    'GET /funding/pending': 'wallet.funding.view',
    'GET /funding/history': 'wallet.funding.view',
    'GET /payments/requires-review': 'wallet.funding.view',
    'GET /vending/payment-recovery': 'wallet.vending.monitor',
    'POST /payments/:id/retry-fulfillment': 'wallet.funding.approve',
    'POST /funding/reconcile-approved': 'wallet.funding.approve',
    'POST /funding/:id/approve': 'wallet.funding.approve',
    'POST /funding/:id/reject': 'wallet.funding.approve',
    'GET /wallets': 'wallet.funding.view',
    'GET /wallets/summary': 'wallet.funding.view',
    'GET /wallets/:id': 'wallet.funding.view',
    'GET /wallets/:id/ledger': 'wallet.funding.view',
    'PATCH /wallets/:id/status': 'wallet.funding.approve',
    'PATCH /wallets/:id/limits': 'wallet.funding.approve',
    'GET /vendor-transfers/vendors': 'wallet.vendor_transfers.manage',
    'POST /vendor-transfers/preview': 'wallet.vendor_transfers.manage',
    'GET /vendor-transfers': 'wallet.vendor_transfers.manage',
    'GET /vendor-transfers/:id': 'wallet.vendor_transfers.manage',
    'POST /vendor-transfers': 'wallet.vendor_transfers.manage',
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
    'POST /purchases/:id/resend-sms': 'wallet.vending.monitor',
    'POST /purchases/:id/resend-remote': 'wallet.vending.monitor',
    'POST /purchases/:id/release-hold': 'wallet.funding.approve',
    'POST /purchases/:id/retry-vend': 'wallet.vending.monitor',
    'GET /meter-orders': 'wallet.vendors.review',
    'GET /meter-orders/stats': 'wallet.vendors.review',
    'GET /meter-pricing': 'wallet.vendors.manage',
    'PUT /meter-pricing': 'wallet.vendors.manage',
    'GET /meter-orders/customer-search': 'wallet.vendors.manage',
    'GET /meter-orders/:id': 'wallet.vendors.review',
    'POST /meter-orders': 'wallet.vendors.manage',
    'POST /meter-orders/:id/reject': 'wallet.vendors.manage',
    'PATCH /meter-orders/:id': 'wallet.vendors.manage',
    'GET /customer-meters': 'wallet.meters.approve',
    'POST /customer-meters/:id/approve': 'wallet.meters.approve',
    'POST /customer-meters/:id/reject': 'wallet.meters.approve',
    'POST /customer-meters/:id/unlink': 'wallet.meters.approve',
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

async function permissionsForRole(role: string): Promise<Set<string>> {
    await ensureAccessDefaults();
    const { data } = await adminClient.from('permissions').select('route_hash').eq('role_key', role);
    return new Set((data ?? []).map((p: any) => p.route_hash));
}

async function requireAdminPermission(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const key = adminRouteKey(req);
    if (OPEN_ADMIN_ROUTES.has(key)) return true;
    if (!req.actor) {
        if (!reply.sent) reply.code(401).send({ error: 'unauthorized', message: 'Bearer token required.' });
        return false;
    }
    const permission = ADMIN_ROUTE_PERMISSIONS[key];
    if (!permission) {
        if (!reply.sent) {
            reply.code(403).send({
                error: 'permission_not_mapped',
                message: `No access policy is mapped for ${key}.`,
            });
        }
        return false;
    }
    const grants = await permissionsForRole(req.actor.role);
    if (!grants.has(permission)) {
        await logAction({
            actorUserId: req.actor.userId,
            actorType: 'staff',
            actorRole: req.actor.role,
            action: 'access.permission_denied',
            targetType: 'admin_route',
            targetId: key,
            metadata: { permission },
        }).catch(() => undefined);
        if (!reply.sent) {
            reply.code(403).send({
                error: 'permission_denied',
                message: `Missing permission: ${permission}.`,
                details: { permission },
            });
        }
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

/**
 * staffStations() returns `[]` (not null) for a non-super-admin with no
 * station assigned. `[]` is truthy, so callers that just check
 * `if (assignedStations)` silently scope every list query to zero rows
 * instead of explaining why. This makes that case an explicit 403,
 * matching the id-scoped behavior in enforceResourceStation().
 */
function requireStationScope(reply: FastifyReply, assignedStations: string[] | null): boolean {
    if (assignedStations && !assignedStations.length) {
        reply.code(403).send({ error: 'station_required', message: 'Your staff account needs a station assignment.' });
        return false;
    }
    return true;
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

// Seed flag — runs once per server lifetime, not on every request.
let _accessDefaultsSeeded = false;
let _accessDefaultsPromise: Promise<void> | null = null;

async function ensureAccessDefaults() {
    if (_accessDefaultsSeeded) return;
    // Deduplicate concurrent calls during startup (e.g. multiple requests arriving before the first finishes).
    if (_accessDefaultsPromise) return _accessDefaultsPromise;
    _accessDefaultsPromise = (async () => {
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
        _accessDefaultsSeeded = true;
    })();
    return _accessDefaultsPromise;
}

function shapeStaffProfile(actor: FastifyRequest['actor'], staff: any) {
    return {
        id: actor!.userId,
        email: staff?.email ?? actor!.email,
        full_name: staff?.user_name ?? null,
        role: staff?.role_key ?? actor!.role,
        station_id: staff?.station_id ?? actor!.stationId ?? null,
        station_ids: staff?.station_ids ?? actor!.stationIds ?? [],
        profile_picture_url: staff?.profile_picture_url ?? null,
        updated_at: staff?.updated_at ?? null,
    };
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('preHandler', fastify.requireStaff());
    fastify.addHook('preHandler', async (req, reply) => {
        if (reply.sent) return undefined;
        const pathname = req.routeOptions?.url ?? req.url.split('?')[0] ?? '';
        if (pathname.startsWith('/dev/')) {
            if (!env.DEV_CONSOLE_ENABLED) {
                return reply.code(404).send({ error: 'not_found', message: 'Route not found.' });
            }
            if (env.NODE_ENV !== 'development' && !req.actor?.mfaVerified) {
                return reply.code(403).send({ error: 'reauth_required', message: 'Reauthenticate with two-factor authentication before using developer tools.' });
            }
            if (env.NODE_ENV !== 'development') {
                const token = req.headers['x-break-glass-token'];
                if (!env.DEV_CONSOLE_BREAK_GLASS_TOKEN || token !== env.DEV_CONSOLE_BREAK_GLASS_TOKEN) {
                    return reply.code(403).send({ error: 'break_glass_required', message: 'Break-glass authorization is required.' });
                }
            }
            await logAction({
                actorUserId: req.actor?.userId ?? 'system',
                actorType: 'staff',
                actorRole: req.actor?.role ?? 'super-admin',
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

    fastify.get('/notifications', async (req) => {
        const query = z.object({
            limit: z.coerce.number().int().min(1).max(100).default(20),
            cursor: z.string().datetime().optional(),
        }).parse(req.query ?? {});
        let rowsQuery = adminClient
            .from('notifications')
            .select('id, type, title, body, metadata, read, created_at')
            .eq('recipient_type', 'staff')
            .eq('recipient_id', req.actor!.userId)
            .order('created_at', { ascending: false })
            .limit(query.limit);
        if (query.cursor) rowsQuery = rowsQuery.lt('created_at', query.cursor);
        const [{ data, error }, { count, error: countError }] = await Promise.all([
            rowsQuery,
            adminClient
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('recipient_type', 'staff')
                .eq('recipient_id', req.actor!.userId)
                .eq('read', false),
        ]);
        if (error) throw error;
        if (countError) throw countError;
        const notifications = data ?? [];
        return {
            notifications,
            nextCursor: notifications.length === query.limit ? notifications.at(-1)?.created_at ?? null : null,
            unreadCount: count ?? 0,
        };
    });

    fastify.post('/notifications/read-all', async (req) => {
        const { error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('recipient_type', 'staff')
            .eq('recipient_id', req.actor!.userId)
            .eq('read', false);
        if (error) throw error;
        return { ok: true };
    });

    fastify.patch('/notifications/:id/read', async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { data, error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .eq('recipient_type', 'staff')
            .eq('recipient_id', req.actor!.userId)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) return reply.code(404).send({ error: 'not_found', message: 'Notification not found.' });
        return { ok: true };
    });

    fastify.get('/push/config', async () => pushConfig());

    fastify.post('/push/subscription', async (req) => {
        const body = z.object({
            portal: z.enum(['admin', 'crm']),
            endpoint: z.string().url().max(2048),
            keys: z.object({
                p256dh: z.string().min(20).max(512),
                auth: z.string().min(8).max(256),
            }),
        }).parse(req.body ?? {});
        await savePushSubscription({
            actorType: 'staff',
            actorId: req.actor!.userId,
            portal: body.portal,
            subscription: body,
            userAgent: req.headers['user-agent'],
        });
        return { ok: true };
    });

    fastify.delete('/push/subscription', async (req) => {
        const { endpoint } = z.object({ endpoint: z.string().url().max(2048) }).parse(req.query ?? {});
        await removePushSubscription({ actorType: 'staff', actorId: req.actor!.userId, endpoint });
        return { ok: true };
    });

    fastify.post('/push/test', async (req, reply) => {
        const { portal } = z.object({ portal: z.enum(['admin', 'crm']) }).parse(req.body ?? {});
        if (!pushConfig().available) {
            return reply.code(503).send({ error: 'push_unavailable', message: 'Push notifications are not configured.' });
        }
        const now = new Date().toISOString();
        await insertAnnouncementNotifications([{
            customer_id: null,
            recipient_type: 'staff',
            recipient_id: req.actor!.userId,
            type: 'push_test',
            title: 'Beverly notifications enabled',
            body: 'This device can receive operational updates.',
            metadata: { path: '/notifications', portal },
            read: false,
            created_at: now,
        }]);
        const delivery = await sendWebPush('staff', req.actor!.userId, {
            title: 'Beverly notifications enabled',
            body: 'This device can receive operational updates.',
            url: portal === 'admin' ? './notifications' : './',
            tag: `beverly-${portal}-push-test`,
        }, portal);
        if (!delivery.sent) {
            return reply.code(409).send({ error: 'push_subscription_missing', message: 'No active subscription exists for this device.' });
        }
        return { ok: true, delivery };
    });

    fastify.post('/logout', async (req) => {
        await revokePortalSession(req.portalSessionKey).catch((err) => {
            req.log.warn({ err }, 'failed to revoke portal session during logout');
        });
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
        if (!isCorporateStaffEmail(body.email)) {
            return reply.code(400).send({
                error: 'invalid_staff_email_domain',
                message: 'Staff accounts must use an approved corporate email domain (@acoblighting.com or @org.acoblighting.com).',
            });
        }
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
            const source = await listStationDirectory({ force });
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
        const stations = await listStationDirectory({ force: true });
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
            stationId: z.string().optional(),
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
    fastify.patch('/vendors/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            legalName: z.string().trim().min(2).max(160),
            tradingName: z.string().trim().max(160).nullable(),
            contactEmail: z.string().trim().email().max(254),
            contactPhone: z.string().trim().min(7).max(32),
            cacNumber: z.string().trim().max(80).nullable(),
            tin: z.string().trim().max(80).nullable(),
            businessType: z.string().trim().max(100).nullable(),
            operatingAddress: z.string().trim().max(500).nullable(),
        });
        const parsed = schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({ error: 'validation_error', message: parsed.error.message });
        }

        const { data: before, error: readError } = await adminClient
            .from('vendor_organizations')
            .select('id, legal_name, trading_name, contact_email, contact_phone, cac_number, tin, business_type, operating_address, station_id')
            .eq('id', id)
            .maybeSingle();
        if (readError) throw readError;
        if (!before) return reply.code(404).send({ error: 'not_found', message: 'Vendor not found.' });
        const assignedStations = staffStations(req);
        if (assignedStations && !assignedStations.includes(String((before as any).station_id ?? '').toUpperCase())) {
            return reply.code(403).send({ error: 'station_scope_forbidden', message: 'Vendor is outside your station scope.' });
        }

        const body = parsed.data;
        const updates = {
            legal_name: body.legalName,
            trading_name: body.tradingName || null,
            contact_email: body.contactEmail.toLowerCase(),
            contact_phone: body.contactPhone,
            cac_number: body.cacNumber || null,
            tin: body.tin || null,
            business_type: body.businessType || null,
            operating_address: body.operatingAddress || null,
            updated_at: new Date().toISOString(),
        };
        const { data: vendor, error } = await adminClient
            .from('vendor_organizations')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();
        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });

        await logAction({
            ...auditFromRequest(req),
            action: 'vendor.details_updated',
            targetType: 'vendor_organization',
            targetId: id,
            before,
            after: updates,
        });
        return { ok: true, vendor };
    });

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
        const assignedStations = staffStations(req);
        const previous = (vendor as any).station_id ?? null;
        if (assignedStations && !assignedStations.includes(String(previous ?? '').toUpperCase())) {
            return reply.code(403).send({ error: 'station_scope_forbidden', message: 'Vendor is outside your station scope.' });
        }
        if (assignedStations && (!stationId || !assignedStations.includes(stationId))) {
            return reply.code(403).send({ error: 'station_scope_forbidden', message: 'Station is outside your assigned scope.' });
        }

        // Reject clearly unknown stations to prevent assigning vendors to phantom sites.
        // If the upstream station directory is unavailable (throws or returns empty),
        // we allow the assignment — an offline token engine must not block admin operations.
        if (stationId) {
            try {
                const { listStationDirectory: listKnownStations } = await import('../services/token-engine.js');
                const known = await listKnownStations();
                if (known.length > 0) {
                    const match = known.some((station) =>
                        String(station.stationId ?? '').toUpperCase() === stationId);
                    if (!match) {
                        return reply.code(400).send({ error: 'unknown_station', message: `Station ${stationId} does not exist.` });
                    }
                }
                // known.length === 0 means upstream is offline — allow assignment and log
            } catch (stationErr: any) {
                req.log.warn({ err: stationErr, stationId }, 'Station directory unavailable; skipping station validation for vendor assignment');
            }
        }

        const { error } = await adminClient
            .from('vendor_organizations')
            .update({ station_id: stationId, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) return reply.code(400).send({ error: 'update_failed', message: error.message });

        await logAction({
            ...auditFromRequest(req),
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
    fastify.get('/funding/pending', async (req) => {
        const list = await listPendingFunding(200);
        const assignedStations = staffStations(req);
        if (!assignedStations) return { funding: list };
        const { vendors } = await stationOwnerIds(assignedStations);
        return { funding: list.filter((row) => vendors.has(row.vendor_organization_id)) };
    });

    await fastify.register(adminPaymentRecoveryRoutes);

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
        const { data: walletsRaw } = await adminClient.from('wallets').select('id, owner_type, owner_id, status');
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
    fastify.get('/customers', async (req, reply) => {
        const { status, kycTier, q, limit, cursor } = req.query as Record<string, string | undefined>;
        const pageSize = Math.min(Number(limit ?? 100), 500);
        const assignedStations = staffStations(req);
        if (!requireStationScope(reply, assignedStations)) return reply;
        const { data: walletRows, error: walletErr } = await adminClient
            .from('wallets')
            .select('id, owner_id, status')
            .eq('owner_type', 'customer');
        if (walletErr) return { customers: [], error: walletErr.message };
        const walletByOwner = new Map((walletRows ?? []).map((w: any) => [w.owner_id, w]));
        let walletOwnerIds = Array.from(walletByOwner.keys()).filter(Boolean);
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
    fastify.get('/customers/summary', async (req, reply) => {
        const assignedStations = staffStations(req);
        if (!requireStationScope(reply, assignedStations)) return reply;
        const { data: wallets } = await adminClient.from('wallets').select('id, owner_id').eq('owner_type', 'customer');
        let walletOwnerIds = Array.from(new Set((wallets ?? []).map((w: any) => w.owner_id).filter(Boolean)));
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

    // ── Customer meter link review & search routes ── extracted to admin-meter-approvals.ts
    await fastify.register(adminMeterApprovalsRoutes);

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
        const [todayOrdersRes, last24h, failed24hRes, refunded, succeededFunding] = await Promise.all([
            scope(adminClient.from('purchase_orders').select('id, amount_minor, units_kwh, status, actor_type').gte('created_at', sod)),
            scope(adminClient.from('purchase_orders').select('id, amount_minor', { count: 'exact' }).gte('created_at', dayAgo)),
            scope(adminClient.from('purchase_orders').select('id, actor_type').gte('created_at', dayAgo).eq('status', 'failed')),
            scope(adminClient.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'refunded')),
            adminClient.from('payment_transactions').select('id', { count: 'exact', head: true })
                .eq('purpose', 'wallet_funding')
                .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES)),
        ]);

        const sumMinor = (arr: any[] | null | undefined) =>
            (arr ?? []).reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

        const todayRows = (todayOrdersRes.data ?? []) as any[];
        const deliveredToday = todayRows.filter((r) => r.status === 'delivered');
        const todayDeliveredKwh = deliveredToday.reduce((sum, r) => sum + Number(r.units_kwh ?? 0), 0);
        const todayDeliveredValueMinor = deliveredToday.reduce((sum, r) => sum + Number(r.amount_minor ?? 0), 0);
        const todayDeliveredCount = deliveredToday.length;

        const isVendorActor = (actorType?: string) => actorType === 'vendor' || actorType === 'vendor_staff';
        const vendorDelivered = deliveredToday.filter((r) => isVendorActor(r.actor_type));
        const customerDelivered = deliveredToday.filter((r) => !isVendorActor(r.actor_type));

        const failedRows = (failed24hRes.data ?? []) as any[];
        const vendorFailedCount = failedRows.filter((r) => isVendorActor(r.actor_type)).length;
        const customerFailedCount = failedRows.filter((r) => !isVendorActor(r.actor_type)).length;

        return {
            todayCount:               todayRows.length,
            todayValueMinor:          sumMinor(todayRows),
            todayDeliveredCount,
            todayDeliveredValueMinor,
            todayDeliveredKwh,
            last24hCount:             last24h.count ?? 0,
            last24hValueMinor:        sumMinor(last24h.data),
            failed24hCount:           failedRows.length,
            refundedCount:            refunded.count ?? 0,
            succeededFundingCount:    succeededFunding.count ?? 0,
            vendorStats: {
                successCount:      vendorDelivered.length,
                successValueMinor: sumMinor(vendorDelivered),
                failedCount:       vendorFailedCount,
            },
            customerStats: {
                successCount:      customerDelivered.length,
                successValueMinor: sumMinor(customerDelivered),
                failedCount:       customerFailedCount,
            },
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

    // Resend a remote-send order that is stuck in delivery_pending_review.
    fastify.post('/purchases/:id/resend-remote', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            const result = await resendRemoteSendOrder(id, req.actor!.userId);
            return { ok: true, taskId: result.taskId };
        } catch (e: any) {
            const status = e.code === 'not_found' ? 404 : e.code === 'invalid_state' ? 409 : e.code === 'no_token' ? 422 : 400;
            return reply.code(status).send({ error: e.code ?? 'resend_failed', message: e.message });
        }
    });

    // Manually release a stuck hold_active order and restore wallet funds.
    fastify.post('/purchases/:id/release-hold', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: po, error } = await adminClient
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error || !po) {
            return reply.code(404).send({ error: 'not_found', message: 'Purchase order not found.' });
        }
        if (!['created', 'hold_active'].includes(po.status)) {
            return reply.code(409).send({ error: 'invalid_state', message: `Order status '${po.status}' cannot be released.` });
        }
        if (!po.hold_id) {
            return reply.code(400).send({ error: 'no_hold', message: 'Purchase order has no associated hold ID.' });
        }

        try {
            await releaseHold(po.hold_id);
            await adminClient
                .from('purchase_orders')
                .update({
                    status: 'reversed',
                    failure_reason: 'manually_released_by_staff',
                })
                .eq('id', id);

            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                action: 'vending.hold.manual_release',
                targetType: 'purchase_order',
                targetId: id,
                metadata: { holdId: po.hold_id },
            });

            return { ok: true, message: 'Hold released successfully and wallet funds restored.' };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'release_failed', message: e.message });
        }
    });

    // Retry vending for an order stuck in hold_active or dispatching.
    fastify.post('/purchases/:id/retry-vend', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: po, error } = await adminClient
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error || !po) {
            return reply.code(404).send({ error: 'not_found', message: 'Purchase order not found.' });
        }
        if (!['hold_active', 'dispatching'].includes(po.status)) {
            return reply.code(409).send({ error: 'invalid_state', message: `Order status '${po.status}' cannot be retried.` });
        }

        try {
            let token = po.token;
            if (!token) {
                const meter = await lookupMeter(po.meter_id);
                const tokenRes = await generateCreditToken({
                    meterId: meter.meterId,
                    customerId: meter.customerId,
                    customerName: meter.customerName,
                    stationId: meter.stationId,
                    amountMinor: po.energy_amount_minor ?? po.amount_minor,
                    units: po.units_kwh ?? 0,
                    tariffId: meter.tariffId,
                    isThreePhase: meter.isThreePhase,
                    sgc: meter.sgc,
                    oemId: meter.oemId,
                    reference: po.id,
                });
                token = tokenRes.token;
            }

            if (po.hold_id) {
                await captureHold({
                    holdId: po.hold_id,
                    entryType: 'purchase_debit',
                    referenceType: 'purchase_order',
                    referenceId: po.id,
                    idempotencyKey: `purchase:capture:${po.id}:retry`,
                    memo: `Vending Retry · ${po.meter_id}`,
                    createdBy: req.actor!.userId,
                }).catch(() => undefined);
            }

            await adminClient.from('purchase_orders').update({
                token,
                status: 'delivered',
                delivery_state: po.delivery_state || 'token_generated',
                failure_reason: null,
            }).eq('id', id);

            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                action: 'vending.retry.success',
                targetType: 'purchase_order',
                targetId: id,
                metadata: { token },
            });

            return { ok: true, token, message: 'Token delivery completed and purchase order updated.' };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'retry_failed', message: e.message });
        }
    });


    // ── meter purchase orders ──
    fastify.get('/meter-pricing', async () => {
        return getMeterPrices();
    });

    fastify.put('/meter-pricing', async (req, reply) => {
        const body = z.object({
            residential_minor: z.number().int().positive().optional(),
            commercial_minor: z.number().int().positive().optional(),
        }).parse(req.body ?? {});
        try {
            const updated = await updateMeterPrices(body, req.actor?.userId);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                actorRole: req.actor!.role,
                action: 'meter_pricing.updated',
                targetType: 'system_settings',
                targetId: 'meter_pricing',
                metadata: body,
            });
            return updated;
        } catch (error: any) {
            return reply.code(error?.status ?? 400).send({
                error: error?.code ?? 'update_pricing_failed',
                message: error?.message ?? 'Could not update meter prices.',
            });
        }
    });

    fastify.post('/meter-orders', async (req, reply) => {
        const body = z.object({
            customer_id: z.string().uuid(),
            meter_type: z.enum(['single_phase', 'three_phase']),
            property_category: z.enum(['residential', 'commercial']).optional(),
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
                propertyCategory: body.property_category,
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
                    property_category: body.property_category ?? 'residential',
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

    fastify.get('/meter-orders/stats', async (req, reply) => {
        const assignedStations = staffStations(req);
        if (!requireStationScope(reply, assignedStations)) return reply;
        let query = adminClient
            .from('meter_purchase_orders')
            .select('status, amount_minor, updated_at, created_at, source_channel')
            .limit(10000);
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
            rejected: count('rejected'),
            by_source: bySource,
        };
    });

    fastify.get('/meter-orders', async (req, reply) => {
        const { status, q, limit, cursor } = req.query as { status?: string; q?: string; limit?: string; cursor?: string };
        const pageSize = Math.min(Number(limit ?? 100), 200);
        const assignedStations = staffStations(req);
        if (!requireStationScope(reply, assignedStations)) return reply;
        let query = adminClient
            .from('meter_purchase_orders')
            .select('*, customers(full_name, email, phone), vendor_organizations(legal_name, trading_name)')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (status) query = query.eq('status', status);
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

    fastify.post('/meter-orders/:id/reject', async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(req.body ?? {});
        const assignedStations = staffStations(req);
        if (!requireStationScope(reply, assignedStations)) return reply;
        let scopeQuery = adminClient
            .from('meter_purchase_orders')
            .select('id')
            .eq('id', id);
        scopeQuery = scopeStations(scopeQuery, assignedStations);
        const { data: scopedOrder, error: scopeError } = await scopeQuery.maybeSingle();
        if (scopeError) {
            return reply.code(503).send({ error: 'meter_order_lookup_failed', message: 'Could not verify this meter order.' });
        }
        if (!scopedOrder) return reply.code(404).send({ error: 'not_found' });
        try {
            const order = await rejectMeterOrder({ orderId: id, rejectedByUserId: req.actor!.userId, reason });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                actorRole: req.actor!.role,
                action: 'meter_order.rejected',
                targetType: 'meter_order',
                targetId: id,
                metadata: {
                    reason,
                    refund_destination: order.rejection_refund_destination ?? 'none',
                    refund_entry_id: order.rejection_refund_entry_id ?? null,
                },
            });
            const { notifyMeterOrderUpdate } = await import('../services/notifications.js');
            await notifyMeterOrderUpdate(order.customer_id, {
                orderId: id,
                status: 'rejected',
                reason,
                refundDestination: order.rejection_refund_destination ?? 'none',
            }).catch(() => undefined);
            if (order.vendor_organization_id) {
                await adminClient.from('notifications').insert({
                    customer_id: null,
                    recipient_type: 'vendor',
                    recipient_id: order.vendor_organization_id,
                    vendor_organization_id: order.vendor_organization_id,
                    type: 'meter_order_update',
                    title: 'Meter order rejected',
                    body: `The meter order for ${order.customer_name_snapshot ?? 'your customer'} was rejected. ${reason}`,
                    metadata: { orderId: id, status: 'rejected', reason, refundDestination: order.rejection_refund_destination ?? 'none', path: '/meter-orders' },
                    read: false,
                }).then(() => undefined, () => undefined);
            }
            return order;
        } catch (error: any) {
            return reply.code(error?.status ?? 422).send({ error: error?.code ?? 'meter_order_rejection_failed', message: error?.message ?? 'Could not reject meter order.' });
        }
    });

    fastify.patch('/meter-orders/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['paid', 'assigned', 'dispatched', 'installed', 'cancelled', 'rejected']).optional(),
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
        if (env.NODE_ENV !== 'test' && req.actor?.mfaEnrolled && !req.actor?.mfaVerified) {
            return reply.code(403).send({
                error: 'mfa_required',
                message: 'Multi-factor authentication (MFA) verification is required for refund approvals.',
            });
        }
        const id = (req.params as { id: string }).id;
        const { amount_minor } = z.object({
            amount_minor: z.number().int().positive().optional(),
        }).parse(req.body ?? {});
        try {
            await approveRefund(id, req.actor!.userId, amount_minor);
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
            await runDailyReconciliation(undefined, { force: true });
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

    await fastify.register(adminVendorAnalyticsRoutes);
    await fastify.register(adminVendorTransferRoutes);
    await fastify.register(adminDevRoutes);
    await fastify.register(adminReportsRoutes);
    await fastify.register(adminConsumptionRoutes);

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
