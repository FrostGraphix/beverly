import { adminClient } from '../db/supabase.js';
import { sendWebPush } from './push-notifications.js';

type StaffRow = {
    auth_user_id?: string | null;
    user_id?: string | null;
    role_key?: string | null;
    station_id?: string | null;
    station_ids?: string[] | null;
};

export interface OperationalNotificationInput {
    permission: string;
    type: string;
    title: string;
    body: string;
    path: string;
    dedupeKey: string;
    stationId?: string | null;
    stationIds?: string[];
    excludeRecipientId?: string;
    metadata?: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function eligibleStaffRecipients(rows: StaffRow[], stationIds: string[] = []): string[] {
    const recipientIds = rows.flatMap((row) => {
        const recipientId = row.auth_user_id ?? row.user_id;
        if (!recipientId || !UUID.test(recipientId)) return [];
        if (!stationIds.length || row.role_key === 'super-admin') return [recipientId];
        const assigned = new Set([row.station_id, ...(row.station_ids ?? [])].filter(Boolean));
        if (assigned.has('*')) return [recipientId];
        return stationIds.some((stationId) => assigned.has(stationId)) ? [recipientId] : [];
    });
    return [...new Set(recipientIds)];
}

async function staffRowsForPermission(permission: string): Promise<StaffRow[]> {
    const { data: grants, error: grantsError } = await adminClient
        .from('permissions')
        .select('role_key')
        .eq('route_hash', permission);
    if (grantsError) throw grantsError;
    const roleKeys = [...new Set((grants ?? []).map((row: any) => row.role_key).filter(Boolean))];
    if (!roleKeys.length) return [];

    let result = await adminClient
        .from('users')
        .select('auth_user_id, user_id, role_key, station_id, station_ids')
        .in('role_key', roleKeys);
    if (result.error && /station_ids/i.test(result.error.message)) {
        result = await adminClient
            .from('users')
            .select('auth_user_id, user_id, role_key, station_id')
            .in('role_key', roleKeys) as typeof result;
    }
    if (result.error) throw result.error;
    return (result.data ?? []) as StaffRow[];
}

export async function notifyOperationalStaff(input: OperationalNotificationInput): Promise<number> {
    const stations = [...new Set([input.stationId, ...(input.stationIds ?? [])].filter(Boolean))] as string[];
    const recipients = eligibleStaffRecipients(await staffRowsForPermission(input.permission), stations)
        .filter((recipientId) => recipientId !== input.excludeRecipientId);
    if (!recipients.length) return 0;

    const rows = recipients.map((recipientId) => ({
        customer_id: null,
        recipient_type: 'staff',
        recipient_id: recipientId,
        vendor_organization_id: null,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: { ...input.metadata, path: input.path },
        dedupe_key: input.dedupeKey,
        read: false,
    }));
    const { data, error } = await adminClient
        .from('notifications')
        .upsert(rows, {
            onConflict: 'recipient_type,recipient_id,dedupe_key',
            ignoreDuplicates: true,
        })
        .select('recipient_id');
    if (error) throw error;

    const inserted = [...new Set((data ?? []).map((row: any) => row.recipient_id).filter(Boolean))];
    await Promise.all(inserted.map((recipientId) => sendWebPush('staff', recipientId, {
        title: input.title,
        body: input.body,
        url: input.path,
        tag: input.dedupeKey,
    }, 'admin').catch(() => ({ sent: 0, failed: 1 }))));
    return inserted.length;
}
