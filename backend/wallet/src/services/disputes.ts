/**
 * Dispute service — Phase 6
 *
 * Both customers and vendors can raise disputes against purchase orders.
 * Staff reviews, responds, and resolves them.
 * A resolved dispute can trigger a refund_request.
 */
import { adminClient } from '../db/supabase.js';
import { notifyDisputeUpdate } from './notifications.js';

export class DisputeError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'DisputeError';
    }
}

export async function raiseDispute(input: {
    raisedByActorType: 'customer' | 'vendor';
    raisedByActorId: string;
    customerId?: string;
    vendorOrganizationId?: string;
    purchaseOrderId?: string;
    subject: string;
    description: string;
}): Promise<{ id: string; reference: string }> {
    const { data, error } = await adminClient
        .from('disputes')
        .insert({
            raised_by_actor_type:  input.raisedByActorType,
            raised_by_actor_id:    input.raisedByActorId,
            customer_id:           input.customerId ?? null,
            vendor_organization_id: input.vendorOrganizationId ?? null,
            purchase_order_id:     input.purchaseOrderId ?? null,
            subject:               input.subject,
            description:           input.description,
        })
        .select('id, reference')
        .single();

    if (error || !data) throw new DisputeError('Could not create dispute', 'db_error');
    return { id: (data as any).id, reference: (data as any).reference };
}

export async function addMessage(input: {
    disputeId: string;
    senderActorType: 'customer' | 'vendor' | 'staff';
    senderActorId: string;
    body: string;
}): Promise<void> {
    const { error } = await adminClient.from('dispute_messages').insert({
        dispute_id:       input.disputeId,
        sender_actor_type: input.senderActorType,
        sender_actor_id:  input.senderActorId,
        body:             input.body,
    });
    if (error) throw new DisputeError('Could not post message', 'db_error');

    // Bump updated_at on parent dispute
    await adminClient.from('disputes').update({ updated_at: new Date().toISOString() }).eq('id', input.disputeId);
}

export async function updateDisputeStatus(input: {
    disputeId: string;
    status: 'open' | 'under_review' | 'resolved' | 'rejected' | 'refund_issued';
    resolutionNote?: string;
    resolvedByUserId?: string;
}): Promise<void> {
    const patch: Record<string, unknown> = { status: input.status };
    if (input.resolutionNote)   patch.resolution_note    = input.resolutionNote;
    if (input.resolvedByUserId) patch.resolved_by_user_id = input.resolvedByUserId;
    if (input.status === 'resolved' || input.status === 'rejected' || input.status === 'refund_issued') {
        patch.resolved_at = new Date().toISOString();
    }
    await adminClient.from('disputes').update(patch).eq('id', input.disputeId);

    // Notify the customer who raised the dispute (if any)
    const { data: dispute } = await adminClient
        .from('disputes')
        .select('customer_id')
        .eq('id', input.disputeId)
        .maybeSingle();
    if ((dispute as any)?.customer_id) {
        notifyDisputeUpdate((dispute as any).customer_id, {
            disputeId: input.disputeId,
            status: input.status,
            message: input.resolutionNote,
        }).catch(() => undefined);
    }
}

export async function getDispute(disputeId: string) {
    const { data } = await adminClient
        .from('disputes')
        .select('*, dispute_messages(* order by created_at asc)')
        .eq('id', disputeId)
        .single();
    return data ? (await withPurchaseContext(data)) : data;
}

export async function listDisputes(opts: {
    customerId?: string;
    vendorOrganizationId?: string;
    status?: string;
    limit?: number;
}) {
    let query = adminClient
        .from('disputes')
        .select('id, reference, subject, status, raised_by_actor_type, purchase_order_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 100);

    if (opts.customerId)           query = query.eq('customer_id', opts.customerId);
    if (opts.vendorOrganizationId) query = query.eq('vendor_organization_id', opts.vendorOrganizationId);
    if (opts.status)               query = query.eq('status', opts.status);

    const { data } = await query;
    return withPurchaseContexts(data ?? []);
}

export async function listAllDisputes(opts: { status?: string; limit?: number }) {
    let query = adminClient
        .from('disputes')
        .select('*, customers(users(full_name, phone)), vendor_organizations(trading_name, legal_name)')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 200);
    if (opts.status) query = query.eq('status', opts.status);
    const { data } = await query;
    return withPurchaseContexts(data ?? []);
}

async function withPurchaseContext(dispute: any) {
    const [row] = await withPurchaseContexts([dispute]);
    return row;
}

async function withPurchaseContexts(disputes: any[]) {
    const ids = [...new Set(disputes.map((d) => d.purchase_order_id).filter(Boolean))];
    if (!ids.length) return disputes;

    const { data: purchases } = await adminClient
        .from('purchase_orders')
        .select('id, meter_id, meter_type, customer_name, station_id, amount_minor, units_kwh, status, created_at')
        .in('id', ids);
    const byId = new Map((purchases ?? []).map((p: any) => [p.id, p]));
    return disputes.map((d) => ({
        ...d,
        purchase_order: d.purchase_order_id ? byId.get(d.purchase_order_id) ?? null : null,
    }));
}
