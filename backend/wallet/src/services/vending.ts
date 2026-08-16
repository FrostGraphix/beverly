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
 * Remote delivery is optional and starts only after the completed token order.
 * It never holds a vend in a backend queue.
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
    lookupMeter, previewPurchaseWithPolicy, generateCreditToken, createRemoteSendTask, pollRemoteSendStatus, assertEnergyVendReady,
    TokenEngineError, type MeterInfo,
} from './token-engine.js';
import { assertWalletCanTransact, findWalletByOwner } from './wallets.js';
import { logAction } from './audit.js';
import {
    abandonWalletIdempotency,
    claimWalletIdempotency,
    completeWalletIdempotency,
    hashIdempotency,
    ledgerKey,
} from './idempotency.js';

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
    meter_type?: 'single_phase' | 'three_phase' | null;
    station_id: string | null;
    tariff_id: string | null;
    amount_minor: number;
    energy_amount_minor?: number | null;
    vat_amount_minor?: number | null;
    vat_rate_basis_points?: number | null;
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
    /** Phase 6: which OEM this meter/vend belongs to (station/meter identity namespacing). */
    oem_id?: string | null;
}

export type MeterType = 'single_phase' | 'three_phase';

export function meterTypeFromInfo(meter: Pick<MeterInfo, 'isThreePhase'>): MeterType {
    return meter.isThreePhase === true ? 'three_phase' : 'single_phase';
}

export interface VendorPurchaseInput {
    vendorOrganizationId: string;
    vendorUserId: string;
    meterId: string;
    amountMinor: number;
    clientIdempotencyKey: string;
    mode: 'wallet';
}

export interface VendorPurchaseResult {
    purchaseOrder: PurchaseOrder;
    token: string | null;
    units: number;
    remoteTaskId: string | null;
    receiptId: string | null;
    ledgerEntryId: string | null;
}

export interface VendorTokenDispatchResult {
    purchaseOrder: PurchaseOrder;
    remoteTaskId: string;
    deliveryState: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
    remark?: string | null;
}

export async function vendorPurchase(input: VendorPurchaseInput): Promise<VendorPurchaseResult> {
    const scope = `vendor_purchase:${input.vendorOrganizationId}`;
    const fingerprint = hashIdempotency([
        input.meterId,
        input.amountMinor,
        input.mode,
    ]);
    let claimed = false;
    try {
        const claim = await claimWalletIdempotency(scope, input.clientIdempotencyKey, fingerprint);
        if (claim.state === 'replay') return claim.responsePayload as VendorPurchaseResult;
        if (claim.state === 'pending') {
            throw new VendingError('This request is still processing. Retry with the same Idempotency-Key.', 'idempotency_in_progress');
        }
        claimed = true;
        const result = await vendorPurchaseImpl(input);
        await completeWalletIdempotency(scope, input.clientIdempotencyKey, result);
        return result;
    } catch (error) {
        if (claimed) {
            await abandonWalletIdempotency(scope, input.clientIdempotencyKey, fingerprint).catch(() => undefined);
        }
        if (error instanceof VendingError) throw error;
        const message = error instanceof Error ? error.message : 'Could not process vend.';
        if (/idempotency key payload mismatch/i.test(message)) {
            throw new VendingError(message, 'idempotency_payload_mismatch');
        }
        throw new VendingError(message, 'idempotency_claim_failed');
    }
}

async function vendorPurchaseImpl(input: VendorPurchaseInput): Promise<VendorPurchaseResult> {
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

    try {
        assertEnergyVendReady();
    } catch (error) {
        if (error instanceof TokenEngineError) throw new VendingError(error.message, error.code);
        throw error;
    }

    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    try {
        assertWalletCanTransact(wallet, 'vend');
    } catch (error: any) {
        throw new VendingError(error.message, error.code ?? 'wallet_inactive');
    }

    // resolve meter + tariff
    let meter: MeterInfo;
    try { meter = await lookupMeter(input.meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new VendingError(e.message, e.code);
        throw e;
    }

    const preview = await previewPurchaseWithPolicy(input.amountMinor, meter.tariffId);
    const meterType = meterTypeFromInfo(meter);

    // create order in 'created' state
    const { data: createdRow, error: createErr } = await adminClient.from('purchase_orders').insert({
        actor_type: 'vendor',
        actor_id: input.vendorOrganizationId,
        wallet_id: wallet.id,
        customer_id: meter.customerId,
        customer_name: meter.customerName,
        meter_id: meter.meterId,
        meter_type: meterType,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        oem_id: meter.oemId ?? null,
        amount_minor: preview.grossAmountMinor,
        energy_amount_minor: preview.energyAmountMinor,
        vat_amount_minor: preview.taxAmountMinor,
        vat_rate_basis_points: preview.vatRateBasisPoints,
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
            amountMinor: preview.grossAmountMinor,
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

    {
        // instant token generation
        try {
            const tokenRes = await generateCreditToken({
                meterId: meter.meterId,
                customerId: meter.customerId,
                customerName: meter.customerName,
                stationId: meter.stationId,
                amountMinor: preview.energyAmountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                isThreePhase: meter.isThreePhase,
                sgc: meter.sgc,
                oemId: meter.oemId,
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
                    meterType,
                    stationId: meter.stationId,
                    tariffId: meter.tariffId,
                    amountMinor: preview.grossAmountMinor,
                    grossAmountMinor: preview.grossAmountMinor,
                    energyAmountMinor: preview.energyAmountMinor,
                    vatAmountMinor: preview.taxAmountMinor,
                    vatRateBasisPoints: preview.vatRateBasisPoints,
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
    }

    await logAction({
        actorUserId: input.vendorUserId,
        actorType: 'vendor_user',
        action: `vending.${input.mode}`,
        targetType: 'purchase_order',
        targetId: po.id,
        after: {
            meterId: meter.meterId,
            amountMinor: preview.grossAmountMinor,
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

export async function dispatchGeneratedVendorToken(
    vendorOrganizationId: string,
    vendorUserId: string,
    purchaseOrderId: string,
): Promise<VendorTokenDispatchResult> {
    const { data, error } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('id', purchaseOrderId)
        .eq('actor_type', 'vendor')
        .eq('actor_id', vendorOrganizationId)
        .maybeSingle();
    if (error) throw new VendingError(error.message, 'purchase_lookup_failed');
    if (!data) throw new VendingError('Purchase order was not found for this vendor.', 'purchase_not_found');

    const po = data as PurchaseOrder;
    if (!po.token) throw new VendingError('This purchase has no generated token to send.', 'token_missing');
    if (po.status !== 'delivered') throw new VendingError('Only delivered token purchases can be remote sent.', 'purchase_not_delivered');
    if (po.remote_task_id && po.delivery_state === 'remote_send_delivered') {
        return {
            purchaseOrder: po,
            remoteTaskId: po.remote_task_id,
            deliveryState: 'remote_send_delivered',
            status: 'success',
            remark: null,
        };
    }
    if (po.remote_task_id && ['remote_send_pending', 'remote_send_pending_review'].includes(String(po.delivery_state))) {
        const status = await pollRemoteSendStatus(po.remote_task_id, {
            meterId: po.meter_id,
            token: po.token,
            oemId: po.oem_id,
        }).catch(() => ({ taskId: po.remote_task_id!, status: 'pending' as const, remark: null }));
        const deliveryState = status.status === 'success'
            ? 'remote_send_delivered'
            : status.status === 'failed'
                ? 'remote_send_failed_needs_manual_entry'
                : 'remote_send_pending_review';
        if (deliveryState !== po.delivery_state) {
            await adminClient.from('purchase_orders').update({
                delivery_state: deliveryState,
                ...(status.status === 'failed'
                    ? { failure_reason: `remote_send_failed: ${status.remark ?? 'Meter rejected the token.'}`.slice(0, 500) }
                    : {}),
            }).eq('id', po.id);
        }
        return {
            purchaseOrder: { ...po, delivery_state: deliveryState },
            remoteTaskId: status.taskId,
            deliveryState,
            status: status.status,
            remark: status.remark ?? null,
        };
    }

    let meter: MeterInfo | null = null;
    try {
        meter = await lookupMeter(po.meter_id, {
            allowArchivedFallback: true,
            allowHistoricalFallback: true,
            oemId: po.oem_id,
        });
    } catch {
        meter = null;
    }
    const stationId = po.station_id || meter?.stationId;
    if (!stationId) {
        throw new VendingError('Remote send needs a station ID for this meter. Enter the token manually and ask admin to bind the meter.', 'remote_send_metadata_missing');
    }

    try {
        const task = await createRemoteSendTask({
            customerId: po.customer_id || meter?.customerId || po.meter_id,
            customerName: po.customer_name || meter?.customerName,
            meterId: po.meter_id,
            stationId,
            protocolVersion: meter?.protocolVersion,
            token: po.token,
            reference: po.id,
            oemId: po.oem_id ?? meter?.oemId,
        });
        const deliveryState = task.status === 'success'
            ? 'remote_send_delivered'
            : task.status === 'failed'
                ? 'remote_send_failed_needs_manual_entry'
                : 'remote_send_pending_review';
        await adminClient.from('purchase_orders').update({
            remote_task_id: task.taskId,
            delivery_state: deliveryState,
        }).eq('id', po.id);
        await logAction({
            actorUserId: vendorUserId,
            actorType: 'vendor_user',
            action: 'vending.wallet_token_remote_send',
            targetType: 'purchase_order',
            targetId: po.id,
            after: { meterId: po.meter_id, remoteTaskId: task.taskId, deliveryState },
        });
        return {
            purchaseOrder: { ...po, remote_task_id: task.taskId, delivery_state: deliveryState },
            remoteTaskId: task.taskId,
            deliveryState,
            status: task.status,
            remark: task.remark ?? null,
        };
    } catch (e: any) {
        const code = e instanceof TokenEngineError ? e.code : e.code ?? 'remote_send_failed';
        const message = e instanceof Error ? e.message : 'Remote send failed.';
        await adminClient.from('purchase_orders').update({
            delivery_state: 'remote_send_failed_needs_manual_entry',
            failure_reason: `${code}: ${message}`.slice(0, 500),
        }).eq('id', po.id);
        throw new VendingError(message, code);
    }
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
            const status = await pollRemoteSendStatus(row.remote_task_id!, {
                meterId: row.meter_id,
                token: row.token ?? undefined,
                oemId: row.oem_id,
            });
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
                    meterType: row.meter_type ?? null,
                    stationId: row.station_id,
                    tariffId: row.tariff_id,
                    amountMinor: row.amount_minor,
                    grossAmountMinor: row.amount_minor,
                    energyAmountMinor: row.energy_amount_minor,
                    vatAmountMinor: row.vat_amount_minor,
                    vatRateBasisPoints: row.vat_rate_basis_points,
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
    const { data: existing, error: lookupError } = await adminClient
        .from('receipts')
        .select('*')
        .eq('purchase_order_id', input.purchaseOrderId)
        .maybeSingle();
    if (lookupError) throw new VendingError(lookupError.message, 'receipt_lookup_failed');
    if (existing) {
        return existing as { id: string; receipt_number: string; payload: Record<string, unknown> };
    }
    const { data, error } = await adminClient.from('receipts').insert({
        purchase_order_id: input.purchaseOrderId,
        receipt_number: receiptNumber,
        payload: input.payload,
        print_name: `Beverly_Credit_Token_Receipt_${receiptNumber}_${new Date().toISOString().slice(0, 10)}.pdf`,
    }).select('*').single();
    if (error) throw new VendingError(error.message, 'receipt_failed');
    return data as { id: string; receipt_number: string; payload: Record<string, unknown> };
}

export async function listVendorPurchases(vendorOrganizationId: string, limit = 100, offset = 0, since?: string) {
    let query = adminClient
        .from('purchase_orders')
        .select('*')
        .eq('actor_type', 'vendor')
        .eq('actor_id', vendorOrganizationId);
    if (since) query = query.gte('created_at', since);
    const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;
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
