import type { VerifyResult } from '../adapters/paystack.js';
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { postEntry } from './ledger.js';
import { logAction } from './audit.js';
import { sendTokenSmsToCustomer } from './customer-purchase.js';
import { notifyTokenPurchased, notifyWalletFunded } from './notifications.js';
import { assertWalletCanTransact, findWalletByOwner } from './wallets.js';
import { PAYMENT_STATUS, PAYMENT_SUCCEEDED_STATUSES } from './payment-status.js';

type PaymentTransaction = Record<string, any>;

export type PaystackFulfillmentSource = 'webhook' | 'scheduler';

export interface PaystackFulfillmentResult {
    status: 'fulfilled' | 'already_fulfilled' | 'blocked';
    reason?: string;
}

interface FulfillmentStepResult {
    blocked?: PaystackFulfillmentResult;
    metadata?: Record<string, unknown>;
}

function sourceActor(source: PaystackFulfillmentSource) {
    return source === 'webhook' ? 'webhook' : 'system';
}

async function findWalletById(walletId: string) {
    const { data, error } = await adminClient
        .from('wallets')
        .select('id, owner_type, owner_id, currency, status, daily_debit_cap_minor, monthly_debit_cap_minor, created_at')
        .eq('id', walletId)
        .maybeSingle();
    if (error) throw error;
    return data as any;
}

async function ledgerEntryExists(idempotencyKey: string): Promise<boolean> {
    const { data } = await adminClient
        .from('wallet_ledger_entries')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
    return Boolean(data);
}

function verifiedMetadata(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
    extra: Record<string, unknown> = {},
) {
    return {
        ...((tx.metadata ?? {}) as Record<string, unknown>),
        authorization: verified.authorization ?? null,
        paystack: verified,
        fulfillment_source: source,
        ...extra,
    };
}

async function markPaymentSucceeded(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
    extraMetadata: Record<string, unknown> = {},
) {
    const now = new Date().toISOString();
    const { error } = await adminClient
        .from('payment_transactions')
        .update({
            status: PAYMENT_STATUS.SUCCEEDED,
            completed_at: verified.paid_at ?? now,
            channel: verified.channel,
            metadata: verifiedMetadata(tx, verified, source, {
                fulfillment_completed_at: now,
                ...extraMetadata,
            }),
            updated_at: now,
            fulfillment_claimed_at: null,
            fulfillment_lease_token: null,
            fulfillment_last_error: null,
            fulfillment_next_retry_at: null,
        })
        .eq('id', tx.id);
    if (error) throw error;
}

async function blockSuccessfulPaymentFulfillment(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
    error: any,
): Promise<PaystackFulfillmentResult> {
    const code = error?.code ?? 'wallet_inactive';
    const prefix = code === 'payment_amount_mismatch'
        ? 'paystack_amount_mismatch'
        : 'wallet_inactive_on_paystack_success';
    const blockedAt = new Date().toISOString();

    if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const purchaseOrderId = tx.metadata?.purchase_order_id;
        if (purchaseOrderId) {
            await adminClient
                .from('purchase_orders')
                .update({
                    status: 'delivery_pending_review',
                    failure_reason: `${prefix}: ${code}`.slice(0, 500),
                    delivery_state: 'wallet_state_blocked_needs_review',
                })
                .eq('id', purchaseOrderId);
        }
    }

    if (tx.purpose === 'wallet_funding' && tx.actor_type === 'vendor') {
        const fundingRequestId = tx.metadata?.funding_request_id;
        if (fundingRequestId) {
            await adminClient
                .from('funding_requests')
                .update({
                    status: 'under_review',
                    rejection_reason: `${prefix}: ${code}`.slice(0, 500),
                })
                .eq('id', fundingRequestId)
                .in('status', ['initiated', 'proof_uploaded']);
        }
    }

    await markPaymentSucceeded(tx, verified, source, {
        fulfillment_blocked: true,
        fulfillment_blocked_reason: code,
        fulfillment_blocked_at: blockedAt,
        requires_ops_review: true,
    });
    await logAction({
        actorUserId: null,
        actorType: sourceActor(source),
        action: 'paystack.fulfillment_blocked',
        targetType: 'payment_transaction',
        targetId: tx.id,
        after: { reason: code, source },
    });
    return { status: 'blocked', reason: code };
}

async function fulfillVendorFunding(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const fundingId = tx.metadata?.funding_request_id as string | undefined;
    if (!fundingId) return {};

    const { data: fr } = await adminClient
        .from('funding_requests')
        .select('*')
        .eq('id', fundingId)
        .maybeSingle();
    if (!fr) return {};
    if (Number((fr as any).amount_minor) !== Number(tx.amount_minor)) {
        return {
            blocked: await blockSuccessfulPaymentFulfillment(
                tx,
                verified,
                source,
                { code: 'payment_amount_mismatch' },
            ),
        };
    }

    const wallet = await findWalletByOwner('vendor', (fr as any).vendor_organization_id);
    try {
        assertWalletCanTransact(wallet, 'receive funding');
    } catch (error: any) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, error) };
    }

    if (wallet.id !== (fr as any).wallet_id) {
        await adminClient
            .from('funding_requests')
            .update({ wallet_id: wallet.id })
            .eq('id', (fr as any).id);
    }

    await postEntry({
        walletId: wallet.id,
        direction: 'credit',
        amountMinor: (fr as any).amount_minor,
        entryType: 'payment_credit',
        referenceType: 'funding_request',
        referenceId: (fr as any).id,
        idempotencyKey: `funding.${(fr as any).id}.paystack.credit`,
        memo: `Paystack ${tx.gateway_reference}`,
        createdBy: (fr as any).submitted_by,
        audit: { actorType: sourceActor(source) },
    });
    await adminClient
        .from('funding_requests')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
        })
        .eq('id', (fr as any).id);
    return {};
}

async function fulfillCustomerWalletFunding(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const walletId = tx.metadata?.wallet_id as string | undefined;
    if (!walletId) return {};

    const wallet = await findWalletById(walletId);
    try {
        assertWalletCanTransact(wallet, 'receive funding');
    } catch (error: any) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, error) };
    }

    const idempotencyKey = `customer_fund.${tx.id}.paystack.credit`;
    const alreadyCredited = await ledgerEntryExists(idempotencyKey);
    await postEntry({
        walletId: wallet.id,
        direction: 'credit',
        amountMinor: verified.amount,
        entryType: 'payment_credit',
        referenceType: 'payment_transaction',
        referenceId: tx.id,
        idempotencyKey,
        memo: `Wallet top-up · Paystack ${tx.gateway_reference}`,
        createdBy: tx.actor_id,
        audit: { actorType: sourceActor(source) },
    });

    if (!alreadyCredited && !tx.metadata?.wallet_funded_notified_at) {
        notifyWalletFunded(tx.actor_id, {
            amountMinor: verified.amount,
            reference: tx.gateway_reference,
        }).catch(() => undefined);
        return { metadata: { wallet_funded_notified_at: new Date().toISOString() } };
    }
    return {};
}

async function fulfillCustomerTokenPurchase(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const purchaseOrderId = tx.metadata?.purchase_order_id as string | undefined;
    if (!purchaseOrderId) return {};

    const { data: po } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('id', purchaseOrderId)
        .maybeSingle();
    if (!po || ['delivered', 'failed'].includes((po as any).status)) return {};
    if (Number((po as any).amount_minor) !== Number(tx.amount_minor)) {
        return {
            blocked: await blockSuccessfulPaymentFulfillment(
                tx,
                verified,
                source,
                { code: 'payment_amount_mismatch' },
            ),
        };
    }

    let issuedToken: string | null = null;
    try {
        const wallet = await findWalletByOwner('customer', (po as any).customer_id ?? tx.actor_id);
        if (wallet) assertWalletCanTransact(wallet, 'buy tokens');

        const { generateCreditToken, lookupMeter, previewPurchase } = await import('./token-engine.js');
        const { createReceipt } = await import('./vending.js');
        const { declaredMeterType, effectiveThreePhase } = await import('./customer-purchase.js');
        const meter = await lookupMeter((po as any).meter_id);
        const preview = previewPurchase((po as any).amount_minor, meter.tariffId);
        const declared = await declaredMeterType((po as any).customer_id, meter.meterId);
        const isThreePhase = effectiveThreePhase(meter.isThreePhase, declared);
        const meterType = isThreePhase ? 'three_phase' : 'single_phase';
        const tokenRes = await generateCreditToken({
            meterId: meter.meterId,
            customerId: meter.customerId,
            amountMinor: preview.energyAmountMinor,
            units: preview.units,
            tariffId: meter.tariffId,
            isThreePhase,
            sgc: meter.sgc,
            reference: purchaseOrderId,
        });
        issuedToken = tokenRes.token;
        const receipt = await createReceipt({
            purchaseOrderId,
            payload: {
                receiptNumber: `BV-${purchaseOrderId.replace(/-/g,'').slice(0,12).toUpperCase()}`,
                customerId: (po as any).customer_id,
                meterId: meter.meterId,
                meterType,
                amountMinor: (po as any).amount_minor,
                grossAmountMinor: preview.grossAmountMinor,
                energyAmountMinor: preview.energyAmountMinor,
                vatAmountMinor: preview.taxAmountMinor,
                vatRateBasisPoints: preview.vatRateBasisPoints,
                units: preview.units,
                token: tokenRes.token,
                generatedAt: tokenRes.generatedAt,
                purchaseMode: 'direct_pay',
            },
        });
        await adminClient
            .from('purchase_orders')
            .update({
                token: tokenRes.token,
                receipt_id: receipt.id,
                meter_type: meterType,
                status: 'delivered',
                delivery_state: 'token_generated',
            })
            .eq('id', purchaseOrderId);

        try {
            await sendTokenSmsToCustomer({
                customerId: (po as any).customer_id,
                token: tokenRes.token,
                meterId: meter.meterId,
                amountMinor: (po as any).amount_minor,
                units: preview.units,
                receiptId: receipt.id,
            });
        } catch (smsError: any) {
            await logAction({
                actorUserId: null,
                actorType: 'system',
                action: 'customer.purchase.token_sms_failed',
                targetType: 'purchase_order',
                targetId: purchaseOrderId,
                after: { reason: smsError?.message ?? 'sms_failed' },
            });
        }

        notifyTokenPurchased((po as any).customer_id, {
            meterId: meter.meterId,
            units: preview.units,
            amountMinor: (po as any).amount_minor,
            token: tokenRes.token,
        }).catch(() => undefined);
    } catch (error: any) {
        const now = new Date().toISOString();
        await adminClient
            .from('purchase_orders')
            .update({
                token: issuedToken ?? undefined,
                status: 'delivery_pending_review',
                failure_reason: `direct_pay_token_failed: ${error.message}`.slice(0, 500),
            })
            .eq('id', purchaseOrderId);
        return {
            metadata: {
                requires_ops_review: true,
                token_delivery_pending_review_at: now,
                token_delivery_error: (error?.message ?? 'direct_pay_token_failed').slice(0, 500),
            },
        };
    }
    return {};
}

export async function fulfillSuccessfulPaystackTransaction(input: {
    tx: PaymentTransaction;
    verified: VerifyResult;
    source: PaystackFulfillmentSource;
}): Promise<PaystackFulfillmentResult> {
    const leaseToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await adminClient.rpc('fn_claim_payment_fulfillment', {
        p_payment_transaction_id: input.tx.id,
        p_lease_token: leaseToken,
    });
    if (claimError) throw claimError;
    if (!claimed) return { status: 'already_fulfilled' };
    try {
        return await fulfillClaimedPaystackTransaction(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'payment_fulfillment_failed';
        try {
            await adminClient.rpc('fn_release_payment_fulfillment', {
                p_payment_transaction_id: input.tx.id,
                p_lease_token: leaseToken,
                p_error: message,
            });
        } catch {
            // The original fulfillment error remains authoritative.
        }
        throw error;
    }
}

async function fulfillClaimedPaystackTransaction(input: {
    tx: PaymentTransaction;
    verified: VerifyResult;
    source: PaystackFulfillmentSource;
}): Promise<PaystackFulfillmentResult> {
    const { tx, verified, source } = input;
    if ((PAYMENT_SUCCEEDED_STATUSES as readonly string[]).includes(tx.status) && tx.metadata?.fulfillment_completed_at) {
        return { status: 'already_fulfilled' };
    }
    if (Number(tx.amount_minor) !== Number(verified.amount)) {
        return blockSuccessfulPaymentFulfillment(
            tx,
            verified,
            source,
            { code: 'payment_amount_mismatch' },
        );
    }

    let extraMetadata: Record<string, unknown> = {};
    if (tx.purpose === 'wallet_funding' && tx.actor_type === 'vendor') {
        const result = await fulfillVendorFunding(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = result.metadata ?? {};
    } else if (tx.purpose === 'wallet_funding' && tx.actor_type === 'customer') {
        const result = await fulfillCustomerWalletFunding(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = result.metadata ?? {};
    } else if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const result = await fulfillCustomerTokenPurchase(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = result.metadata ?? {};
    }

    await markPaymentSucceeded(tx, verified, source, extraMetadata);
    await logAction({
        actorUserId: null,
        actorType: sourceActor(source),
        action: source === 'webhook' ? 'paystack.charge.success' : 'paystack.charge.reconciled',
        targetType: 'payment_transaction',
        targetId: tx.id,
        after: { reference: tx.gateway_reference, channel: verified.channel },
    });
    return { status: 'fulfilled' };
}
