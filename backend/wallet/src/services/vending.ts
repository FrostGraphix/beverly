/**
 * Vending service — token purchase end-to-end.
 *
 * Flow (token, instant):
 *   1. lookupMeter
 *   2. previewPurchase (tariff + units)
 *   3. createHold for amount
 *   4. generateCreditToken via energy backend
 *   5. captureHold → debit ledger entry
 *   6. create purchase_order row + receipt
 *   7. return token
 *
 * Flow (remote-send):
 *   1. same 1-3 as above
 *   2. createRemoteSendTask
 *   3. purchase_order.status = 'dispatching', delivery_state = 'remote_send_pending'
 *   4. async worker polls; on success captures hold + writes receipt
 *
 * Failure recovery:
 *   • Token engine fails → release hold, mark purchase_order failed.
 *   • Capture fails (rare) → mark order delivery_pending_review for ops.
 */
import { adminClient } from '../db/supabase.js';
import {
    createHold, captureHold, releaseHold,
} from './ledger.js';
import {
    lookupMeter, previewPurchase, generateCreditToken, createRemoteSendTask, pollRemoteSendStatus,
    TokenEngineError, type MeterInfo,
} from './token-engine.js';
import { findWalletByOwner } from './wallets.js';
import { logAction } from './audit.js';
import { ledgerKey, hashIdempotency } from './idempotency.js';

export class VendingError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'VendingError'; }
}

export interface PurchaseOrder {
    id: string;
    actor_type: 'vendor' | 'customer';
    actor_id: string;
    wallet_id: string | null;
    customer_id: string | null;
    customer_name: string | null;
    meter_id: string;
    station_id: string | null;
    tariff_id: string | null;
    amount_minor: number;
    units_kwh: number | null;
    purchase_mode: 'wallet' | 'direct_pay' | 'remote_send';
    payment_transaction_id: string | null;
    hold_id: string | null;
    token: string | null;
    remote_task_id: string | null;
    receipt_id: string | null;
    status: 'created' | 'hold_active' | 'dispatching' | 'delivered' | 'delivery_pending_review' | 'failed' | 'reversed';
    delivery_state: string | null;
    idempotency_key: string;
    failure_reason: string | null;
    created_by: string;
    created_at: string;
}

export interface VendorPurchaseInput {
    vendorOrganizationId: string;
    vendorUserId: string;
    meterId: string;
    amountMinor: number;
    clientIdempotencyKey: string;
    mode: 'wallet' | 'remote_send';
}

export interface VendorPurchaseResult {
    purchaseOrder: PurchaseOrder;
    token: string | null;
    units: number;
    remoteTaskId: string | null;
    receiptId: string | null;
    ledgerEntryId: string | null;
}

export async function vendorPurchase(input: VendorPurchaseInput): Promise<VendorPurchaseResult> {
    const idemKey = hashIdempotency([
        'vendor_purchase', input.vendorOrganizationId, input.meterId,
        input.amountMinor, input.mode, input.clientIdempotencyKey,
    ]);

    // idempotency short-circuit
    const { data: existing } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('idempotency_key', idemKey)
        .maybeSingle();
    if (existing) {
        const po = existing as PurchaseOrder;
        return {
            purchaseOrder: po,
            token: po.token,
            units: Number(po.units_kwh ?? 0),
            remoteTaskId: po.remote_task_id,
            receiptId: po.receipt_id,
            ledgerEntryId: null,
        };
    }

    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    if (!wallet) throw new VendingError('vendor wallet not provisioned', 'wallet_missing');
    if (wallet.status !== 'active') throw new VendingError('vendor wallet not active', 'wallet_inactive');

    // resolve meter + tariff
    let meter: MeterInfo;
    try { meter = await lookupMeter(input.meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new VendingError(e.message, e.code);
        throw e;
    }

    const preview = previewPurchase(input.amountMinor, meter.tariffId);

    // create order in 'created' state
    const { data: createdRow, error: createErr } = await adminClient.from('purchase_orders').insert({
        actor_type: 'vendor',
        actor_id: input.vendorOrganizationId,
        wallet_id: wallet.id,
        customer_id: meter.customerId,
        customer_name: meter.customerName,
        meter_id: meter.meterId,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        amount_minor: input.amountMinor,
        units_kwh: preview.units,
        purchase_mode: input.mode,
        status: 'created',
        idempotency_key: idemKey,
        created_by: input.vendorUserId,
    }).select('*').single();
    if (createErr) throw new VendingError(createErr.message, 'create_order_failed');
    let po = createdRow as PurchaseOrder;

    // place hold
    let hold;
    try {
        hold = await createHold({
            walletId: wallet.id,
            amountMinor: input.amountMinor,
            referenceType: 'purchase_order',
            referenceId: po.id,
            idempotencyKey: ledgerKey('purchase', 'debit', po.id, 'hold'),
            ttlSeconds: 900,
            createdBy: input.vendorUserId,
        });
    } catch (e: any) {
        await markFailed(po.id, e.code ?? 'hold_failed', e.message);
        throw new VendingError(e.message, e.code ?? 'hold_failed');
    }
    await adminClient.from('purchase_orders').update({
        hold_id: hold.id, status: 'hold_active',
    }).eq('id', po.id);
    po = { ...po, hold_id: hold.id, status: 'hold_active' };

    // dispatch
    let token: string | null = null;
    let remoteTaskId: string | null = null;
    let ledgerEntryId: string | null = null;
    let receiptId: string | null = null;

    if (input.mode === 'wallet') {
        // instant token generation
        try {
            const tokenRes = await generateCreditToken({
                meterId: meter.meterId,
                customerId: meter.customerId,
                customerName: meter.customerName,
                stationId: meter.stationId,
                amountMinor: input.amountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                reference: po.id,
            });
            token = tokenRes.token;

            const ledgerEntry = await captureHold({
                holdId: hold.id,
                entryType: 'purchase_debit',
                referenceType: 'purchase_order',
                referenceId: po.id,
                idempotencyKey: ledgerKey('purchase', 'capture', po.id, 'final'),
                memo: `Vending · ${meter.meterId}`,
                createdBy: input.vendorUserId,
            });
            ledgerEntryId = ledgerEntry.id;

            const receipt = await createReceipt({
                purchaseOrderId: po.id,
                payload: {
                    receiptNumber: shortReceipt(po.id),
                    vendorOrganizationId: input.vendorOrganizationId,
                    customerId: meter.customerId,
                    customerName: meter.customerName,
                    meterId: meter.meterId,
                    stationId: meter.stationId,
                    tariffId: meter.tariffId,
                    amountMinor: input.amountMinor,
                    units: preview.units,
                    token,
                    generatedAt: tokenRes.generatedAt,
                },
            });
            receiptId = receipt.id;

            await adminClient.from('purchase_orders').update({
                token,
                receipt_id: receiptId,
                status: 'delivered',
                delivery_state: 'token_generated',
            }).eq('id', po.id);
            po = { ...po, token, receipt_id: receiptId, status: 'delivered', delivery_state: 'token_generated' };

        } catch (e: any) {
            // token engine or capture failed → release hold and mark failed
            if (token) {
                await markPendingReview(po.id, e.code ?? 'post_token_failed', e.message, {
                    token,
                    deliveryState: 'token_generated_needs_reconciliation',
                });
            } else {
                try { await releaseHold(hold.id); } catch { /* noop */ }
                await markFailed(po.id, e.code ?? 'token_engine_failed', e.message);
            }
            throw new VendingError(e.message, e.code ?? 'token_engine_failed');
        }
    } else {
        // remote_send: generate the credit token, then dispatch it to the meter.
        // The hold stays active until the remote task worker confirms delivery.
        try {
            const tokenRes = await generateCreditToken({
                meterId: meter.meterId,
                customerId: meter.customerId,
                customerName: meter.customerName,
                stationId: meter.stationId,
                amountMinor: input.amountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                reference: po.id,
            });
            token = tokenRes.token;
            const sendRes = await createRemoteSendTask({
                customerId: meter.customerId,
                customerName: meter.customerName,
                meterId: meter.meterId,
                stationId: meter.stationId,
                protocolVersion: meter.protocolVersion,
                token,
                reference: po.id,
            });
            remoteTaskId = sendRes.taskId;
            await adminClient.from('purchase_orders').update({
                token,
                remote_task_id: remoteTaskId,
                status: 'dispatching',
                delivery_state: 'remote_send_pending',
            }).eq('id', po.id);
            po = { ...po, token, remote_task_id: remoteTaskId, status: 'dispatching', delivery_state: 'remote_send_pending' };
        } catch (e: any) {
            if (token) {
                await markPendingReview(po.id, e.code ?? 'remote_send_failed', e.message, {
                    token,
                    deliveryState: 'token_generated_remote_send_failed',
                });
            } else {
                try { await releaseHold(hold.id); } catch { /* noop */ }
                await markFailed(po.id, e.code ?? 'remote_send_failed', e.message);
            }
            throw new VendingError(e.message, e.code ?? 'remote_send_failed');
        }
    }

    await logAction({
        actorUserId: input.vendorUserId,
        actorType: 'vendor_user',
        action: `vending.${input.mode}`,
        targetType: 'purchase_order',
        targetId: po.id,
        after: {
            meterId: meter.meterId,
            amountMinor: input.amountMinor,
            units: preview.units,
            status: po.status,
        },
    });

    return {
        purchaseOrder: po,
        token,
        units: preview.units,
        remoteTaskId,
        receiptId,
        ledgerEntryId,
    };
}

async function markFailed(purchaseOrderId: string, code: string, reason: string) {
    await adminClient.from('purchase_orders').update({
        status: 'failed',
        failure_reason: `${code}: ${reason}`.slice(0, 500),
    }).eq('id', purchaseOrderId);
}

async function markPendingReview(
    purchaseOrderId: string,
    code: string,
    reason: string,
    opts: { token?: string | null; deliveryState?: string | null } = {},
) {
    await adminClient.from('purchase_orders').update({
        token: opts.token ?? undefined,
        status: 'delivery_pending_review',
        delivery_state: opts.deliveryState ?? 'manual_review_required',
        failure_reason: `${code}: ${reason}`.slice(0, 500),
    }).eq('id', purchaseOrderId);
}

export async function reconcileRemoteSendOrders(limit = 25) {
    const { data: rows } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('purchase_mode', 'remote_send')
        .eq('status', 'dispatching')
        .eq('delivery_state', 'remote_send_pending')
        .not('remote_task_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(limit);

    let checked = 0;
    let delivered = 0;
    let reviewed = 0;

    for (const row of (rows ?? []) as PurchaseOrder[]) {
        checked++;
        try {
            const status = await pollRemoteSendStatus(row.remote_task_id!);
            if (status.status === 'pending' || status.status === 'unknown') continue;
            if (status.status === 'failed') {
                await markPendingReview(row.id, 'remote_delivery_failed', 'Remote meter task failed.', {
                    token: row.token,
                    deliveryState: 'remote_send_failed_needs_review',
                });
                reviewed++;
                continue;
            }

            const ledgerEntry = await captureHold({
                holdId: row.hold_id!,
                entryType: 'purchase_debit',
                referenceType: 'purchase_order',
                referenceId: row.id,
                idempotencyKey: ledgerKey('purchase', 'capture', row.id, 'remote-final'),
                memo: `Remote vending · ${row.meter_id}`,
                createdBy: row.created_by,
            });
            const receipt = await createReceipt({
                purchaseOrderId: row.id,
                payload: {
                    receiptNumber: shortReceipt(row.id),
                    customerId: row.customer_id,
                    customerName: row.customer_name,
                    meterId: row.meter_id,
                    stationId: row.station_id,
                    tariffId: row.tariff_id,
                    amountMinor: row.amount_minor,
                    units: row.units_kwh,
                    token: row.token,
                    remoteTaskId: row.remote_task_id,
                    ledgerEntryId: ledgerEntry.id,
                    purchaseMode: 'remote_send',
                },
            });
            await adminClient.from('purchase_orders').update({
                receipt_id: receipt.id,
                status: 'delivered',
                delivery_state: 'remote_send_delivered',
            }).eq('id', row.id);
            delivered++;
        } catch (e: any) {
            await markPendingReview(row.id, e.code ?? 'remote_reconcile_failed', e.message ?? 'Remote reconciliation failed.', {
                token: row.token,
                deliveryState: 'remote_reconcile_failed',
            });
            reviewed++;
        }
    }

    return { checked, delivered, reviewed };
}

function shortReceipt(orderId: string): string {
    return `BV-${orderId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

export interface CreateReceiptInput {
    purchaseOrderId: string;
    payload: Record<string, unknown>;
}

export async function createReceipt(input: CreateReceiptInput) {
    const receiptNumber = (input.payload.receiptNumber as string) ?? shortReceipt(input.purchaseOrderId);
    const { data, error } = await adminClient.from('receipts').insert({
        purchase_order_id: input.purchaseOrderId,
        receipt_number: receiptNumber,
        payload: input.payload,
        print_name: `Beverly_Credit_Token_Receipt_${receiptNumber}_${new Date().toISOString().slice(0, 10)}.pdf`,
    }).select('*').single();
    if (error) throw new VendingError(error.message, 'receipt_failed');
    return data as { id: string; receipt_number: string; payload: Record<string, unknown> };
}

export async function listVendorPurchases(vendorOrganizationId: string, limit = 100) {
    const { data } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('actor_type', 'vendor')
        .eq('actor_id', vendorOrganizationId)
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []) as PurchaseOrder[];
}

export async function getReceiptByOrder(purchaseOrderId: string) {
    const { data } = await adminClient
        .from('receipts')
        .select('*')
        .eq('purchase_order_id', purchaseOrderId)
        .maybeSingle();
    return data;
}
