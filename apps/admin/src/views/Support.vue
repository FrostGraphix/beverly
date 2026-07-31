<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api } from '../lib/api';

type Tab = 'tickets' | 'chat' | 'faq';
const tab = ref<Tab>('tickets');

// ════════════════════════════════════════════════ Tickets
interface Ticket { id: string; reference: string; subject: string; status: string; category: string; priority: string; requester_actor_type: string; requester_name?: string; assigned_to_user_id?: string; last_message_at: string; created_at: string }
const tickets = ref<Ticket[]>([]);
const ticketStats = ref<Record<string, number>>({});
const ticketStatus = ref('');
const ticketSearch = ref('');
const ticketView = ref<'table' | 'grid'>('table');
const selTicket = ref<Ticket | null>(null);
const ticketDetail = ref<any>(null);
const staffReply = ref('');
const internalNote = ref(false);
const busy = ref(false);

async function loadTickets() {
    try {
        const [list, stats] = await Promise.all([
            api.get<{ tickets: Ticket[] }>(`/api/v1/admin/support/tickets?${ticketStatus.value ? `status=${ticketStatus.value}&` : ''}${ticketSearch.value ? `search=${encodeURIComponent(ticketSearch.value)}` : ''}`),
            api.get<Record<string, number>>('/api/v1/admin/support/tickets/stats'),
        ]);
        tickets.value = list.tickets ?? [];
        ticketStats.value = stats ?? {};
    } catch { /* ignore */ }
}
async function openTicket(t: Ticket) {
    selTicket.value = t; ticketDetail.value = null; staffReply.value = ''; internalNote.value = false;
    try { ticketDetail.value = await api.get(`/api/v1/admin/support/tickets/${t.id}`); } catch { /* ignore */ }
}
async function patchTicket(patch: Record<string, unknown>) {
    if (!selTicket.value) return;
    busy.value = true;
    try {
        await api.patch(`/api/v1/admin/support/tickets/${selTicket.value.id}`, patch);
        await openTicket(selTicket.value);
        await loadTickets();
    } catch { /* ignore */ } finally { busy.value = false; }
}
async function sendStaffReply() {
    if (!selTicket.value || !staffReply.value.trim()) return;
    busy.value = true;
    try {
        await api.post(`/api/v1/admin/support/tickets/${selTicket.value.id}/messages`, { body: staffReply.value.trim(), internal: internalNote.value });
        staffReply.value = '';
        await openTicket(selTicket.value);
        await loadTickets();
    } catch { /* ignore */ } finally { busy.value = false; }
}

// ════════════════════════════════════════════════ Live chat
interface ChatSession { id: string; display_name?: string; requester_actor_type: string; status: string; subject?: string; unread_for_staff: number; last_message_at: string }
const sessions = ref<ChatSession[]>([]);
const chatStatusFilter = ref('');
const selSession = ref<ChatSession | null>(null);
const chatMessages = ref<any[]>([]);
const chatDraft = ref('');
const chatLastTs = ref('');
let chatPoll: ReturnType<typeof setInterval> | null = null;
let sessionsPoll: ReturnType<typeof setInterval> | null = null;
const chatScroller = ref<HTMLElement | null>(null);

async function loadSessions() {
    try {
        const res = await api.get<{ sessions: ChatSession[] }>(`/api/v1/admin/support/chat/sessions${chatStatusFilter.value ? `?status=${chatStatusFilter.value}` : ''}`);
        sessions.value = res.sessions ?? [];
    } catch { /* ignore */ }
}
async function openSession(s: ChatSession) {
    selSession.value = s; chatMessages.value = []; chatLastTs.value = '';
    try { await api.post(`/api/v1/admin/support/chat/${s.id}/assign`, {}); } catch { /* ignore */ }
    await fetchChat(true);
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = setInterval(() => fetchChat(false), 4000);
}
async function fetchChat(initial: boolean) {
    if (!selSession.value) return;
    try {
        const q = chatLastTs.value && !initial ? `?since=${encodeURIComponent(chatLastTs.value)}` : '';
        const res = await api.get<{ messages: any[] }>(`/api/v1/admin/support/chat/${selSession.value.id}/messages${q}`);
        const incoming = res.messages ?? [];
        if (initial) chatMessages.value = incoming;
        else if (incoming.length) chatMessages.value.push(...incoming);
        if (chatMessages.value.length) chatLastTs.value = chatMessages.value[chatMessages.value.length - 1].created_at;
        scrollChat();
    } catch { /* ignore */ }
}
async function sendChat() {
    if (!selSession.value || !chatDraft.value.trim()) return;
    const body = chatDraft.value.trim();
    chatDraft.value = '';
    try {
        await api.post(`/api/v1/admin/support/chat/${selSession.value.id}/messages`, { body });
        await fetchChat(false);
    } catch { /* ignore */ }
}
async function endChat() {
    if (!selSession.value) return;
    try { await api.post(`/api/v1/admin/support/chat/${selSession.value.id}/end`, {}); await loadSessions(); selSession.value = null; if (chatPoll) clearInterval(chatPoll); } catch { /* ignore */ }
}
function scrollChat() { requestAnimationFrame(() => { if (chatScroller.value) chatScroller.value.scrollTop = chatScroller.value.scrollHeight; }); }
const waitingCount = computed(() => sessions.value.filter((s) => s.status === 'waiting').length);

// ════════════════════════════════════════════════ FAQ
interface FaqCategory { id: string; slug: string; title: string; audience: string; sort_order: number }
interface Faq { id: string; category_id: string | null; question: string; answer: string; audience: string; published: boolean; sort_order: number; view_count: number; helpful_count: number; not_helpful_count: number }
const faqCategories = ref<FaqCategory[]>([]);
const faqs = ref<Faq[]>([]);
const faqSearch = ref('');
const showFaqEdit = ref(false);
const faqForm = ref<any>({ id: '', category_id: '', question: '', answer: '', audience: 'all', published: true, sort_order: 0 });
const deleteFaqOpen = ref(false);
const deleteFaqTarget = ref<Faq | null>(null);
const deleteFaqBusy = ref(false);

async function loadFaqAdmin() {
    try {
        const [cats, list] = await Promise.all([
            api.get<{ categories: FaqCategory[] }>('/api/v1/admin/support/faq-categories'),
            api.get<{ faqs: Faq[] }>(`/api/v1/admin/support/faqs${faqSearch.value ? `?search=${encodeURIComponent(faqSearch.value)}` : ''}`),
        ]);
        faqCategories.value = cats.categories ?? [];
        faqs.value = list.faqs ?? [];
    } catch { /* ignore */ }
}
function newFaq() { faqForm.value = { id: '', category_id: faqCategories.value[0]?.id ?? '', question: '', answer: '', audience: 'all', published: true, sort_order: 0 }; showFaqEdit.value = true; }
function editFaq(f: Faq) { faqForm.value = { ...f, category_id: f.category_id ?? '' }; showFaqEdit.value = true; }
async function saveFaq() {
    const payload = {
        category_id: faqForm.value.category_id || null,
        question: faqForm.value.question, answer: faqForm.value.answer,
        audience: faqForm.value.audience, published: faqForm.value.published,
        sort_order: Number(faqForm.value.sort_order) || 0,
    };
    try {
        if (faqForm.value.id) await api.put(`/api/v1/admin/support/faqs/${faqForm.value.id}`, payload);
        else await api.post('/api/v1/admin/support/faqs', payload);
        showFaqEdit.value = false;
        await loadFaqAdmin();
    } catch { /* ignore */ }
}
function askDeleteFaq(f: Faq) {
    deleteFaqTarget.value = f;
    deleteFaqOpen.value = true;
}
async function deleteFaq() {
    if (!deleteFaqTarget.value) return;
    deleteFaqBusy.value = true;
    try {
        await api.del(`/api/v1/admin/support/faqs/${deleteFaqTarget.value.id}`);
        deleteFaqOpen.value = false;
        deleteFaqTarget.value = null;
        await loadFaqAdmin();
    } catch { /* ignore */ } finally { deleteFaqBusy.value = false; }
}
async function togglePublish(f: Faq) {
    try {
        await api.put(`/api/v1/admin/support/faqs/${f.id}`, {
            category_id: f.category_id, question: f.question, answer: f.answer,
            audience: f.audience, published: !f.published, sort_order: f.sort_order,
        });
        await loadFaqAdmin();
    } catch { /* ignore */ }
}
function categoryName(id: string | null) { return faqCategories.value.find((c) => c.id === id)?.title ?? '—'; }

// ════════════════════════════════════════════════ lifecycle
function statusBadge(s: string) {
    return ({ open: 'bw-badge-warning', pending: 'bw-badge-brand', awaiting_customer: 'bw-badge-warning', resolved: 'bw-badge-success', closed: 'bw-badge-neutral', active: 'bw-badge-success', waiting: 'bw-badge-warning', ended: 'bw-badge-neutral' } as Record<string, string>)[s] ?? 'bw-badge-neutral';
}
function priorityBadge(p: string) {
    return ({ low: 'bw-badge-neutral', normal: 'bw-badge-brand', high: 'bw-badge-warning', urgent: 'bw-badge-error' } as Record<string, string>)[p] ?? 'bw-badge-neutral';
}
function fmt(s: string) { return s ? new Date(s).toLocaleString() : '—'; }
function pretty(s: string) { return s.replace(/_/g, ' '); }

onMounted(() => {
    loadTickets(); loadSessions(); loadFaqAdmin();
    sessionsPoll = setInterval(() => { if (tab.value === 'chat') loadSessions(); }, 6000);
});
onBeforeUnmount(() => { if (chatPoll) clearInterval(chatPoll); if (sessionsPoll) clearInterval(sessionsPoll); });
</script>

<template>
  <AppShell title="Support">
    <section class="support-hero">
      <div>
        <p class="support-kicker">Support command desk</p>
        <h1>Customer care cockpit</h1>
        <p>Resolve tickets, answer live chats, and keep the Beverly knowledge base sharp.</p>
      </div>
      <div class="support-hero-metrics" aria-label="Support overview">
        <span><strong>{{ ticketStats.open ?? 0 }}</strong> open</span>
        <span><strong>{{ waitingCount }}</strong> waiting</span>
        <span><strong>{{ faqs.length }}</strong> FAQs</span>
      </div>
    </section>

    <div class="bw-segmented support-tabs">
      <button :class="['bw-seg', tab === 'tickets' ? 'active' : '']" @click="tab = 'tickets'">
        Tickets <span v-if="ticketStats.open" class="sup-pill">{{ ticketStats.open }}</span>
      </button>
      <button :class="['bw-seg', tab === 'chat' ? 'active' : '']" @click="tab = 'chat'; loadSessions()">
        Live chat <span v-if="waitingCount" class="sup-pill sup-pill--warn">{{ waitingCount }}</span>
      </button>
      <button :class="['bw-seg', tab === 'faq' ? 'active' : '']" @click="tab = 'faq'">FAQ knowledge base</button>
    </div>

    <!-- ═══ TICKETS ═══ -->
    <template v-if="tab === 'tickets'">
      <div class="sup-stats">
        <div class="sup-stat"><span>Total</span><strong>{{ ticketStats.total ?? 0 }}</strong></div>
        <div class="sup-stat"><span>Open</span><strong>{{ ticketStats.open ?? 0 }}</strong></div>
        <div class="sup-stat"><span>Pending</span><strong>{{ ticketStats.pending ?? 0 }}</strong></div>
        <div class="sup-stat"><span>Awaiting</span><strong>{{ ticketStats.awaiting_customer ?? 0 }}</strong></div>
        <div class="sup-stat"><span>Resolved</span><strong>{{ ticketStats.resolved ?? 0 }}</strong></div>
      </div>

      <div class="bw-filter-bar support-filter">
        <select v-model="ticketStatus" class="bw-select bw-select-sm" @change="loadTickets">
          <option value="">All statuses</option>
          <option value="open">Open</option><option value="pending">Pending</option>
          <option value="awaiting_customer">Awaiting customer</option>
          <option value="resolved">Resolved</option><option value="closed">Closed</option>
        </select>
        <input v-model="ticketSearch" class="bw-input bw-input-sm" placeholder="Search subject or reference…" @keyup.enter="loadTickets" />
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="loadTickets">Search</button>
      </div>

      <div class="ticket-layout-bar">
        <span>Ticket results</span>
        <div class="ticket-view-toggle" aria-label="Ticket layout">
          <button type="button" :class="{ active: ticketView === 'grid' }" :aria-pressed="ticketView === 'grid'" aria-label="Grid view" title="Grid view" @click="ticketView = 'grid'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button type="button" :class="{ active: ticketView === 'table' }" :aria-pressed="ticketView === 'table'" aria-label="Table view" title="Table view" @click="ticketView = 'table'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 4v16" />
            </svg>
          </button>
        </div>
      </div>

      <div :class="['bw-table-wrapper', 'support-table', { 'ticket-table-active': ticketView === 'table' }]">
        <table class="bw-table">
          <thead><tr><th>Reference</th><th>Subject</th><th>From</th><th>Priority</th><th>Status</th><th>Updated</th><th class="sup-actions-col"></th></tr></thead>
          <tbody>
            <tr v-for="t in tickets" :key="t.id" style="cursor:pointer" @click="openTicket(t)">
              <td class="bw-mono">{{ t.reference }}</td>
              <td>{{ t.subject }}</td>
              <td>{{ t.requester_name || t.requester_actor_type }}</td>
              <td><span :class="['bw-badge', priorityBadge(t.priority)]">{{ t.priority }}</span></td>
              <td><span :class="['bw-badge', statusBadge(t.status)]">{{ pretty(t.status) }}</span></td>
              <td class="bw-dim">{{ fmt(t.last_message_at) }}</td>
              <td class="sup-actions-col" @click.stop>
                <button class="bw-btn bw-btn-ghost bw-btn-sm sup-row-action" @click="openTicket(t)">Open</button>
                <MobileActionMenu label="Ticket actions">
                  <button class="mobile-action-item" @click="openTicket(t)">Open</button>
                </MobileActionMenu>
              </td>
            </tr>
            <tr v-if="!tickets.length">
              <td colspan="7">
                <div class="sup-empty-state">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <strong>No support tickets</strong>
                  <span>Tickets raised by customers and vendors will appear here.</span>
                  <button class="bw-btn bw-btn-sm" @click="loadTickets">Refresh</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div :class="['support-mobile-list', 'ticket-mobile-list', `ticket-mobile-list--${ticketView}`]">
        <article v-for="t in tickets" :key="`mobile-${t.id}`" class="support-ticket-card" @click="openTicket(t)">
          <div>
            <span class="bw-mono">{{ t.reference }}</span>
            <h3>{{ t.subject }}</h3>
            <p>{{ t.requester_name || t.requester_actor_type }} · {{ fmt(t.last_message_at) }}</p>
          </div>
          <div class="support-ticket-card-actions">
            <span :class="['bw-badge', priorityBadge(t.priority)]">{{ t.priority }}</span>
            <span :class="['bw-badge', statusBadge(t.status)]">{{ pretty(t.status) }}</span>
          </div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click.stop="openTicket(t)">Open</button>
        </article>
        <div v-if="!tickets.length" class="sup-empty-state">
          <strong>No support tickets</strong>
          <span>Tickets raised by customers and vendors will appear here.</span>
          <button class="bw-btn bw-btn-sm" @click="loadTickets">Refresh</button>
        </div>
      </div>
    </template>

    <!-- ═══ LIVE CHAT ═══ -->
    <template v-else-if="tab === 'chat'">
      <div class="sup-chat">
        <aside class="sup-chat-list">
          <div class="bw-filter-bar" style="padding: var(--s-2)">
            <select v-model="chatStatusFilter" class="bw-select bw-select-sm" @change="loadSessions">
              <option value="">All</option><option value="waiting">Waiting</option>
              <option value="active">Active</option><option value="ended">Ended</option>
            </select>
          </div>
          <button v-for="s in sessions" :key="s.id" :class="['sup-session', selSession?.id === s.id && 'sup-session--on']" @click="openSession(s)">
            <div class="sup-session-top">
              <strong>{{ s.display_name || s.requester_actor_type }}</strong>
              <span v-if="s.unread_for_staff" class="sup-pill sup-pill--warn">{{ s.unread_for_staff }}</span>
            </div>
            <div class="sup-session-meta">
              <span :class="['bw-badge', statusBadge(s.status)]">{{ s.status }}</span>
              <span class="bw-dim">{{ fmt(s.last_message_at) }}</span>
            </div>
          </button>
          <div v-if="!sessions.length" class="sup-empty-state sup-empty-state--sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <strong>No live chats</strong>
            <span>Active customer chats appear here.</span>
            <button class="bw-btn bw-btn-sm" @click="loadSessions">Refresh</button>
          </div>
        </aside>

        <section class="sup-chat-main">
          <template v-if="selSession">
            <header class="sup-chat-head">
              <div><strong>{{ selSession.display_name || selSession.requester_actor_type }}</strong>
                <span class="bw-dim" style="font-size: var(--t-xs)"> · {{ selSession.requester_actor_type }}</span>
              </div>
              <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="endChat">End chat</button>
            </header>
            <div ref="chatScroller" class="sup-chat-body">
              <div v-for="m in chatMessages" :key="m.id"
                   :class="['sup-msg', m.sender_actor_type === 'staff' ? 'sup-msg--staff' : m.kind === 'system' || m.kind === 'bot' ? 'sup-msg--sys' : 'sup-msg--user']">
                <template v-if="m.kind === 'system' || m.kind === 'bot'"><span class="sup-sys">{{ m.body }}</span></template>
                <template v-else>
                  <span class="sup-msg-who">{{ m.sender_actor_type === 'staff' ? 'You' : (m.sender_name || 'Customer') }}</span>
                  <p class="sup-msg-body">{{ m.body }}</p>
                </template>
              </div>
            </div>
            <footer class="sup-chat-foot">
              <input v-model="chatDraft" class="bw-input" placeholder="Type a reply…" @keyup.enter="sendChat" />
              <button class="bw-btn bw-btn-primary" :disabled="!chatDraft.trim()" @click="sendChat">Send</button>
            </footer>
          </template>
          <div v-else class="sup-chat-empty">Select a conversation to start replying.</div>
        </section>
      </div>
    </template>

    <!-- ═══ FAQ ═══ -->
    <template v-else>
      <div class="bw-filter-bar support-filter">
        <input v-model="faqSearch" class="bw-input bw-input-sm" placeholder="Search FAQs…" @keyup.enter="loadFaqAdmin" />
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="loadFaqAdmin">Search</button>
        <button class="bw-btn bw-btn-primary bw-btn-sm" style="margin-left:auto" @click="newFaq">+ New FAQ</button>
      </div>
      <div class="bw-table-wrapper support-table">
        <table class="bw-table">
          <thead><tr><th>Question</th><th>Category</th><th>Audience</th><th>Views</th><th>Helpful</th><th>Status</th><th class="sup-actions-col"></th></tr></thead>
          <tbody>
            <tr v-for="f in faqs" :key="f.id">
              <td>{{ f.question }}</td>
              <td>{{ categoryName(f.category_id) }}</td>
              <td>{{ f.audience }}</td>
              <td class="bw-mono">{{ f.view_count }}</td>
              <td class="bw-mono">{{ f.helpful_count }}/{{ f.helpful_count + f.not_helpful_count }}</td>
              <td><span :class="['bw-badge', f.published ? 'bw-badge-success' : 'bw-badge-neutral']">{{ f.published ? 'Published' : 'Draft' }}</span></td>
              <td class="sup-actions-col" style="white-space:nowrap">
                <div class="sup-row-actions">
                  <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editFaq(f)">Edit</button>
                  <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="togglePublish(f)">{{ f.published ? 'Unpublish' : 'Publish' }}</button>
                  <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="askDeleteFaq(f)">Delete</button>
                </div>
                <MobileActionMenu label="FAQ actions">
                  <button class="mobile-action-item" @click="editFaq(f)">Edit</button>
                  <button class="mobile-action-item" @click="togglePublish(f)">{{ f.published ? 'Unpublish' : 'Publish' }}</button>
                  <button class="mobile-action-item danger" @click="askDeleteFaq(f)">Delete</button>
                </MobileActionMenu>
              </td>
            </tr>
            <tr v-if="!faqs.length">
              <td colspan="7">
                <div class="sup-empty-state">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
                  <strong>No FAQs yet</strong>
                  <span>Create your first FAQ article to help customers self-serve.</span>
                  <button class="bw-btn bw-btn-primary bw-btn-sm" @click="newFaq">+ Add FAQ</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bw-t-cards support-mobile-list">
        <article v-for="f in faqs" :key="`faq-mobile-${f.id}`" class="support-ticket-card">
          <div>
            <span>{{ categoryName(f.category_id) }}</span>
            <h3>{{ f.question }}</h3>
            <p>{{ f.audience }} · {{ f.view_count }} views</p>
          </div>
          <div class="support-ticket-card-actions">
            <span :class="['bw-badge', f.published ? 'bw-badge-success' : 'bw-badge-neutral']">{{ f.published ? 'Published' : 'Draft' }}</span>
          </div>
          <div class="support-card-actions">
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editFaq(f)">Edit</button>
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="togglePublish(f)">{{ f.published ? 'Unpublish' : 'Publish' }}</button>
          </div>
        </article>
        <div v-if="!faqs.length" class="sup-empty-state">
          <strong>No FAQs yet</strong>
          <span>Create your first FAQ article to help customers self-serve.</span>
          <button class="bw-btn bw-btn-primary bw-btn-sm" @click="newFaq">+ Add FAQ</button>
        </div>
      </div>
    </template>

    <!-- Ticket detail modal -->
    <div v-if="selTicket" class="bw-modal-backdrop" @click.self="selTicket = null">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header">
          <div><h2>{{ selTicket.reference }}</h2><span class="bw-muted" style="font-size: var(--t-xs)">{{ selTicket.subject }}</span></div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" style="margin-left:auto" @click="selTicket = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="sup-ticket-controls">
            <select :value="ticketDetail?.status" class="bw-select bw-select-sm" @change="patchTicket({ status: ($event.target as HTMLSelectElement).value })">
              <option value="open">Open</option><option value="pending">Pending</option>
              <option value="awaiting_customer">Awaiting customer</option>
              <option value="resolved">Resolved</option><option value="closed">Closed</option>
            </select>
            <select :value="ticketDetail?.priority" class="bw-select bw-select-sm" @change="patchTicket({ priority: ($event.target as HTMLSelectElement).value })">
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
            <button class="bw-btn bw-btn-ghost bw-btn-sm" :disabled="busy" @click="patchTicket({ assign_to_me: true })">Assign to me</button>
          </div>
          <div class="sup-thread">
            <div v-for="m in ticketDetail?.support_ticket_messages" :key="m.id"
                 :class="['sup-msg', m.sender_actor_type === 'staff' ? 'sup-msg--staff' : 'sup-msg--user', m.is_internal && 'sup-msg--internal']">
              <span class="sup-msg-who">{{ m.sender_actor_type === 'staff' ? 'Staff' : (m.sender_name || m.sender_actor_type) }}<em v-if="m.is_internal"> · internal note</em></span>
              <p class="sup-msg-body">{{ m.body }}</p>
              <span class="bw-dim" style="font-size: var(--t-2xs)">{{ fmt(m.created_at) }}</span>
            </div>
            <p v-if="!ticketDetail?.support_ticket_messages?.length" class="bw-muted">Loading…</p>
          </div>
          <label class="sup-internal-check"><input v-model="internalNote" type="checkbox" /> Internal note (not shown to customer)</label>
          <textarea v-model="staffReply" class="bw-textarea" rows="3" placeholder="Write a reply…"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selTicket = null">Close</button>
          <button class="bw-btn bw-btn-primary" :disabled="!staffReply.trim() || busy" @click="sendStaffReply">{{ busy ? 'Sending…' : 'Send' }}</button>
        </div>
      </div>
    </div>

    <!-- FAQ edit modal -->
    <div v-if="showFaqEdit" class="bw-modal-backdrop" @click.self="showFaqEdit = false">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header"><h2>{{ faqForm.id ? 'Edit' : 'New' }} FAQ</h2><button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showFaqEdit = false">✕</button></div>
        <div class="bw-modal-body">
          <div class="bw-form-group"><label class="bw-label">Question</label><input v-model="faqForm.question" class="bw-input" /></div>
          <div class="bw-form-group"><label class="bw-label">Answer</label><textarea v-model="faqForm.answer" class="bw-textarea" rows="5"></textarea></div>
          <div class="help-form-row">
            <div class="bw-form-group"><label class="bw-label">Category</label>
              <select v-model="faqForm.category_id" class="bw-select">
                <option value="">— None —</option>
                <option v-for="c in faqCategories" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
            </div>
            <div class="bw-form-group"><label class="bw-label">Audience</label>
              <select v-model="faqForm.audience" class="bw-select">
                <option value="all">All</option><option value="customer">Customers</option><option value="vendor">Vendors</option>
              </select>
            </div>
          </div>
          <div class="help-form-row">
            <div class="bw-form-group"><label class="bw-label">Sort order</label><input v-model="faqForm.sort_order" type="number" class="bw-input" /></div>
            <label class="sup-internal-check" style="align-self:flex-end"><input v-model="faqForm.published" type="checkbox" /> Published</label>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showFaqEdit = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="!faqForm.question || !faqForm.answer" @click="saveFaq">Save FAQ</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="deleteFaqOpen"
      title="Delete FAQ"
      :description="deleteFaqTarget ? `Delete '${deleteFaqTarget.question}'?` : ''"
      confirm-label="Delete FAQ"
      tone="danger"
      :loading="deleteFaqBusy"
      @confirm="deleteFaq"
    />
  </AppShell>
</template>

<style scoped>
.support-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-4);
  align-items: end;
  padding: var(--s-5);
  border: 1px solid oklch(from var(--brand) l c h / 0.28);
  border-radius: var(--r-xl);
  background:
    radial-gradient(circle at 10% 8%, oklch(from var(--brand) l c h / 0.22), transparent 18rem),
    linear-gradient(135deg, var(--surface-2), var(--surface));
  box-shadow: var(--shadow-sm);
}
.support-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent, oklch(from var(--brand) l c h / 0.10), transparent),
    repeating-linear-gradient(90deg, oklch(from var(--text) l c h / 0.06) 0 1px, transparent 1px 92px);
  opacity: 0.45;
}
.support-hero > * { position: relative; }
.support-kicker {
  margin: 0 0 var(--s-2);
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}
.support-hero h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(2rem, 5vw, var(--t-4xl));
  line-height: 0.98;
}
.support-hero p:last-child {
  max-width: 52ch;
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--t-md);
}
.support-hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
  min-width: min(360px, 100%);
}
.support-hero-metrics span {
  min-width: 0;
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: oklch(from var(--surface-3) l c h / 0.62);
  color: var(--text-muted);
  font-size: var(--t-xs);
  text-align: center;
}
.support-hero-metrics strong {
  display: block;
  color: var(--brand);
  font-family: var(--font-mono);
  font-size: var(--t-xl);
}

.support-tabs {
  width: 100%;
  margin-bottom: var(--s-4);
  overflow-x: auto;
  scrollbar-width: none;
}
.support-tabs::-webkit-scrollbar { display: none; }
.support-tabs .bw-seg {
  min-width: max-content;
}

.sup-pill { background: var(--brand); color: #04140b; border-radius: 999px; padding: 0 6px; font-size: 10px; margin-left: 4px; }
.sup-pill--warn { background: var(--warn, oklch(78% 0.16 75)); color: #1a1300; }

.sup-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.sup-stat {
  min-width: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  padding: var(--s-3);
  display: grid;
  gap: var(--s-2);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.sup-stat strong { font-size: var(--t-2xl); font-family: var(--font-mono); color: var(--text); line-height: 1; }
.sup-stat span { font-size: var(--t-xs); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.support-filter {
  display: grid;
  grid-template-columns: minmax(150px, 0.65fr) minmax(180px, 1fr) auto;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.support-filter > * {
  min-width: 0;
}
.support-table {
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
}
.support-table .bw-table {
  min-width: 760px;
}
.ticket-layout-bar { display: none; }
.ticket-view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}
.ticket-view-toggle button {
  width: 36px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.ticket-view-toggle button:hover { color: var(--text); }
.ticket-view-toggle button.active { background: var(--brand-glow); color: var(--brand); }
.ticket-view-toggle svg { width: 17px; height: 17px; }
.support-mobile-list {
  display: none;
  gap: var(--s-3);
}
.support-ticket-card {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.support-ticket-card h3 {
  margin: 4px 0;
  color: var(--text);
  font-size: var(--t-md);
  line-height: 1.2;
}
.support-ticket-card p,
.support-ticket-card span {
  color: var(--text-muted);
  font-size: var(--t-xs);
}
.support-ticket-card-actions,
.support-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.support-card-actions .bw-btn {
  flex: 1;
}

.sup-chat { display: grid; grid-template-columns: 280px 1fr; gap: var(--s-4); height: 560px; }
.sup-chat-list { border: 1px solid var(--glass-border); border-radius: var(--r-lg); background: var(--glass-bg); overflow-y: auto; display: flex; flex-direction: column; backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); }
.sup-session { text-align: left; border: 0; border-bottom: 1px solid var(--border); background: none; padding: var(--s-3); cursor: pointer; color: var(--text); }
.sup-session:hover { background: var(--surface-2); }
.sup-session--on { background: var(--brand-glow); }
.sup-session-top { display: flex; align-items: center; justify-content: space-between; }
.sup-session-meta { display: flex; align-items: center; gap: var(--s-2); margin-top: 4px; font-size: var(--t-xs); }

.sup-chat-main { border: 1px solid var(--glass-border); border-radius: var(--r-lg); background: var(--glass-bg); display: flex; flex-direction: column; overflow: hidden; backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); }
.sup-chat-head { display: flex; align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); }
.sup-chat-body { flex: 1; overflow-y: auto; padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-2); }
.sup-chat-foot { display: flex; gap: var(--s-2); padding: var(--s-3); border-top: 1px solid var(--border); }
.sup-chat-foot .bw-input { flex: 1; }
.sup-chat-empty { display: grid; place-items: center; height: 100%; color: var(--text-muted); }
.sup-empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 24px; color: var(--text-muted); text-align: center; }
.sup-empty-state svg { opacity: 0.45; }
.sup-empty-state strong { font-size: 15px; font-weight: 600; color: var(--text); }
.sup-empty-state span { font-size: 13px; max-width: 260px; }
.sup-empty-state--sm { padding: 24px 16px; }
.sup-empty-state--sm strong { font-size: 13px; }
.sup-empty-state--sm span { font-size: 12px; }

.sup-msg { max-width: 80%; display: flex; flex-direction: column; }
.sup-msg--staff { align-self: flex-end; align-items: flex-end; }
.sup-msg--user { align-self: flex-start; }
.sup-msg--sys { align-self: center; max-width: 100%; }
.sup-msg--internal .sup-msg-body { background: oklch(78% 0.16 75 / 0.16) !important; }
.sup-msg-who { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
.sup-msg-who em { font-style: normal; color: var(--warn, oklch(78% 0.16 75)); }
.sup-msg-body { margin: 2px 0; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); font-size: var(--t-md); white-space: pre-wrap; }
.sup-msg--staff .sup-msg-body { background: var(--brand-glow); color: var(--text); }
.sup-msg--user .sup-msg-body { background: var(--surface-2); color: var(--text); }
.sup-sys { font-size: var(--t-xs); color: var(--text-muted); background: var(--surface-2); padding: 5px 10px; border-radius: 999px; }

.sup-ticket-controls { display: flex; gap: var(--s-2); margin-bottom: var(--s-3); flex-wrap: wrap; }
.sup-thread { display: flex; flex-direction: column; gap: var(--s-2); max-height: 300px; overflow-y: auto; margin-bottom: var(--s-3); }
.sup-internal-check { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--text-2); margin-bottom: var(--s-2); cursor: pointer; }
.help-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.sup-actions-col { min-width: 120px; }
.sup-row-actions { display: flex; gap: 4px; justify-content: flex-end; }
.bw-modal-lg {
  max-width: 620px;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
}
.bw-modal-lg .bw-modal-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.bw-modal-lg .bw-modal-header,
.bw-modal-lg .bw-modal-footer {
  flex: 0 0 auto;
}
.bw-input-sm { height: 30px; }

@media (max-width: 720px) {
  .support-hero {
    grid-template-columns: 1fr;
    padding: var(--s-4);
  }

  .support-hero-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
  }

  .support-hero-metrics span {
    padding: var(--s-2);
  }

  .support-filter {
    grid-template-columns: 1fr;
  }

  .support-filter .bw-btn {
    width: 100%;
    justify-content: center;
  }

  .support-table {
    display: none;
  }

  .support-table.ticket-table-active {
    display: block;
    overflow-x: auto;
  }

  .ticket-layout-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
  }

  .support-mobile-list {
    display: grid;
  }

  .ticket-mobile-list--table {
    display: none;
  }

  .ticket-mobile-list--grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .ticket-mobile-list--grid .support-ticket-card {
    min-width: 0;
    gap: var(--s-2);
    padding: var(--s-3);
    overflow: hidden;
  }
  .ticket-mobile-list--grid .support-ticket-card h3,
  .ticket-mobile-list--grid .support-ticket-card p,
  .ticket-mobile-list--grid .support-ticket-card span { overflow-wrap: anywhere; }
  .ticket-mobile-list--grid .support-ticket-card > .bw-btn { width: 100%; justify-content: center; }

  .sup-chat {
    grid-template-columns: 1fr;
    height: auto;
  }

  .sup-chat-list,
  .sup-chat-main {
    min-height: 320px;
  }

  .sup-actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    z-index: 3;
  }

  .sup-row-action,
  .sup-row-actions {
    display: none;
  }

  .help-form-row {
    grid-template-columns: 1fr;
  }

  .sup-chat-foot {
    display: grid;
  }
}
</style>
