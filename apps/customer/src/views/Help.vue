<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface FaqCategory { id: string; slug: string; title: string; description?: string; icon?: string }
interface Faq { id: string; category_id: string | null; question: string; answer: string; tags: string[]; helpful_count: number; not_helpful_count: number }
interface Ticket { id: string; reference: string; subject: string; status: string; category: string; priority: string; last_message_at: string; created_at: string }

const tab = ref<'faq' | 'tickets'>('faq');

// ── FAQ ──
const categories = ref<FaqCategory[]>([]);
const faqs = ref<Faq[]>([]);
const search = ref('');
const activeCategory = ref<string>('');
const openFaq = ref<string>('');
const voted = ref<Record<string, boolean>>({});
const faqLoading = ref(false);

const filteredFaqs = computed(() => {
    let list = faqs.value;
    if (activeCategory.value) list = list.filter((f) => f.category_id === activeCategory.value);
    return list;
});

async function loadFaqs() {
    faqLoading.value = true;
    try {
        const [cats, list] = await Promise.all([
            api.get<{ categories: FaqCategory[] }>('/api/v1/public/faqs/categories?audience=customer'),
            api.get<{ faqs: Faq[] }>(`/api/v1/public/faqs?audience=customer${search.value ? `&search=${encodeURIComponent(search.value)}` : ''}`),
        ]);
        categories.value = cats.categories ?? [];
        faqs.value = list.faqs ?? [];
    } catch { /* keep prior */ } finally {
        faqLoading.value = false;
    }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(loadFaqs, 250);
}

function toggleFaq(f: Faq) {
    openFaq.value = openFaq.value === f.id ? '' : f.id;
    if (openFaq.value === f.id) api.post(`/api/v1/public/faqs/${f.id}/view`).catch(() => undefined);
}

async function vote(f: Faq, helpful: boolean) {
    if (voted.value[f.id]) return;
    voted.value[f.id] = true;
    try { await api.post(`/api/v1/public/faqs/${f.id}/vote`, { helpful }); } catch { /* best effort */ }
}

// ── Tickets ──
const tickets = ref<Ticket[]>([]);
const ticketsLoading = ref(false);
const showNew = ref(false);
const saving = ref(false);
const newError = ref('');
const form = ref({ subject: '', description: '', category: 'general', priority: 'normal' });

const selected = ref<Ticket | null>(null);
const detail = ref<any>(null);
const replyText = ref('');

async function loadTickets() {
    ticketsLoading.value = true;
    try {
        const res = await api.get<{ tickets: Ticket[] }>('/api/v1/customer/support/tickets');
        tickets.value = res.tickets ?? [];
    } catch { /* ignore */ } finally {
        ticketsLoading.value = false;
    }
}

async function submitNew() {
    newError.value = '';
    if (form.value.subject.trim().length < 5 || form.value.description.trim().length < 10) {
        newError.value = 'Add a subject (5+ chars) and a description (10+ chars).';
        return;
    }
    saving.value = true;
    try {
        await api.post('/api/v1/customer/support/tickets', { ...form.value });
        showNew.value = false;
        form.value = { subject: '', description: '', category: 'general', priority: 'normal' };
        await loadTickets();
        tab.value = 'tickets';
    } catch (e: any) {
        newError.value = e?.message ?? 'Could not create ticket.';
    } finally {
        saving.value = false;
    }
}

async function openTicket(t: Ticket) {
    selected.value = t;
    detail.value = null;
    replyText.value = '';
    try { detail.value = await api.get(`/api/v1/customer/support/tickets/${t.id}`); } catch { /* ignore */ }
}

async function sendReply() {
    if (!selected.value || !replyText.value.trim()) return;
    saving.value = true;
    try {
        await api.post(`/api/v1/customer/support/tickets/${selected.value.id}/messages`, { body: replyText.value.trim() });
        replyText.value = '';
        detail.value = await api.get(`/api/v1/customer/support/tickets/${selected.value.id}`);
        await loadTickets();
    } catch { /* ignore */ } finally {
        saving.value = false;
    }
}

function statusBadge(s: string) {
    return ({
        open: 'bw-badge-warning', pending: 'bw-badge-brand', awaiting_customer: 'bw-badge-warning',
        resolved: 'bw-badge-success', closed: 'bw-badge-neutral',
    } as Record<string, string>)[s] ?? 'bw-badge-neutral';
}
function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }
function prettyStatus(s: string) { return s.replace(/_/g, ' '); }

onMounted(() => { loadFaqs(); loadTickets(); });
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Help &amp; Support</p>
      <p class="bw-page-sub">Find answers fast or reach our team.</p>
    </div>

    <div class="bw-segmented help-tabs">
      <button :class="['bw-seg', tab === 'faq' ? 'active' : '']" @click="tab = 'faq'">Help center</button>
      <button :class="['bw-seg', tab === 'tickets' ? 'active' : '']" @click="tab = 'tickets'">
        My tickets <span v-if="tickets.length" class="help-count">{{ tickets.length }}</span>
      </button>
    </div>

    <!-- ── FAQ ── -->
    <template v-if="tab === 'faq'">
      <div class="help-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input v-model="search" class="help-search-input" placeholder="Search help articles…" @input="onSearch" />
      </div>

      <div class="help-chips">
        <button :class="['help-chip', !activeCategory && 'help-chip--on']" @click="activeCategory = ''">All</button>
        <button v-for="c in categories" :key="c.id"
                :class="['help-chip', activeCategory === c.id && 'help-chip--on']"
                @click="activeCategory = activeCategory === c.id ? '' : c.id">{{ c.title }}</button>
      </div>

      <div v-if="faqLoading && !faqs.length" class="bw-loading">Loading…</div>
      <div v-else class="help-faqs">
        <div v-for="f in filteredFaqs" :key="f.id" :class="['help-faq', openFaq === f.id && 'help-faq--open']">
          <button class="help-faq-q" @click="toggleFaq(f)">
            <span>{{ f.question }}</span>
            <svg class="help-faq-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div v-if="openFaq === f.id" class="help-faq-a">
            <p>{{ f.answer }}</p>
            <div class="help-faq-vote">
              <span>Was this helpful?</span>
              <button :disabled="voted[f.id]" @click="vote(f, true)">👍 Yes</button>
              <button :disabled="voted[f.id]" @click="vote(f, false)">👎 No</button>
              <span v-if="voted[f.id]" class="help-faq-thanks">Thanks for the feedback!</span>
            </div>
          </div>
        </div>
        <div v-if="!filteredFaqs.length" class="help-empty">
          <p>No articles found{{ search ? ` for “${search}”` : '' }}.</p>
          <button class="bw-btn bw-btn-primary" @click="tab = 'tickets'; showNew = true">Ask our team instead</button>
        </div>
      </div>

      <div class="help-cta-card">
        <div>
          <strong>Still need help?</strong>
          <p>Open a ticket and our support team will get back to you.</p>
        </div>
        <button class="bw-btn bw-btn-primary" @click="tab = 'tickets'; showNew = true">New ticket</button>
      </div>
    </template>

    <!-- ── Tickets ── -->
    <template v-else>
      <div class="help-tickets-head">
        <span class="bw-muted">{{ tickets.length }} ticket{{ tickets.length === 1 ? '' : 's' }}</span>
        <button class="bw-btn bw-btn-primary" @click="showNew = true">+ New ticket</button>
      </div>

      <div v-if="ticketsLoading && !tickets.length" class="bw-loading">Loading…</div>
      <div v-else class="help-ticket-list">
        <button v-for="t in tickets" :key="t.id" class="help-ticket" @click="openTicket(t)">
          <div class="help-ticket-main">
            <div class="help-ticket-subject">{{ t.subject }}</div>
            <div class="help-ticket-meta">{{ t.reference }} · {{ fmtDate(t.last_message_at) }}</div>
          </div>
          <span :class="['bw-badge', statusBadge(t.status)]">{{ prettyStatus(t.status) }}</span>
        </button>
        <div v-if="!tickets.length" class="help-empty">
          <p>No tickets yet.</p>
          <button class="bw-btn bw-btn-primary" @click="showNew = true">Open your first ticket</button>
        </div>
      </div>
    </template>

    <!-- New ticket modal -->
    <div v-if="showNew" class="bw-modal-backdrop" @click.self="showNew = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>New support ticket</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showNew = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Subject</label>
            <input v-model="form.subject" class="bw-input" placeholder="e.g. Token not received" />
          </div>
          <div class="help-form-row">
            <div class="bw-form-group">
              <label class="bw-label">Category</label>
              <select v-model="form.category" class="bw-select">
                <option value="general">General</option>
                <option value="payments">Payments &amp; wallet</option>
                <option value="tokens">Tokens &amp; meters</option>
                <option value="account">Account &amp; security</option>
              </select>
            </div>
            <div class="bw-form-group">
              <label class="bw-label">Priority</label>
              <select v-model="form.priority" class="bw-select">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Describe the issue</label>
            <textarea v-model="form.description" class="bw-textarea" rows="4" placeholder="Tell us what happened…"></textarea>
          </div>
          <div v-if="newError" class="bw-error-banner">{{ newError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showNew = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="submitNew">{{ saving ? 'Submitting…' : 'Submit ticket' }}</button>
        </div>
      </div>
    </div>

    <!-- Ticket thread modal -->
    <div v-if="selected" class="bw-modal-backdrop" @click.self="selected = null">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header">
          <div>
            <h2>{{ selected.reference }}</h2>
            <span class="bw-muted" style="font-size: var(--t-xs)">{{ selected.subject }}</span>
          </div>
          <span :class="['bw-badge', statusBadge(selected.status)]">{{ prettyStatus(selected.status) }}</span>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" style="margin-left:auto" @click="selected = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="help-thread">
            <div v-for="m in detail?.support_ticket_messages" :key="m.id"
                 :class="['help-msg', m.sender_actor_type === 'staff' ? 'help-msg--staff' : 'help-msg--mine']">
              <span class="help-msg-who">{{ m.sender_actor_type === 'staff' ? 'Support' : 'You' }}</span>
              <p class="help-msg-body">{{ m.body }}</p>
              <span class="help-msg-time">{{ fmtDate(m.created_at) }}</span>
            </div>
            <p v-if="!detail?.support_ticket_messages?.length" class="bw-muted">Loading conversation…</p>
          </div>
          <textarea v-if="selected.status !== 'closed'" v-model="replyText" class="bw-textarea" rows="3" placeholder="Write a reply…"></textarea>
          <p v-else class="bw-muted" style="font-size: var(--t-sm)">This ticket is closed. Open a new ticket if you still need help.</p>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selected = null">Close</button>
          <button v-if="selected.status !== 'closed'" class="bw-btn bw-btn-primary" :disabled="!replyText.trim() || saving" @click="sendReply">
            {{ saving ? 'Sending…' : 'Send reply' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.help-tabs { margin-bottom: var(--s-2); }
.help-count { background: var(--brand); color: #04140b; border-radius: 999px; padding: 0 6px; font-size: 10px; margin-left: 4px; }

.help-search { display: flex; align-items: center; gap: var(--s-2); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 0 var(--s-3); height: 44px; }
.help-search svg { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.help-search-input { flex: 1; border: 0; background: transparent; color: var(--text); font: inherit; outline: none; }

.help-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.help-chip { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); font-size: var(--t-sm); font-weight: 600; cursor: pointer; transition: all var(--dur-fast); }
.help-chip--on { background: var(--brand); border-color: var(--brand); color: #04140b; }

.help-faqs { display: flex; flex-direction: column; gap: var(--s-2); }
.help-faq { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); overflow: hidden; transition: border-color var(--dur-base); }
.help-faq--open { border-color: oklch(70% 0.19 145 / 0.4); }
.help-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-4); background: none; border: 0; cursor: pointer; font: inherit; font-weight: 600; color: var(--text); text-align: left; }
.help-faq-caret { width: 18px; height: 18px; flex-shrink: 0; color: var(--text-muted); transition: transform var(--dur-base); }
.help-faq--open .help-faq-caret { transform: rotate(180deg); color: var(--brand); }
.help-faq-a { padding: 0 var(--s-4) var(--s-4); }
.help-faq-a p { margin: 0 0 var(--s-3); color: var(--text-2); line-height: 1.6; font-size: var(--t-md); }
.help-faq-vote { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-sm); color: var(--text-muted); flex-wrap: wrap; }
.help-faq-vote button { border: 1px solid var(--border); background: var(--surface-2); border-radius: 999px; padding: 4px 10px; font-size: var(--t-sm); cursor: pointer; color: var(--text); }
.help-faq-vote button:disabled { opacity: 0.5; cursor: default; }
.help-faq-thanks { color: var(--brand); font-weight: 600; }

.help-cta-card { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-4); border: 1px solid var(--border); border-radius: var(--r-lg); background: radial-gradient(120% 100% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface); margin-top: var(--s-2); }
.help-cta-card strong { display: block; color: var(--text); }
.help-cta-card p { margin: 2px 0 0; font-size: var(--t-sm); color: var(--text-2); }

.help-tickets-head { display: flex; align-items: center; justify-content: space-between; }
.help-ticket-list { display: flex; flex-direction: column; gap: var(--s-2); }
.help-ticket { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); cursor: pointer; text-align: left; transition: border-color var(--dur-fast); }
.help-ticket:hover { border-color: var(--brand); }
.help-ticket-main { flex: 1; min-width: 0; }
.help-ticket-subject { font-weight: 600; color: var(--text); }
.help-ticket-meta { font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }

.help-empty { text-align: center; padding: var(--s-6) var(--s-4); color: var(--text-muted); display: flex; flex-direction: column; gap: var(--s-3); align-items: center; }

.help-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.help-thread { display: flex; flex-direction: column; gap: var(--s-2); max-height: 320px; overflow-y: auto; margin-bottom: var(--s-3); }
.help-msg { border-radius: var(--r-md); padding: var(--s-2) var(--s-3); max-width: 85%; }
.help-msg--mine { background: var(--brand-glow); align-self: flex-end; }
.help-msg--staff { background: var(--surface-2); align-self: flex-start; }
.help-msg-who { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
.help-msg-body { margin: 2px 0; font-size: var(--t-md); color: var(--text); white-space: pre-wrap; }
.help-msg-time { font-size: var(--t-2xs); color: var(--text-muted); }
.bw-modal-lg { max-width: 560px; }
</style>
