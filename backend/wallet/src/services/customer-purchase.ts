/**
 * Customer purchase service.
 *
 * Wraps the shared token engine for customer-initiated purchases.
 * Token purchases debit customer wallets and return tokens immediately.
 *
 * Customer wallet funding uses a separate initiateCustomerFunding() helper
 * (Paystack gateway, same as vendor but owned by customer).
 */
import { adminClient } from '../db/supabase.js';
import { createHold, captureHold, releaseHold } from './ledger.js';
import {
    lookupMeter, previewPurchaseWithPolicy, generateCreditToken, createRemoteSendTask, pollRemoteSendStatus, assertEnergyVendReady,
    TokenEngineError, type MeterInfo,
} from './token-engine.js';
import { assertWalletCanTransact, findWalletByOwner, getOrCreateWallet } from './wallets.js';
import { logAction } from './audit.js';
import { ledgerKey, hashIdempotency } from './idempotency.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { sendSms } from '../adapters/twilio.js';
import { env } from '../config/env.js';
import { createReceipt, meterTypeFromInfo, type MeterType, type PurchaseOrder } from './vending.js';
import { PAYMENT_STATUS } from './payment-status.js';
import {
    assertSmsCountryAllowed,
    assertTokenSmsResendAllowed,
    SmsGuardrailError,
    type SmsTrafficKind,
} from './sms-guardrails.js';
import { notifyTokenPurchased } from './notifications.js';
import { assertStationVendAllowed, StationVendScopeError } from './station-vend-scope.js';

export class CustomerPurchaseError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'CustomerPurchaseError';
    }
}

/**
 * Meters a customer may link, keyed by kyc_tier. Mirrors the existing
 * money-cap tiering in customer-kyc.ts (Tier 0 read-only, Tier 1/2 raise
 * wallet spend caps) so verification level gates both spend and meter count.
 */
const METER_CAP_BY_KYC_TIER: Record<number, number> = { 0: 1, 1: 5, 2: 10 };

function meterCapForTier(kycTier: number): number {
    return METER_CAP_BY_KYC_TIER[kycTier] ?? METER_CAP_BY_KYC_TIER[0];
}

async function assertMeterApprovedForPurchase(
    customerId: string,
    meterId: string,
): Promise<{ stationId: string | null }> {
    const { data: link, error } = await adminClient
        .from('customer_meters')
        .select('status, station_id')
        .eq('customer_id', customerId)
        .eq('meter_id', meterId)
        .maybeSingle();
    if (error) {
        throw new CustomerPurchaseError(
            'Meter approval could not be verified. No purchase was started. Please try again shortly.',
            'meter_approval_unavailable',
        );
    }
    if (!link) {
        throw new CustomerPurchaseError('This meter is not linked to your account. Add it under My Meters first.', 'meter_not_linked');
    }
    const approvedMeter = link as { status: string; station_id: string | null };
    const status = approvedMeter.status;
    if (status === 'pending') {
        throw new CustomerPurchaseError('This meter is awaiting admin approval and cannot be used for purchases yet.', 'meter_not_approved');
    }
    if (status === 'rejected') {
        throw new CustomerPurchaseError('This meter link was rejected. Contact support or relink with correct details.', 'meter_rejected');
    }
    if (status !== 'approved') {
        throw new CustomerPurchaseError(
            'This meter is not approved for purchases. Contact support before trying again.',
            'meter_not_approved',
        );
    }
    return { stationId: String(approvedMeter.station_id ?? '').trim() || null };
}

function enforceCustomerMeterStation(approvedStationId: string | null, meterStationId: string | null): void {
    try {
        assertStationVendAllowed(approvedStationId, meterStationId);
    } catch (error) {
        if (error instanceof StationVendScopeError) {
            throw new CustomerPurchaseError(error.message, error.code);
        }
        throw error;
    }
}

function normalizeCustomerPaymentEmail(email: string | null | undefined, purpose: string): string {
    const normalized = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new CustomerPurchaseError(`A valid email is required for ${purpose}.`, 'email_required');
    }
    return normalized;
}

export interface CustomerPurchaseInput {
    customerId: string;
    customerUserId: string;
    customerName: string | null;
    meterId: string;
    amountMinor: number;
    mode: 'wallet';
    clientIdempotencyKey: string;
}

export interface CustomerPurchaseResult {
    purchaseOrder: PurchaseOrder;
    token: string | null;
    units: number;
    receiptId: string | null;
    authorizationUrl: null;
    reference: string | null;
}

export interface CustomerTokenDispatchResult {
    purchaseOrder: PurchaseOrder;
    remoteTaskId: string;
    deliveryState: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
    remark?: string | null;
}

function assertRequestedMeterType(actual: MeterType, requested?: MeterType) {
    if (requested && requested !== actual) {
        throw new CustomerPurchaseError('Selected meter phase does not match the live meter record.', 'meter_type_mismatch');
    }
}

/**
 * Phase the customer declared when onboarding this meter (customer_meters.meter_type).
 * Used only as a fallback when the live energy catalog does not state the phase.
 */
export async function declaredMeterType(customerId: string, meterId: string): Promise<MeterType | null> {
    const { data } = await adminClient
        .from('customer_meters')
        .select('meter_type')
        .eq('customer_id', customerId)
        .eq('meter_id', meterId)
        .maybeSingle();
    const t = (data as any)?.meter_type;
    return t === 'three_phase' || t === 'single_phase' ? t : null;
}

/**
 * Authoritative phase resolution for token generation.
 * The live energy record wins when it states a phase (true OR false);
 * the customer's onboarding declaration only fills a null/unknown.
 */
export function effectiveThreePhase(liveValue: boolean | null | undefined, declared: MeterType | null): boolean {
    if (liveValue === true) return true;
    if (liveValue === false) return false;
    return declared === 'three_phase';
}

export interface TokenSmsResult {
    sent: boolean;
    sid: string | null;
    status: string | null;
    reason?: string;
}

function tokenSmsBody(input: {
    token: string;
    meterId: string;
    amountMinor: number;
    units: number;
    receiptId?: string | null;
}): string {
    const amount = (input.amountMinor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    return [
        'Beverly token purchase successful.',
        `Token: ${input.token}`,
        `Meter: ${input.meterId}`,
        `Amount: ${amount}`,
        `Units: ${input.units.toFixed(4)} kWh`,
        input.receiptId ? `Receipt: ${input.receiptId}` : '',
        'Keep this token safe. Beverly will never ask for your verification code.',
    ].filter(Boolean).join('\n');
}

export async function sendTokenSmsToCustomer(input: {
    customerId: string;
    token: string | null;
    meterId: string;
    amountMinor: number;
    units: number;
    receiptId?: string | null;
    trafficKind?: Extract<SmsTrafficKind, 'token_delivery' | 'token_resend'>;
    actorUserId?: string | null;
}): Promise<TokenSmsResult> {
    if (!input.token) return { sent: false, sid: null, status: null, reason: 'token_missing' };
    const token = input.token;
    const { data: customer } = await adminClient
        .from('customers')
        .select('phone')
        .eq('id', input.customerId)
        .single();
    const phone = (customer as any)?.phone as string | null;
    if (!phone) return { sent: false, sid: null, status: null, reason: 'customer_phone_missing' };
    let to = phone;
    try {
        const decision = input.trafficKind === 'token_resend'
            ? await assertTokenSmsResendAllowed({
                kind: 'token_resend',
                phone,
                actorUserId: input.actorUserId ?? input.customerId,
                actorType: input.actorUserId ? 'customer' : 'system',
                receiptId: input.receiptId,
                metadata: { meterId: input.meterId },
            })
            : await assertSmsCountryAllowed({
                kind: 'token_delivery',
                phone,
                actorUserId: input.actorUserId ?? input.customerId,
                actorType: 'system',
                metadata: { meterId: input.meterId },
            });
        to = decision.phone;
    } catch (error) {
        if (error instanceof SmsGuardrailError) {
            return { sent: false, sid: null, status: null, reason: error.code };
        }
        throw error;
    }
    const msg = await sendSms({
        to,
        body: tokenSmsBody({ ...input, token }),
        from: env.TWILIO_TOKEN_SMS_FROM_NUMBER || env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID || undefined,
        idempotencyKey: `token-sms:${input.receiptId ?? input.meterId}:${input.token}`,
    });
    await logAction({
        actorUserId: input.actorUserId ?? input.customerId,
        actorType: input.actorUserId ? 'customer' : 'system',
        action: 'customer.purchase.token_sms_sent',
        targetType: 'receipt',
        targetId: input.receiptId ?? input.meterId,
        after: { sid: msg.sid, status: msg.status, trafficKind: input.trafficKind ?? 'token_delivery' },
    });
    return { sent: true, sid: msg.sid, status: msg.status };
}

export async function customerPurchase(input: CustomerPurchaseInput): Promise<CustomerPurchaseResult> {
    if (input.amountMinor < 50000) {
        throw new CustomerPurchaseError('Minimum purchase is ₦500.', 'amount_too_low');
    }

    const customerWallet = await findWalletByOwner('customer', input.customerId);
    if (customerWallet) {
        try {
            assertWalletCanTransact(customerWallet, 'buy tokens');
        } catch (error: any) {
            throw new CustomerPurchaseError(error.message, error.code ?? 'wallet_inactive');
        }
    }

    const idemKey = hashIdempotency([
        'customer_purchase', input.customerId, input.meterId,
        input.amountMinor, input.mode, input.clientIdempotencyKey,
    ]);

    // Idempotency short-circuit
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
            receiptId: po.receipt_id,
            authorizationUrl: null,
            reference: null,
        };
    }

    try {
        assertEnergyVendReady();
    } catch (error) {
        if (error instanceof TokenEngineError) throw new CustomerPurchaseError(error.message, error.code);
        throw error;
    }

    // Resolve meter
    let meter: MeterInfo;
    try { meter = await lookupMeter(input.meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, e.code);
        throw e;
    }

    const approvedMeter = await assertMeterApprovedForPurchase(input.customerId, meter.meterId);
    try {
        assertStationVendAllowed(approvedMeter.stationId, meter.stationId);
    } catch (error) {
        if (error instanceof StationVendScopeError) {
            throw new CustomerPurchaseError(error.message, error.code);
        }
        throw error;
    }

    const preview = await previewPurchaseWithPolicy(input.amountMinor, meter.tariffId);
    // Resolve phase: live record wins; customer's onboarding declaration fills any gap.
    const declared = await declaredMeterType(input.customerId, meter.meterId);
    const isThreePhase = effectiveThreePhase(meter.isThreePhase, declared);
    const meterType: MeterType = isThreePhase ? 'three_phase' : 'single_phase';

    // Create order
    const { data: createdRow, error: createErr } = await adminClient.from('purchase_orders').insert({
        actor_type: 'customer',
        actor_id: input.customerId,
        wallet_id: null, // filled in below for wallet mode
        customer_id: input.customerId,
        customer_name: input.customerName,
        meter_id: meter.meterId,
        meter_type: meterType,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        amount_minor: preview.grossAmountMinor,
        energy_amount_minor: preview.energyAmountMinor,
        vat_amount_minor: preview.taxAmountMinor,
        vat_rate_basis_points: preview.vatRateBasisPoints,
        units_kwh: preview.units,
        purchase_mode: input.mode,
        status: 'created',
        idempotency_key: idemKey,
        created_by: input.customerUserId,
    }).select('*').single();
    if (createErr) throw new CustomerPurchaseError(createErr.message, 'create_order_failed');
    let po = createdRow as PurchaseOrder;

    {
        const wallet = customerWallet;
        if (!wallet) throw new CustomerPurchaseError('Wallet not provisioned.', 'wallet_missing');

        // Update order with wallet id
        await adminClient.from('purchase_orders').update({ wallet_id: wallet.id }).eq('id', po.id);
        po = { ...po, wallet_id: wallet.id };

        // Hold
        let hold;
        try {
            hold = await createHold({
                walletId: wallet.id,
                amountMinor: preview.grossAmountMinor,
                referenceType: 'purchase_order',
                referenceId: po.id,
                idempotencyKey: ledgerKey('purchase', 'debit', po.id, 'hold'),
                ttlSeconds: 600,
                createdBy: input.customerUserId,
            });
        } catch (e: any) {
            await adminClient.from('purchase_orders').update({
                status: 'failed',
                failure_reason: `hold_failed: ${e.message}`.slice(0, 500),
            }).eq('id', po.id);
            throw new CustomerPurchaseError(e.message, e.code ?? 'hold_failed');
        }
        await adminClient.from('purchase_orders').update({ hold_id: hold.id, status: 'hold_active' }).eq('id', po.id);
        po = { ...po, hold_id: hold.id, status: 'hold_active' };

        // Generate token
        let issuedToken: string | null = null;
        try {
            const tokenRes = await generateCreditToken({
                meterId: meter.meterId,
                customerId: meter.customerId,
                amountMinor: preview.energyAmountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                isThreePhase,
                sgc: meter.sgc,
                reference: po.id,
            });
            issuedToken = tokenRes.token;

            await captureHold({
                holdId: hold.id,
                entryType: 'purchase_debit',
                referenceType: 'purchase_order',
                referenceId: po.id,
                idempotencyKey: ledgerKey('purchase', 'capture', po.id, 'final'),
                memo: `Token · ${meter.meterId}`,
                createdBy: input.customerUserId,
            });

            const receipt = await createReceipt({
                purchaseOrderId: po.id,
                payload: {
                    receiptNumber: `BV-${po.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
                    customerId: input.customerId,
                    customerName: input.customerName,
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
                    token: tokenRes.token,
                    generatedAt: tokenRes.generatedAt,
                    purchaseMode: 'wallet',
                },
            });

            await adminClient.from('purchase_orders').update({
                token: tokenRes.token,
                receipt_id: receipt.id,
                status: 'delivered',
                delivery_state: 'token_generated',
            }).eq('id', po.id);
            po = { ...po, token: tokenRes.token, receipt_id: receipt.id, status: 'delivered' };

            await logAction({
                actorUserId: input.customerUserId,
                actorType: 'customer',
                action: 'customer.purchase.wallet',
                targetType: 'purchase_order',
                targetId: po.id,
                after: { meterId: meter.meterId, amountMinor: preview.grossAmountMinor, status: 'delivered' },
            });

            try {
                const sms = await sendTokenSmsToCustomer({
                    customerId: input.customerId,
                    token: tokenRes.token,
                    meterId: meter.meterId,
                    amountMinor: preview.grossAmountMinor,
                    units: preview.units,
                    receiptId: receipt.id,
                });
                if (sms.sent) {
                    await logAction({
                        actorUserId: input.customerUserId,
                        actorType: 'system',
                        action: 'customer.purchase.token_sms_sent',
                        targetType: 'purchase_order',
                        targetId: po.id,
                        after: { sid: sms.sid, status: sms.status },
                    });
                }
            } catch (e: any) {
                await logAction({
                    actorUserId: input.customerUserId,
                    actorType: 'system',
                    action: 'customer.purchase.token_sms_failed',
                    targetType: 'purchase_order',
                    targetId: po.id,
                    after: { reason: e?.message ?? 'sms_failed' },
                });
            }

            // In-app + email notification (SMS handled above by token SMS system)
            notifyTokenPurchased(input.customerId, {
                meterId: meter.meterId,
                units: preview.units,
                amountMinor: preview.grossAmountMinor,
                token: tokenRes.token,
            }).catch(() => undefined);

            return {
                purchaseOrder: po,
                token: tokenRes.token,
                units: preview.units,
                receiptId: receipt.id,
                authorizationUrl: null,
                reference: null,
            };
        } catch (e: any) {
            if (issuedToken) {
                await adminClient.from('purchase_orders').update({
                    token: issuedToken,
                    status: 'delivery_pending_review',
                    delivery_state: 'token_generated_needs_reconciliation',
                    failure_reason: `${e.code ?? 'post_token_failed'}: ${e.message}`.slice(0, 500),
                }).eq('id', po.id);
            } else {
                try { await releaseHold(hold.id); } catch { /* noop */ }
                await adminClient.from('purchase_orders').update({
                    status: 'failed',
                    failure_reason: `${e.code ?? 'token_failed'}: ${e.message}`.slice(0, 500),
                }).eq('id', po.id);
            }
            throw new CustomerPurchaseError(e.message, e.code ?? 'token_failed');
        }
    }
}

export async function dispatchGeneratedCustomerToken(
    customerId: string,
    customerUserId: string,
    purchaseOrderId: string,
): Promise<CustomerTokenDispatchResult> {
    const { data, error } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('id', purchaseOrderId)
        .eq('actor_type', 'customer')
        .eq('customer_id', customerId)
        .maybeSingle();
    if (error) throw new CustomerPurchaseError(error.message, 'purchase_lookup_failed');
    if (!data) throw new CustomerPurchaseError('Purchase order was not found for this customer.', 'purchase_not_found');

    const po = data as PurchaseOrder;
    if (!po.token) throw new CustomerPurchaseError('This purchase has no generated token to send.', 'token_missing');
    if (po.status !== 'delivered') throw new CustomerPurchaseError('Only delivered token purchases can be remote sent.', 'purchase_not_delivered');
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
        });
    } catch {
        meter = null;
    }
    const stationId = po.station_id || meter?.stationId;
    if (!stationId) {
        throw new CustomerPurchaseError(
            'Remote send needs a station ID for this meter. Enter the token manually and contact support.',
            'remote_send_metadata_missing',
        );
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
            actorUserId: customerUserId,
            actorType: 'customer',
            action: 'customer.purchase.wallet_token_remote_send',
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
        throw new CustomerPurchaseError(message, code);
    }
}

export async function previewCustomerPurchase(meterId: string, amountMinor: number, customerId?: string) {
    if (amountMinor < 50000) {
        throw new CustomerPurchaseError('Minimum purchase is ₦500.', 'amount_too_low');
    }
    let meter: MeterInfo;
    try { meter = await lookupMeter(meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, (e as TokenEngineError).code);
        throw e;
    }
    if (customerId) {
        const approvedMeter = await assertMeterApprovedForPurchase(customerId, meter.meterId);
        enforceCustomerMeterStation(approvedMeter.stationId, meter.stationId);
    }
    const preview = await previewPurchaseWithPolicy(amountMinor, meter.tariffId);
    const declared = customerId ? await declaredMeterType(customerId, meter.meterId) : null;
    const isThreePhase = effectiveThreePhase(meter.isThreePhase, declared);
    return {
        meterId: meter.meterId,
        meterType: isThreePhase ? 'three_phase' : 'single_phase',
        isThreePhase,
        customerName: meter.customerName,
        stationId: meter.stationId,
        tariffId: meter.tariffId,
        amountMinor: preview.grossAmountMinor,
        units: preview.units,
        tariffRate: preview.effectivePricePerKwh,
        vatMinor: preview.taxAmountMinor,
        serviceChargeMinor: 0,
        netMinor: preview.energyAmountMinor,
        grossAmountMinor: preview.grossAmountMinor,
        energyAmountMinor: preview.energyAmountMinor,
        vatRateBasisPoints: preview.vatRateBasisPoints,
    };
}

// ── Customer wallet funding via Paystack ──────────────────────────────────────

export interface CustomerFundingInput {
    customerId: string;
    customerUserId: string;
    customerEmail: string;
    amountMinor: number;
    callbackUrl?: string;
}

export async function initiateCustomerFunding(input: CustomerFundingInput): Promise<{
    authorizationUrl: string;
    reference: string;
}> {
    if (input.amountMinor < 50000) {
        throw new CustomerPurchaseError('Minimum top-up is ₦500.', 'amount_too_low');
    }

    const email = normalizeCustomerPaymentEmail(input.customerEmail, 'wallet top-up');
    const wallet = await getOrCreateWallet('customer', input.customerId);
    try {
        assertWalletCanTransact(wallet, 'receive funding');
    } catch (error: any) {
        throw new CustomerPurchaseError(error.message, error.code ?? 'wallet_inactive');
    }
    const reference = `CFD-${Date.now()}-${input.customerId.slice(0, 8)}`;

    const { data: pt, error: ptErr } = await adminClient.from('payment_transactions').insert({
        gateway: 'paystack',
        gateway_reference: reference,
        actor_type: 'customer',
        actor_id: input.customerId,
        purpose: 'wallet_funding',
        amount_minor: input.amountMinor,
        status: PAYMENT_STATUS.INITIATED,
        idempotency_key: `customer_fund.${input.customerId}.${reference}`,
        metadata: { wallet_id: wallet.id },
    }).select('id, metadata').single();
    if (ptErr) {
        throw new CustomerPurchaseError(ptErr.message, 'create_payment_failed');
    }

    let initRes;
    try {
        initRes = await initializeTransaction({
            email,
            amountMinor: input.amountMinor,
            reference,
            callbackUrl: input.callbackUrl,
            metadata: { customer_id: input.customerId, wallet_id: wallet.id, purpose: 'wallet_funding' },
            channels: ['card', 'bank', 'ussd', 'bank_transfer'],
        });
    } catch (error: any) {
        const now = new Date().toISOString();
        const message = error?.message ?? 'Paystack checkout could not be initialized.';
        await adminClient.from('payment_transactions').update({
            status: PAYMENT_STATUS.FAILED,
            metadata: {
                ...(((pt as any).metadata ?? {}) as Record<string, unknown>),
                wallet_id: wallet.id,
                checkout_init_failed_at: now,
                checkout_init_error: message,
            },
            updated_at: now,
        }).eq('id', (pt as { id: string }).id);
        await logAction({
            actorUserId: input.customerUserId,
            actorType: 'customer',
            action: 'customer.fund.initiate_failed',
            targetType: 'wallet',
            targetId: wallet.id,
            after: { amountMinor: input.amountMinor, reference, reason: message },
        }).catch(() => undefined);
        throw new CustomerPurchaseError(message, 'payment_init_failed');
    }

    await logAction({
        actorUserId: input.customerUserId,
        actorType: 'customer',
        action: 'customer.fund.initiate',
        targetType: 'wallet',
        targetId: wallet.id,
        after: { amountMinor: input.amountMinor, reference },
    });

    return { authorizationUrl: initRes.authorization_url, reference };
}

// ── Meter linking ─────────────────────────────────────────────────────────────

export async function linkMeter(customerId: string, customerUserId: string, meterId: string, nickname?: string, requestedMeterType?: MeterType) {
    // Verify meter exists
    let meter: MeterInfo;
    try { meter = await lookupMeter(meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, (e as TokenEngineError).code);
        throw e;
    }
    const meterType = meterTypeFromInfo(meter);
    assertRequestedMeterType(meterType, requestedMeterType);

    // A rejected claim is historical, not an active link. Keep its row so the
    // lifecycle remains stable, then reset it to a fresh pending review below.
    const { data: existing, error: existingError } = await adminClient
        .from('customer_meters')
        .select('id, status')
        .eq('customer_id', customerId)
        .eq('meter_id', meterId)
        .maybeSingle();
    if (existingError) throw new CustomerPurchaseError(existingError.message, 'link_failed');
    if (existing?.status === 'pending') {
        throw new CustomerPurchaseError('This meter link is already awaiting review.', 'already_pending');
    }
    if (existing?.status === 'approved') {
        throw new CustomerPurchaseError('This meter is already linked and approved.', 'already_linked');
    }

    // Cap by KYC tier — higher-verified customers may link more meters.
    const { data: customerRow } = await adminClient
        .from('customers')
        .select('kyc_tier')
        .eq('id', customerId)
        .maybeSingle();
    const kycTier = Number((customerRow as { kyc_tier?: number } | null)?.kyc_tier ?? 0);
    const meterCap = meterCapForTier(kycTier);
    const { count } = await adminClient
        .from('customer_meters')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .not('status', 'eq', 'rejected');
    if ((count ?? 0) >= meterCap) {
        throw new CustomerPurchaseError(`Maximum ${meterCap} meters per account at your verification level.`, 'meter_limit');
    }

    const linkValues = {
        customer_id: customerId,
        meter_id: meterId,
        meter_type: meterType,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        nickname: nickname ?? null,
        meter_name: meter.customerName,
        status: 'pending',
    } as const;
    const linkMutation = existing?.status === 'rejected'
        ? adminClient.from('customer_meters').update({
            ...linkValues,
            reviewed_by: null,
            reviewed_at: null,
            review_note: null,
            rejection_reason: null,
        }).eq('id', existing.id).eq('status', 'rejected')
        : adminClient.from('customer_meters').insert(linkValues);
    const { data, error } = await linkMutation.select('*').maybeSingle();
    if (error) throw new CustomerPurchaseError(error.message, 'link_failed');
    if (!data) throw new CustomerPurchaseError('This meter link is already awaiting review.', 'already_pending');

    await logAction({
        actorUserId: customerUserId,
        actorType: 'customer',
        action: 'customer.meter.link',
        targetType: 'customer_meter',
        targetId: (data as { id: string }).id,
        before: existing ? { status: existing.status } : undefined,
        after: { meterId, meterType, stationId: meter.stationId, status: 'pending', resubmitted: Boolean(existing) },
    });

    return { ...(data as Record<string, unknown>), resubmitted: Boolean(existing) };
}

export async function unlinkMeter(customerId: string, customerUserId: string, meterRowId: string) {
    const { data: row } = await adminClient
        .from('customer_meters')
        .select('id, meter_id')
        .eq('id', meterRowId)
        .eq('customer_id', customerId)
        .maybeSingle();
    if (!row) throw new CustomerPurchaseError('Meter not found.', 'not_found');

    await adminClient.from('customer_meters').delete().eq('id', meterRowId);

    await logAction({
        actorUserId: customerUserId,
        actorType: 'customer',
        action: 'customer.meter.unlink',
        targetType: 'customer_meter',
        targetId: meterRowId,
        after: { meterId: (row as { meter_id: string }).meter_id },
    });
}

export async function listCustomerMeters(customerId: string) {
    const { data } = await adminClient
        .from('customer_meters')
        .select('*')
        .eq('customer_id', customerId)
        .not('status', 'eq', 'rejected')
        .order('created_at', { ascending: false });
    return data ?? [];
}

export async function listCustomerMeterLinkHistory(customerId: string, limit = 100, offset = 0) {
    const pageSize = Math.min(Math.max(Math.trunc(limit) || 25, 1), 100);
    const pageOffset = Math.max(Math.trunc(offset) || 0, 0);
    const { data, error, count } = await adminClient
        .from('customer_meter_link_history')
        .select('id, customer_meter_id, meter_id, station_id, event_type, previous_status, new_status, reason, note, created_at', { count: 'exact' })
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);
    if (error) throw new CustomerPurchaseError(error.message, 'history_unavailable');
    return { history: data ?? [], total: count ?? 0, limit: pageSize, offset: pageOffset };
}

export async function listCustomerPurchases(customerId: string, limit = 100) {
    const { data } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('customer_id', customerId)
        .eq('actor_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(limit);
    return data ?? [];
}
