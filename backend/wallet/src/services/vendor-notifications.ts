import { adminClient } from '../db/supabase.js';
import { sendVendorPush } from './vendor-push.js';

export type VendorNotificationType =
    | 'funding_update'
    | 'wallet_activity'
    | 'vending_update'
    | 'dispute_update'
    | 'support_update'
    | 'security_update';

export async function notifyVendor(
    vendorOrganizationId: string | null | undefined,
    payload: {
        type: VendorNotificationType;
        title: string;
        body: string;
        eventKey: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
    },
): Promise<void> {
    if (!vendorOrganizationId) return;
    try {
        const { data: existing } = await adminClient
            .from('notifications')
            .select('id')
            .eq('vendor_organization_id', vendorOrganizationId)
            .contains('metadata', { event_key: payload.eventKey })
            .maybeSingle();
        if (existing) return;

        const { error } = await adminClient.from('notifications').insert({
            customer_id: null,
            recipient_type: 'vendor',
            recipient_id: vendorOrganizationId,
            vendor_organization_id: vendorOrganizationId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            message: payload.body,
            metadata: { ...payload.metadata, event_key: payload.eventKey },
            read: false,
            ...(payload.createdAt ? { created_at: payload.createdAt } : {}),
        });
        if (error) {
            console.error('[vendor-notifications] in-app write failed:', error);
            return;
        }
        if (!payload.createdAt) {
            await sendVendorPush(vendorOrganizationId, {
                title: payload.title,
                body: payload.body,
                eventKey: payload.eventKey,
                path: typeof payload.metadata?.path === 'string' ? payload.metadata.path : undefined,
            }).catch((pushError) => console.error('[vendor-notifications] device delivery failed:', pushError));
        }
    } catch (error) {
        console.error('[vendor-notifications] in-app write failed:', error);
    }
}

export async function notifyWalletEntry(entry: {
    id: string;
    wallet_id: string;
    direction: 'credit' | 'debit';
    amount_minor: number;
    entry_type: string;
    reference_id: string | null;
}): Promise<void> {
    const { data: wallet } = await adminClient
        .from('wallets')
        .select('owner_type, owner_id')
        .eq('id', entry.wallet_id)
        .maybeSingle();
    const ownerType = (wallet as any)?.owner_type;
    const ownerId = (wallet as any)?.owner_id;
    if (!ownerId || !['vendor', 'customer'].includes(ownerType)) return;

    const amount = `₦${(entry.amount_minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const labels: Record<string, [string, string]> = {
        funding_credit: ['Wallet funded', `${amount} was added to your wallet.`],
        purchase_debit: ['Token purchase completed', `${amount} was deducted for vending.`],
        reversal_credit: ['Reversal received', `${amount} was returned to your wallet.`],
        reversal_debit: ['Reversal posted', `${amount} was reversed from your wallet.`],
        refund_credit: ['Refund received', `${amount} was refunded to your wallet.`],
        fee_debit: ['Wallet fee posted', `${amount} was charged to your wallet.`],
        promo_credit: ['Promotional credit received', `${amount} was added to your wallet.`],
        manual_credit: ['Manual credit received', `${amount} was added to your wallet.`],
        manual_debit: ['Manual debit posted', `${amount} was deducted from your wallet.`],
    };
    const [title, body] = labels[entry.entry_type] ?? [
        'Wallet activity',
        `${amount} ${entry.direction === 'credit' ? 'was added to' : 'was deducted from'} your wallet.`,
    ];
    if (ownerType === 'customer') {
        if (['funding_credit', 'purchase_debit'].includes(entry.entry_type)) return;
        await adminClient.from('notifications').insert({
            customer_id: ownerId,
            recipient_type: 'customer',
            recipient_id: ownerId,
            type: 'wallet_activity',
            title,
            body,
            message: body,
            metadata: { event_key: `ledger:${entry.id}`, ledger_entry_id: entry.id, path: '/wallet' },
            read: false,
        });
        return;
    }

    await notifyVendor(ownerId, {
        type: entry.entry_type === 'funding_credit'
            ? 'funding_update'
            : entry.entry_type === 'purchase_debit' ? 'vending_update' : 'wallet_activity',
        title,
        body,
        eventKey: `ledger:${entry.id}`,
        metadata: { ledger_entry_id: entry.id, reference_id: entry.reference_id, path: '/wallet' },
    });
}

export async function backfillVendorFundingNotifications(vendorOrganizationId: string): Promise<void> {
    const { data: wallet } = await adminClient
        .from('wallets')
        .select('id')
        .eq('owner_type', 'vendor')
        .eq('owner_id', vendorOrganizationId)
        .maybeSingle();
    if (!wallet?.id) return;

    // ponytail: recent 50 credits cover the inbox; page older history if backfills exceed that ceiling.
    const { data: entries, error } = await adminClient
        .from('wallet_ledger_entries')
        .select('id, amount_minor, reference_id, created_at')
        .eq('wallet_id', wallet.id)
        .eq('entry_type', 'funding_credit')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;

    await Promise.all((entries ?? []).map((entry: any) => notifyVendor(vendorOrganizationId, {
        type: 'funding_update',
        title: 'Wallet funded',
        body: `₦${(Number(entry.amount_minor) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })} was added to your wallet.`,
        eventKey: `ledger:${entry.id}`,
        metadata: { ledger_entry_id: entry.id, reference_id: entry.reference_id, path: '/wallet' },
        createdAt: entry.created_at,
    })));
}
