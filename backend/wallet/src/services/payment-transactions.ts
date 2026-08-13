import type { VerifyResult } from '../adapters/paystack.js';
import { verifiedPrincipalAmount } from '../adapters/paystack.js';
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { postEntry } from './ledger.js';
import { logAction } from './audit.js';
import { sendTokenSmsToCustomer } from './customer-purchase.js';
import { notifyPaymentFailed, notifyTokenPurchased, notifyWalletFunded } from './notifications.js';
import { assertWalletCanTransact, findWalletByOwner, type Wallet } from './wallets.js';
import { PAYMENT_STATUS, PAYMENT_SUCCEEDED_STATUSES } from './payment-status.js';

type PaymentTransaction = Record<string, any>;

export type PaystackFulfillmentSource = 'webhook' | 'scheduler' | 'callback';

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
    error: { code?: string; detail?: string },
): Promise<PaystackFulfillmentResult> {
    const code = error?.code ?? 'wallet_inactive';
    const prefix = code === 'payment_amount_mismatch'
        ? 'paystack_amount_mismatch'
        : code.startsWith('token_')
            ? 'token_delivery_failed'
        : code.startsWith('payment_')
            ? 'paystack_verification_mismatch'
            : 'wallet_inactive_on_paystack_success';
    const blockedAt = new Date().toISOString();
    const attempts = Number(tx.fulfillment_attempts ?? 0) + 1;
    const retryable = ['payment_amount_mismatch', 'token_delivery_failed'].includes(code) && attempts < 5;
    const retryDelayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));

    if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const purchaseOrderId = tx.metadata?.purchase_order_id;
        if (purchaseOrderId) {
            const { error: purchaseUpdateError } = await adminClient
                .from('purchase_orders')
                .update({
                    status: 'delivery_pending_review',
                    failure_reason: `${prefix}: ${error.detail ?? code}`.slice(0, 500),
                    delivery_state: `${code}_needs_review`.slice(0, 100),
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
                fulfillment_blocked_detail: error.detail ?? null,
                fulfillment_blocked_at: blockedAt,
                requires_ops_review: true,
            }),
            updated_at: blockedAt,
            fulfillment_claimed_at: null,
            fulfillment_lease_token: null,
            fulfillment_last_error: code,
            fulfillment_next_retry_at: retryable
                ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
                : null,
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

export async function markUnsuccessfulPaystackTransaction(input: {
    tx: PaymentTransaction;
    verified: VerifyResult;
    source: PaystackFulfillmentSource;
}): Promise<void> {
    const { tx, verified, source } = input;
    const now = new Date().toISOString();
    const gatewayStatus = verified.status === 'abandoned' ? 'abandoned' : 'failed';
    const { error: paymentError } = await adminClient
        .from('payment_transactions')
        .update({
            status: PAYMENT_STATUS.FAILED,
            metadata: verifiedMetadata(tx, verified, source, {
                reconciled_at: now,
                reconciliation_status: gatewayStatus,
            }),
            updated_at: now,
            fulfillment_claimed_at: null,
            fulfillment_lease_token: null,
            fulfillment_next_retry_at: null,
        })
        .eq('id', tx.id);
    if (paymentError) throw paymentError;

    if (tx.purpose === 'token_purchase' && tx.actor_type === 'customer') {
        const purchaseOrderId = tx.metadata?.purchase_order_id as string | undefined;
        if (purchaseOrderId) {
            const { error: purchaseError } = await adminClient
                .from('purchase_orders')
                .update({
                    status: 'failed',
                    delivery_state: `payment_${gatewayStatus}`,
                    failure_reason: `paystack_payment_${gatewayStatus}`,
                    updated_at: now,
                })
                .eq('id', purchaseOrderId)
                .neq('status', 'delivered');
            if (purchaseError) throw purchaseError;
        }
    }

    if (tx.actor_type === 'customer' && tx.actor_id) {
        notifyPaymentFailed(tx.actor_id, {
            amountMinor: Number(tx.amount_minor ?? 0),
            reason: gatewayStatus === 'abandoned' ? 'The payment was not completed.' : undefined,
        }).catch(() => undefined);
    }
    await logAction({
        actorUserId: null,
        actorType: sourceActor(source),
        action: 'paystack.payment.failed',
        targetType: 'payment_transaction',
        targetId: tx.id,
        before: { status: tx.status },
        after: { status: PAYMENT_STATUS.FAILED, gatewayStatus, source },
    });
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
    const { error: fundingApprovalError } = await adminClient
        .from('funding_requests')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
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

    const idempotencyKey = `customer_fund.${tx.id}.paystack.credit`;
    const alreadyCredited = await ledgerEntryExists(idempotencyKey);
    await postEntry({
        walletId: wallet.id,
        direction: 'credit',
        amountMinor: verifiedPrincipalAmount(verified),
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
            amountMinor: verifiedPrincipalAmount(verified),
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
        const existingToken = typeof (po as any).token === 'string' && (po as any).token.trim()
            ? (po as any).token.trim()
            : null;
        const tokenRes = existingToken
            ? { token: existingToken, generatedAt: String((po as any).updated_at ?? new Date().toISOString()) }
            : await generateCreditToken({
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
        if (!existingToken) {
            const { error: tokenPersistError } = await adminClient
                .from('purchase_orders')
                .update({
                    token: tokenRes.token,
                    status: 'delivery_pending_review',
                    delivery_state: 'token_generated_needs_receipt',
                })
                .eq('id', purchaseOrderId);
            if (tokenPersistError) throw tokenPersistError;
        }
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
                detail: error instanceof Error ? error.message : String(error),
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
    if (Number(tx.amount_minor) !== verifiedPrincipalAmount(verified)) {
        return blockSuccessfulPaymentFulfillment(
            tx,
            verified,
            source,
            { code: 'payment_amount_mismatch' },
        );
    }
    if (verified.reference !== tx.gateway_reference) {
        return blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'payment_reference_mismatch' });
    }
    if (String(verified.currency ?? '').toUpperCase() !== 'NGN') {
        return blockSuccessfulPaymentFulfillment(tx, verified, source, { code: 'payment_currency_mismatch' });
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
