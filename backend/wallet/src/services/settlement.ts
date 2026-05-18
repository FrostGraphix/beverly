/**
 * Settlement service — Phase 6
 *
 * Computes vendor activity summaries for a given period.
 * Beverly is a closed-loop system — vendors do not withdraw balance.
 * Settlement reports are purely for finance visibility and audit.
 *
 * Run nightly at 03:00 by the scheduler.
 */
import { adminClient } from '../db/supabase.js';

export async function computeSettlementBatch(
    vendorOrganizationId: string,
    periodStart: string,   // ISO date 'YYYY-MM-DD'
    periodEnd: string,
): Promise<string> {
    // Idempotent: skip if batch already exists for this period
    const { data: existing } = await adminClient
        .from('settlement_batches')
        .select('id')
        .eq('vendor_organization_id', vendorOrganizationId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .single();
    if (existing) return (existing as any).id;

    // Pull all delivered purchase orders in period for this vendor
    const { data: orders } = await adminClient
        .from('purchase_orders')
        .select('amount_minor, fee_minor')
        .eq('vendor_organization_id', vendorOrganizationId)
        .eq('status', 'delivered')
        .gte('created_at', `${periodStart}T00:00:00Z`)
        .lte('created_at', `${periodEnd}T23:59:59Z`);

    const rows = (orders ?? []) as { amount_minor: number; fee_minor: number | null }[];
    const totalVends      = rows.length;
    const grossMinor      = rows.reduce((s, r) => s + Number(r.amount_minor), 0);
    const feeMinor        = rows.reduce((s, r) => s + Number(r.fee_minor ?? 0), 0);
    const netMinor        = grossMinor - feeMinor;

    const { data: batch, error } = await adminClient
        .from('settlement_batches')
        .insert({
            vendor_organization_id: vendorOrganizationId,
            period_start:     periodStart,
            period_end:       periodEnd,
            total_vends:      totalVends,
            gross_amount_minor: grossMinor,
            fee_minor:        feeMinor,
            net_amount_minor: netMinor,
            status:           'settled',
            settled_at:       new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error || !batch) throw new Error(`Settlement batch failed: ${error?.message}`);
    return (batch as any).id;
}

export async function runDailySettlement(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const periodStart = yesterday.toISOString().slice(0, 10);
    const periodEnd   = periodStart;

    const { data: vendors } = await adminClient
        .from('vendor_organizations')
        .select('id')
        .eq('status', 'approved');

    if (!vendors) return;
    for (const v of vendors) {
        try {
            await computeSettlementBatch((v as any).id, periodStart, periodEnd);
        } catch {
            // one vendor failure must not block others
        }
    }
}

export async function listSettlementBatches(opts: {
    vendorOrganizationId?: string;
    limit?: number;
}) {
    let query = adminClient
        .from('settlement_batches')
        .select('*, vendor_organizations(trading_name, legal_name)')
        .order('period_start', { ascending: false })
        .limit(opts.limit ?? 200);
    if (opts.vendorOrganizationId) {
        query = query.eq('vendor_organization_id', opts.vendorOrganizationId);
    }
    const { data } = await query;
    return data ?? [];
}
