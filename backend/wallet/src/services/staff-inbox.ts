import { adminClient } from '../db/supabase.js';

export async function notifyStaffInbox(payload: {
    type: string;
    title: string;
    body: string;
    eventKey: string;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    try {
        const { data: existing } = await adminClient
            .from('notifications')
            .select('id')
            .eq('recipient_type', 'admin')
            .contains('metadata', { event_key: payload.eventKey })
            .limit(1);
        if (existing?.length) return;

        const { data: staff } = await adminClient.from('users').select('auth_user_id, user_id');
        const recipientIds = Array.from(new Set((staff ?? [])
            .map((user: any) => user.auth_user_id ?? user.user_id)
            .filter(Boolean)));
        if (!recipientIds.length) return;

        const rows = recipientIds.map((recipientId) => ({
            customer_id: null,
            recipient_type: 'admin',
            recipient_id: recipientId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            metadata: { ...payload.metadata, event_key: payload.eventKey },
            read: false,
        }));
        for (let index = 0; index < rows.length; index += 500) {
            await adminClient.from('notifications').insert(rows.slice(index, index + 500));
        }
    } catch (error) {
        console.error('[staff-inbox] in-app write failed:', error);
    }
}
