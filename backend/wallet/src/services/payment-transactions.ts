import type { VerifyResult } from '../adapters/paystack.js';
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { postEntry } from './ledger.js';
import { logAction } from './audit.js';
import { sendTokenSmsToCustomer } from './customer-purchase.js';
import { notifyTokenPurchased, notifyWalletFunded } from './notifications.js';
import { assertWalletCanTransact, findWalletByOwner, type Wallet } from './wallets.js';
import { PAYMENT_STATUS, PAYMENT_SUCCEEDED_STATUSES } from './payment-status.js';
import { blockCodeFor, classifyGatewayAmount, isCreditable } from './gateway-amounts.js';
import {
    fundingCreditKey,
    legacyPaystackFundingCreditKey,
    UNCREDITABLE_FUNDING_STATUSES,
} from './funding-credit.js';

type PaymentTransaction = Record<string, any>;

export type PaystackFulfillmentSource = 'webhook' | 'scheduler' | 'callback' | 'manual_retry';

export interface PaystackFulfillmentResult {
    status: 'fulfilled' | 'already_fulfilled' | 'blocked';
    reason?: string;
}

interface FulfillmentStepResult {
    blocked?: PaystackFulfillmentResult;
    metadata?: Record<string, unknown>;
}

function sourceActor(source: PaystackFulfillmentSource) {
    if (source === 'webhook') return 'webhook';
    if (source === 'manual_retry') return 'staff';
    return 'system';
}

export class PaymentRetryError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'PaymentRetryError'; }
}

/**
 * Clear a blocked payment so fulfillment can run again.
 *
 * Blocking sets `completed_at`, and `fn_claim_payment_fulfillment` refuses to
 * claim anything with a `completed_at` — deliberately, so a blocked payment is
 * never re-driven by accident. That also means a payment blocked for a reason
 * since fixed (a wallet unfrozen, a mismatch explained) can never recover on
 * its own. This is the one supervised way back in.
 */
export async function clearPaymentFulfillmentBlock(input: {
    paymentTransactionId: string;
    clearedBy: string;
}): Promise<PaymentTransaction> {
    const { data: tx, error } = await adminClient
        .from('payment_transactions')
        .select('*')
        .eq('id', input.paymentTransactionId)
        .maybeSingle();
    if (error) throw error;
    if (!tx) throw new PaymentRetryError('Payment transaction not found.', 'not_found');
    if ((tx as any).gateway !== 'paystack') {
        throw new PaymentRetryError('Only Paystack payments can be re-driven.', 'unsupported_gateway');
    }
    if ((tx as any).status !== PAYMENT_STATUS.REQUIRES_REVIEW) {
        throw new PaymentRetryError(
            `Only payments held for review can be retried (current status: ${(tx as any).status}).`,
            'invalid_state',
        );
    }

    const now = new Date().toISOString();
    const { data: cleared, error: clearError } = await adminClient
        .from('payment_transactions')
        .update({
            status: PAYMENT_STATUS.PENDING,
            completed_at: null,
            fulfillment_claimed_at: null,
            fulfillment_lease_token: null,
            fulfillment_last_error: null,
            fulfillment_next_retry_at: null,
            metadata: {
                ...(((tx as any).metadata ?? {}) as Record<string, unknown>),
                fulfillment_blocked: false,
                fulfillment_block_cleared_at: now,
                fulfillment_block_cleared_by: input.clearedBy,
                requires_ops_review: false,
            },
            updated_at: now,
        })
        .eq('id', input.paymentTransactionId)
        .eq('status', PAYMENT_STATUS.REQUIRES_REVIEW)
        .select('*')
        .maybeSingle();
    if (clearError) throw clearError;
    if (!cleared) throw new PaymentRetryError('Another reviewer already acted on this payment.', 'concurrent_update');

    await logAction({
        actorUserId: input.clearedBy,
        actorType: 'staff',
        action: 'paystack.fulfillment_block_cleared',
        targetType: 'payment_transaction',
        targetId: input.paymentTransactionId,
        before: { status: PAYMENT_STATUS.REQUIRES_REVIEW, reason: (tx as any).fulfillment_last_error },
        after: { status: PAYMENT_STATUS.PENDING },
    });
    return cleared as PaymentTransaction;
}

async function findWalletById(walletId: string): Promise<Wallet | null> {
    const { data, error } = await adminClient
        .from('wallets')
        .select('id, owner_type, owner_id, currency, status, daily_debit_cap_minor, monthly_debit_cap_minor, created_at')
        .eq('id', walletId)
        .maybeSingle();
    if (error) throw error;
    return (data as Wallet | null) ?? null;
}

async function ledgerEntryExists(idempotencyKey: string): Promise<boolean> {
    const { data, error } = await adminClient
        .from('wallet_ledger_entries')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
    if (error) throw error;
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
    error: { code?: string },
): Promise<PaystackFulfillmentResult> {
    const code = error?.code ?? 'wallet_inactive';
    const prefix = code === 'payment_amount_mismatch'
        ? 'paystack_amount_mismatch'
        : code === 'payment_overpaid'
            ? 'paystack_overpaid'
            : code.startsWith('payment_')
                ? 'paystack_verification_mismatch'
                : code.startsWith('funding_')
                    ? 'paystack_funding_state'
                    : 'wallet_inactive_on_paystack_success';
    const blockedAt = new Date().toISOString();

    if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const purchaseOrderId = tx.metadata?.purchase_order_id;
        if (purchaseOrderId) {
            const { error: purchaseUpdateError } = await adminClient
                .from('purchase_orders')
                .update({
                    status: 'delivery_pending_review',
                    failure_reason: `${prefix}: ${code}`.slice(0, 500),
                    delivery_state: 'wallet_state_blocked_needs_review',
                })
                .eq('id', purchaseOrderId);
            if (purchaseUpdateError) throw purchaseUpdateError;
        }
    }

    if (tx.purpose === 'wallet_funding' && tx.actor_type === 'vendor') {
        const fundingRequestId = tx.metadata?.funding_request_id;
        if (fundingRequestId) {
            const { error: fundingUpdateError } = await adminClient
                .from('funding_requests')
                .update({
                    status: 'under_review',
                    rejection_reason: `${prefix}: ${code}`.slice(0, 500),
                })
                .eq('id', fundingRequestId)
                .in('status', ['initiated', 'proof_uploaded']);
            if (fundingUpdateError) throw fundingUpdateError;
        }
    }

    const { error: paymentUpdateError } = await adminClient
        .from('payment_transactions')
        .update({
            status: PAYMENT_STATUS.REQUIRES_REVIEW,
            completed_at: verified.paid_at ?? blockedAt,
            channel: verified.channel,
            metadata: verifiedMetadata(tx, verified, source, {
                fulfillment_blocked: true,
                fulfillment_blocked_reason: code,
                fulfillment_blocked_at: blockedAt,
                requires_ops_review: true,
            }),
            updated_at: blockedAt,
            fulfillment_claimed_at: null,
            fulfillment_lease_token: null,
            fulfillment_last_error: code,
            fulfillment_next_retry_at: null,
        })
        .eq('id', tx.id);
    if (paymentUpdateError) throw paymentUpdateError;
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
    if (!fundingId) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'funding_request_missing' }) };
    }

    const { data: fr, error: fundingLookupError } = await adminClient
        .from('funding_requests')
        .select('*')
        .eq('id', fundingId)
        .maybeSingle();
    if (fundingLookupError) throw fundingLookupError;
    if (!fr) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'funding_request_missing' }) };
    }
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
    // A request staff already closed out must never be credited by the gateway
    // path — that would silently resurrect it as `approved`.
    if (UNCREDITABLE_FUNDING_STATUSES.has(String((fr as any).status))) {
        return {
            blocked: await blockSuccessfulPaymentFulfillment(
                tx,
                verified,
                source,
                { code: `funding_request_${(fr as any).status}` },
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
        const { error: walletUpdateError } = await adminClient
            .from('funding_requests')
            .update({ wallet_id: wallet.id })
            .eq('id', (fr as any).id);
        if (walletUpdateError) throw walletUpdateError;
    }

    // Canonical key — shared with the staff-approval path in funding.ts so the
    // two routes to a funding credit can never both fire. Rows credited before
    // this unification carry the legacy key; honour it so we never re-credit.
    const alreadyCreditedLegacy = await ledgerEntryExists(legacyPaystackFundingCreditKey((fr as any).id));
    if (!alreadyCreditedLegacy) {
        await postEntry({
            walletId: wallet.id,
            direction: 'credit',
            amountMinor: (fr as any).amount_minor,
            entryType: 'funding_credit',
            referenceType: 'funding_request',
            referenceId: (fr as any).id,
            idempotencyKey: fundingCreditKey((fr as any).id),
            memo: `Paystack ${tx.gateway_reference}`,
            createdBy: (fr as any).submitted_by,
            audit: { actorType: sourceActor(source) },
        });
    }
    const { error: fundingApprovalError } = await adminClient
        .from('funding_requests')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            rejection_reason: null,
        })
        .eq('id', (fr as any).id);
    if (fundingApprovalError) throw fundingApprovalError;
    return {};
}

async function fulfillCustomerWalletFunding(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const walletId = tx.metadata?.wallet_id as string | undefined;
    if (!walletId) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'wallet_target_missing' }) };
    }

    const wallet = await findWalletById(walletId);
    try {
        assertWalletCanTransact(wallet, 'receive funding');
    } catch (error: any) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, error) };
    }
    if (wallet.owner_type !== 'customer' || wallet.owner_id !== tx.actor_id) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'wallet_owner_mismatch' }) };
    }

    // Credit what was requested, not what the gateway charged: when the payer
    // bears the fee, `verified.amount` is grossed up and the surplus never
    // reaches our settlement account.
    const creditableMinor = Number(tx.amount_minor);
    const idempotencyKey = `customer_fund.${tx.id}.paystack.credit`;
    const alreadyCredited = await ledgerEntryExists(idempotencyKey);
    await postEntry({
        walletId: wallet.id,
        direction: 'credit',
        amountMinor: creditableMinor,
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
            amountMinor: creditableMinor,
            reference: tx.gateway_reference,
        }).catch(() => undefined);
        return { metadata: { wallet_funded_notified_at: new Date().toISOString() } };
    }
    return {};
}

async function fulfillMeterOrder(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const meterOrderId = tx.metadata?.meter_order_id as string | undefined;
    if (!meterOrderId) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'meter_order_missing' }) };
    }

    const { data: order, error: orderError } = await adminClient
        .from('meter_purchase_orders')
        .select('*')
        .eq('id', meterOrderId)
        .maybeSingle();
    if (orderError) throw orderError;
    if (!order) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'meter_order_missing' }) };
    }
    if (Number((order as any).amount_minor) !== Number(tx.amount_minor)) {
        return {
            blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'payment_amount_mismatch' }),
        };
    }
    if ((order as any).status === 'cancelled') {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'meter_order_cancelled' }) };
    }
    // Already past payment — nothing to do, and re-running must not rewind it.
    if ((order as any).status !== 'pending_payment') return {};

    const { error: paidError } = await adminClient
        .from('meter_purchase_orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', meterOrderId)
        .eq('status', 'pending_payment');
    if (paidError) throw paidError;

    await logAction({
        actorUserId: null,
        actorType: sourceActor(source),
        action: 'meter_order.payment_confirmed',
        targetType: 'meter_purchase_order',
        targetId: meterOrderId,
        after: { reference: tx.gateway_reference, source },
    });
    return {};
}

async function fulfillCustomerTokenPurchase(
    tx: PaymentTransaction,
    verified: VerifyResult,
    source: PaystackFulfillmentSource,
): Promise<FulfillmentStepResult> {
    const purchaseOrderId = tx.metadata?.purchase_order_id as string | undefined;
    if (!purchaseOrderId) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'purchase_order_missing' }) };
    }

    const { data: po, error: purchaseLookupError } = await adminClient
        .from('purchase_orders')
        .select('*')
        .eq('id', purchaseOrderId)
        .maybeSingle();
    if (purchaseLookupError) throw purchaseLookupError;
    if (!po) {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'purchase_order_missing' }) };
    }
    if ((po as any).status === 'failed') {
        return { blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'purchase_order_failed' }) };
    }
    if ((po as any).status === 'delivered') return {};
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

        const { generateCreditToken, lookupMeter } = await import('./token-engine.js');
        const { createReceipt } = await import('./vending.js');
        const { declaredMeterType, effectiveThreePhase } = await import('./customer-purchase.js');
        const meter = await lookupMeter((po as any).meter_id);
        const energyAmountMinor = Number((po as any).energy_amount_minor);
        const vatAmountMinor = Number((po as any).vat_amount_minor);
        const vatRateBasisPoints = Number((po as any).vat_rate_basis_points);
        const grossAmountMinor = Number((po as any).amount_minor);
        const units = Number((po as any).units_kwh);
        const declared = await declaredMeterType((po as any).customer_id, meter.meterId);
        const isThreePhase = effectiveThreePhase(meter.isThreePhase, declared);
        const meterType = isThreePhase ? 'three_phase' : 'single_phase';
        const tokenRes = await generateCreditToken({
            meterId: meter.meterId,
            customerId: meter.customerId,
            amountMinor: energyAmountMinor,
            units,
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
                grossAmountMinor,
                energyAmountMinor,
                vatAmountMinor,
                vatRateBasisPoints,
                units,
                token: tokenRes.token,
                generatedAt: tokenRes.generatedAt,
                purchaseMode: 'direct_pay',
            },
        });
        const { error: deliveryUpdateError } = await adminClient
            .from('purchase_orders')
            .update({
                token: tokenRes.token,
                receipt_id: receipt.id,
                meter_type: meterType,
                status: 'delivered',
                delivery_state: 'token_generated',
            })
            .eq('id', purchaseOrderId);
        if (deliveryUpdateError) throw deliveryUpdateError;

        try {
            await sendTokenSmsToCustomer({
                customerId: (po as any).customer_id,
                token: tokenRes.token,
                meterId: meter.meterId,
                amountMinor: (po as any).amount_minor,
                units,
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
            units,
            amountMinor: (po as any).amount_minor,
            token: tokenRes.token,
        }).catch(() => undefined);
    } catch (error: any) {
        const { error: reviewUpdateError } = await adminClient
            .from('purchase_orders')
            .update({
                token: issuedToken ?? undefined,
                status: 'delivery_pending_review',
                failure_reason: `direct_pay_token_failed: ${error.message}`.slice(0, 500),
            })
            .eq('id', purchaseOrderId);
        if (reviewUpdateError) throw reviewUpdateError;
        return {
            blocked: await blockSuccessfulPaymentFulfillment(tx, verified, source, {
                code: issuedToken ? 'token_delivery_record_failed' : 'token_delivery_failed',
            }),
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
    // Paystack grosses the charge up when the payer bears the fee, so the
    // verified amount is legitimately above what we asked for. Credit the
    // requested amount; hold anything we cannot explain as a fee.
    const amountAssessment = classifyGatewayAmount({
        expectedMinor: Number(tx.amount_minor),
        paidMinor: Number(verified.amount),
    });
    if (!isCreditable(amountAssessment)) {
        return blockSuccessfulPaymentFulfillment(
            tx,
            verified,
            source,
            { code: blockCodeFor(amountAssessment) },
        );
    }
    if (verified.reference !== tx.gateway_reference) {
        return blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'payment_reference_mismatch' });
    }
    if (String(verified.currency ?? '').toUpperCase() !== 'NGN') {
        return blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'payment_currency_mismatch' });
    }

    let extraMetadata: Record<string, unknown> = {
        gateway_amount_kind: amountAssessment.kind,
        gateway_surplus_minor: amountAssessment.surplusMinor,
        credited_amount_minor: amountAssessment.creditableMinor,
    };
    if (tx.purpose === 'wallet_funding' && tx.actor_type === 'vendor') {
        const result = await fulfillVendorFunding(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = { ...extraMetadata, ...(result.metadata ?? {}) };
    } else if (tx.purpose === 'wallet_funding' && tx.actor_type === 'customer') {
        const result = await fulfillCustomerWalletFunding(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = { ...extraMetadata, ...(result.metadata ?? {}) };
    } else if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const result = await fulfillCustomerTokenPurchase(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = { ...extraMetadata, ...(result.metadata ?? {}) };
    } else if (tx.purpose === 'meter_order') {
        const result = await fulfillMeterOrder(tx, verified, source);
        if (result.blocked) return result.blocked;
        extraMetadata = { ...extraMetadata, ...(result.metadata ?? {}) };
    } else {
        return blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'unsupported_payment_target' });
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
