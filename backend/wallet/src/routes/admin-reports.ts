/**
 * Admin report routes — /api/v1/admin/reports/*
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { PAYMENT_SUCCEEDED_STATUSES } from '../services/payment-status.js';

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

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

function staffStations(req: FastifyRequest): string[] | null {
    if (req.actor?.role === 'super-admin') return null;
    return [...new Set((req.actor?.stationIds ?? [req.actor?.stationId])
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean))];
}

type ReportAudience = 'all' | 'vendor' | 'customer';
type ReportFamily = 'financial' | 'transactions' | 'vendors-wallets' | 'audit' | 'disputes' | 'general';

const reportAudienceSchema = z.enum(['all', 'vendor', 'customer']);
const reportFamilySchema = z.enum(['financial', 'transactions', 'vendors-wallets', 'audit', 'disputes', 'general']);

async function gatherReportData(sinceIso: string, untilIso: string, audience: ReportAudience, family: ReportFamily, stationIds?: string[]) {
    const inRange = (q: any) => q.gte('created_at', sinceIso).lte('created_at', untilIso);
    const readRows = async (source: string, query: PromiseLike<{ data: any[] | null; error: { message: string } | null }>) => {
        const { data, error } = await query;
        if (error) throw new Error(`${source} report query failed: ${error.message}`);
        return data ?? [];
    };

    let purchasesQuery = inRange(adminClient.from('purchase_orders').select('amount_minor, energy_amount_minor, vat_amount_minor, status, created_at, actor_type, station_id'));
    if (audience !== 'all') purchasesQuery = purchasesQuery.eq('actor_type', audience);
    if (stationIds) purchasesQuery.in('station_id', stationIds);

    let fundingQuery = inRange(adminClient.from('payment_transactions').select('amount_minor, created_at, actor_type').eq('purpose', 'wallet_funding').in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES)));
    if (audience !== 'all') fundingQuery = fundingQuery.eq('actor_type', audience);

    let refundsQuery = inRange(adminClient.from('refund_requests').select('amount_minor, status, created_at, wallets!inner(owner_type)'));
    if (audience !== 'all') refundsQuery = refundsQuery.eq('wallets.owner_type', audience);

    let disputesQuery = inRange(adminClient.from('disputes').select('status, created_at, raised_by_actor_type'));
    if (audience !== 'all') disputesQuery = disputesQuery.eq('raised_by_actor_type', audience);

    const [purchases, funding, fundingRequests, refunds, disputes, newCustomers, newVendors, settlements, auditLogs, securityEvents] = await Promise.all([
        readRows('Purchases', purchasesQuery.limit(50_000)),
        readRows('Funding', fundingQuery.limit(50_000)),
        family !== 'vendors-wallets' || audience === 'customer' ? Promise.resolve([]) : readRows('Funding requests', inRange(adminClient.from('funding_requests').select('amount_minor, channel, status, created_at')).limit(50_000)),
        readRows('Refunds', refundsQuery.limit(50_000)),
        readRows('Disputes', disputesQuery.limit(50_000)),
        audience === 'vendor' ? Promise.resolve([]) : readRows('Customers', inRange(adminClient.from('customers').select('created_at')).limit(50_000)),
        audience === 'customer' ? Promise.resolve([]) : readRows('Vendors', inRange(adminClient.from('vendor_organizations').select('created_at')).limit(50_000)),
        audience === 'customer' ? Promise.resolve([]) : readRows('Settlements', inRange(adminClient.from('settlement_batches').select('gross_amount_minor, fee_minor, net_amount_minor, status, created_at')).limit(50_000)),
        family === 'audit' ? readRows('Audit logs', inRange(adminClient.from('wallet_audit_log').select('action, actor_type, created_at')).limit(50_000)) : Promise.resolve([]),
        family === 'audit' ? readRows('Security events', inRange(adminClient.from('wallet_security_events').select('event_type, severity, created_at')).limit(50_000)) : Promise.resolve([]),
    ]);
    return { purchases, funding, fundingRequests, refunds, disputes, newCustomers, newVendors, settlements, auditLogs, securityEvents } as Record<string, any[]>;
}

function buildReport(sinceIso: string, untilIso: string, days: number, audience: ReportAudience, d: Record<string, any[]>) {
    const num = (v: unknown) => Number(v ?? 0);
    const delivered = d.purchases.filter((p) => p.status === 'delivered');
    const failed = d.purchases.filter((p) => p.status === 'failed');
    const revenueMinor = delivered.reduce((s, p) => s + num(p.amount_minor), 0);
    const energyRevenueMinor = delivered.reduce((s, p) => s + num(p.energy_amount_minor ?? p.amount_minor), 0);
    const vatMinor = delivered.reduce((s, p) => s + num(p.vat_amount_minor), 0);
    const feeMinor = 0;
    const fundingApprovedMinor = d.funding.reduce((s, p) => s + num(p.amount_minor), 0);
    const approvedRefunds = d.refunds.filter((r) => r.status === 'approved');
    const refundApprovedMinor = approvedRefunds.reduce((s, r) => s + num(r.amount_minor), 0);
    const settlementNetMinor = d.settlements.reduce((s, b) => s + num(b.net_amount_minor), 0);
    const settlementGrossMinor = d.settlements.reduce((s, b) => s + num(b.gross_amount_minor), 0);
    const processed = delivered.length + failed.length;

    // Daily buckets (zero-filled across the range)
    const buckets = new Map<string, { date: string; revenueMinor: number; energyRevenueMinor: number; vatMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; newVendors: number; refundMinor: number; auditLogsCount: number; securityEventsCount: number }>();
    const startMs = new Date(sinceIso).getTime();
    for (let i = 0; i < days; i++) {
        const key = dayKey(new Date(startMs + i * 86400_000).toISOString());
        buckets.set(key, { date: key, revenueMinor: 0, energyRevenueMinor: 0, vatMinor: 0, purchaseCount: 0, fundingMinor: 0, newCustomers: 0, newVendors: 0, refundMinor: 0, auditLogsCount: 0, securityEventsCount: 0 });
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
    for (const v of d.newVendors) { const b = touch(v.created_at); if (b) b.newVendors += 1; }
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
        audience,
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
            newVendors: d.newVendors.length,
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
            vendorOrganizations: d.newVendors.length,
            settlements: d.settlements.length,
            auditLogs: (d.auditLogs || []).length,
            securityEvents: (d.securityEvents || []).length,
        },
    };
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/reports/overview', async (req, reply) => {
        const audienceResult = reportAudienceSchema.safeParse((req.query as { audience?: string }).audience ?? 'all');
        if (!audienceResult.success) return reply.code(400).send({ error: 'invalid_report_audience', message: 'Audience must be all, vendor, or customer.' });
        const familyResult = reportFamilySchema.safeParse((req.query as { family?: string }).family ?? 'financial');
        if (!familyResult.success) return reply.code(400).send({ error: 'invalid_report_family', message: 'The requested report type is invalid.' });
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        try {
            const data = await gatherReportData(sinceIso, untilIso, audienceResult.data, familyResult.data, staffStations(req) ?? undefined);
            return buildReport(sinceIso, untilIso, days, audienceResult.data, data);
        } catch (error) {
            req.log.error({ err: error, audience: audienceResult.data }, 'report overview query failed');
            return reply.code(502).send({ error: 'reports_unavailable', message: 'Reports could not be loaded. Please retry.' });
        }
    });

    fastify.get('/reports/export.csv', async (req, reply) => {
        const audienceResult = reportAudienceSchema.safeParse((req.query as { audience?: string }).audience ?? 'all');
        if (!audienceResult.success) return reply.code(400).send({ error: 'invalid_report_audience', message: 'Audience must be all, vendor, or customer.' });
        const familyResult = reportFamilySchema.safeParse((req.query as { family?: string }).family ?? 'financial');
        if (!familyResult.success) return reply.code(400).send({ error: 'invalid_report_family', message: 'The requested report type is invalid.' });
        const { sinceIso, untilIso, days } = resolveRange(req.query as Record<string, string | undefined>);
        let report: ReturnType<typeof buildReport>;
        try {
            const data = await gatherReportData(sinceIso, untilIso, audienceResult.data, familyResult.data, staffStations(req) ?? undefined);
            report = buildReport(sinceIso, untilIso, days, audienceResult.data, data);
        } catch (error) {
            req.log.error({ err: error, audience: audienceResult.data }, 'report export query failed');
            return reply.code(502).send({ error: 'reports_unavailable', message: 'Report export could not be prepared. Please retry.' });
        }
        const header = ['date', 'audience', 'revenue_minor', 'energy_revenue_minor', 'vat_minor', 'purchase_count', 'funding_minor', 'refund_minor', 'new_customers', 'new_vendors'];
        const csv = [
            header.join(','),
            ...report.series.daily.map((r) => [r.date, audienceResult.data, r.revenueMinor, r.energyRevenueMinor, r.vatMinor, r.purchaseCount, r.fundingMinor, r.refundMinor, r.newCustomers, r.newVendors].map(csvEscape).join(',')),
        ].join('\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="report-${audienceResult.data}-${sinceIso.slice(0, 10)}_${untilIso.slice(0, 10)}.csv"`);
        return csv;
    });
};

export default route;
