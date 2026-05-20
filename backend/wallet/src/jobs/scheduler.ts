/**
 * Background job scheduler — Phase 6
 *
 * Uses node-cron for time-based triggers.
 * Each job is wrapped so one failure does not kill the scheduler.
 *
 * Schedule (from master design §18):
 *   Hold expiry sweeper      every 5 min
 *   Payment status sweeper   every 5 min
 *   Stuck purchase scan      every 10 min
 *   Fraud baseline recompute 05:00 daily
 *   Daily reconciliation     02:00 daily
 *   Settlement batch         03:00 daily
 *   Refund expiry            hourly
 */
import cron from 'node-cron';
import { adminClient } from '../db/supabase.js';
import { runDailyReconciliation } from '../services/reconciliation.js';
import { runDailySettlement } from '../services/settlement.js';
import { refreshCustomerBaseline } from '../services/fraud-engine.js';
import { reconcileRemoteSendOrders } from '../services/vending.js';

function safe(name: string, fn: () => Promise<void>): () => void {
    return () => {
        fn().catch((err) => console.error(`[JOB:${name}] failed:`, err));
    };
}

// ── Hold expiry sweeper ────────────────────────────────────────────────────────
async function sweepExpiredHolds(): Promise<void> {
    // Holds older than 30 min with no capture → release
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stale } = await adminClient
        .from('wallet_holds')
        .select('id, wallet_id, amount_minor')
        .eq('status', 'active')
        .lt('created_at', cutoff);

    if (!stale?.length) return;
    const holdIds = (stale as any[]).map((hold) => hold.id);
    const { data: protectedOrders } = await adminClient
        .from('purchase_orders')
        .select('hold_id')
        .in('hold_id', holdIds)
        .in('status', ['dispatching', 'delivery_pending_review']);
    const protectedHoldIds = new Set((protectedOrders ?? []).map((row: any) => row.hold_id));
    for (const hold of stale as any[]) {
        if (protectedHoldIds.has(hold.id)) continue;
        void adminClient.rpc('fn_release_hold', { p_hold_id: hold.id });
    }
    console.info(`[JOB:holds] released ${stale.length} expired holds`);
}

// ── Payment status sweeper ────────────────────────────────────────────────────
async function sweepPendingPayments(): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // stuck >1hr
    const { data: stuck } = await adminClient
        .from('payment_transactions')
        .select('id, reference, amount_minor')
        .eq('status', 'pending')
        .lt('created_at', since)
        .limit(50);

    if (!stuck?.length) return;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) return;

    for (const txn of stuck as any[]) {
        try {
            const res  = await fetch(`https://api.paystack.co/transaction/verify/${txn.reference}`, {
                headers: { Authorization: `Bearer ${paystackKey}` },
            });
            const ps: any = await res.json();
            if (ps.data?.status === 'success') {
                await adminClient.from('payment_transactions')
                    .update({ status: 'succeeded' }).eq('id', txn.id);
            } else if (['failed', 'abandoned'].includes(ps.data?.status)) {
                await adminClient.from('payment_transactions')
                    .update({ status: 'failed' }).eq('id', txn.id);
            }
        } catch { /* noop per txn */ }
    }
    console.info(`[JOB:payments] swept ${stuck.length} pending payment transactions`);
}

// ── Stuck purchase scan ────────────────────────────────────────────────────────
async function scanStuckPurchases(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuck } = await adminClient
        .from('purchase_orders')
        .select('id, meter_id, amount_minor')
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .limit(20);
    if (!stuck?.length) return;
    console.warn(`[JOB:stuck-purchases] ${stuck.length} purchases pending >30min`);
    // Future: add to exception_queue for ops review
}

async function reconcileRemoteSends(): Promise<void> {
    const result = await reconcileRemoteSendOrders(25);
    if (!result.checked) return;
    console.info(`[JOB:remote-send] checked=${result.checked} delivered=${result.delivered} review=${result.reviewed}`);
}

// ── Fraud baseline recompute ───────────────────────────────────────────────────
async function recomputeFraudBaselines(): Promise<void> {
    const { data: customers } = await adminClient
        .from('customers')
        .select('id')
        .eq('status', 'active')
        .limit(500);
    if (!customers) return;
    let count = 0;
    for (const c of customers as any[]) {
        try { await refreshCustomerBaseline(c.id); count++; } catch { /* noop */ }
    }
    console.info(`[JOB:fraud-baseline] recomputed ${count} customer baselines`);
}

// ── Refund expiry (auto-close refunds pending >7 days) ───────────────────────
async function processRefundExpiry(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await adminClient
        .from('refund_requests')
        .select('id')
        .eq('status', 'pending')
        .lt('created_at', cutoff);
    if (!stale?.length) return;
    console.warn(`[JOB:refund-expiry] ${stale.length} refund requests pending >7 days — escalation needed`);
}

// ── Scheduler init ─────────────────────────────────────────────────────────────
export function startScheduler(): void {
    // Hold expiry — every 5 min
    cron.schedule('*/5 * * * *', safe('holds', sweepExpiredHolds));

    // Payment sweeper — every 5 min (offset by 2 min to avoid hold/payment collision)
    cron.schedule('2-57/5 * * * *', safe('payments', sweepPendingPayments));

    // Stuck purchase scan — every 10 min
    cron.schedule('*/10 * * * *', safe('stuck-purchases', scanStuckPurchases));
    cron.schedule('*/3 * * * *', safe('remote-send', reconcileRemoteSends));

    // Daily reconciliation — 02:00
    cron.schedule('0 2 * * *', safe('reconciliation', runDailyReconciliation));

    // Settlement batch — 03:00
    cron.schedule('0 3 * * *', safe('settlement', runDailySettlement));

    // Fraud baseline recompute — 05:00
    cron.schedule('0 5 * * *', safe('fraud-baseline', recomputeFraudBaselines));

    // Refund expiry — every hour
    cron.schedule('0 * * * *', safe('refund-expiry', processRefundExpiry));

    console.info('[scheduler] all jobs registered');
}
