import { verifyTransaction } from '../adapters/paystack.js';
import { adminClient } from '../db/supabase.js';
import { fulfillSuccessfulPaystackTransaction, type PaystackFulfillmentSource } from './payment-transactions.js';

export interface PaystackWebhookProcessingResult {
    status: 'ignored' | 'fulfilled' | 'already_fulfilled' | 'blocked';
    reason?: string;
}

export async function processPaystackChargeSuccess(
    reference: string,
    source: PaystackFulfillmentSource,
): Promise<PaystackWebhookProcessingResult> {
    const verified = await verifyTransaction(reference);
    if (verified.status !== 'success') {
        return { status: 'ignored', reason: `verify_status=${verified.status}` };
    }

    const { data: tx } = await adminClient
        .from('payment_transactions')
        .select('*')
        .eq('gateway', 'paystack')
        .eq('gateway_reference', reference)
        .maybeSingle();
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
