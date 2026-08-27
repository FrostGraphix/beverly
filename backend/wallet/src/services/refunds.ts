/**
 * Refund service — Phase 6
 *
 * Closed-loop: refunds credit the customer or vendor wallet via the ledger.
 * No gateway reverse — only issued for failed/undelivered service.
 * Maker-checker: finance role approves, different person from requester.
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';
import { notifyOperationalStaff } from './operational-notifications.js';

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

    await notifyOperationalStaff({
        permission: 'wallet.refunds.manage',
        type: 'refund_approval',
        title: 'Refund approval requested',
        body: `A ${input.amountMinor / 100} NGN refund requires review.`,
        path: '/refunds',
        dedupeKey: `refund.requested.${(data as any).id}`,
        excludeRecipientId: input.requestedByUserId,
        metadata: { refundRequestId: (data as any).id, disputeId: input.disputeId ?? null, amountMinor: input.amountMinor },
    }).catch(() => undefined);

    return (data as any).id;
}

export async function approveRefund(refundRequestId: string, approvedByUserId: string, amountMinor?: number): Promise<void> {
    const { data: approved, error } = await adminClient.rpc('fn_approve_refund_request', {
        p_refund_request_id: refundRequestId,
        p_approved_by_user_id: approvedByUserId,
        p_amount_minor: amountMinor ?? null,
    });
    if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('not found')) throw new RefundError('Refund request not found', 'not_found');
        if (message.includes('not pending')) throw new RefundError('Refund is not pending', 'invalid_status');
        if (message.includes('maker-checker')) throw new RefundError('Approver must be different from requester (maker-checker)', 'maker_checker_violation');
        if (message.includes('missing ledger entry')) throw new RefundError('Approved refund is missing its ledger entry. Manual reconciliation required.', 'state_transition_missing');
        if (message.includes('partial refund amount')) throw new RefundError('Partial amount must be greater than zero and cannot exceed the requested amount', 'invalid_amount');
        if (message.includes('wallet')) throw new RefundError(`Ledger write failed: ${error.message}`, 'ledger_error');
        throw new RefundError(`Refund approval failed: ${error.message}`, 'approve_failed');
    }
    const req = approved as any;

    await logAction({
        actorUserId: approvedByUserId,
        actorType:   'staff',
        action:      'refund.approved',
        targetId:    refundRequestId,
        metadata:    {
            amount_minor: req?.amount_minor,
            approved_amount_minor: req?.approved_amount_minor ?? req?.amount_minor,
            wallet_id: req?.wallet_id,
            ledger_entry_id: req?.ledger_entry_id ?? null,
        },
    });
}

export async function rejectRefund(refundRequestId: string, rejectedByUserId: string, reason: string): Promise<void> {
    const { data: req } = await adminClient
        .from('refund_requests')
        .select('status, reason')
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

export async function getRefundSummary() {
    const statuses = ['pending', 'approved', 'rejected', 'expired'] as const;
    const [total, ...statusCounts] = await Promise.all([
        adminClient.from('refund_requests').select('id', { count: 'exact', head: true }),
        ...statuses.map((status) => adminClient
            .from('refund_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', status)),
    ]);
    const failed = [total, ...statusCounts].find((result) => result.error);
    if (failed?.error) throw new RefundError('Could not load refund summary', 'db_error');
    return {
        total: total.count ?? 0,
        pending: statusCounts[0].count ?? 0,
        approved: statusCounts[1].count ?? 0,
        rejected: statusCounts[2].count ?? 0,
        expired: statusCounts[3].count ?? 0,
    };
}
