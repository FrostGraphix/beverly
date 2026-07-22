import { verifyTransaction } from '../adapters/paystack.js';
import { adminClient } from '../db/supabase.js';
import { fulfillSuccessfulPaystackTransaction, type PaystackFulfillmentSource } from './payment-transactions.js';

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
