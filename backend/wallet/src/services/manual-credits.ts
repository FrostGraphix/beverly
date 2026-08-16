/**
 * Manual Credit service — maker-checker enforced.
 *
 * Finance staff (maker) requests a wallet credit.
 * A different finance staff member (checker) approves it.
 * Only on approval does the ledger entry get written.
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { postEntry } from './ledger.js';
import { assertWalletCanTransact } from './wallets.js';
import { logAction } from './audit.js';

export class ManualCreditError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'ManualCreditError';
    }
}

export interface ManualCreditRequest {
    id: string;
    wallet_id: string;
    amount_minor: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    requested_by_user_id: string;
    approved_by_user_id: string | null;
    rejected_by_user_id: string | null;
    ledger_entry_id: string | null;
    rejection_reason: string | null;
    processed_at: string | null;
    idempotency_key: string;
    created_at: string;
}

export async function requestManualCredit(opts: {
    walletId: string;
    amountMinor: number;
    reason: string;
    requestedByUserId: string;
}): Promise<ManualCreditRequest> {
    if (opts.amountMinor <= 0 || !Number.isInteger(opts.amountMinor)) {
        throw new ManualCreditError('amount_minor must be a positive integer', 'invalid_amount');
    }
    if (!opts.reason?.trim()) {
        throw new ManualCreditError('reason is required', 'reason_required');
    }

    const { data: wallet, error: walletErr } = await adminClient
        .from('wallets')
        .select('id, status, owner_type, owner_id')
        .eq('id', opts.walletId)
        .maybeSingle();
    if (walletErr || !wallet) {
        throw new ManualCreditError('Wallet not found', 'not_found');
    }

    const idemKey = crypto
        .createHash('sha256')
        .update(`manual_credit:${opts.walletId}:${opts.amountMinor}:${opts.requestedByUserId}:${Date.now()}`)
        .digest('hex');

    const { data, error } = await adminClient
        .from('manual_credit_requests')
        .insert({
            wallet_id:            opts.walletId,
            amount_minor:         opts.amountMinor,
            reason:               opts.reason.trim(),
            status:               'pending',
            requested_by_user_id: opts.requestedByUserId,
            idempotency_key:      idemKey,
        })
        .select('*')
        .single();
    if (error || !data) throw new ManualCreditError(error?.message ?? 'db_error', 'db_error');

    await logAction({
        actorUserId: opts.requestedByUserId,
        actorType:   'staff',
        action:      'manual_credit.requested',
        targetType:  'wallet',
        targetId:    opts.walletId,
        after:       { amountMinor: opts.amountMinor, reason: opts.reason },
    });

    return data as ManualCreditRequest;
}

export async function approveManualCredit(opts: {
    requestId: string;
    approvedByUserId: string;
}): Promise<ManualCreditRequest> {
    const { data: req } = await adminClient
        .from('manual_credit_requests')
        .select('*')
        .eq('id', opts.requestId)
        .maybeSingle();
    if (!req) throw new ManualCreditError('Request not found', 'not_found');
    if ((req as any).status !== 'pending') {
        throw new ManualCreditError(`Request is already ${(req as any).status}`, 'invalid_status');
    }
    if ((req as any).requested_by_user_id === opts.approvedByUserId) {
        throw new ManualCreditError(
            'Approver must be a different staff member from the requester (maker-checker)',
            'self_approval',
        );
    }

    const { data: wallet, error: walletErr } = await adminClient
        .from('wallets')
        .select('id, status')
        .eq('id', (req as any).wallet_id)
        .maybeSingle();
    if (walletErr || !wallet) throw new ManualCreditError('Wallet not found', 'not_found');
    try {
        assertWalletCanTransact(wallet as any, 'receive manual credit');
    } catch (e: any) {
        throw new ManualCreditError(e.message, e.code ?? 'wallet_inactive');
    }

    const entry = await postEntry({
        walletId:       (req as any).wallet_id,
        direction:      'credit',
        amountMinor:    (req as any).amount_minor,
        entryType:      'manual_credit',
        referenceType:  'manual_credit_request',
        referenceId:    opts.requestId,
        idempotencyKey: `manual_credit.${opts.requestId}`,
        memo:           `Manual credit: ${(req as any).reason}`,
        createdBy:      opts.approvedByUserId,
        audit: { actorType: 'staff', actorRole: 'finance-checker' },
    });

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await adminClient
        .from('manual_credit_requests')
        .update({
            status:                'approved',
            approved_by_user_id:   opts.approvedByUserId,
            ledger_entry_id:       entry.id,
            processed_at:          now,
        })
        .eq('id', opts.requestId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
    if (updErr) throw new ManualCreditError(updErr.message, 'update_failed');
    if (!updated) throw new ManualCreditError('Another reviewer already acted on this request', 'concurrent_update');

    await logAction({
        actorUserId: opts.approvedByUserId,
        actorType:   'staff',
        action:      'manual_credit.approved',
        targetType:  'wallet',
        targetId:    (req as any).wallet_id,
        after:       { amountMinor: (req as any).amount_minor, ledgerEntryId: entry.id },
    });

    return updated as ManualCreditRequest;
}

export async function rejectManualCredit(opts: {
    requestId: string;
    rejectedByUserId: string;
    reason: string;
}): Promise<ManualCreditRequest> {
    const { data: req } = await adminClient
        .from('manual_credit_requests')
        .select('status, requested_by_user_id')
        .eq('id', opts.requestId)
        .maybeSingle();
    if (!req) throw new ManualCreditError('Request not found', 'not_found');
    if ((req as any).status !== 'pending') {
        throw new ManualCreditError(`Request is already ${(req as any).status}`, 'invalid_status');
    }
    if ((req as any).requested_by_user_id === opts.rejectedByUserId) {
        throw new ManualCreditError('A different staff member must reject this request', 'self_rejection');
    }

    const { data: updated, error } = await adminClient
        .from('manual_credit_requests')
        .update({
            status:               'rejected',
            rejected_by_user_id:  opts.rejectedByUserId,
            rejection_reason:     opts.reason,
            processed_at:         new Date().toISOString(),
        })
        .eq('id', opts.requestId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
    if (error) throw new ManualCreditError(error.message, 'update_failed');
    if (!updated) throw new ManualCreditError('Another reviewer already acted on this request', 'concurrent_update');

    await logAction({
        actorUserId: opts.rejectedByUserId,
        actorType:   'staff',
        action:      'manual_credit.rejected',
        targetType:  'manual_credit_request',
        targetId:    opts.requestId,
        after:       { reason: opts.reason },
    });

    return updated as ManualCreditRequest;
}

export async function listManualCreditRequests(opts: {
    walletId?: string;
    status?: string;
    limit?: number;
}): Promise<ManualCreditRequest[]> {
    let q = adminClient
        .from('manual_credit_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 100);
    if (opts.walletId) q = q.eq('wallet_id', opts.walletId);
    if (opts.status)   q = q.eq('status', opts.status);
    const { data } = await q;
    return (data ?? []) as ManualCreditRequest[];
}
