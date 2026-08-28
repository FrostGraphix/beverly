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
import { notifyRefundUpdate } from './notifications.js';

export class RefundError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'RefundError';
    }
}

export type RefundSource = 'manual' | 'dispute' | 'meter_order_rejection';

async function notifyRefundOwner(refund: any, status: 'approved' | 'rejected', reason?: string): Promise<void> {
    if (!refund?.wallet_id) return;
    const { data: wallet, error } = await adminClient
        .from('wallets')
        .select('owner_type, owner_id')
        .eq('id', refund.wallet_id)
        .maybeSingle();
    if (error || !wallet?.owner_id) return;
    const amountMinor = Number(refund.approved_amount_minor ?? refund.amount_minor ?? 0);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return;
    if (wallet.owner_type === 'customer') {
        await notifyRefundUpdate(wallet.owner_id, {
            refundRequestId: refund.id,
            status,
            amountMinor,
            reason,
        }).catch(() => undefined);
        return;
    }
    if (wallet.owner_type === 'vendor') {
        const approved = status === 'approved';
        const amount = `₦${(amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        await adminClient.from('notifications').insert({
            customer_id: null,
            recipient_type: 'vendor',
            recipient_id: wallet.owner_id,
            vendor_organization_id: wallet.owner_id,
            type: 'refund_update',
            title: approved ? 'Refund approved' : 'Refund declined',
            body: approved ? `${amount} has been credited to your vendor wallet.` : `The ${amount} refund request was declined.${reason ? ` ${reason}` : ''}`,
            metadata: { refundRequestId: refund.id, status, amountMinor, reason: reason ?? null, path: '/wallet' },
            read: false,
        }).then(() => undefined, () => undefined);
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
            source_type:          input.disputeId ? 'dispute' : 'manual',
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
    await notifyRefundOwner(req, 'approved');
}

export async function rejectRefund(refundRequestId: string, rejectedByUserId: string, reason: string): Promise<void> {
    const { data: req, error: readError } = await adminClient
        .from('refund_requests')
        .select('id, wallet_id, amount_minor, status, reason')
        .eq('id', refundRequestId)
        .single();

    if (readError && readError.code !== 'PGRST116') throw new RefundError(`Could not reject refund: ${readError.message}`, 'db_error');
    if (!req) throw new RefundError('Refund request not found', 'not_found');
    if ((req as any).status !== 'pending') throw new RefundError('Refund is not pending', 'invalid_status');

    const { data: rejected, error: updateError } = await adminClient.from('refund_requests').update({
        status:              'rejected',
        rejected_by_user_id: rejectedByUserId,
        processed_at:        new Date().toISOString(),
        reason:              `${(req as any).reason} [Rejected: ${reason}]`,
    }).eq('id', refundRequestId).eq('status', 'pending').select('id, wallet_id, amount_minor').maybeSingle();
    if (updateError) throw new RefundError(`Could not reject refund: ${updateError.message}`, 'db_error');
    if (!rejected) throw new RefundError('Refund is not pending', 'invalid_status');

    await logAction({
        actorUserId: rejectedByUserId,
        actorType:   'staff',
        action:      'refund.rejected',
        targetId:    refundRequestId,
        metadata:    { reason },
    });
    await notifyRefundOwner(rejected, 'rejected', reason);
}

export async function listRefundRequests(opts: { status?: string; source?: RefundSource; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = adminClient
        .from('refund_requests')
        .select('*, wallets(owner_type, owner_id)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.source) query = query.eq('source_type', opts.source);
    const { data, count, error } = await query;
    if (error) throw new RefundError(`Could not load refunds: ${error.message}`, 'db_error');
    return { refunds: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getRefundSummary() {
    const statuses = ['pending', 'approved', 'rejected', 'expired'] as const;
    const [total, ...counts] = await Promise.all([
        adminClient.from('refund_requests').select('id', { count: 'exact', head: true }),
        ...statuses.map((status) => adminClient
            .from('refund_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', status)),
        adminClient
            .from('refund_requests')
            .select('id', { count: 'exact', head: true })
            .eq('source_type', 'meter_order_rejection'),
    ]);
    const failed = [total, ...counts].find((result) => result.error);
    if (failed?.error) throw new RefundError('Could not load refund summary', 'db_error');
    return {
        total: total.count ?? 0,
        pending: counts[0].count ?? 0,
        approved: counts[1].count ?? 0,
        rejected: counts[2].count ?? 0,
        expired: counts[3].count ?? 0,
        meter_rejection: counts[4].count ?? 0,
    };
}
