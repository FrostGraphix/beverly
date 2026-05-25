/**
 * Support service — FAQ knowledge base, Ticketing, and Quick Chat.
 *
 * Customers and vendors can browse FAQs, raise tickets, and start live chats.
 * Staff manage FAQs, work the ticket queue, and answer chats from the admin console.
 * All access flows through the service-role adminClient (RLS-enabled tables).
 */
import { adminClient } from '../db/supabase.js';
import { notifyDisputeUpdate } from './notifications.js';

export class SupportError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'SupportError';
    }
}

export type SupportActorType = 'customer' | 'vendor' | 'staff' | 'system';
type Audience = 'all' | 'customer' | 'vendor';

// ════════════════════════════════════════════════════════════════════════════
// FAQ
// ════════════════════════════════════════════════════════════════════════════
export async function listFaqCategories(audience: Audience = 'all') {
    let query = adminClient
        .from('support_faq_categories')
        .select('*')
        .order('sort_order', { ascending: true });
    if (audience !== 'all') query = query.in('audience', ['all', audience]);
    const { data } = await query;
    return data ?? [];
}

export async function listFaqs(opts: {
    audience?: Audience;
    categoryId?: string;
    search?: string;
    includeUnpublished?: boolean;
    limit?: number;
}) {
    let query = adminClient
        .from('support_faqs')
        .select('*')
        .order('sort_order', { ascending: true })
        .limit(opts.limit ?? 200);

    if (!opts.includeUnpublished) query = query.eq('published', true);
    if (opts.categoryId) query = query.eq('category_id', opts.categoryId);
    if (opts.audience && opts.audience !== 'all') query = query.in('audience', ['all', opts.audience]);
    if (opts.search && opts.search.trim()) {
        const term = opts.search.trim().replace(/[%,()]/g, ' ');
        query = query.or(`question.ilike.%${term}%,answer.ilike.%${term}%`);
    }

    const { data } = await query;
    return data ?? [];
}

export async function voteFaq(faqId: string, helpful: boolean): Promise<void> {
    const column = helpful ? 'helpful_count' : 'not_helpful_count';
    const { data } = await adminClient.from('support_faqs').select(column).eq('id', faqId).maybeSingle();
    if (!data) throw new SupportError('FAQ not found', 'not_found');
    const current = Number((data as any)[column] ?? 0);
    await adminClient.from('support_faqs').update({ [column]: current + 1 }).eq('id', faqId);
}

export async function incrementFaqView(faqId: string): Promise<void> {
    const { data } = await adminClient.from('support_faqs').select('view_count').eq('id', faqId).maybeSingle();
    if (!data) return;
    await adminClient.from('support_faqs').update({ view_count: Number((data as any).view_count ?? 0) + 1 }).eq('id', faqId);
}

// Admin CRUD
export async function upsertFaqCategory(input: {
    id?: string;
    slug: string;
    title: string;
    description?: string;
    icon?: string;
    audience?: Audience;
    sortOrder?: number;
}) {
    const row = {
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        icon: input.icon ?? null,
        audience: input.audience ?? 'all',
        sort_order: input.sortOrder ?? 0,
    };
    if (input.id) {
        const { error } = await adminClient.from('support_faq_categories').update(row).eq('id', input.id);
        if (error) throw new SupportError('Could not update category', 'db_error');
        return { id: input.id };
    }
    const { data, error } = await adminClient.from('support_faq_categories').insert(row).select('id').single();
    if (error || !data) throw new SupportError('Could not create category', 'db_error');
    return { id: (data as any).id };
}

export async function deleteFaqCategory(id: string): Promise<void> {
    await adminClient.from('support_faq_categories').delete().eq('id', id);
}

export async function upsertFaq(input: {
    id?: string;
    categoryId?: string | null;
    question: string;
    answer: string;
    audience?: Audience;
    tags?: string[];
    sortOrder?: number;
    published?: boolean;
}) {
    const row = {
        category_id: input.categoryId ?? null,
        question: input.question,
        answer: input.answer,
        audience: input.audience ?? 'all',
        tags: input.tags ?? [],
        sort_order: input.sortOrder ?? 0,
        published: input.published ?? true,
    };
    if (input.id) {
        const { error } = await adminClient.from('support_faqs').update(row).eq('id', input.id);
        if (error) throw new SupportError('Could not update FAQ', 'db_error');
        return { id: input.id };
    }
    const { data, error } = await adminClient.from('support_faqs').insert(row).select('id').single();
    if (error || !data) throw new SupportError('Could not create FAQ', 'db_error');
    return { id: (data as any).id };
}

export async function deleteFaq(id: string): Promise<void> {
    await adminClient.from('support_faqs').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════════════════
// Tickets
// ════════════════════════════════════════════════════════════════════════════
export async function createTicket(input: {
    requesterActorType: SupportActorType;
    requesterActorId: string;
    requesterName?: string;
    customerId?: string;
    vendorOrganizationId?: string;
    category?: string;
    subject: string;
    description: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
}): Promise<{ id: string; reference: string }> {
    const { data, error } = await adminClient
        .from('support_tickets')
        .insert({
            requester_actor_type: input.requesterActorType,
            requester_actor_id: input.requesterActorId,
            requester_name: input.requesterName ?? null,
            customer_id: input.customerId ?? null,
            vendor_organization_id: input.vendorOrganizationId ?? null,
            category: input.category ?? 'general',
            subject: input.subject,
            priority: input.priority ?? 'normal',
            last_message_actor_type: input.requesterActorType,
        })
        .select('id, reference')
        .single();
    if (error || !data) throw new SupportError('Could not create ticket', 'db_error');

    const ticketId = (data as any).id as string;
    // Seed the first message with the description.
    await adminClient.from('support_ticket_messages').insert({
        ticket_id: ticketId,
        sender_actor_type: input.requesterActorType,
        sender_actor_id: input.requesterActorId,
        sender_name: input.requesterName ?? null,
        body: input.description,
    });

    return { id: ticketId, reference: (data as any).reference };
}

export async function addTicketMessage(input: {
    ticketId: string;
    senderActorType: SupportActorType;
    senderActorId?: string;
    senderName?: string;
    body: string;
    isInternal?: boolean;
}): Promise<void> {
    const { error } = await adminClient.from('support_ticket_messages').insert({
        ticket_id: input.ticketId,
        sender_actor_type: input.senderActorType,
        sender_actor_id: input.senderActorId ?? null,
        sender_name: input.senderName ?? null,
        body: input.body,
        is_internal: input.isInternal ?? false,
    });
    if (error) throw new SupportError('Could not post message', 'db_error');

    if (!input.isInternal) {
        const patch: Record<string, unknown> = {
            last_message_at: new Date().toISOString(),
            last_message_actor_type: input.senderActorType,
        };
        // Staff reply moves an open ticket to awaiting_customer; customer reply re-opens.
        if (input.senderActorType === 'staff') patch.status = 'awaiting_customer';
        else if (input.senderActorType === 'customer' || input.senderActorType === 'vendor') patch.status = 'pending';
        await adminClient.from('support_tickets').update(patch).eq('id', input.ticketId);

        if (input.senderActorType === 'staff') {
            const { data: t } = await adminClient.from('support_tickets').select('customer_id, reference').eq('id', input.ticketId).maybeSingle();
            if ((t as any)?.customer_id) {
                notifyDisputeUpdate((t as any).customer_id, {
                    disputeId: input.ticketId,
                    status: 'reply',
                    message: `Support replied to ${(t as any).reference}`,
                }).catch(() => undefined);
            }
        }
    }
}

export async function getTicket(ticketId: string) {
    const { data: ticket } = await adminClient
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
    if (!ticket) return null;
    const { data: messages } = await adminClient
        .from('support_ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
    (ticket as any).support_ticket_messages = messages ?? [];
    return ticket;
}

export async function listTickets(opts: {
    customerId?: string;
    vendorOrganizationId?: string;
    status?: string;
    assignedToUserId?: string;
    search?: string;
    limit?: number;
}) {
    let query = adminClient
        .from('support_tickets')
        .select('id, reference, subject, category, priority, status, requester_actor_type, requester_name, customer_id, vendor_organization_id, assigned_to_user_id, last_message_at, last_message_actor_type, created_at, updated_at')
        .order('last_message_at', { ascending: false })
        .limit(opts.limit ?? 200);

    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.vendorOrganizationId) query = query.eq('vendor_organization_id', opts.vendorOrganizationId);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.assignedToUserId) query = query.eq('assigned_to_user_id', opts.assignedToUserId);
    if (opts.search && opts.search.trim()) {
        const term = opts.search.trim().replace(/[%,()]/g, ' ');
        query = query.or(`subject.ilike.%${term}%,reference.ilike.%${term}%`);
    }

    const { data } = await query;
    return data ?? [];
}

export async function updateTicket(input: {
    ticketId: string;
    status?: 'open' | 'pending' | 'awaiting_customer' | 'resolved' | 'closed';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    category?: string;
    assignedToUserId?: string | null;
}): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.status) {
        patch.status = input.status;
        if (input.status === 'resolved') patch.resolved_at = new Date().toISOString();
        if (input.status === 'closed') patch.closed_at = new Date().toISOString();
    }
    if (input.priority) patch.priority = input.priority;
    if (input.category) patch.category = input.category;
    if (input.assignedToUserId !== undefined) patch.assigned_to_user_id = input.assignedToUserId;
    if (Object.keys(patch).length === 0) return;
    await adminClient.from('support_tickets').update(patch).eq('id', input.ticketId);

    if (input.status === 'resolved' || input.status === 'closed') {
        const { data: t } = await adminClient.from('support_tickets').select('customer_id, reference').eq('id', input.ticketId).maybeSingle();
        if ((t as any)?.customer_id) {
            notifyDisputeUpdate((t as any).customer_id, {
                disputeId: input.ticketId,
                status: input.status,
                message: `Ticket ${(t as any).reference} ${input.status}`,
            }).catch(() => undefined);
        }
    }
}

export async function ticketStats() {
    const { data } = await adminClient.from('support_tickets').select('status').limit(5000);
    const rows = (data ?? []) as Array<{ status: string }>;
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
    return {
        total: rows.length,
        open: by.open ?? 0,
        pending: by.pending ?? 0,
        awaiting_customer: by.awaiting_customer ?? 0,
        resolved: by.resolved ?? 0,
        closed: by.closed ?? 0,
    };
}

// ════════════════════════════════════════════════════════════════════════════
// Quick Chat
// ════════════════════════════════════════════════════════════════════════════
const CHAT_GREETING =
    'Hi! 👋 You’re chatting with Beverly Support. Ask a question and a team member will join shortly. Meanwhile, check the suggested help topics below.';

export async function getOrCreateChatSession(input: {
    requesterActorType: SupportActorType;
    requesterActorId?: string;
    displayName?: string;
    customerId?: string;
    vendorOrganizationId?: string;
    subject?: string;
}): Promise<{ id: string; created: boolean }> {
    // Resume an existing non-ended session for this requester.
    if (input.requesterActorId) {
        const { data: existing } = await adminClient
            .from('support_chat_sessions')
            .select('id')
            .eq('requester_actor_id', input.requesterActorId)
            .neq('status', 'ended')
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (existing) return { id: (existing as any).id, created: false };
    }

    const { data, error } = await adminClient
        .from('support_chat_sessions')
        .insert({
            requester_actor_type: input.requesterActorType,
            requester_actor_id: input.requesterActorId ?? null,
            display_name: input.displayName ?? null,
            customer_id: input.customerId ?? null,
            vendor_organization_id: input.vendorOrganizationId ?? null,
            subject: input.subject ?? null,
            status: 'active',
        })
        .select('id')
        .single();
    if (error || !data) throw new SupportError('Could not start chat', 'db_error');

    const sessionId = (data as any).id as string;
    await adminClient.from('support_chat_messages').insert({
        session_id: sessionId,
        sender_actor_type: 'system',
        sender_name: 'Beverly Support',
        body: CHAT_GREETING,
        kind: 'bot',
    });
    return { id: sessionId, created: true };
}

export async function sendChatMessage(input: {
    sessionId: string;
    senderActorType: SupportActorType;
    senderActorId?: string;
    senderName?: string;
    body: string;
    kind?: string;
}): Promise<void> {
    const { error } = await adminClient.from('support_chat_messages').insert({
        session_id: input.sessionId,
        sender_actor_type: input.senderActorType,
        sender_actor_id: input.senderActorId ?? null,
        sender_name: input.senderName ?? null,
        body: input.body,
        kind: input.kind ?? 'text',
    });
    if (error) throw new SupportError('Could not send message', 'db_error');

    // Maintain unread counters + waiting status.
    const { data: s } = await adminClient
        .from('support_chat_sessions')
        .select('unread_for_staff, unread_for_user, status')
        .eq('id', input.sessionId)
        .maybeSingle();
    if (!s) return;
    const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    const fromUser = input.senderActorType === 'customer' || input.senderActorType === 'vendor';
    if (fromUser) {
        patch.unread_for_staff = Number((s as any).unread_for_staff ?? 0) + 1;
        if ((s as any).status === 'ended') patch.status = 'active';
        else patch.status = 'waiting';
    } else if (input.senderActorType === 'staff') {
        patch.unread_for_user = Number((s as any).unread_for_user ?? 0) + 1;
        patch.status = 'active';
    }
    await adminClient.from('support_chat_sessions').update(patch).eq('id', input.sessionId);
}

export async function getChatMessages(sessionId: string, opts?: { since?: string; viewer?: 'user' | 'staff' }) {
    let query = adminClient
        .from('support_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(500);
    if (opts?.since) query = query.gt('created_at', opts.since);
    const { data } = await query;

    // Reset unread counter for the viewer.
    if (opts?.viewer === 'user') {
        await adminClient.from('support_chat_sessions').update({ unread_for_user: 0 }).eq('id', sessionId);
    } else if (opts?.viewer === 'staff') {
        await adminClient.from('support_chat_sessions').update({ unread_for_staff: 0 }).eq('id', sessionId);
    }
    return data ?? [];
}

export async function getChatSession(sessionId: string) {
    const { data } = await adminClient.from('support_chat_sessions').select('*').eq('id', sessionId).maybeSingle();
    return data;
}

export async function listChatSessions(opts: { status?: string; assignedToUserId?: string; limit?: number }) {
    let query = adminClient
        .from('support_chat_sessions')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(opts.limit ?? 100);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.assignedToUserId) query = query.eq('assigned_to_user_id', opts.assignedToUserId);
    const { data } = await query;
    return data ?? [];
}

export async function endChatSession(sessionId: string): Promise<void> {
    await adminClient.from('support_chat_sessions').update({ status: 'ended' }).eq('id', sessionId);
    await adminClient.from('support_chat_messages').insert({
        session_id: sessionId,
        sender_actor_type: 'system',
        sender_name: 'Beverly Support',
        body: 'This chat has been closed. Start a new chat any time you need us.',
        kind: 'system',
    });
}

export async function assignChatSession(sessionId: string, userId: string): Promise<void> {
    await adminClient.from('support_chat_sessions').update({ assigned_to_user_id: userId, status: 'active' }).eq('id', sessionId);
}

export async function escalateChatToTicket(input: {
    sessionId: string;
    requesterActorType: SupportActorType;
    requesterActorId: string;
    requesterName?: string;
    customerId?: string;
    vendorOrganizationId?: string;
    subject: string;
}): Promise<{ id: string; reference: string }> {
    const messages = await getChatMessages(input.sessionId);
    const transcript = (messages as any[])
        .filter((m) => m.kind === 'text')
        .map((m) => `${m.sender_name || m.sender_actor_type}: ${m.body}`)
        .join('\n');

    const ticket = await createTicket({
        requesterActorType: input.requesterActorType,
        requesterActorId: input.requesterActorId,
        requesterName: input.requesterName,
        customerId: input.customerId,
        vendorOrganizationId: input.vendorOrganizationId,
        category: 'chat-escalation',
        subject: input.subject,
        description: `Escalated from live chat.\n\n--- Transcript ---\n${transcript || '(no messages)'}`,
    });

    await adminClient.from('support_chat_sessions').update({ ticket_id: ticket.id }).eq('id', input.sessionId);
    await adminClient.from('support_chat_messages').insert({
        session_id: input.sessionId,
        sender_actor_type: 'system',
        sender_name: 'Beverly Support',
        body: `Your chat was turned into ticket ${ticket.reference}. We’ll follow up there.`,
        kind: 'system',
    });
    return ticket;
}
