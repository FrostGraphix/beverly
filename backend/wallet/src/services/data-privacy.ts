/**
 * Data privacy service — Phase 7 (NDPR compliance)
 *
 * NDPR = Nigeria Data Protection Regulation
 *
 * - Right to access: customer can request a full export of their data
 * - Right to erasure: customer can request account deletion (30-day cooling-off)
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';
import { exportsQueue } from '../queue/index.js';

export class PrivacyError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'PrivacyError';
    }
}

// ── Data export ───────────────────────────────────────────────────────────────

export async function requestDataExport(customerId: string): Promise<{ requestId: string }> {
    // Only one pending export at a time
    const { data: existing } = await adminClient
        .from('data_export_requests')
        .select('id, status')
        .eq('customer_id', customerId)
        .in('status', ['pending', 'processing', 'ready'])
        .limit(1)
        .single();

    if (existing) {
        return { requestId: (existing as any).id };
    }

    const { data, error } = await adminClient
        .from('data_export_requests')
        .insert({ customer_id: customerId })
        .select('id')
        .single();

    if (error || !data) throw new PrivacyError('Could not create export request', 'db_error');

    await logAction({
        actorUserId: customerId,
        actorType:   'customer',
        action:      'ndpr.data_export.requested',
        targetId:    (data as any).id,
    });
    try {
        await exportsQueue.add('build', { customerId, requestId: (data as any).id }, {
            jobId: `data-export:${(data as any).id}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 500,
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') throw error;
    }

    return { requestId: (data as any).id };
}

export async function getDataExportStatus(customerId: string): Promise<any> {
    const { data } = await adminClient
        .from('data_export_requests')
        .select('id, status, requested_at, processed_at, download_url, expires_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    return data ?? null;
}

export async function buildDataExport(customerId: string, requestId: string): Promise<Record<string, unknown>> {
    // Gather all personal data for this customer
    const [
        { data: customer },
        { data: wallets },
        { data: meters },
        { data: purchaseOrders },
        { data: disputes },
        { data: meterOrders },
    ] = await Promise.all([
        adminClient.from('customers').select('*, users(full_name, email, phone, created_at)').eq('id', customerId).single(),
        adminClient.from('wallets').select('id, balance_minor, currency, created_at').eq('owner_id', customerId).eq('owner_type', 'customer'),
        adminClient.from('customer_meters').select('meter_id, meter_type, alias, nickname, registered_at, created_at').eq('customer_id', customerId),
        adminClient.from('purchase_orders').select('id, meter_id, meter_type, amount_minor, units_kwh, status, created_at').eq('customer_id', customerId).limit(200),
        adminClient.from('disputes').select('id, reference, subject, status, created_at').eq('customer_id', customerId).limit(100),
        adminClient.from('meter_purchase_orders').select('id, meter_type, status, created_at').eq('customer_id', customerId).limit(50),
    ]);
    const walletIds = (wallets ?? []).map((wallet: any) => wallet.id).filter(Boolean);
    const { data: transactions } = walletIds.length
        ? await adminClient
            .from('wallet_ledger_entries')
            .select('id, wallet_id, direction, amount_minor, entry_type, reference_type, reference_id, memo, created_at')
            .in('wallet_id', walletIds)
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [] };

    await adminClient
        .from('data_export_requests')
        .update({ status: 'ready', processed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', requestId);

    return {
        exported_at: new Date().toISOString(),
        customer,
        wallets,
        transactions,
        meters,
        purchase_orders:  purchaseOrders,
        disputes,
        meter_orders:     meterOrders,
    };
}

// ── Account deletion ──────────────────────────────────────────────────────────

const COOLING_OFF_DAYS = 30;

export async function requestAccountDeletion(customerId: string, reason?: string): Promise<{ requestId: string; scheduledFor: string }> {
    // Check for existing pending deletion
    const { data: existing } = await adminClient
        .from('account_deletion_requests')
        .select('id, status, scheduled_for')
        .eq('customer_id', customerId)
        .eq('status', 'pending')
        .limit(1)
        .single();

    if (existing) {
        return { requestId: (existing as any).id, scheduledFor: (existing as any).scheduled_for };
    }

    const scheduledFor = new Date(Date.now() + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await adminClient
        .from('account_deletion_requests')
        .insert({ customer_id: customerId, reason: reason ?? null, scheduled_for: scheduledFor })
        .select('id')
        .single();

    if (error || !data) throw new PrivacyError('Could not create deletion request', 'db_error');

    await logAction({
        actorUserId: customerId,
        actorType:   'customer',
        action:      'ndpr.account_deletion.requested',
        targetId:    (data as any).id,
        metadata:    { scheduled_for: scheduledFor },
    });

    return { requestId: (data as any).id, scheduledFor };
}

export async function cancelDeletionRequest(customerId: string): Promise<void> {
    const { data } = await adminClient
        .from('account_deletion_requests')
        .select('id')
        .eq('customer_id', customerId)
        .eq('status', 'pending')
        .single();

    if (!data) throw new PrivacyError('No pending deletion request', 'not_found');

    await adminClient
        .from('account_deletion_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', (data as any).id);

    await logAction({
        actorUserId: customerId,
        actorType:   'customer',
        action:      'ndpr.account_deletion.cancelled',
        targetId:    (data as any).id,
    });
}

export async function listDeletionRequests(opts: { status?: string; limit?: number }) {
    let query = adminClient
        .from('account_deletion_requests')
        .select('*, customers(users(full_name, phone, email))')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 100);
    if (opts.status) query = query.eq('status', opts.status);
    const { data } = await query;
    return data ?? [];
}

export async function reviewDeletionRequest(requestId: string, staffUserId: string, approve: boolean, note?: string): Promise<void> {
    const newStatus = approve ? 'approved' : 'rejected';
    await adminClient
        .from('account_deletion_requests')
        .update({ status: newStatus, reviewed_by: staffUserId, reviewed_at: new Date().toISOString(), review_note: note ?? null, updated_at: new Date().toISOString() })
        .eq('id', requestId);

    await logAction({
        actorUserId: staffUserId,
        actorType:   'staff',
        action:      `ndpr.account_deletion.${newStatus}`,
        targetId:    requestId,
        metadata:    { note },
    });
}
