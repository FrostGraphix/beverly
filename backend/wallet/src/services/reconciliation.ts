/**
 * Reconciliation service — Phase 6
 *
 * Nightly job (02:00): compare gateway-confirmed transactions in the DB
 * against Paystack's transaction list for the same date range.
 *
 * A mismatch > ₦10,000 raises an alert (logged; future: PagerDuty/Slack).
 * Results stored in reconciliation_runs for dashboard display.
 */
import { adminClient } from '../db/supabase.js';
import { PAYMENT_SUCCEEDED_STATUSES } from './payment-status.js';

const MISMATCH_ALERT_THRESHOLD_MINOR = 10_000_00; // ₦10,000

export async function runDailyReconciliation(runDate?: string, options: { force?: boolean } = {}): Promise<void> {
    const date = runDate ?? new Date().toISOString().slice(0, 10);

    // Idempotent: skip if already ran today successfully
    const { data: existing } = await adminClient
        .from('reconciliation_runs')
        .select('id, status')
        .eq('run_date', date)
        .single();
    if (!options.force && existing && (existing as any).status === 'ok') return;

    const { data: runRow } = await adminClient
        .from('reconciliation_runs')
        .upsert({ run_date: date, status: 'running' }, { onConflict: 'run_date' })
        .select('id')
        .single();
    const runId = (runRow as any)?.id;

    try {
        const since = `${date}T00:00:00Z`;
        const until = `${date}T23:59:59Z`;

        // Our DB: sum of payment_transactions completed on this date, keyed
        // by gateway_reference so we can diff against Paystack's own list.
        const { data: dbTxns, error: dbError } = await adminClient
            .from('payment_transactions')
            .select('amount_minor, gateway_reference')
            .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES))
            .gte('completed_at', since)
            .lte('completed_at', until);
        if (dbError) throw new Error(`payment reconciliation query failed: ${dbError.message}`);

        const dbRows = dbTxns ?? [];
        const dbTotal = dbRows.reduce((s: number, r: any) => s + Number(r.amount_minor), 0);
        const dbCount = dbRows.length;
        const dbRefs = new Set(dbRows.map((r: any) => String(r.gateway_reference)));

        // Paystack: list transactions for the date, following pagination so
        // high-volume days (> perPage transactions) never report a false delta.
        let gatewayTotal: number | null = null;
        const gatewayRefs = new Set<string>();
        try {
            const paystackKey = process.env.PAYSTACK_SECRET_KEY;
            if (paystackKey) {
                const perPage = 200;
                const maxPages = 50; // hard stop: 10k transactions/day
                let page = 1;
                let sum = 0;
                let complete = false;
                while (page <= maxPages) {
                    const res = await fetch(
                        `https://api.paystack.co/transaction?status=success&from=${since}&to=${until}&perPage=${perPage}&page=${page}`,
                        { headers: { Authorization: `Bearer ${paystackKey}` } },
                    );
                    if (res.ok === false) break;
                    const ps: any = await res.json();
                    if (!ps.status || !Array.isArray(ps.data)) break;
                    for (const t of ps.data as any[]) {
                        const requested = Number(t.requested_amount);
                        sum += Number.isSafeInteger(requested) && requested > 0
                            ? requested
                            : Number(t.amount);
                        if (t.reference) gatewayRefs.add(String(t.reference));
                    }
                    if (ps.data.length < perPage) {
                        complete = true;
                        break;
                    }
                    page += 1;
                }
                if (complete) gatewayTotal = sum;
            }
        } catch {
            // Gateway query failure — record null, don't fail the run
        }

        const mismatch = gatewayTotal !== null ? Math.abs(dbTotal - gatewayTotal) : null;
        const status   = mismatch === null ? 'failed'
                       : mismatch > MISMATCH_ALERT_THRESHOLD_MINOR ? 'mismatch'
                       : 'ok';

        let notes: string | null = null;
        let mismatchedReferences: { db_only: string[]; gateway_only: string[] } | null = null;
        if (status === 'mismatch' && mismatch !== null) {
            notes = `DB total: ₦${(dbTotal / 100).toFixed(2)}, Gateway total: ₦${(gatewayTotal! / 100).toFixed(2)}, Delta: ₦${(mismatch / 100).toFixed(2)}`;
            console.error(`[RECONCILIATION] MISMATCH on ${date}: ${notes}`);
            const dbOnly = [...dbRefs].filter((r) => !gatewayRefs.has(r)).slice(0, 200);
            const gatewayOnly = [...gatewayRefs].filter((r) => !dbRefs.has(r)).slice(0, 200);
            mismatchedReferences = { db_only: dbOnly, gateway_only: gatewayOnly };
        } else if (gatewayTotal === null) {
            // "ok" here only means "nothing proven wrong" — make the gap visible.
            notes = 'gateway unverified: PAYSTACK_SECRET_KEY missing, query failed, or pagination incomplete';
        }

        await adminClient.from('reconciliation_runs').update({
            status,
            total_purchases:     dbCount,
            total_amount_minor:  dbTotal,
            gateway_total_minor: gatewayTotal,
            mismatch_minor:      mismatch,
            mismatched_references: mismatchedReferences,
            notes,
            checked_at:          new Date().toISOString(),
        }).eq('id', runId);

    } catch (err: any) {
        await adminClient.from('reconciliation_runs').update({
            status: 'failed',
            notes:  err.message,
            checked_at: new Date().toISOString(),
        }).eq('id', runId);
    }
}

export async function listReconciliationRuns(limit = 30) {
    const { data, error } = await adminClient
        .from('reconciliation_runs')
        .select('*')
        .order('run_date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data ?? [];
}
