/**
 * Customer purchase service.
 *
 * Wraps the shared token engine for customer-initiated purchases.
 * Supports two modes:
 *   wallet     — debits customer wallet, returns token immediately
 *   direct_pay — customer pays via Paystack; token issued after webhook confirms
 *
 * Customer wallet funding uses a separate initiateCustomerFunding() helper
 * (Paystack gateway, same as vendor but owned by customer).
 */
import { adminClient } from '../db/supabase.js';
import { createHold, captureHold, releaseHold } from './ledger.js';
import {
    lookupMeter, previewPurchase, generateCreditToken,
    TokenEngineError, type MeterInfo,
} from './token-engine.js';
import { findWalletByOwner, getOrCreateWallet } from './wallets.js';
import { logAction } from './audit.js';
import { ledgerKey, hashIdempotency } from './idempotency.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { sendSms } from '../adapters/twilio.js';
import { env } from '../config/env.js';
import { createReceipt, type PurchaseOrder } from './vending.js';

export class CustomerPurchaseError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'CustomerPurchaseError';
    }
}

export interface CustomerPurchaseInput {
    customerId: string;
    customerUserId: string;
    customerName: string | null;
    customerEmail: string | null;
    meterId: string;
    amountMinor: number;
    mode: 'wallet' | 'direct_pay';
    clientIdempotencyKey: string;
}

export interface CustomerPurchaseResult {
    purchaseOrder: PurchaseOrder;
    token: string | null;
    units: number;
    receiptId: string | null;
    authorizationUrl: string | null;  // for direct_pay
    reference: string | null;
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
        `Units: ${input.units.toFixed(2)} kWh`,
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
    const msg = await sendSms({
        to: phone,
        body: tokenSmsBody({ ...input, token }),
        from: env.TWILIO_TOKEN_SMS_FROM_NUMBER || env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID || undefined,
        idempotencyKey: `token-sms:${input.receiptId ?? input.meterId}:${input.token}`,
    });
    return { sent: true, sid: msg.sid, status: msg.status };
}

export async function customerPurchase(input: CustomerPurchaseInput): Promise<CustomerPurchaseResult> {
    if (input.amountMinor < 50000) {
        throw new CustomerPurchaseError('Minimum purchase is ₦500.', 'amount_too_low');
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

    // Resolve meter
    let meter: MeterInfo;
    try { meter = await lookupMeter(input.meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, e.code);
        throw e;
    }

    const preview = previewPurchase(input.amountMinor, meter.tariffId);

    // Create order
    const { data: createdRow, error: createErr } = await adminClient.from('purchase_orders').insert({
        actor_type: 'customer',
        actor_id: input.customerId,
        wallet_id: null, // filled in below for wallet mode
        customer_id: input.customerId,
        customer_name: input.customerName,
        meter_id: meter.meterId,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        amount_minor: input.amountMinor,
        units_kwh: preview.units,
        purchase_mode: input.mode,
        status: 'created',
        idempotency_key: idemKey,
        created_by: input.customerUserId,
    }).select('*').single();
    if (createErr) throw new CustomerPurchaseError(createErr.message, 'create_order_failed');
    let po = createdRow as PurchaseOrder;

    if (input.mode === 'wallet') {
        const wallet = await findWalletByOwner('customer', input.customerId);
        if (!wallet) throw new CustomerPurchaseError('Wallet not provisioned.', 'wallet_missing');
        if (wallet.status !== 'active') throw new CustomerPurchaseError('Wallet is not active.', 'wallet_inactive');

        // Update order with wallet id
        await adminClient.from('purchase_orders').update({ wallet_id: wallet.id }).eq('id', po.id);
        po = { ...po, wallet_id: wallet.id };

        // Hold
        let hold;
        try {
            hold = await createHold({
                walletId: wallet.id,
                amountMinor: input.amountMinor,
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
        try {
            const tokenRes = await generateCreditToken({
                meterId: meter.meterId,
                customerId: meter.customerId,
                amountMinor: input.amountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                reference: po.id,
            });

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
                    stationId: meter.stationId,
                    tariffId: meter.tariffId,
                    amountMinor: input.amountMinor,
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
                after: { meterId: meter.meterId, amountMinor: input.amountMinor, status: 'delivered' },
            });

            try {
                const sms = await sendTokenSmsToCustomer({
                    customerId: input.customerId,
                    token: tokenRes.token,
                    meterId: meter.meterId,
                    amountMinor: input.amountMinor,
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

            return {
                purchaseOrder: po,
                token: tokenRes.token,
                units: preview.units,
                receiptId: receipt.id,
                authorizationUrl: null,
                reference: null,
            };
        } catch (e: any) {
            try { await releaseHold(hold.id); } catch { /* noop */ }
            await adminClient.from('purchase_orders').update({
                status: 'failed',
                failure_reason: `${e.code ?? 'token_failed'}: ${e.message}`.slice(0, 500),
            }).eq('id', po.id);
            throw new CustomerPurchaseError(e.message, e.code ?? 'token_failed');
        }
    } else {
        // direct_pay: initialise Paystack, token issued by webhook after payment
        if (!input.customerEmail) {
            throw new CustomerPurchaseError('Email required for card payment.', 'email_required');
        }
        const reference = `CPO-${Date.now()}-${input.customerId.slice(0, 8)}`;

        const { data: pt } = await adminClient.from('payment_transactions').insert({
            gateway: 'paystack',
            gateway_reference: reference,
            actor_type: 'customer',
            actor_id: input.customerId,
            purpose: 'token_purchase',
            amount_minor: input.amountMinor,
            status: 'initiated',
            idempotency_key: `customer_purchase.${po.id}`,
            metadata: { purchase_order_id: po.id },
        }).select('id').single();

        const initRes = await initializeTransaction({
            email: input.customerEmail,
            amountMinor: input.amountMinor,
            reference,
            metadata: { purchase_order_id: po.id, customer_id: input.customerId },
            channels: ['card', 'bank', 'ussd', 'bank_transfer'],
        });

        await adminClient.from('purchase_orders').update({
            payment_transaction_id: (pt as { id: string } | null)?.id ?? null,
            status: 'hold_active',
            delivery_state: 'awaiting_payment',
        }).eq('id', po.id);
        po = { ...po, status: 'hold_active', delivery_state: 'awaiting_payment' };

        await logAction({
            actorUserId: input.customerUserId,
            actorType: 'customer',
            action: 'customer.purchase.direct_pay.init',
            targetType: 'purchase_order',
            targetId: po.id,
            after: { meterId: meter.meterId, amountMinor: input.amountMinor, reference },
        });

        return {
            purchaseOrder: po,
            token: null,
            units: preview.units,
            receiptId: null,
            authorizationUrl: initRes.authorization_url,
            reference,
        };
    }
}

export async function previewCustomerPurchase(meterId: string, amountMinor: number) {
    if (amountMinor < 50000) {
        throw new CustomerPurchaseError('Minimum purchase is ₦500.', 'amount_too_low');
    }
    let meter: MeterInfo;
    try { meter = await lookupMeter(meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, (e as TokenEngineError).code);
        throw e;
    }
    const preview = previewPurchase(amountMinor, meter.tariffId);
    return {
        meterId: meter.meterId,
        customerName: meter.customerName,
        stationId: meter.stationId,
        tariffId: meter.tariffId,
        amountMinor,
        units: preview.units,
        tariffRate: preview.effectivePricePerKwh,
        vatMinor: preview.taxAmountMinor,
        serviceChargeMinor: 0,
        netMinor: amountMinor - preview.taxAmountMinor,
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

    const wallet = await getOrCreateWallet('customer', input.customerId);
    const reference = `CFD-${Date.now()}-${input.customerId.slice(0, 8)}`;

    await adminClient.from('payment_transactions').insert({
        gateway: 'paystack',
        gateway_reference: reference,
        actor_type: 'customer',
        actor_id: input.customerId,
        purpose: 'wallet_funding',
        amount_minor: input.amountMinor,
        status: 'initiated',
        idempotency_key: `customer_fund.${input.customerId}.${reference}`,
        metadata: { wallet_id: wallet.id },
    });

    const initRes = await initializeTransaction({
        email: input.customerEmail,
        amountMinor: input.amountMinor,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: { customer_id: input.customerId, wallet_id: wallet.id, purpose: 'wallet_funding' },
        channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    });

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

export async function linkMeter(customerId: string, customerUserId: string, meterId: string, nickname?: string) {
    // Verify meter exists
    let meter: MeterInfo;
    try { meter = await lookupMeter(meterId); }
    catch (e) {
        if (e instanceof TokenEngineError) throw new CustomerPurchaseError(e.message, (e as TokenEngineError).code);
        throw e;
    }

    // Check not already linked
    const { data: existing } = await adminClient
        .from('customer_meters')
        .select('id')
        .eq('customer_id', customerId)
        .eq('meter_id', meterId)
        .maybeSingle();
    if (existing) throw new CustomerPurchaseError('Meter already linked.', 'already_linked');

    // Cap at 5 meters per customer
    const { count } = await adminClient
        .from('customer_meters')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId);
    if ((count ?? 0) >= 5) throw new CustomerPurchaseError('Maximum 5 meters per account.', 'meter_limit');

    const { data, error } = await adminClient.from('customer_meters').insert({
        customer_id: customerId,
        meter_id: meterId,
        station_id: meter.stationId,
        tariff_id: meter.tariffId,
        nickname: nickname ?? null,
        meter_name: meter.customerName,
    }).select('*').single();
    if (error) throw new CustomerPurchaseError(error.message, 'link_failed');

    await logAction({
        actorUserId: customerUserId,
        actorType: 'customer',
        action: 'customer.meter.link',
        targetType: 'customer_meter',
        targetId: (data as { id: string }).id,
        after: { meterId, stationId: meter.stationId },
    });

    return data;
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
        .order('created_at', { ascending: false });
    return data ?? [];
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
