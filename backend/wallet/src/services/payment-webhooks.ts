import { verifyTransaction } from '../adapters/paystack.js';
import { adminClient } from '../db/supabase.js';
import {
    clearPaymentFulfillmentBlock,
    fulfillSuccessfulPaystackTransaction,
    PaymentRetryError,
    type PaystackFulfillmentSource,
} from './payment-transactions.js';

export interface PaystackWebhookProcessingResult {
    status: 'ignored' | 'fulfilled' | 'already_fulfilled' | 'blocked';
    reason?: string;
}

export interface OwnedPaymentVerificationResult {
    reference: string;
    status: string;
    purpose: string;
    fulfillmentStatus: PaystackWebhookProcessingResult['status'];
    reason?: string;
}

export async function verifyOwnedPaystackPayment(input: {
    reference: string;
    actorType: 'customer' | 'vendor';
    actorId: string;
}): Promise<OwnedPaymentVerificationResult | null> {
    const { data: owned, error: ownedError } = await adminClient
        .from('payment_transactions')
        .select('id, gateway_reference, status, purpose')
        .eq('gateway', 'paystack')
        .eq('gateway_reference', input.reference)
        .eq('actor_type', input.actorType)
        .eq('actor_id', input.actorId)
        .maybeSingle();
    if (ownedError) throw ownedError;
    if (!owned) return null;

    const result = await processPaystackChargeSuccess(input.reference, 'callback');
    const { data: latest, error: latestError } = await adminClient
        .from('payment_transactions')
        .select('status')
        .eq('id', (owned as { id: string }).id)
        .single();
    if (latestError) throw latestError;

    return {
        reference: input.reference,
        status: String((latest as { status?: string } | null)?.status ?? (owned as { status: string }).status),
        purpose: (owned as { purpose: string }).purpose,
        fulfillmentStatus: result.status,
        reason: result.reason,
    };
}

export interface RetryBlockedPaymentResult {
    paymentTransactionId: string;
    reference: string;
    status: string;
    fulfillmentStatus: PaystackWebhookProcessingResult['status'];
    reason?: string;
}

/**
 * Staff-driven recovery for a payment held at `requires_review`: lift the block,
 * then re-run verification and fulfillment. Fulfillment is idempotent on the
 * ledger key, so a payment that did credit cannot be credited twice by this.
 */
export async function retryBlockedPaystackPayment(input: {
    paymentTransactionId: string;
    retriedBy: string;
}): Promise<RetryBlockedPaymentResult> {
    const tx = await clearPaymentFulfillmentBlock({
        paymentTransactionId: input.paymentTransactionId,
        clearedBy: input.retriedBy,
    });
    const reference = String((tx as { gateway_reference?: string }).gateway_reference ?? '');
    if (!reference) throw new PaymentRetryError('Payment has no gateway reference.', 'missing_reference');

    const result = await processPaystackChargeSuccess(reference, 'manual_retry');
    const { data: latest } = await adminClient
        .from('payment_transactions')
        .select('status')
        .eq('id', input.paymentTransactionId)
        .maybeSingle();

    return {
        paymentTransactionId: input.paymentTransactionId,
        reference,
        status: String((latest as { status?: string } | null)?.status ?? 'unknown'),
        fulfillmentStatus: result.status,
        reason: result.reason,
    };
}

export async function processPaystackChargeSuccess(
    reference: string,
    source: PaystackFulfillmentSource,
): Promise<PaystackWebhookProcessingResult> {
    const verified = await verifyTransaction(reference);
    if (verified.status !== 'success') {
        return { status: 'ignored', reason: `verify_status=${verified.status}` };
    }

    const { data: tx, error: txError } = await adminClient
        .from('payment_transactions')
        .select('*')
        .eq('gateway', 'paystack')
        .eq('gateway_reference', reference)
        .maybeSingle();
    if (txError) throw txError;
    if (!tx) {
        return { status: 'ignored', reason: 'no_local_tx' };
    }

    const result = await fulfillSuccessfulPaystackTransaction({ tx: tx as any, verified, source });
    if (result.status === 'blocked') {
        return { status: 'blocked', reason: result.reason };
    }
    if (result.status === 'already_fulfilled') {
        return { status: 'already_fulfilled' };
    }
    return { status: 'fulfilled' };
}
