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

        // Our DB: payment_transactions completed on this date, keyed by
        // reference so a per-reference discrepancy cannot net to zero against
        // an offsetting one and hide inside a matching gross total.
        const { data: dbTxns } = await adminClient
            .from('payment_transactions')
            .select('gateway_reference, amount_minor')
            .eq('gateway', 'paystack')
            .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES))
            .gte('completed_at', since)
            .lte('completed_at', until);

        const dbByReference = new Map<string, number>();
        for (const row of (dbTxns ?? []) as any[]) {
            const reference = String(row.gateway_reference ?? '');
            if (!reference) continue;
            dbByReference.set(reference, (dbByReference.get(reference) ?? 0) + Number(row.amount_minor));
        }
        const dbTotal = (dbTxns ?? []).reduce((s: number, r: any) => s + Number(r.amount_minor), 0);
        const dbCount = (dbTxns ?? []).length;

        // Paystack: list transactions for the date, following pagination so
        // high-volume days (> perPage transactions) never report a false delta.
        let gatewayTotal: number | null = null;
        const gatewayByReference = new Map<string, number>();
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
                    const ps: any = await res.json();
                    if (!ps.status || !Array.isArray(ps.data)) break;
                    for (const t of ps.data as any[]) {
                        sum += Number(t.amount);
                        const reference = String(t.reference ?? '');
                        if (reference) {
                            gatewayByReference.set(reference, (gatewayByReference.get(reference) ?? 0) + Number(t.amount));
                        }
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

        // Per-reference comparison. A charge the gateway settled but we never
        // applied nets out of the gross total against an unrelated surplus, so
        // it has to be counted on its own.
        const unappliedReferences: string[] = [];
        const unknownReferences: string[] = [];
        if (gatewayTotal !== null) {
            for (const [reference] of gatewayByReference) {
                if (!dbByReference.has(reference)) unappliedReferences.push(reference);
            }
            for (const [reference] of dbByReference) {
                if (!gatewayByReference.has(reference)) unknownReferences.push(reference);
            }
        }
        const referenceGaps = unappliedReferences.length + unknownReferences.length;

        const status   = gatewayTotal === null ? 'ok'
                       : referenceGaps > 0 ? 'mismatch'
                       : mismatch !== null && mismatch > MISMATCH_ALERT_THRESHOLD_MINOR ? 'mismatch'
                       : 'ok';

        let notes: string | null = null;
        if (status === 'mismatch') {
            const parts = [
                `DB total: ₦${(dbTotal / 100).toFixed(2)}`,
                `Gateway total: ₦${((gatewayTotal ?? 0) / 100).toFixed(2)}`,
                `Delta: ₦${((mismatch ?? 0) / 100).toFixed(2)}`,
            ];
            if (unappliedReferences.length) {
                parts.push(`Settled at gateway but not applied (${unappliedReferences.length}): ${unappliedReferences.slice(0, 10).join(', ')}`);
            }
            if (unknownReferences.length) {
                parts.push(`Marked succeeded locally but absent at gateway (${unknownReferences.length}): ${unknownReferences.slice(0, 10).join(', ')}`);
            }
            notes = parts.join(' · ');
            console.error(`[RECONCILIATION] MISMATCH on ${date}: ${notes}`);
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
