/**
 * Admin report routes — /api/v1/admin/reports/*
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { PAYMENT_SUCCEEDED_STATUSES } from '../services/payment-status.js';

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const raw = typeof v === 'string' ? v : JSON.stringify(v);
    const s = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function resolveRange(query: Record<string, string | undefined>) {
    const validDay = /^\d{4}-\d{2}-\d{2}$/;
    if ((query.since && !validDay.test(query.since)) || (query.until && !validDay.test(query.until))) {
        throw new Error('Dates must use YYYY-MM-DD.');
    }
    const now = new Date();
    const until = query.until ? new Date(query.until) : now;
    const since = query.since
        ? new Date(query.since)
        : new Date(until.getTime() - 29 * 86400_000);
    if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime())) throw new Error('The reporting dates are invalid.');
    if (since.getTime() > until.getTime()) throw new Error('Start date must precede end date.');
    const sinceIso = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())).toISOString();
    const untilIso = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate(), 23, 59, 59, 999)).toISOString();
    const days = Math.max(1, Math.floor((new Date(untilIso).getTime() - new Date(sinceIso).getTime()) / 86400_000) + 1);
    if (days > 3660) throw new Error('Reporting periods cannot exceed ten years.');
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
type ReportGrouping = 'site' | 'vendor' | 'customer';
type ReportTransactionStatus = 'all' | 'successful' | 'failed';
type ReportBreakdownRow = {
    siteId: string; groupType: string; entityId: string; entityName: string;
    vendorName: string; vendorBusinessName: string; customerName: string;
    purchaseCount: number; deliveredCount: number; failedCount: number; customerCount: number;
    directPurchaseCount: number; vendorPurchaseCount: number; revenueMinor: number;
    energyRevenueMinor: number; vatMinor: number; unitsKwh: number; averagePurchaseMinor: number;
    successRate: number; firstPurchaseAt: string | null; lastPurchaseAt: string | null;
    revenueMinorExact: string; energyRevenueMinorExact: string; vatMinorExact: string;
    averagePurchaseMinorExact: string; unitsKwhExact: string;
};

const reportAudienceSchema = z.enum(['all', 'vendor', 'customer']);
const reportFamilySchema = z.enum(['financial', 'transactions', 'vendors-wallets', 'audit', 'disputes', 'general']);
const reportGroupingSchema = z.enum(['site', 'vendor', 'customer']);
const reportTransactionStatusSchema = z.enum(['all', 'successful', 'failed']);
const REPORT_PAGE_SIZE = 1000;

class ReportQueryError extends Error {
    constructor(message: string, readonly code?: string) {
        super(message);
    }
}

async function readAllRows(source: string, query: any): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; ; from += REPORT_PAGE_SIZE) {
        const { data, error } = await query.range(from, from + REPORT_PAGE_SIZE - 1);
        if (error) throw new ReportQueryError(`${source} report query failed: ${error.message}`, error.code);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < REPORT_PAGE_SIZE) return rows;
    }
}

function minorToMajorString(value: string): string {
    const normalized = /^-?\d+$/.test(value) ? value : '0';
    const negative = normalized.startsWith('-');
    const digits = (negative ? normalized.slice(1) : normalized).padStart(3, '0');
    const major = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
    return negative ? `-${major}` : major;
}

function reportScope(req: FastifyRequest, query: { site_id?: string }):
    | { siteId: string | null; stationIds: string[] | null; error?: never }
    | { error: { status: 403; code: string; message: string }; siteId?: never; stationIds?: never } {
    const assigned = staffStations(req);
    const siteId = String(query.site_id ?? '').trim().toUpperCase() || null;
    if (assigned && !assigned.length) {
        return { error: { status: 403, code: 'station_required', message: 'Your staff account needs a station assignment.' } } as const;
    }
    if (siteId && assigned && !assigned.includes(siteId)) {
        return { error: { status: 403, code: 'site_forbidden', message: 'That site is outside your assigned stations.' } } as const;
    }
    return { siteId, stationIds: assigned } as const;
}

async function readPurchaseBreakdown(
    sinceIso: string,
    untilIso: string,
    audience: ReportAudience,
    groupBy: ReportGrouping,
    siteId: string | null,
    stationIds: string[] | null,
    transactionStatus: ReportTransactionStatus = 'all',
    entityId: string | null = null,
): Promise<ReportBreakdownRow[]> {
    let sourceRows: any[];
    try {
        sourceRows = await readAllRows('Purchase breakdown', adminClient.rpc('wallet_report_purchase_breakdown', {
            p_since: sinceIso,
            p_until: untilIso,
            p_group_by: groupBy,
            p_audience: audience,
            p_site_id: siteId,
            p_station_ids: stationIds,
            p_transaction_status: transactionStatus,
            p_entity_id: entityId,
        }));
    } catch (error) {
        const missingFunction = error instanceof ReportQueryError
            && (error.code === 'PGRST202' || /could not find the function/i.test(error.message));
        if (!missingFunction) throw error;
        sourceRows = await readPurchaseBreakdownFallback(
            sinceIso, untilIso, audience, groupBy, siteId, stationIds, transactionStatus, entityId,
        );
    }
    const rows: ReportBreakdownRow[] = sourceRows.map((row: any): ReportBreakdownRow => ({
        siteId: String(row.site_id ?? 'UNKNOWN'),
        groupType: String(row.group_type ?? groupBy),
        entityId: String(row.entity_id ?? 'unknown'),
        entityName: String(row.entity_name ?? row.entity_id ?? 'Unknown'),
        vendorName: '',
        vendorBusinessName: '',
        customerName: groupBy === 'customer' ? String(row.entity_name ?? row.entity_id ?? 'Unknown') : '',
        purchaseCount: Number(row.purchase_count ?? 0),
        deliveredCount: Number(row.delivered_count ?? 0),
        failedCount: Number(row.failed_count ?? 0),
        customerCount: Number(row.customer_count ?? 0),
        directPurchaseCount: Number(row.direct_purchase_count ?? 0),
        vendorPurchaseCount: Number(row.vendor_purchase_count ?? 0),
        revenueMinor: Number(row.revenue_minor ?? 0),
        energyRevenueMinor: Number(row.energy_revenue_minor ?? 0),
        vatMinor: Number(row.vat_minor ?? 0),
        unitsKwh: Number(row.units_kwh ?? 0),
        averagePurchaseMinor: Number(row.average_purchase_minor ?? 0),
        successRate: Number(row.success_rate ?? 0),
        firstPurchaseAt: row.first_purchase_at ?? null,
        lastPurchaseAt: row.last_purchase_at ?? null,
        revenueMinorExact: String(row.revenue_minor ?? '0'),
        energyRevenueMinorExact: String(row.energy_revenue_minor ?? '0'),
        vatMinorExact: String(row.vat_minor ?? '0'),
        averagePurchaseMinorExact: String(row.average_purchase_minor ?? '0'),
        unitsKwhExact: String(row.units_kwh ?? '0'),
    }));
    if (groupBy === 'vendor' && rows.length) {
        const ids = [...new Set(rows.map((row) => row.entityId).filter(isUuid))];
        if (ids.length) {
            const { data: vendors } = await adminClient.from('vendor_organizations')
                .select('id, legal_name, trading_name')
                .in('id', ids);
            const identities = new Map((vendors ?? []).map((vendor: any) => [String(vendor.id), {
                name: String(vendor.legal_name || vendor.trading_name || vendor.id),
                business: String(vendor.trading_name || vendor.legal_name || vendor.id),
            }]));
            for (const row of rows) {
                const identity = identities.get(row.entityId);
                if (!identity) continue;
                row.vendorName = identity.name;
                row.vendorBusinessName = identity.business;
                row.entityName = identity.name === identity.business
                    ? identity.name : `${identity.name} — ${identity.business}`;
            }
        }
    }
    return rows.filter((row) => row.purchaseCount > 0);
}

async function readPurchaseBreakdownFallback(
    sinceIso: string,
    untilIso: string,
    audience: ReportAudience,
    groupBy: ReportGrouping,
    siteId: string | null,
    stationIds: string[] | null,
    transactionStatus: ReportTransactionStatus,
    entityId: string | null,
): Promise<any[]> {
    let query = adminClient.from('purchase_orders')
        .select('station_id, actor_type, actor_id, customer_id, customer_name, status, amount_minor, energy_amount_minor, vat_amount_minor, units_kwh, created_at')
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso);
    if (audience !== 'all') query = query.eq('actor_type', audience);
    if (siteId) query = query.ilike('station_id', siteId);
    else if (stationIds) query = query.in('station_id', stationIds);
    if (groupBy === 'vendor') query = query.eq('actor_type', 'vendor');
    if (transactionStatus === 'successful') query = query.eq('status', 'delivered');
    if (transactionStatus === 'failed') query = query.eq('status', 'failed');
    if (entityId && groupBy === 'vendor') query = query.eq('actor_id', entityId);
    if (entityId && groupBy === 'customer') query = query.or(`customer_id.eq.${entityId},and(actor_type.eq.customer,actor_id.eq.${entityId})`);
    const data = await readAllRows('Purchase breakdown fallback', query);

    const grouped = new Map<string, any>();
    for (const purchase of data) {
        const site = String(purchase.station_id || 'UNKNOWN').toUpperCase();
        const customerId = String(purchase.customer_id || (purchase.actor_type === 'customer' ? purchase.actor_id : '') || '');
        const entity = groupBy === 'vendor' ? String(purchase.actor_id || '') : groupBy === 'customer' ? customerId : site;
        if (!entity) continue;
        const key = `${site}\u0000${entity}`;
        const row = grouped.get(key) ?? {
            site_id: site, group_type: groupBy, entity_id: entity, recorded_customer_name: '',
            purchase_count: 0, delivered_count: 0, failed_count: 0,
            direct_purchase_count: 0, vendor_purchase_count: 0,
            revenue_minor: 0, energy_revenue_minor: 0, vat_minor: 0, units_kwh: 0,
            first_purchase_at: null, last_purchase_at: null, customer_ids: new Set<string>(),
        };
        row.purchase_count += 1;
        if (purchase.status === 'delivered') {
            row.delivered_count += 1;
            row.revenue_minor += Number(purchase.amount_minor ?? 0);
            row.energy_revenue_minor += Number(purchase.energy_amount_minor ?? purchase.amount_minor ?? 0);
            row.vat_minor += Number(purchase.vat_amount_minor ?? 0);
            row.units_kwh += Number(purchase.units_kwh ?? 0);
        }
        if (purchase.status === 'failed') row.failed_count += 1;
        if (purchase.actor_type === 'customer') row.direct_purchase_count += 1;
        if (purchase.actor_type === 'vendor') row.vendor_purchase_count += 1;
        if (customerId) row.customer_ids.add(customerId);
        if (!row.recorded_customer_name && purchase.customer_name) row.recorded_customer_name = purchase.customer_name;
        if (!row.first_purchase_at || purchase.created_at < row.first_purchase_at) row.first_purchase_at = purchase.created_at;
        if (!row.last_purchase_at || purchase.created_at > row.last_purchase_at) row.last_purchase_at = purchase.created_at;
        grouped.set(key, row);
    }

    const [{ data: vendorRows }, { data: customerRows }] = await Promise.all([
        groupBy === 'vendor' ? adminClient.from('vendor_organizations').select('id, trading_name, legal_name').limit(50_000) : Promise.resolve({ data: [] }),
        groupBy === 'customer' ? adminClient.from('customers').select('id, full_name').limit(50_000) : Promise.resolve({ data: [] }),
    ]);
    const vendorNames = new Map((vendorRows ?? []).map((row: any) => [String(row.id), String(row.trading_name || row.legal_name || row.id)]));
    const customerNames = new Map((customerRows ?? []).map((row: any) => [String(row.id), String(row.full_name || row.id)]));
    return [...grouped.values()].map((row) => ({
        ...row,
        entity_name: groupBy === 'vendor' ? vendorNames.get(row.entity_id) || row.entity_id
            : groupBy === 'customer' ? customerNames.get(row.entity_id) || row.recorded_customer_name || row.entity_id
                : row.site_id,
        customer_count: row.customer_ids.size,
        average_purchase_minor: row.delivered_count ? Math.round(row.revenue_minor / row.delivered_count) : 0,
        success_rate: row.delivered_count + row.failed_count
            ? Math.round((row.delivered_count * 10_000) / (row.delivered_count + row.failed_count)) / 100 : 0,
    }));
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readOwnerScope(stationIds: string[] | null) {
    if (!stationIds) return null;
    const [vendors, meters] = await Promise.all([
        readAllRows('Vendor scope', adminClient.from('vendor_organizations').select('id, station_id, operating_stations')),
        readAllRows('Customer scope', adminClient.from('customer_meters').select('customer_id').in('station_id', stationIds)),
    ]);
    const allowedSites = new Set(stationIds.map((value) => value.toUpperCase()));
    return {
        vendors: new Set(vendors.filter((row: any) => [
            row.station_id,
            ...(Array.isArray(row.operating_stations) ? row.operating_stations : []),
        ].some((value) => allowedSites.has(String(value ?? '').toUpperCase()))).map((row: any) => String(row.id))),
        customers: new Set(meters.map((row: any) => String(row.customer_id))),
    };
}

async function gatherReportData(
    sinceIso: string,
    untilIso: string,
    audience: ReportAudience,
    family: ReportFamily,
    groupBy: ReportGrouping,
    siteId: string | null,
    stationIds: string[] | null,
    transactionStatus: ReportTransactionStatus = 'all',
    entityId: string | null = null,
) {
    const inRange = (q: any) => q.gte('created_at', sinceIso).lte('created_at', untilIso);
    const effectiveStations = siteId ? [siteId.toUpperCase()] : stationIds;
    const ownerScope = await readOwnerScope(effectiveStations);
    const selectedOwnerType = entityId && groupBy !== 'site' ? groupBy : null;
    const needsPurchases = family !== 'audit';
    const needsFunding = family === 'financial' || family === 'vendors-wallets' || family === 'general';
    const needsRefunds = family === 'financial' || family === 'disputes' || family === 'general';
    const needsDisputes = family === 'disputes' || family === 'general';
    const needsLedger = family === 'vendors-wallets' || family === 'general';
    const needsSettlements = family === 'financial' || family === 'general';
    const needsReconciliation = family === 'financial' || family === 'general';
    const needsEntityPerformance = family !== 'audit' && family !== 'disputes';

    let purchasesQuery = inRange(adminClient.from('purchase_orders').select('amount_minor, energy_amount_minor, vat_amount_minor, units_kwh, status, created_at, actor_type, actor_id, customer_id, station_id'));
    if (audience !== 'all') purchasesQuery = purchasesQuery.eq('actor_type', audience);
    if (effectiveStations) purchasesQuery.in('station_id', effectiveStations);
    if (transactionStatus === 'successful') purchasesQuery = purchasesQuery.eq('status', 'delivered');
    if (transactionStatus === 'failed') purchasesQuery = purchasesQuery.eq('status', 'failed');
    if (entityId && groupBy === 'vendor') purchasesQuery = purchasesQuery.eq('actor_id', entityId);
    if (entityId && groupBy === 'customer') purchasesQuery = purchasesQuery.or(`customer_id.eq.${entityId},and(actor_type.eq.customer,actor_id.eq.${entityId})`);

    let fundingQuery = inRange(adminClient.from('payment_transactions').select('amount_minor, created_at, actor_type, actor_id').eq('purpose', 'wallet_funding').in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES)));
    if (audience !== 'all') fundingQuery = fundingQuery.eq('actor_type', audience);
    if (selectedOwnerType) fundingQuery = fundingQuery.eq('actor_type', selectedOwnerType).eq('actor_id', entityId);

    let refundsQuery = inRange(adminClient.from('refund_requests').select('amount_minor, approved_amount_minor, status, created_at, wallets!inner(owner_type, owner_id)'));
    if (audience !== 'all') refundsQuery = refundsQuery.eq('wallets.owner_type', audience);
    if (selectedOwnerType) refundsQuery = refundsQuery.eq('wallets.owner_type', selectedOwnerType).eq('wallets.owner_id', entityId);

    let disputesQuery = inRange(adminClient.from('disputes').select('status, created_at, raised_by_actor_type, customer_id, vendor_organization_id'));
    if (audience !== 'all') disputesQuery = disputesQuery.eq('raised_by_actor_type', audience);
    if (selectedOwnerType === 'vendor') disputesQuery = disputesQuery.eq('vendor_organization_id', entityId);
    if (selectedOwnerType === 'customer') disputesQuery = disputesQuery.eq('customer_id', entityId);

    let ledgerQuery = inRange(adminClient.from('wallet_ledger_entries').select('amount_minor, direction, entry_type, created_at, wallets!inner(owner_type, owner_id)'));
    if (audience !== 'all') ledgerQuery = ledgerQuery.eq('wallets.owner_type', audience);
    if (selectedOwnerType) ledgerQuery = ledgerQuery.eq('wallets.owner_type', selectedOwnerType).eq('wallets.owner_id', entityId);

    let holdsQuery = adminClient.from('wallet_holds').select('amount_minor, status, wallets!inner(owner_type, owner_id)').eq('status', 'active');
    if (audience !== 'all') holdsQuery = holdsQuery.eq('wallets.owner_type', audience);
    if (selectedOwnerType) holdsQuery = holdsQuery.eq('wallets.owner_type', selectedOwnerType).eq('wallets.owner_id', entityId);

    let fundingRequestsQuery = inRange(adminClient.from('funding_requests').select('amount_minor, channel, status, created_at, vendor_organization_id'));
    if (selectedOwnerType === 'vendor') fundingRequestsQuery = fundingRequestsQuery.eq('vendor_organization_id', entityId);

    let customersQuery = inRange(adminClient.from('customers').select('id, created_at'));
    if (selectedOwnerType === 'customer') customersQuery = customersQuery.eq('id', entityId);

    let vendorsQuery = inRange(adminClient.from('vendor_organizations').select('id, created_at'));
    if (selectedOwnerType === 'vendor') vendorsQuery = vendorsQuery.eq('id', entityId);

    let settlementsQuery = inRange(adminClient.from('settlement_batches').select('gross_amount_minor, fee_minor, net_amount_minor, status, created_at, vendor_organization_id'));
    if (selectedOwnerType === 'vendor') settlementsQuery = settlementsQuery.eq('vendor_organization_id', entityId);

    const reconciliationQuery = adminClient.from('reconciliation_runs')
        .select('status, total_purchases, total_amount_minor, gateway_total_minor, mismatch_minor, run_date, checked_at')
        .gte('run_date', sinceIso.slice(0, 10)).lte('run_date', untilIso.slice(0, 10));

    const [purchases, funding, fundingRequests, refunds, disputes, newCustomers, newVendors, settlements, auditLogs, securityEvents, ledgerEntries, activeHolds, reconciliationRuns, entityPerformance] = await Promise.all([
        needsPurchases ? readAllRows('Purchases', purchasesQuery) : Promise.resolve([]),
        needsFunding ? readAllRows('Funding', fundingQuery) : Promise.resolve([]),
        family !== 'vendors-wallets' || audience === 'customer' ? Promise.resolve([]) : readAllRows('Funding requests', fundingRequestsQuery),
        needsRefunds ? readAllRows('Refunds', refundsQuery) : Promise.resolve([]),
        needsDisputes ? readAllRows('Disputes', disputesQuery) : Promise.resolve([]),
        family !== 'general' || audience === 'vendor' ? Promise.resolve([]) : readAllRows('Customers', customersQuery),
        (family !== 'general' && family !== 'vendors-wallets') || audience === 'customer' ? Promise.resolve([]) : readAllRows('Vendors', vendorsQuery),
        !needsSettlements || audience === 'customer' ? Promise.resolve([]) : readAllRows('Settlements', settlementsQuery),
        family === 'audit' && !ownerScope ? readAllRows('Audit logs', inRange(adminClient.from('wallet_audit_log').select('action, actor_type, created_at'))) : Promise.resolve([]),
        family === 'audit' && !ownerScope ? readAllRows('Security events', inRange(adminClient.from('wallet_security_events').select('event_type, severity, created_at'))) : Promise.resolve([]),
        needsLedger ? readAllRows('Ledger entries', ledgerQuery) : Promise.resolve([]),
        needsLedger ? readAllRows('Active holds', holdsQuery) : Promise.resolve([]),
        !needsReconciliation || ownerScope ? Promise.resolve([]) : readAllRows('Reconciliation runs', reconciliationQuery),
        needsEntityPerformance ? readPurchaseBreakdown(sinceIso, untilIso, audience, groupBy, siteId, stationIds, transactionStatus, entityId) : Promise.resolve([]),
    ]);
    const walletOwner = (row: any) => Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;
    const allowedOwner = (ownerType: string, ownerId: unknown) => !ownerScope
        || (ownerType === 'vendor' ? ownerScope.vendors : ownerScope.customers).has(String(ownerId ?? ''));
    return {
        purchases,
        funding: funding.filter((row) => allowedOwner(row.actor_type, row.actor_id)),
        fundingRequests: fundingRequests.filter((row) => !ownerScope || ownerScope.vendors.has(String(row.vendor_organization_id))),
        refunds: refunds.filter((row) => allowedOwner(walletOwner(row)?.owner_type, walletOwner(row)?.owner_id)),
        disputes: disputes.filter((row) => !ownerScope || (row.vendor_organization_id
            ? ownerScope.vendors.has(String(row.vendor_organization_id))
            : ownerScope.customers.has(String(row.customer_id)))),
        newCustomers: newCustomers.filter((row) => !ownerScope || ownerScope.customers.has(String(row.id))),
        newVendors: newVendors.filter((row) => !ownerScope || ownerScope.vendors.has(String(row.id))),
        settlements: settlements.filter((row) => !ownerScope || ownerScope.vendors.has(String(row.vendor_organization_id))),
        auditLogs, securityEvents,
        ledgerEntries: ledgerEntries.filter((row) => allowedOwner(walletOwner(row)?.owner_type, walletOwner(row)?.owner_id)),
        activeHolds: activeHolds.filter((row) => allowedOwner(walletOwner(row)?.owner_type, walletOwner(row)?.owner_id)),
        reconciliationRuns, entityPerformance,
        quality: {
            purchaseGrain: 'one purchase order',
            purchaseStationScope: effectiveStations ? 'event_station_id' : 'all_stations',
            relatedFinancialStationScope: effectiveStations ? 'current_owner_assignment' : 'all_owners',
            activeHoldsSnapshotAt: new Date().toISOString(),
            auditScope: ownerScope ? 'unavailable_for_station_scope' : 'global',
            reconciliationScope: ownerScope ? 'unavailable_for_station_scope' : 'global',
        },
    } as unknown as Record<string, any[]>;
}

function buildReport(sinceIso: string, untilIso: string, days: number, audience: ReportAudience, d: Record<string, any[]>) {
    const num = (v: unknown) => Number(v ?? 0);
    const delivered = d.purchases.filter((p) => p.status === 'delivered');
    const failed = d.purchases.filter((p) => p.status === 'failed');
    const revenueMinor = delivered.reduce((s, p) => s + num(p.amount_minor), 0);
    const energyRevenueMinor = delivered.reduce((s, p) => s + num(p.energy_amount_minor ?? p.amount_minor), 0);
    const vatMinor = delivered.reduce((s, p) => s + num(p.vat_amount_minor), 0);
    const unitsKwh = delivered.reduce((s, p) => s + num(p.units_kwh), 0);
    const fundingApprovedMinor = d.funding.reduce((s, p) => s + num(p.amount_minor), 0);
    const approvedRefunds = d.refunds.filter((r) => r.status === 'approved');
    const refundApprovedMinor = approvedRefunds.reduce((s, r) => s + num(r.approved_amount_minor ?? r.amount_minor), 0);
    const settledBatches = d.settlements.filter((b) => b.status === 'settled');
    const settlementNetMinor = settledBatches.reduce((s, b) => s + num(b.net_amount_minor), 0);
    const settlementGrossMinor = settledBatches.reduce((s, b) => s + num(b.gross_amount_minor), 0);
    const feeMinor = settledBatches.reduce((s, b) => s + num(b.fee_minor), 0);
    const processed = delivered.length + failed.length;

    const ledgerCreditMinor = (d.ledgerEntries || []).filter((e) => e.direction === 'credit').reduce((s, e) => s + num(e.amount_minor), 0);
    const ledgerDebitMinor = (d.ledgerEntries || []).filter((e) => e.direction === 'debit').reduce((s, e) => s + num(e.amount_minor), 0);
    const ledgerNetMinor = ledgerCreditMinor - ledgerDebitMinor;
    const activeHoldsMinor = (d.activeHolds || []).reduce((s, h) => s + num(h.amount_minor), 0);
    const activeHoldsCount = (d.activeHolds || []).length;
    const mismatchedRuns = (d.reconciliationRuns || []).filter((r) => r.status === 'mismatch');
    const reconciliationMismatches = mismatchedRuns.length;
    const reconciliationMismatchMinor = mismatchedRuns.reduce((s, r) => s + Math.abs(num(r.mismatch_minor)), 0);

    // Daily buckets (zero-filled across the range)
    const buckets = new Map<string, { date: string; revenueMinor: number; energyRevenueMinor: number; vatMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; newVendors: number; refundMinor: number; auditLogsCount: number; securityEventsCount: number }>();
    const startMs = new Date(sinceIso).getTime();
    for (let i = 0; i < days; i++) {
        const key = dayKey(new Date(startMs + i * 86400_000).toISOString());
        buckets.set(key, { date: key, revenueMinor: 0, energyRevenueMinor: 0, vatMinor: 0, purchaseCount: 0, fundingMinor: 0, newCustomers: 0, newVendors: 0, refundMinor: 0, auditLogsCount: 0, securityEventsCount: 0 });
    }
    const touch = (iso: string) => buckets.get(dayKey(iso));
    for (const p of d.purchases) {
        const b = touch(p.created_at);
        if (b) {
            b.purchaseCount += 1;
            if (p.status === 'delivered') {
                b.revenueMinor += num(p.amount_minor);
                b.energyRevenueMinor += num(p.energy_amount_minor ?? p.amount_minor);
                b.vatMinor += num(p.vat_amount_minor);
            }
        }
    }
    for (const f of d.funding) { const b = touch(f.created_at); if (b) b.fundingMinor += num(f.amount_minor); }
    for (const c of d.newCustomers) { const b = touch(c.created_at); if (b) b.newCustomers += 1; }
    for (const v of d.newVendors) { const b = touch(v.created_at); if (b) b.newVendors += 1; }
    for (const r of approvedRefunds) { const b = touch(r.created_at); if (b) b.refundMinor += num(r.approved_amount_minor ?? r.amount_minor); }
    for (const log of (d.auditLogs || [])) { const b = touch(log.created_at); if (b) b.auditLogsCount += 1; }
    for (const e of (d.securityEvents || [])) { const b = touch(e.created_at); if (b) b.securityEventsCount += 1; }

    const purchasesByStatus: Record<string, number> = {};
    for (const p of d.purchases) purchasesByStatus[p.status] = (purchasesByStatus[p.status] ?? 0) + 1;

    const revenueByActorType: Record<string, number> = {};
    for (const p of delivered) revenueByActorType[p.actor_type ?? 'unknown'] = (revenueByActorType[p.actor_type ?? 'unknown'] ?? 0) + num(p.amount_minor);

    const fundingByChannel: Record<string, number> = {};
    const fundingRequestsByStatus: Record<string, number> = {};
    for (const f of d.fundingRequests || []) {
        if (f.status === 'approved') {
            fundingByChannel[f.channel ?? 'unknown'] = (fundingByChannel[f.channel ?? 'unknown'] ?? 0) + num(f.amount_minor);
        }
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

    const ledgerByEntryType: Record<string, number> = {};
    for (const entry of (d.ledgerEntries || [])) {
        const key = entry.entry_type ?? 'unknown';
        const signed = entry.direction === 'debit' ? -num(entry.amount_minor) : num(entry.amount_minor);
        ledgerByEntryType[key] = (ledgerByEntryType[key] ?? 0) + signed;
    }

    const reconciliationByStatus: Record<string, number> = {};
    for (const run of (d.reconciliationRuns || [])) {
        reconciliationByStatus[run.status ?? 'unknown'] = (reconciliationByStatus[run.status ?? 'unknown'] ?? 0) + 1;
    }

    return {
        audience,
        range: { since: sinceIso, until: untilIso, days },
        kpis: {
            revenueMinor,
            energyRevenueMinor,
            vatMinor,
            unitsKwh,
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
            settlementBatches: settledBatches.length,
            refundApprovedMinor,
            refundCount: d.refunds.length,
            disputesOpened: d.disputes.length,
            newCustomers: d.newCustomers.length,
            newVendors: d.newVendors.length,
            auditLogsCount: (d.auditLogs || []).length,
            securityEventsCount: (d.securityEvents || []).length,
            securityAlertsHigh: (d.securityEvents || []).filter((e: any) => e.severity === 'high' || e.severity === 'critical').length,
            ledgerNetMinor,
            ledgerCreditMinor,
            ledgerDebitMinor,
            ledgerEntryCount: (d.ledgerEntries || []).length,
            activeHoldsMinor,
            activeHoldsCount,
            reconciliationRunCount: (d.reconciliationRuns || []).length,
            reconciliationMismatches,
            reconciliationMismatchMinor,
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
            ledgerByEntryType,
            reconciliationByStatus,
            entityPerformance: d.entityPerformance ?? [],
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
            ledgerEntries: (d.ledgerEntries || []).length,
            activeHolds: (d.activeHolds || []).length,
            reconciliationRuns: (d.reconciliationRuns || []).length,
            entityBreakdownRows: (d.entityPerformance || []).length,
        },
        quality: (d as any).quality,
    };
}

function resolveReportTransactionFilters(query: Record<string, string | undefined>) {
    const statusResult = reportTransactionStatusSchema.safeParse(query.transaction_status ?? 'all');
    if (!statusResult.success) throw new Error('Transaction status must be all, successful, or failed.');
    const entityId = String(query.entity_id ?? '').trim() || null;
    if (entityId && !isUuid(entityId)) throw new Error('The selected entity ID is invalid.');
    return { transactionStatus: statusResult.data, entityId };
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/reports/overview', async (req, reply) => {
        const audienceResult = reportAudienceSchema.safeParse((req.query as { audience?: string }).audience ?? 'all');
        if (!audienceResult.success) return reply.code(400).send({ error: 'invalid_report_audience', message: 'Audience must be all, vendor, or customer.' });
        const familyResult = reportFamilySchema.safeParse((req.query as { family?: string }).family ?? 'financial');
        if (!familyResult.success) return reply.code(400).send({ error: 'invalid_report_family', message: 'The requested report type is invalid.' });
        const groupingResult = reportGroupingSchema.safeParse((req.query as { group_by?: string }).group_by ?? 'site');
        if (!groupingResult.success) return reply.code(400).send({ error: 'invalid_report_grouping', message: 'Grouping must be site, vendor, or customer.' });
        const scope = reportScope(req, req.query as { site_id?: string });
        if (scope.error) return reply.code(scope.error.status).send({ error: scope.error.code, message: scope.error.message });
        let range: ReturnType<typeof resolveRange>;
        try { range = resolveRange(req.query as Record<string, string | undefined>); }
        catch (error) { return reply.code(400).send({ error: 'invalid_report_range', message: (error as Error).message }); }
        const { sinceIso, untilIso, days } = range;
        try {
            const filters = resolveReportTransactionFilters(req.query as Record<string, string | undefined>);
            const data = await gatherReportData(sinceIso, untilIso, audienceResult.data, familyResult.data, groupingResult.data, scope.siteId, scope.stationIds, filters.transactionStatus, filters.entityId);
            return {
                ...buildReport(sinceIso, untilIso, days, audienceResult.data, data),
                scope: { siteId: scope.siteId, groupBy: groupingResult.data },
            };
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
        const groupingResult = reportGroupingSchema.safeParse((req.query as { group_by?: string }).group_by ?? 'site');
        if (!groupingResult.success) return reply.code(400).send({ error: 'invalid_report_grouping', message: 'Grouping must be site, vendor, or customer.' });
        const scope = reportScope(req, req.query as { site_id?: string });
        if (scope.error) return reply.code(scope.error.status).send({ error: scope.error.code, message: scope.error.message });
        let range: ReturnType<typeof resolveRange>;
        try { range = resolveRange(req.query as Record<string, string | undefined>); }
        catch (error) { return reply.code(400).send({ error: 'invalid_report_range', message: (error as Error).message }); }
        const { sinceIso, untilIso, days } = range;
        let report: ReturnType<typeof buildReport>;
        try {
            const filters = resolveReportTransactionFilters(req.query as Record<string, string | undefined>);
            const data = await gatherReportData(sinceIso, untilIso, audienceResult.data, familyResult.data, groupingResult.data, scope.siteId, scope.stationIds, filters.transactionStatus, filters.entityId);
            report = buildReport(sinceIso, untilIso, days, audienceResult.data, data);
        } catch (error) {
            req.log.error({ err: error, audience: audienceResult.data }, 'report export query failed');
            return reply.code(502).send({ error: 'reports_unavailable', message: 'Report export could not be prepared. Please retry.' });
        }
        const filters = resolveReportTransactionFilters(req.query as Record<string, string | undefined>);
        const header = [
            'schema_version', 'family', 'period_start', 'period_end', 'audience', 'group_type', 'site_id',
            'transaction_filter', 'entity_id', 'date', 'revenue_minor', 'energy_revenue_minor', 'vat_minor',
            'purchase_count', 'funding_minor', 'refund_minor', 'new_customers', 'new_vendors',
            'audit_logs_count', 'security_events_count',
        ];
        const csv = [
            header.join(','),
            ...report.series.daily.map((r) => [
                1, familyResult.data, sinceIso.slice(0, 10), untilIso.slice(0, 10), audienceResult.data,
                groupingResult.data, scope.siteId ?? 'all', filters.transactionStatus, filters.entityId ?? 'all',
                r.date, r.revenueMinor, r.energyRevenueMinor, r.vatMinor, r.purchaseCount, r.fundingMinor,
                r.refundMinor, r.newCustomers, r.newVendors, r.auditLogsCount, r.securityEventsCount,
            ].map(csvEscape).join(',')),
        ].join('\r\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="report-${audienceResult.data}-${sinceIso.slice(0, 10)}_${untilIso.slice(0, 10)}.csv"`);
        return `\uFEFF${csv}`;
    });

    fastify.get('/reports/power-bi.csv', async (req, reply) => {
        const audienceResult = reportAudienceSchema.safeParse((req.query as { audience?: string }).audience ?? 'all');
        if (!audienceResult.success) return reply.code(400).send({ error: 'invalid_report_audience', message: 'Audience must be all, vendor, or customer.' });
        const groupingResult = reportGroupingSchema.safeParse((req.query as { group_by?: string }).group_by ?? 'site');
        if (!groupingResult.success) return reply.code(400).send({ error: 'invalid_report_grouping', message: 'Grouping must be site, vendor, or customer.' });
        const scope = reportScope(req, req.query as { site_id?: string });
        if (scope.error) return reply.code(scope.error.status).send({ error: scope.error.code, message: scope.error.message });
        let range: ReturnType<typeof resolveRange>;
        try { range = resolveRange(req.query as Record<string, string | undefined>); }
        catch (error) { return reply.code(400).send({ error: 'invalid_report_range', message: (error as Error).message }); }
        const { sinceIso, untilIso } = range;
        let rows: Awaited<ReturnType<typeof readPurchaseBreakdown>>;
        try {
            const filters = resolveReportTransactionFilters(req.query as Record<string, string | undefined>);
            rows = await readPurchaseBreakdown(sinceIso, untilIso, audienceResult.data, groupingResult.data, scope.siteId, scope.stationIds, filters.transactionStatus, filters.entityId);
        } catch (error) {
            req.log.error({ err: error, audience: audienceResult.data, groupBy: groupingResult.data }, 'Power BI report export failed');
            return reply.code(502).send({ error: 'reports_unavailable', message: 'Power BI export could not be prepared. Please retry.' });
        }
        const generatedAt = new Date().toISOString();
        const header = [
            'schema_version', 'currency', 'amount_scale', 'period_start', 'period_end', 'generated_at', 'audience', 'group_type', 'site_id',
            'entity_id', 'entity_name', 'vendor_name', 'vendor_business_name', 'customer_name', 'purchase_count', 'delivered_count', 'failed_count',
            'customer_count', 'direct_purchase_count', 'vendor_purchase_count', 'success_rate',
            'revenue_minor', 'revenue_naira', 'energy_revenue_minor', 'vat_minor', 'units_kwh',
            'average_purchase_minor', 'first_purchase_at', 'last_purchase_at',
        ];
        const csv = [
            header.join(','),
            ...rows.map((row) => [
                1, 'NGN', 100, sinceIso.slice(0, 10), untilIso.slice(0, 10), generatedAt, audienceResult.data,
                row.groupType, row.siteId, row.entityId, row.entityName, row.vendorName, row.vendorBusinessName, row.customerName, row.purchaseCount,
                row.deliveredCount, row.failedCount, row.customerCount, row.directPurchaseCount,
                row.vendorPurchaseCount, row.successRate, row.revenueMinorExact,
                minorToMajorString(row.revenueMinorExact), row.energyRevenueMinorExact, row.vatMinorExact,
                row.unitsKwhExact, row.averagePurchaseMinorExact, row.firstPurchaseAt, row.lastPurchaseAt,
            ].map(csvEscape).join(',')),
        ].join('\r\n');
        const siteSuffix = scope.siteId ? `-${scope.siteId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="beverly-power-bi-${groupingResult.data}${siteSuffix}-${sinceIso.slice(0, 10)}_${untilIso.slice(0, 10)}.csv"`);
        return `\uFEFF${csv}`;
    });
};

export const reportTestUtils = { buildReport, resolveRange };
export default route;
