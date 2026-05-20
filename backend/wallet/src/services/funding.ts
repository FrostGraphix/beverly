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
import { findWalletByOwner, getOrCreateWallet, type Wallet } from './wallets.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { logAction } from './audit.js';
import crypto from 'node:crypto';

const PROOF_BUCKET = 'uploads';
const PROOF_MAX_BYTES = 8 * 1024 * 1024;
const PROOF_ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);

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
    proof_view_url?: string | null;
    vendor_organizations?: {
        legal_name: string | null;
        trading_name: string | null;
        contact_email: string | null;
        contact_phone?: string | null;
    } | null;
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

export interface UploadBankProofInput {
    vendorOrganizationId: string;
    submittedBy: string;
    fileName: string;
    mimeType: string;
    base64: string;
}

function safeProofFileName(fileName: string): string {
    const cleaned = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
    return cleaned || 'proof-upload';
}

function decodeProofBase64(base64: string): Buffer {
    const normalized = base64.includes(',') ? base64.split(',').pop() ?? '' : base64;
    const buffer = Buffer.from(normalized, 'base64');
    if (!buffer.length) throw new FundingError('proof file is empty', 'empty_proof');
    if (buffer.byteLength > PROOF_MAX_BYTES) {
        throw new FundingError('proof file must be 8MB or smaller', 'proof_too_large');
    }
    return buffer;
}

export async function uploadBankFundingProof(input: UploadBankProofInput): Promise<{
    proofFilePath: string;
    proofHash: string;
}> {
    if (!PROOF_ALLOWED_MIME.has(input.mimeType)) {
        throw new FundingError('proof must be a PDF, JPG, PNG, or WebP file', 'invalid_proof_type');
    }
    const buffer = decodeProofBase64(input.base64);
    const proofHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const { data: duplicate } = await adminClient
        .from('funding_requests')
        .select('id')
        .eq('vendor_organization_id', input.vendorOrganizationId)
        .eq('proof_hash', proofHash)
        .maybeSingle();
    if (duplicate) throw new FundingError('proof appears to be a duplicate submission', 'duplicate_proof');

    const ext = safeProofFileName(input.fileName).split('.').pop();
    const proofFilePath = `wallet/funding-proofs/${input.vendorOrganizationId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await adminClient.storage
        .from(PROOF_BUCKET)
        .upload(proofFilePath, buffer, {
            contentType: input.mimeType,
            cacheControl: '3600',
            upsert: false,
        });
    if (error) throw new FundingError(error.message, 'proof_upload_failed');

    await logAction({
        actorUserId: input.submittedBy,
        actorType: 'vendor_user',
        action: 'funding.proof.upload',
        targetType: 'vendor_organization',
        targetId: input.vendorOrganizationId,
        after: { proofFilePath, proofHash },
    });

    return { proofFilePath, proofHash };
}

async function attachProofUrls(requests: FundingRequest[]): Promise<FundingRequest[]> {
    return Promise.all(requests.map(async (request) => {
        if (!request.proof_file_path) return { ...request, proof_view_url: null };
        const { data } = await adminClient.storage
            .from(PROOF_BUCKET)
            .createSignedUrl(request.proof_file_path, 60 * 30);
        return { ...request, proof_view_url: data?.signedUrl ?? null };
    }));
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

async function canonicalVendorWallet(funding: FundingRequest): Promise<Wallet> {
    const wallet = await getOrCreateWallet('vendor', funding.vendor_organization_id);
    if (wallet.id !== funding.wallet_id) {
        await adminClient
            .from('funding_requests')
            .update({ wallet_id: wallet.id })
            .eq('id', funding.id);
    }
    return wallet;
}

async function findFundingCredit(fundingId: string): Promise<LedgerEntry | null> {
    const { data } = await adminClient
        .from('wallet_ledger_entries')
        .select('*')
        .eq('idempotency_key', `funding.${fundingId}.credit`)
        .maybeSingle();
    return (data as LedgerEntry) ?? null;
}

async function repairApprovedFundingWallet(input: {
    funding: FundingRequest;
    canonicalWallet: Wallet;
    existingEntry: LedgerEntry;
    approvedBy: string;
}): Promise<LedgerEntry> {
    if (input.existingEntry.wallet_id === input.canonicalWallet.id) {
        return input.existingEntry;
    }

    await postEntry({
        walletId: input.existingEntry.wallet_id,
        direction: 'debit',
        amountMinor: input.existingEntry.amount_minor,
        entryType: 'reversal_debit',
        referenceType: 'funding_request',
        referenceId: input.funding.id,
        idempotencyKey: `funding.${input.funding.id}.stale_wallet_reversal`,
        memo: `Funding repair debit · ${input.funding.channel}`,
        createdBy: input.approvedBy,
        audit: { actorType: 'staff', actorRole: 'finance-checker' },
    });

    const repairedEntry = await postEntry({
        walletId: input.canonicalWallet.id,
        direction: 'credit',
        amountMinor: input.existingEntry.amount_minor,
        entryType: 'funding_credit',
        referenceType: 'funding_request',
        referenceId: input.funding.id,
        idempotencyKey: `funding.${input.funding.id}.canonical_credit`,
        memo: `Funding repair credit · ${input.funding.channel}`,
        createdBy: input.approvedBy,
        audit: { actorType: 'staff', actorRole: 'finance-checker' },
    });

    await adminClient
        .from('funding_requests')
        .update({ wallet_id: input.canonicalWallet.id })
        .eq('id', input.funding.id);

    await logAction({
        actorUserId: input.approvedBy,
        actorType: 'staff',
        action: 'funding.repair.canonical_wallet',
        targetType: 'funding_request',
        targetId: input.funding.id,
        before: { walletId: input.existingEntry.wallet_id, ledgerEntryId: input.existingEntry.id },
        after: { walletId: input.canonicalWallet.id, ledgerEntryId: repairedEntry.id },
    });

    return repairedEntry;
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
    const canonicalWallet = await canonicalVendorWallet(funding);
    const fundingForCredit = { ...funding, wallet_id: canonicalWallet.id };

    if (funding.status === 'approved') {
        // idempotent return
        const existing = await findFundingCredit(funding.id);
        if (existing) {
            const ledgerEntry = await repairApprovedFundingWallet({
                funding,
                canonicalWallet,
                existingEntry: existing,
                approvedBy: input.approvedBy,
            });
            return { funding: fundingForCredit, ledgerEntry };
        }
    }
    if (funding.status !== 'under_review' && funding.status !== 'proof_uploaded') {
        throw new FundingError(`Cannot approve a request in status "${funding.status}".`, 'invalid_state');
    }

    // Maker/checker: submitter cannot be approver
    if (funding.submitted_by === input.approvedBy) {
        throw new FundingError(
            'You cannot approve your own funding request. A different staff member must review it.',
            'self_approval',
        );
    }

    // (No intermediate state — `funding_requests_status_check` constraint only
    // allows the canonical lifecycle. We post the ledger entry first with an
    // idempotency key, then transition status atomically: if another approver
    // beat us to it, the UPDATE returns zero rows and we recognize the race.)

    const entry = await postEntry({
        walletId: canonicalWallet.id,
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

    // Atomic transition: only one approver can flip from pending → approved.
    const { data: updated, error: updErr } = await adminClient
        .from('funding_requests')
        .update({
            status: 'approved',
            approved_by: input.approvedBy,
            approved_at: new Date().toISOString(),
        })
        .eq('id', funding.id)
        .in('status', ['under_review', 'proof_uploaded'])
        .select('*')
        .maybeSingle();
    if (updErr) throw new FundingError(updErr.message, 'update_failed');
    if (!updated) {
        // Race: another reviewer transitioned the row before us. The shared
        // idempotency key on the ledger entry guaranteed at most one credit.
        // Return the current state so the UI reconciles.
        const { data: latest } = await adminClient
            .from('funding_requests').select('*').eq('id', funding.id).single();
        return { funding: latest as FundingRequest, ledgerEntry: entry };
    }

    await logAction({
        actorUserId: input.approvedBy,
        actorType: 'staff',
        action: 'funding.approve',
        targetType: 'funding_request',
        targetId: funding.id,
        before: { status: funding.status },
        after: { status: 'approved', walletId: canonicalWallet.id, ledgerEntryId: entry.id },
    });

    return { funding: updated as FundingRequest, ledgerEntry: entry };
}

export async function reconcileApprovedFundingCredits(input: {
    repairedBy: string;
    limit?: number;
}): Promise<{
    checked: number;
    repaired: number;
    missingLedger: number;
    staleWallet: number;
}> {
    const { data } = await adminClient
        .from('funding_requests')
        .select('*')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(input.limit ?? 250);

    let repaired = 0;
    let missingLedger = 0;
    let staleWallet = 0;

    for (const row of data ?? []) {
        const funding = row as FundingRequest;
        const canonicalWallet = await canonicalVendorWallet(funding);
        const existing = await findFundingCredit(funding.id);

        if (!existing) {
            missingLedger += 1;
            await postEntry({
                walletId: canonicalWallet.id,
                direction: 'credit',
                amountMinor: funding.amount_minor,
                entryType: 'funding_credit',
                referenceType: 'funding_request',
                referenceId: funding.id,
                idempotencyKey: `funding.${funding.id}.credit`,
                memo: `Funding reconciled · ${funding.channel}`,
                createdBy: input.repairedBy,
                audit: { actorType: 'staff', actorRole: 'finance-checker' },
            });
            repaired += 1;
            continue;
        }

        if (existing.wallet_id !== canonicalWallet.id) {
            staleWallet += 1;
            await repairApprovedFundingWallet({
                funding,
                canonicalWallet,
                existingEntry: existing,
                approvedBy: input.repairedBy,
            });
            repaired += 1;
        }
    }

    return {
        checked: data?.length ?? 0,
        repaired,
        missingLedger,
        staleWallet,
    };
}

export async function rejectFundingRequest(opts: {
    fundingRequestId: string;
    rejectedBy: string;
    reason: string;
}): Promise<FundingRequest> {
    const { data: fr } = await adminClient.from('funding_requests').select('*').eq('id', opts.fundingRequestId).single();
    if (!fr) throw new FundingError('Funding request not found.', 'not_found');
    const cur = (fr as FundingRequest).status as string;
    if (cur === 'rejected') return fr as FundingRequest;
    if (cur === 'approved') {
        throw new FundingError('Cannot reject an already-approved request. Use a refund instead.', 'already_approved');
    }
    if (cur !== 'under_review' && cur !== 'proof_uploaded' && cur !== 'initiated') {
        throw new FundingError(`Cannot reject a request in status "${cur}".`, 'invalid_state');
    }

    if ((fr as FundingRequest).submitted_by === opts.rejectedBy) {
        throw new FundingError(
            'You cannot reject your own funding request. A different staff member must review it.',
            'self_rejection',
        );
    }

    // Atomic transition
    const { data, error } = await adminClient.from('funding_requests').update({
        status: 'rejected',
        rejected_by: opts.rejectedBy,
        rejected_at: new Date().toISOString(),
        rejection_reason: opts.reason,
    }).eq('id', opts.fundingRequestId).in('status', ['under_review', 'proof_uploaded', 'initiated']).select('*').maybeSingle();
    if (error) throw new FundingError(error.message, 'update_failed');
    if (!data) {
        throw new FundingError('Another reviewer already acted on this request.', 'concurrent_update');
    }

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
        .select('*, vendor_organizations(legal_name, trading_name, contact_email, contact_phone)')
        .eq('vendor_organization_id', vendorOrganizationId)
        .order('created_at', { ascending: false })
        .limit(limit);
    return attachProofUrls((data ?? []) as FundingRequest[]);
}

export async function listPendingFunding(limit = 100): Promise<FundingRequest[]> {
    const { data } = await adminClient
        .from('funding_requests')
        .select('*, vendor_organizations(legal_name, trading_name, contact_email, contact_phone)')
        .in('status', ['proof_uploaded', 'under_review'])
        .order('created_at', { ascending: true })
        .limit(limit);
    return attachProofUrls((data ?? []) as FundingRequest[]);
}
