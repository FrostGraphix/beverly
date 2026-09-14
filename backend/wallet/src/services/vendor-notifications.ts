import { adminClient } from '../db/supabase.js';
import { sendWebPush } from './push-notifications.js';

export interface VendorNotification {
    vendorOrganizationId: string;
    type: string;
    title: string;
    body: string;
    path: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
}

export async function notifyVendor(input: VendorNotification): Promise<boolean> {
    const row = {
        customer_id: null,
        vendor_organization_id: input.vendorOrganizationId,
        recipient_type: 'vendor',
        recipient_id: input.vendorOrganizationId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: { ...input.metadata, path: input.path },
        dedupe_key: input.dedupeKey ?? null,
        read: false,
    };
    const query = input.dedupeKey
        ? adminClient.from('notifications').upsert(row, { onConflict: 'recipient_type,recipient_id,dedupe_key', ignoreDuplicates: true })
        : adminClient.from('notifications').insert(row);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) return false;
    await sendWebPush('vendor', input.vendorOrganizationId, {
        title: input.title, body: input.body, url: input.path, tag: `notification:${data.id}`,
    }, 'vendor').catch(() => undefined);
    return true;
}
