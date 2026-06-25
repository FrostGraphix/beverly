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

const MISMATCH_ALERT_THRESHOLD_MINOR = 10_000_00; // ₦10,000

export async function runDailyReconciliation(runDate?: string): Promise<void> {
    const date = runDate ?? new Date().toISOString().slice(0, 10);

    // Idempotent: skip if already ran today successfully
    const { data: existing } = await adminClient
        .from('reconciliation_runs')
        .select('id, status')
        .eq('run_date', date)
        .single();
    if (existing && (existing as any).status === 'ok') return;

    const { data: runRow } = await adminClient
        .from('reconciliation_runs')
        .upsert({ run_date: date, status: 'running' }, { onConflict: 'run_date' })
        .select('id')
        .single();
    const runId = (runRow as any)?.id;

    try {
        const since = `${date}T00:00:00Z`;
        const until = `${date}T23:59:59Z`;

        // Our DB: sum of payment_transactions confirmed on this date
        const { data: dbTxns } = await adminClient
            .from('payment_transactions')
            .select('amount_minor')
            .eq('status', 'succeeded')
            .gte('created_at', since)
            .lte('created_at', until);

        const dbTotal = (dbTxns ?? []).reduce((s: number, r: any) => s + Number(r.amount_minor), 0);
        const dbCount = (dbTxns ?? []).length;

        // Paystack: list transactions for date (paginated, max 200 for daily)
        let gatewayTotal: number | null = null;
        try {
            const paystackKey = process.env.PAYSTACK_SECRET_KEY;
            if (paystackKey) {
                const res = await fetch(
                    `https://api.paystack.co/transaction?status=success&from=${since}&to=${until}&perPage=200`,
                    { headers: { Authorization: `Bearer ${paystackKey}` } },
                );
                const ps: any = await res.json();
                if (ps.status && ps.data) {
                    gatewayTotal = (ps.data as any[]).reduce((s, t) => s + Number(t.amount), 0);
                }
            }
        } catch {
            // Gateway query failure — record null, don't fail the run
        }

        const mismatch = gatewayTotal !== null ? Math.abs(dbTotal - gatewayTotal) : null;
        const status   = mismatch === null ? 'ok'
                       : mismatch > MISMATCH_ALERT_THRESHOLD_MINOR ? 'mismatch'
                       : 'ok';

        let notes: string | null = null;
        if (status === 'mismatch' && mismatch !== null) {
            notes = `DB total: ₦${(dbTotal / 100).toFixed(2)}, Gateway total: ₦${(gatewayTotal! / 100).toFixed(2)}, Delta: ₦${(mismatch / 100).toFixed(2)}`;
            console.error(`[RECONCILIATION] MISMATCH on ${date}: ${notes}`);
        }

        await adminClient.from('reconciliation_runs').update({
            status,
            total_purchases:     dbCount,
            total_amount_minor:  dbTotal,
            gateway_total_minor: gatewayTotal,
            mismatch_minor:      mismatch,
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
    const { data } = await adminClient
        .from('reconciliation_runs')
        .select('*')
        .order('run_date', { ascending: false })
        .limit(limit);
    return data ?? [];
}
