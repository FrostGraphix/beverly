/**
 * Refund service — Phase 6
 *
 * Closed-loop: refunds credit the customer or vendor wallet via the ledger.
 * No gateway reverse — only issued for failed/undelivered service.
 * Maker-checker: finance role approves, different person from requester.
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';

export class RefundError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'RefundError';
    }
}

export async function createRefundRequest(input: {
    disputeId?: string;
    walletId: string;
    amountMinor: number;
    reason: string;
    requestedByUserId: string;
}): Promise<string> {
    const { data, error } = await adminClient
        .from('refund_requests')
        .insert({
            dispute_id:           input.disputeId ?? null,
            wallet_id:            input.walletId,
            amount_minor:         input.amountMinor,
            reason:               input.reason,
            requested_by_user_id: input.requestedByUserId,
        })
        .select('id')
        .single();

    if (error || !data) throw new RefundError('Could not create refund request', 'db_error');

    await logAction({
        actorUserId: input.requestedByUserId,
        actorType:   'staff',
        action:      'refund.requested',
        targetId:    (data as any).id,
        metadata:    { wallet_id: input.walletId, amount_minor: input.amountMinor },
    });

    return (data as any).id;
}

export async function approveRefund(refundRequestId: string, approvedByUserId: string): Promise<void> {
    const { data: req } = await adminClient
        .from('refund_requests')
        .select('*')
        .eq('id', refundRequestId)
        .single();

    if (!req) throw new RefundError('Refund request not found', 'not_found');
    if ((req as any).status !== 'pending') throw new RefundError('Refund is not pending', 'invalid_status');
    if ((req as any).requested_by_user_id === approvedByUserId) {
        throw new RefundError('Approver must be different from requester (maker-checker)', 'maker_checker_violation');
    }

    // Write ledger credit
    const { data: entry, error: ledgerErr } = await adminClient.rpc('fn_post_ledger_entry', {
        p_wallet_id:         (req as any).wallet_id,
        p_entry_type:        'refund_credit',
        p_amount_minor:      (req as any).amount_minor,
        p_reference_type:    'refund_request',
        p_reference_id:      refundRequestId,
        p_description:       `Refund: ${(req as any).reason}`,
        p_idempotency_key:   `refund_${refundRequestId}`,
    });

    if (ledgerErr) throw new RefundError(`Ledger write failed: ${ledgerErr.message}`, 'ledger_error');

    await adminClient.from('refund_requests').update({
        status:               'approved',
        approved_by_user_id:  approvedByUserId,
        ledger_entry_id:      (entry as any)?.id ?? null,
        processed_at:         new Date().toISOString(),
    }).eq('id', refundRequestId);

    await logAction({
        actorUserId: approvedByUserId,
        actorType:   'staff',
        action:      'refund.approved',
        targetId:    refundRequestId,
        metadata:    { amount_minor: (req as any).amount_minor, wallet_id: (req as any).wallet_id },
    });
}

export async function rejectRefund(refundRequestId: string, rejectedByUserId: string, reason: string): Promise<void> {
    const { data: req } = await adminClient
        .from('refund_requests')
        .select('status')
        .eq('id', refundRequestId)
        .single();

    if (!req) throw new RefundError('Refund request not found', 'not_found');
    if ((req as any).status !== 'pending') throw new RefundError('Refund is not pending', 'invalid_status');

    await adminClient.from('refund_requests').update({
        status:              'rejected',
        rejected_by_user_id: rejectedByUserId,
        processed_at:        new Date().toISOString(),
        reason:              `${(req as any).reason} [Rejected: ${reason}]`,
    }).eq('id', refundRequestId);

    await logAction({
        actorUserId: rejectedByUserId,
        actorType:   'staff',
        action:      'refund.rejected',
        targetId:    refundRequestId,
        metadata:    { reason },
    });
}

export async function listRefundRequests(opts: { status?: string; limit?: number }) {
    let query = adminClient
        .from('refund_requests')
        .select('*, wallets(owner_type, owner_id)')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 200);
    if (opts.status) query = query.eq('status', opts.status);
    const { data } = await query;
    return data ?? [];
}
