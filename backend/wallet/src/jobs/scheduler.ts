/**
 * Background job scheduler — Phase 6
 *
 * Executes durable worker job handlers.
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
import { adminClient } from '../db/supabase.js';
import { refreshCustomerBaseline } from '../services/fraud-engine.js';
import { reconcileRemoteSendOrders } from '../services/vending.js';
import { verifyTransaction } from '../adapters/paystack.js';
import { PAYMENT_RECONCILABLE_STATUSES, PAYMENT_STATUS } from '../services/payment-status.js';
import { fulfillSuccessfulPaystackTransaction } from '../services/payment-transactions.js';

// ── Hold expiry sweeper ────────────────────────────────────────────────────────
export async function sweepExpiredHolds(): Promise<void> {
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
    let released = 0;
    for (const hold of stale as any[]) {
        if (protectedHoldIds.has(hold.id)) continue;
        const { error } = await adminClient.rpc('fn_release_hold', { p_hold_id: hold.id });
        if (error) {
            console.error(`[JOB:holds] release failed hold=${hold.id}:`, error.message);
        } else {
            released++;
        }
    }
    console.info(`[JOB:holds] released ${released}/${stale.length} expired holds`);
}

// ── Payment status sweeper ────────────────────────────────────────────────────
export async function sweepPendingPayments(): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // stuck >1hr
    const { data: stuck } = await adminClient
        .from('payment_transactions')
        .select('*')
        .eq('gateway', 'paystack')
        .in('status', Array.from(PAYMENT_RECONCILABLE_STATUSES))
        .lt('created_at', since)
        .or(`fulfillment_next_retry_at.is.null,fulfillment_next_retry_at.lte.${new Date().toISOString()}`)
        .limit(50);

    if (!stuck?.length) return;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) return;

    for (const txn of stuck as any[]) {
        try {
            const reference = String(txn.gateway_reference ?? '');
            if (!reference) continue;
            const verified = await verifyTransaction(reference);
            if (verified.status === 'success') {
                await fulfillSuccessfulPaystackTransaction({ tx: txn, verified, source: 'scheduler' });
            } else if (['failed', 'abandoned'].includes(verified.status)) {
                const now = new Date().toISOString();
                await adminClient.from('payment_transactions')
                    .update({
                        status: PAYMENT_STATUS.FAILED,
                        metadata: {
                            ...((txn.metadata ?? {}) as Record<string, unknown>),
                            paystack: verified,
                            reconciled_at: now,
                            reconciliation_status: verified.status,
                        },
                        updated_at: now,
                    })
                    .eq('id', txn.id);
                if (txn.actor_type === 'customer' && txn.actor_id) {
                    const { notifyPaymentFailed } = await import('../services/notifications.js');
                    notifyPaymentFailed(txn.actor_id, {
                        amountMinor: Number(txn.amount_minor ?? 0),
                        reason: verified.status === 'abandoned' ? 'The payment was not completed.' : undefined,
                    }).catch(() => undefined);
                }
            }
        } catch (error) {
            const attempts = Number(txn.fulfillment_attempts ?? 0) + 1;
            const terminal = attempts >= 5;
            const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
            await adminClient
                .from('payment_transactions')
                .update({
                    fulfillment_attempts: attempts,
                    fulfillment_last_error: (error instanceof Error ? error.message : 'payment_reconciliation_failed').slice(0, 500),
                    fulfillment_next_retry_at: terminal ? null : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
                    status: terminal ? PAYMENT_STATUS.FAILED : txn.status,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', txn.id);
            if (terminal && txn.actor_type === 'customer' && txn.actor_id) {
                const { notifyPaymentFailed } = await import('../services/notifications.js');
                notifyPaymentFailed(txn.actor_id, { amountMinor: Number(txn.amount_minor ?? 0) }).catch(() => undefined);
            }
        }
    }
    console.info(`[JOB:payments] swept ${stuck.length} stale payment transactions`);
}

// ── Stuck purchase scan ────────────────────────────────────────────────────────
export async function scanStuckPurchases(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuck } = await adminClient
        .from('purchase_orders')
        .select('id, meter_id, amount_minor')
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .limit(20);
    if (!stuck?.length) return;
    await adminClient.from('operations_exceptions').upsert((stuck as any[]).map((order) => ({
        exception_key: `purchase-stuck:${order.id}`,
        category: 'purchase_stuck',
        target_type: 'purchase_order',
        target_id: order.id,
        severity: 'high',
        status: 'open',
        details: { meter_id: order.meter_id, amount_minor: order.amount_minor },
        updated_at: new Date().toISOString(),
    })), { onConflict: 'exception_key' });
    console.warn(`[JOB:stuck-purchases] ${stuck.length} purchases pending >30min`);
    // Future: add to exception_queue for ops review
}

export async function reconcileRemoteSends(): Promise<void> {
    const result = await reconcileRemoteSendOrders(25);
    if (!result.checked) return;
    console.info(`[JOB:remote-send] checked=${result.checked} delivered=${result.delivered} review=${result.reviewed}`);
}

// ── Fraud baseline recompute ───────────────────────────────────────────────────
export async function recomputeFraudBaselines(): Promise<void> {
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
export async function processRefundExpiry(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await adminClient
        .from('refund_requests')
        .select('id')
        .in('status', ['created', 'hold_active', 'dispatching', 'delivery_pending_review', 'pending'])
        .lt('created_at', cutoff);
    if (!stale?.length) return;
    const ids = (stale as any[]).map((row) => row.id);
    const { error } = await adminClient
        .from('refund_requests')
        .update({
            status: 'expired',
            processed_at: new Date().toISOString(),
        })
        .in('id', ids)
        .eq('status', 'pending');
    if (error) throw error;
    console.warn(`[JOB:refund-expiry] expired ${ids.length} refund requests pending >7 days`);
}

// ── Scheduler init ─────────────────────────────────────────────────────────────
export function startScheduler(): void {
    // Hold expiry — every 5 min

    // Payment sweeper — every 5 min (offset by 2 min to avoid hold/payment collision)

    // Stuck purchase scan — every 10 min

    // Daily reconciliation — 02:00

    // Settlement batch — 03:00

    // Fraud baseline recompute — 05:00

    // Refund expiry — every hour

    throw new Error('In-process scheduling is retired. Run the BullMQ worker.');
}
