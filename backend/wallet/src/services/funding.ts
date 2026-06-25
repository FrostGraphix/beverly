/**
 * Funding service.
 *
 * Two channels:
 *   1. Paystack — vendor pays via gateway, webhook drives ledger credit.
 *   2. Bank transfer with proof — vendor uploads proof, staff approves.
 *
 * Approval always writes one immutable funding_credit ledger entry.
 */
import { adminClient } from '../db/supabase.js';
import { postEntry, type LedgerEntry } from './ledger.js';
import { findWalletByOwner } from './wallets.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { logAction } from './audit.js';

export interface FundingRequest {
    id: string;
    vendor_organization_id: string;
    wallet_id: string;
    amount_minor: number;
    funding_reference: string | null;
    proof_file_path: string | null;
    proof_hash: string | null;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: 'initiated' | 'proof_uploaded' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'cancelled';
    submitted_by: string;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    expires_at: string | null;
    created_at: string;
}

export class FundingError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'FundingError'; }
}

export interface InitiatePaystackInput {
    vendorOrganizationId: string;
    amountMinor: number;
    submittedBy: string;
    email: string;
    callbackUrl?: string;
}

export interface InitiatePaystackResult {
    fundingRequest: FundingRequest;
    paymentTransactionId: string;
    authorizationUrl: string;
    reference: string;
}

export async function initiatePaystackFunding(input: InitiatePaystackInput): Promise<InitiatePaystackResult> {
    if (input.amountMinor < 50000) {
        throw new FundingError('minimum funding is ₦500', 'amount_too_low');
    }
    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    if (!wallet) throw new FundingError('vendor wallet not provisioned', 'wallet_missing');

    const reference = `FND-${Date.now()}-${input.vendorOrganizationId.slice(0, 8)}`;

    // Create funding_request and payment_transaction atomically (best-effort sequential)
    const { data: fr, error: frErr } = await adminClient.from('funding_requests').insert({
        vendor_organization_id: input.vendorOrganizationId,
        wallet_id: wallet.id,
        amount_minor: input.amountMinor,
        channel: 'paystack',
        funding_reference: reference,
        status: 'initiated',
        submitted_by: input.submittedBy,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }).select('*').single();
    if (frErr) throw new FundingError(frErr.message, 'create_funding_failed');

    const { data: pt, error: ptErr } = await adminClient.from('payment_transactions').insert({
        gateway: 'paystack',
        gateway_reference: reference,
        actor_type: 'vendor',
        actor_id: input.vendorOrganizationId,
        purpose: 'wallet_funding',
        amount_minor: input.amountMinor,
        status: 'initiated',
        idempotency_key: `funding.${(fr as FundingRequest).id}`,
        metadata: { funding_request_id: (fr as FundingRequest).id },
    }).select('*').single();
    if (ptErr) throw new FundingError(ptErr.message, 'create_payment_failed');

    const initRes = await initializeTransaction({
        email: input.email,
        amountMinor: input.amountMinor,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: { funding_request_id: (fr as FundingRequest).id, vendor_id: input.vendorOrganizationId },
        channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    });

    await logAction({
        actorUserId: input.submittedBy,
        actorType: 'vendor_user',
        action: 'funding.initiate.paystack',
        targetType: 'funding_request',
        targetId: (fr as FundingRequest).id,
        after: { amountMinor: input.amountMinor, reference },
    });

    return {
        fundingRequest: fr as FundingRequest,
        paymentTransactionId: (pt as { id: string }).id,
        authorizationUrl: initRes.authorization_url,
        reference,
    };
}

export interface InitiateBankProofInput {
    vendorOrganizationId: string;
    amountMinor: number;
    submittedBy: string;
    proofFilePath: string;
    proofHash: string;
}

export async function initiateBankProofFunding(input: InitiateBankProofInput): Promise<FundingRequest> {
    if (input.amountMinor < 100000) {
        throw new FundingError('minimum bank funding is ₦1,000', 'amount_too_low');
    }
    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    if (!wallet) throw new FundingError('vendor wallet not provisioned', 'wallet_missing');

    // Reject obvious duplicate proofs by hash
    const { data: dup } = await adminClient
        .from('funding_requests')
        .select('id, status')
        .eq('vendor_organization_id', input.vendorOrganizationId)
        .eq('proof_hash', input.proofHash)
        .maybeSingle();
    if (dup) throw new FundingError('proof appears to be a duplicate submission', 'duplicate_proof');

    const { data, error } = await adminClient.from('funding_requests').insert({
        vendor_organization_id: input.vendorOrganizationId,
        wallet_id: wallet.id,
        amount_minor: input.amountMinor,
        channel: 'bank_transfer',
        proof_file_path: input.proofFilePath,
        proof_hash: input.proofHash,
        status: 'proof_uploaded',
        submitted_by: input.submittedBy,
        expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    }).select('*').single();
    if (error) throw new FundingError(error.message, 'create_funding_failed');

    await logAction({
        actorUserId: input.submittedBy,
        actorType: 'vendor_user',
        action: 'funding.initiate.bank_transfer',
        targetType: 'funding_request',
        targetId: (data as FundingRequest).id,
        after: { amountMinor: input.amountMinor },
    });

    return data as FundingRequest;
}

export interface ApproveFundingInput {
    fundingRequestId: string;
    approvedBy: string;
}

export async function approveFundingRequest(input: ApproveFundingInput): Promise<{
    funding: FundingRequest;
    ledgerEntry: LedgerEntry;
}> {
    // Lock-and-check via service role
    const { data: fr, error: frErr } = await adminClient
        .from('funding_requests')
        .select('*')
        .eq('id', input.fundingRequestId)
        .single();
    if (frErr || !fr) throw new FundingError('funding request not found', 'not_found');
    const funding = fr as FundingRequest;

    if (funding.status === 'approved') {
        // idempotent return
        const { data: existing } = await adminClient
            .from('wallet_ledger_entries')
            .select('*')
            .eq('idempotency_key', `funding.${funding.id}.credit`)
            .single();
        if (existing) return { funding, ledgerEntry: existing as LedgerEntry };
    }
    if (funding.status !== 'under_review' && funding.status !== 'proof_uploaded') {
        throw new FundingError(`cannot approve from status=${funding.status}`, 'invalid_state');
    }

    // Maker/checker: submitter cannot be approver
    if (funding.submitted_by === input.approvedBy) {
        throw new FundingError('submitter cannot approve their own funding', 'self_approval');
    }

    const entry = await postEntry({
        walletId: funding.wallet_id,
        direction: 'credit',
        amountMinor: funding.amount_minor,
        entryType: 'funding_credit',
        referenceType: 'funding_request',
        referenceId: funding.id,
        idempotencyKey: `funding.${funding.id}.credit`,
        memo: `Funding approved · ${funding.channel}`,
        createdBy: input.approvedBy,
        audit: { actorType: 'staff', actorRole: 'finance-checker' },
    });

    const { data: updated, error: updErr } = await adminClient
        .from('funding_requests')
        .update({
            status: 'approved',
            approved_by: input.approvedBy,
            approved_at: new Date().toISOString(),
        })
        .eq('id', funding.id)
        .select('*')
        .single();
    if (updErr) throw new FundingError(updErr.message, 'update_failed');

    await logAction({
        actorUserId: input.approvedBy,
        actorType: 'staff',
        action: 'funding.approve',
        targetType: 'funding_request',
        targetId: funding.id,
        before: { status: funding.status },
        after: { status: 'approved', ledgerEntryId: entry.id },
    });

    return { funding: updated as FundingRequest, ledgerEntry: entry };
}

export async function rejectFundingRequest(opts: {
    fundingRequestId: string;
    rejectedBy: string;
    reason: string;
}): Promise<FundingRequest> {
    const { data: fr } = await adminClient.from('funding_requests').select('*').eq('id', opts.fundingRequestId).single();
    if (!fr) throw new FundingError('funding request not found', 'not_found');
    if ((fr as FundingRequest).status === 'rejected') return fr as FundingRequest;

    const { data, error } = await adminClient.from('funding_requests').update({
        status: 'rejected',
        rejected_by: opts.rejectedBy,
        rejected_at: new Date().toISOString(),
        rejection_reason: opts.reason,
    }).eq('id', opts.fundingRequestId).select('*').single();
    if (error) throw new FundingError(error.message, 'update_failed');

    await logAction({
        actorUserId: opts.rejectedBy,
        actorType: 'staff',
        action: 'funding.reject',
        targetType: 'funding_request',
        targetId: opts.fundingRequestId,
        after: { status: 'rejected', reason: opts.reason },
    });

    return data as FundingRequest;
}

export async function listVendorFunding(vendorOrganizationId: string, limit = 50): Promise<FundingRequest[]> {
    const { data } = await adminClient
        .from('funding_requests')
        .select('*')
        .eq('vendor_organization_id', vendorOrganizationId)
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []) as FundingRequest[];
}

export async function listPendingFunding(limit = 100): Promise<FundingRequest[]> {
    const { data } = await adminClient
        .from('funding_requests')
        .select('*')
        .in('status', ['proof_uploaded', 'under_review'])
        .order('created_at', { ascending: true })
        .limit(limit);
    return (data ?? []) as FundingRequest[];
}
