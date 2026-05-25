<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

type Tab = 'tickets' | 'chat' | 'faq';
const tab = ref<Tab>('tickets');

// ════════════════════════════════════════════════ Tickets
interface Ticket { id: string; reference: string; subject: string; status: string; category: string; priority: string; requester_actor_type: string; requester_name?: string; assigned_to_user_id?: string; last_message_at: string; created_at: string }
const tickets = ref<Ticket[]>([]);
const ticketStats = ref<Record<string, number>>({});
const ticketStatus = ref('');
const ticketSearch = ref('');
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
async function deleteFaq(f: Faq) {
    if (!window.confirm('Delete this FAQ?')) return;
    try { await api.del(`/api/v1/admin/support/faqs/${f.id}`); await loadFaqAdmin(); } catch { /* ignore */ }
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
    <div class="bw-segmented" style="margin-bottom: var(--s-4)">
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
        <div class="sup-stat"><strong>{{ ticketStats.total ?? 0 }}</strong><span>Total</span></div>
        <div class="sup-stat"><strong>{{ ticketStats.open ?? 0 }}</strong><span>Open</span></div>
        <div class="sup-stat"><strong>{{ ticketStats.pending ?? 0 }}</strong><span>Pending</span></div>
        <div class="sup-stat"><strong>{{ ticketStats.awaiting_customer ?? 0 }}</strong><span>Awaiting</span></div>
        <div class="sup-stat"><strong>{{ ticketStats.resolved ?? 0 }}</strong><span>Resolved</span></div>
      </div>

      <div class="bw-filter-bar">
        <select v-model="ticketStatus" class="bw-select bw-select-sm" @change="loadTickets">
          <option value="">All statuses</option>
          <option value="open">Open</option><option value="pending">Pending</option>
          <option value="awaiting_customer">Awaiting customer</option>
          <option value="resolved">Resolved</option><option value="closed">Closed</option>
        </select>
        <input v-model="ticketSearch" class="bw-input bw-input-sm" placeholder="Search subject or reference…" @keyup.enter="loadTickets" />
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="loadTickets">Search</button>
      </div>

      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead><tr><th>Reference</th><th>Subject</th><th>From</th><th>Priority</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in tickets" :key="t.id" style="cursor:pointer" @click="openTicket(t)">
              <td class="bw-mono">{{ t.reference }}</td>
              <td>{{ t.subject }}</td>
              <td>{{ t.requester_name || t.requester_actor_type }}</td>
              <td><span :class="['bw-badge', priorityBadge(t.priority)]">{{ t.priority }}</span></td>
              <td><span :class="['bw-badge', statusBadge(t.status)]">{{ pretty(t.status) }}</span></td>
              <td class="bw-dim">{{ fmt(t.last_message_at) }}</td>
              <td><button class="bw-btn bw-btn-ghost bw-btn-sm" @click.stop="openTicket(t)">Open</button></td>
            </tr>
            <tr v-if="!tickets.length"><td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No tickets.</td></tr>
          </tbody>
        </table>
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
          <p v-if="!sessions.length" class="bw-muted" style="text-align:center; padding: var(--s-4)">No chat sessions.</p>
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
      <div class="bw-filter-bar">
        <input v-model="faqSearch" class="bw-input bw-input-sm" placeholder="Search FAQs…" @keyup.enter="loadFaqAdmin" />
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="loadFaqAdmin">Search</button>
        <button class="bw-btn bw-btn-primary bw-btn-sm" style="margin-left:auto" @click="newFaq">+ New FAQ</button>
      </div>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead><tr><th>Question</th><th>Category</th><th>Audience</th><th>Views</th><th>Helpful</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="f in faqs" :key="f.id">
              <td>{{ f.question }}</td>
              <td>{{ categoryName(f.category_id) }}</td>
              <td>{{ f.audience }}</td>
              <td class="bw-mono">{{ f.view_count }}</td>
              <td class="bw-mono">{{ f.helpful_count }}/{{ f.helpful_count + f.not_helpful_count }}</td>
              <td><span :class="['bw-badge', f.published ? 'bw-badge-success' : 'bw-badge-neutral']">{{ f.published ? 'Published' : 'Draft' }}</span></td>
              <td style="white-space:nowrap">
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editFaq(f)">Edit</button>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="togglePublish(f)">{{ f.published ? 'Unpublish' : 'Publish' }}</button>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="deleteFaq(f)">Delete</button>
              </td>
            </tr>
            <tr v-if="!faqs.length"><td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No FAQs yet.</td></tr>
          </tbody>
        </table>
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
  </AppShell>
</template>

<style scoped>
.sup-pill { background: var(--brand); color: #04140b; border-radius: 999px; padding: 0 6px; font-size: 10px; margin-left: 4px; }
.sup-pill--warn { background: var(--warn, oklch(78% 0.16 75)); color: #1a1300; }

.sup-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--s-3); margin-bottom: var(--s-4); }
.sup-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-3) var(--s-4); display: flex; flex-direction: column; }
.sup-stat strong { font-size: var(--t-2xl); font-family: var(--font-mono); color: var(--text); }
.sup-stat span { font-size: var(--t-xs); color: var(--text-muted); }

.sup-chat { display: grid; grid-template-columns: 280px 1fr; gap: var(--s-4); height: 560px; }
.sup-chat-list { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); overflow-y: auto; display: flex; flex-direction: column; }
.sup-session { text-align: left; border: 0; border-bottom: 1px solid var(--border); background: none; padding: var(--s-3); cursor: pointer; color: var(--text); }
.sup-session:hover { background: var(--surface-2); }
.sup-session--on { background: var(--brand-glow); }
.sup-session-top { display: flex; align-items: center; justify-content: space-between; }
.sup-session-meta { display: flex; align-items: center; gap: var(--s-2); margin-top: 4px; font-size: var(--t-xs); }

.sup-chat-main { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
.sup-chat-head { display: flex; align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); }
.sup-chat-body { flex: 1; overflow-y: auto; padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-2); }
.sup-chat-foot { display: flex; gap: var(--s-2); padding: var(--s-3); border-top: 1px solid var(--border); }
.sup-chat-foot .bw-input { flex: 1; }
.sup-chat-empty { display: grid; place-items: center; height: 100%; color: var(--text-muted); }

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
.bw-modal-lg { max-width: 620px; }
.bw-input-sm { height: 30px; }
</style>
