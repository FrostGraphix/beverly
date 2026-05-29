/**
 * Currency Transaction Report (CTR) service — Phase 3
 *
 * Auto-generates a CTR for every ledger entry ≥ ₦5 000 000 (500 000 000 minor).
 * Staff can list, filter, and file CTRs via the admin API.
 *
 * CBN AML/CFT Regulations 2022 — s. 10(1): threshold ≥ ₦5M.
 */
import { adminClient } from '../db/supabase.js';

/** ₦5 000 000 in kobo */
export const CTR_THRESHOLD_MINOR = 500_000_000;

export class CtrError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'CtrError';
    }
}

function buildReference(id: number): string {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return `CTR-${ymd}-${String(id).padStart(5, '0')}`;
}

export interface CtrInput {
    ledgerEntryId?: string;
    walletId: string;
    customerId?: string;
    vendorOrganizationId?: string;
    amountMinor: number;
    entryType: string;
    direction: 'credit' | 'debit';
}

/**
 * Called right after a ledger entry posts.
 * Returns the CTR id/reference if generated, null if below threshold.
 */
export async function maybeGenerateCtr(input: CtrInput): Promise<{ id: string; reference: string } | null> {
    if (input.amountMinor < CTR_THRESHOLD_MINOR) return null;

    // Get the next sequence value for the reference
    const { data: seqData } = await adminClient.rpc('nextval', { seq: 'ctr_reference_seq' }) as any;
    const seq = seqData ?? Math.floor(Math.random() * 99999);
    const reference = buildReference(Number(seq));

    const { data, error } = await adminClient
        .from('currency_transaction_reports')
        .insert({
            reference,
            ledger_entry_id:        input.ledgerEntryId ?? null,
            wallet_id:              input.walletId,
            customer_id:            input.customerId ?? null,
            vendor_organization_id: input.vendorOrganizationId ?? null,
            amount_minor:           input.amountMinor,
            entry_type:             input.entryType,
            direction:              input.direction,
        })
        .select('id, reference')
        .single();

    if (error || !data) {
        console.error('[CTR] insert failed:', error?.message);
        return null;
    }
    console.info(`[CTR] generated ${(data as any).reference} for wallet=${input.walletId} amount=${input.amountMinor}`);
    return { id: (data as any).id, reference: (data as any).reference };
}

export interface ListCtrOpts {
    status?: string;
    walletId?: string;
    customerId?: string;
    since?: string;
    until?: string;
    limit?: number;
    cursor?: string;
}

export async function listCtrs(opts: ListCtrOpts = {}) {
    let q = adminClient
        .from('currency_transaction_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 100);

    if (opts.status)     q = q.eq('status', opts.status);
    if (opts.walletId)   q = q.eq('wallet_id', opts.walletId);
    if (opts.customerId) q = q.eq('customer_id', opts.customerId);
    if (opts.since)      q = q.gte('created_at', opts.since);
    if (opts.until)      q = q.lte('created_at', opts.until);
    if (opts.cursor)     q = q.lt('created_at', opts.cursor);

    const { data } = await q;
    return data ?? [];
}

export async function fileCtr(ctrId: string, filedByUserId: string, filingReference?: string): Promise<void> {
    const { error } = await adminClient
        .from('currency_transaction_reports')
        .update({
            status:           'filed',
            filed_at:         new Date().toISOString(),
            filed_by_user_id: filedByUserId,
            filing_reference: filingReference ?? null,
        })
        .eq('id', ctrId)
        .eq('status', 'draft');

    if (error) throw new CtrError('Could not file CTR', 'file_failed');
}

export async function getCtrStats(): Promise<{
    draft: number;
    filed: number;
    total: number;
    totalAmountMinor: number;
}> {
    const { data } = await adminClient
        .from('currency_transaction_reports')
        .select('status, amount_minor');

    const rows = (data ?? []) as Array<{ status: string; amount_minor: number }>;
    return {
        draft:            rows.filter((r) => r.status === 'draft').length,
        filed:            rows.filter((r) => r.status === 'filed').length,
        total:            rows.length,
        totalAmountMinor: rows.reduce((s, r) => s + r.amount_minor, 0),
    };
}

/** Build a NDJSON-style CBN report payload for a date range */
export async function buildCbnReport(since: string, until: string): Promise<object[]> {
    const rows = await listCtrs({ since, until, limit: 5000 });
    return (rows as any[]).map((r) => ({
        report_type:      'CTR',
        reference:        r.reference,
        filing_reference: r.filing_reference,
        status:           r.status,
        filed_at:         r.filed_at,
        amount_ngn:       (r.amount_minor / 100).toFixed(2),
        currency:         r.currency,
        direction:        r.direction,
        entry_type:       r.entry_type,
        wallet_id:        r.wallet_id,
        customer_id:      r.customer_id,
        vendor_id:        r.vendor_organization_id,
        created_at:       r.created_at,
        reporter:         r.reporter_institution,
    }));
}
